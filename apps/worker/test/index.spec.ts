import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
  runDurableObjectAlarm,
  runInDurableObject
} from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import app from '../src/index';

let TEST_ROOM_ID = '';

describe('Worker Router & Rate Limiter', () => {
  it.only('should return healthy on /api/health', async () => {
    const request = new Request('http://localhost/api/health');
    const ctx = createExecutionContext();

    const response = await app.fetch(request, env as any, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.status).toBe('healthy');
    expect(data.version).toBeDefined();
  });

  it.only('should enforce security headers', async () => {
    const request = new Request('http://localhost/api/health');
    const ctx = createExecutionContext();

    const response = await app.fetch(request, env as any, ctx);
    await waitOnExecutionContext(ctx);

    const csp = response.headers.get('Content-Security-Policy');
    
    expect(csp).toContain("frame-ancestors *;"); 
    expect(csp).toContain("default-src 'self'");
    expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
  });

  it.only('should catch and log rate limiter errors gracefully', async () => {
    const request = new Request('http://localhost/api/health', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' }
    });
    const ctx = createExecutionContext();

    const badEnv = {
      ...env,
      ENVIRONMENT: 'production',
      RATE_LIMITER: {
        limit: vi.fn().mockRejectedValue(new Error('Simulated KV failure'))
      }
    };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await app.fetch(request, badEnv as any, ctx);
    await waitOnExecutionContext(ctx);

    expect(consoleSpy).toHaveBeenCalled();
    expect(response.status).toBe(200); 
    
    consoleSpy.mockRestore();
  });

  it.only('should return 429 when rate limit is exceeded', async () => {
    const request = new Request('http://localhost/api/health', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' }
    });
    const ctx = createExecutionContext();

    const limitedEnv = {
      ...env,
      ENVIRONMENT: 'production',
      RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: false }) 
      }
    };

    const response = await app.fetch(request, limitedEnv as any, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(429);
  });

  it.only('should return 413 if encryptedPsbt exceeds MAX_PAYLOAD_SIZE_BYTES on POST /api/room', async () => {
    const request = new Request('http://localhost/api/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: TEST_ROOM_ID,
        // Create a payload intentionally larger than 2MB
        encryptedPsbt: 'a'.repeat((2 * 1024 * 1024) + 10) 
      }),
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env as any, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(413);
    const data = await response.json() as any;
    expect(data.error).toContain('Payload too large');
  });

  it.only('should omit Access-Control-Allow-Origin for unauthorized CORS requests', async () => {
    const request = new Request('http://localhost/api/health', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://malicious-domain.com',
        'Access-Control-Request-Method': 'GET'
      }
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env as any, ctx);
    await waitOnExecutionContext(ctx);

    // If the origin is rejected, Hono omits the allow-origin header
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('SigningRoom Durable Object', () => {
  let roomStub: DurableObjectStub;

  beforeEach(() => {
    TEST_ROOM_ID = `test-room-${crypto.randomUUID()}`;
    const id = env.SIGNING_ROOM.idFromName(TEST_ROOM_ID);
    roomStub = env.SIGNING_ROOM.get(id);
  });

  afterEach(async () => {
    // CRITICAL FIX: Give the DO 50ms to process any webSocketClose events 
    // from cleanupClient BEFORE we force the room expiration alarm to run!
    await new Promise((r) => setTimeout(r, 50));
    try {
      await runDurableObjectAlarm(roomStub);
    } catch (_) {}
  });

  async function initRoom(overrides: any = {}) {
    const initBody = {
      roomId: TEST_ROOM_ID,
      expectedPass: 'pass123',
      adminToken: 'admin-secret',
      ...overrides,
    };

    const initRes = await roomStub.fetch(new Request('http://internal/init', {
      method: 'POST',
      body: JSON.stringify(initBody),
    }));

    await initRes.text();
    return initBody;
  }

  async function createWebSocketClient(queryParams = '?pass=pass123') {
    const wsResponse = await roomStub.fetch(new Request(`http://localhost${queryParams}`, {
      headers: { 'Upgrade': 'websocket' },
    }));

    const client = wsResponse.webSocket;
    if (!client) throw new Error('No WebSocket returned');

    const received: any[] = [];

    client.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' 
          ? JSON.parse(event.data) 
          : event.data;
        received.push(data);
      } catch (err) {
        received.push({ raw: event.data, parseError: true });
      }
    });

    client.accept();
    await new Promise(r => setTimeout(r, 10));

    return { client, received };
  }

  async function cleanupClient(client: WebSocket) {
    if (!client) return;

    if (client.readyState !== 3) { // 3 = CLOSED
      const closePromise = new Promise<void>((resolve) => {
        client.addEventListener('close', () => resolve(), { once: true });
      });
      
      if (client.readyState === 1) { // 1 = OPEN
        client.close(1000, "Test cleanup");
      }
      
      try {
        await Promise.race([
          closePromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
        ]);
      } catch (e) {
        // silently ignore timeout
      }
    }
  }

  it.only('should initialize a room via POST /api/room', async () => {
    const request = new Request('http://localhost/api/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: TEST_ROOM_ID,
        expectedPass: 'pass123',
        adminToken: 'admin-secret',
      }),
    });

    const ctx = createExecutionContext();
    const response = await app.fetch(request, env as any, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.roomId).toBe(TEST_ROOM_ID);
    expect(data.socketUrl).toContain('/websocket');
  });

  it.only('should reject non-websocket upgrade requests', async () => {
    const response = await roomStub.fetch(new Request('http://localhost/'));
    expect(response.status).toBe(426);
  });

  it.only('should successfully upgrade to a WebSocket and send initial state', async () => {
    await initRoom({ encryptedLogBlob: 'initial-creation-log' });
    const { client, received } = await createWebSocketClient();

    try {
      await vi.waitFor(() => {
        expect(received.length).toBeGreaterThan(0);
      }, { timeout: 1000 });

      expect(received.some((m) => m.type === 'SESSION_CONNECTED')).toBe(true);
      expect(received.some((m) => m.type === 'STATE_SYNC')).toBe(true);
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should maintain persistent participants state and broadcast updates', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      await vi.waitFor(() => {
        expect(received.some((m) => 
          m.type === 'PARTICIPANTS_UPDATE' && 
          Object.values(m.participants).some((p: any) => p.role === 'guest')
        )).toBe(true);
      });

      client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
      await vi.waitFor(() => {
        expect(received.some((m) => 
          m.type === 'PARTICIPANTS_UPDATE' && 
          Object.values(m.participants).some((p: any) => p.role === 'admin')
        )).toBe(true);
      });

      client.send(JSON.stringify({ type: 'SET_DISPLAY_NAME', encryptedDisplayName: 'EncryptedNameBlob' }));
      await vi.waitFor(() => {
        expect(received.some((m) => 
          m.type === 'PARTICIPANTS_UPDATE' && 
          Object.values(m.participants).some((p: any) => p.encryptedDisplayName === 'EncryptedNameBlob')
        )).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should authenticate admin with correct token', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      client.send(JSON.stringify({
        type: 'AUTH',
        token: 'admin-secret',
      }));

      await vi.waitFor(() => {
        expect(received.some((m) => m.type === 'ROLE_UPDATE' && m.role === 'admin')).toBe(true);
      }, { timeout: 800 });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should reject invalid admin token and lock out after 5 failures', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      for (let i = 0; i < 6; i++) {
        client.send(JSON.stringify({ type: 'AUTH', token: 'wrong' }));
      }

      await vi.waitFor(() => {
        expect(received.some((m) => m.message?.includes('Room locked'))).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should update signer labels (admin only)', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
      await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

      client.send(JSON.stringify({
        type: 'UPDATE_LABEL',
        fingerprint: 'abc123',
        label: 'Coordinator Label',
        encryptedLogBlob: 'label-log',
      }));

      await vi.waitFor(() => {
        expect(received.some((m) => m.type === 'LABELS_UPDATED')).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should close room and clean up on CLOSE_ROOM (admin)', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
      await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

      client.send(JSON.stringify({
        type: 'CLOSE_ROOM',
        encryptedLogBlob: 'closing-room',
      }));

      await vi.waitFor(() => {
        expect(received.some((m) => m.type === 'ROOM_CLOSED')).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should reject connection on protocol version mismatch', async () => {
    await initRoom({ protocolVersion: '2.0.0' });
    
    const wsResponse = await roomStub.fetch(new Request('http://localhost/?pass=pass123&v=1.0.0', {
      headers: { 'Upgrade': 'websocket' },
    }));

    const client = wsResponse.webSocket!;
    client.accept();

    const received: any[] = [];
    client.addEventListener('message', (e) => {
      received.push(JSON.parse(e.data as string));
    });

    try {
      await vi.waitFor(() => {
        expect(received.some(m => m.type === 'ERROR_VERSION_MISMATCH')).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  // it.only('should shift auditLog array if it exceeds 2000 entries', async () => {
  //   await initRoom();
  //   await runInDurableObject(roomStub, async (instance: any) => {
  //     // Artificially inflate the log array to exactly 2000 items
  //     instance.roomState.auditLog = new Array(2000).fill('old-log');
      
  //     await instance.log('new-log');
      
  //     expect(instance.roomState.auditLog.length).toBe(2000); // Should not exceed 2000
  //     expect(instance.roomState.auditLog[1999]).toBe('new-log'); // New log is at the end
  //   });
  // });

  // it.only('should drop broken sockets during broadcast()', async () => {
  //   await initRoom();
  //   await runInDurableObject(roomStub, async (instance: any) => {
  //     Create a mock socket that throws when send() is called
  //     const mockBrokenSocket = { 
  //       send: vi.fn().mockImplementation(() => { throw new Error('Broken pipe'); }),
  //       close: vi.fn()
  //     };
  //     instance.sessions.set(mockBrokenSocket, { id: '123', role: 'guest' });
      
  //     expect(instance.sessions.has(mockBrokenSocket)).toBe(true);
      
  //     Broadcast should catch the error and delete the socket
  //     expect(() => instance.broadcast({ type: 'TEST' })).not.toThrow();
  //     expect(instance.sessions.has(mockBrokenSocket)).toBe(false);
  //   });
  // });

  // it.only('alarm() should reset lockout and retain room if not expired', async () => {
  //   await initRoom();
  //   await runInDurableObject(roomStub, async (instance: any) => {
  //     instance.isLockedOut = true;
  //     instance.authFailures = 5;
  //     instance.roomState.expiresAt = Date.now() + 10000; // Room expires in the future
      
  //     const setAlarmSpy = vi.spyOn(instance.state.storage, 'setAlarm');
      
  //     await instance.alarm();
      
  //     expect(instance.isLockedOut).toBe(false);
  //     expect(instance.authFailures).toBe(0);
  //     expect(instance.roomState).not.toBeNull();
  //     expect(setAlarmSpy).toHaveBeenCalledWith(instance.roomState.expiresAt);
  //   });
  // });

  // it.only('alarm() should delete room and close sockets if expired', async () => {
  //   await initRoom();
  //   const { client } = await createWebSocketClient();
    
  //   try {
  //     await runInDurableObject(roomStub, async (instance: any) => {
  //       // Force the room into an expired state
  //       instance.roomState.expiresAt = Date.now() - 10000; 
        
  //       await instance.alarm();
        
  //       expect(instance.roomState).toBeNull();
  //     });
      
  //     // The connected client should receive a close event with code 1000 "Expired"
  //     const closeEvent = await new Promise<CloseEvent>((resolve) => {
  //       client.addEventListener('close', resolve);
  //     });
      
  //     expect(closeEvent.code).toBe(1000);
  //     expect(closeEvent.reason).toBe('Expired');
  //   } finally {
  //     await cleanupClient(client);
  //   }
  // });

  it.only('should ignore UPLOAD_PARTIAL if payload exceeds MAX_PAYLOAD_SIZE_BYTES', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      const massiveData = 'a'.repeat((2 * 1024 * 1024) + 10);
      client.send(JSON.stringify({
        type: 'UPLOAD_PARTIAL',
        fingerprint: '123456',
        data: { encryptedData: massiveData },
        encryptedLogBlob: 'upload-log'
      }));

      await new Promise(r => setTimeout(r, 100)); // Wait for processing

      // It should silently return, meaning no NEW_PARTIAL_DATA is broadcasted
      expect(received.some(m => m.type === 'NEW_PARTIAL_DATA')).toBe(false);
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should enforce message rate limiting', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      for (let i = 0; i < 20; i++) {
        client.send(JSON.stringify({
          type: 'LOG_ACTION',
          encryptedLogBlob: `log-${i}`,
        }));
      }

      await vi.waitFor(() => {
        const logUpdates = received.filter((m) => m.type === 'LOG_UPDATE');
        return logUpdates.length > 0;
      }, { timeout: 800 });

      const logUpdates = received.filter((m) => m.type === 'LOG_UPDATE');
      expect(logUpdates.length).toBeLessThan(15); 
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should reject more than 10 connections from the same IP', async () => {
    await initRoom();
    const clients: WebSocket[] = [];

    for (let i = 0; i < 10; i++) {
      const res = await roomStub.fetch(new Request('http://localhost/?pass=pass123', {
        headers: { 'Upgrade': 'websocket', 'cf-connecting-ip': '1.2.3.4' },
      }));
      if (res.webSocket) {
        res.webSocket.accept();
        await new Promise(r => setTimeout(r, 5));
        clients.push(res.webSocket);
      }
    }

    const failRes = await roomStub.fetch(new Request('http://localhost/?pass=pass123', {
      headers: { 'Upgrade': 'websocket', 'cf-connecting-ip': '1.2.3.4' },
    }));

    expect(failRes.status).toBe(429);
    
    for (const c of clients) {
      await cleanupClient(c);
    }
  });

  it.only('should set display name and broadcast connections', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      client.send(JSON.stringify({
        type: 'SET_DISPLAY_NAME',
        encryptedDisplayName: 'EncryptedNameBlob',
      }));

      await vi.waitFor(() => {
        expect(received.some((m) => 
          m.type === 'CONNECTIONS_UPDATE' && 
          m.sessions.some((s: any) => s.encryptedDisplayName === 'EncryptedNameBlob')
        )).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should rename the room (admin only)', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
      await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

      client.send(JSON.stringify({
        type: 'RENAME_ROOM',
        encryptedName: 'New Encrypted Room Name',
        encryptedLogBlob: 'rename-log'
      }));

      await vi.waitFor(() => {
        expect(received.some((m) => m.type === 'ROOM_RENAMED' && m.encryptedName === 'New Encrypted Room Name')).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should accept partial uploads and enforce limit', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      client.send(JSON.stringify({
        type: 'UPLOAD_PARTIAL',
        fingerprint: '123456',
        data: { encryptedData: 'sig-data' },
        encryptedLogBlob: 'upload-log'
      }));

      await vi.waitFor(() => {
        expect(received.some((m) => m.type === 'NEW_PARTIAL_DATA' && m.fingerprint === '123456')).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should allow admin to update whitelist and lock room', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
      await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

      client.send(JSON.stringify({
        type: 'UPDATE_WHITELIST',
        encryptedWhitelist: ['pubkey1', 'pubkey2'],
        encryptedLogBlob: 'whitelist-log'
      }));

      await vi.waitFor(() => {
        expect(received.some((m) => m.type === 'WHITELIST_UPDATED')).toBe(true);
      });

      client.send(JSON.stringify({
        type: 'TOGGLE_LOCK',
        locked: true,
        encryptedLogBlob: 'lock-log'
      }));

      await vi.waitFor(() => {
        expect(received.some((m) => m.type === 'LOCK_UPDATED' && m.isLocked === true)).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should finalize transaction (admin only)', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
      await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

      client.send(JSON.stringify({
        type: 'TX_FINALIZED',
        encryptedFinalTxHex: 'hex-data',
        encryptedFinalTxId: 'txid-data',
        encryptedLogBlob: 'tx-log'
      }));

      await vi.waitFor(() => {
        expect(received.some((m) => m.type === 'TX_FINALIZED_BROADCAST')).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should safely catch malformed JSON messages', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();
    
    try {
      client.send('this { is [ not valid json');
      
      await new Promise(r => setTimeout(r, 100));
      
      expect(client.readyState).toBe(WebSocket.OPEN);
      expect(received.some(m => m.parseError)).toBe(false); 
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should reject connection with an invalid password', async () => {
    await initRoom();

    const response = await roomStub.fetch(new Request('http://localhost/?pass=wrongpassword', {
      headers: { 'Upgrade': 'websocket' },
    }));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized: Invalid Room Pass");
  });

  it('should enforce the 100 signature upload limit safely via state injection', async () => {
    await initRoom();

    await runInDurableObject(roomStub, (instance: any) => {
      instance.roomState.signatures = new Array(100).fill('dummy-signature');
    });

    const { client, received } = await createWebSocketClient();
    try {
      client.send(JSON.stringify({
        type: 'UPLOAD_PARTIAL',
        fingerprint: `fp-overflow`,
        data: { encryptedData: 'sig-overflow' }
      }));

      await vi.waitFor(() => {
        expect(received.some((m) => m.message === 'Signature limit reached.')).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should remove disconnected clients gracefully during broadcast', async () => {
    await initRoom();
    const { client: client1 } = await createWebSocketClient();
    const { client: client2 } = await createWebSocketClient();
    
    try {
      await cleanupClient(client1);

      client2.send(JSON.stringify({ 
        type: 'SET_DISPLAY_NAME', 
        encryptedDisplayName: 'test' 
      }));
      
      await new Promise(r => setTimeout(r, 150));
    } finally {
      await cleanupClient(client2);
    }
  });

  it.only('should reject connection if room is not initialized', async () => {
    const wsResponse = await roomStub.fetch(new Request('http://localhost/?pass=pass123', {
      headers: { 'Upgrade': 'websocket' },
    }));

    const client = wsResponse.webSocket!;
    try {
      const closePromise = new Promise<{code: number}>((resolve) => {
        client.addEventListener('close', (e) => resolve({ code: e.code }));
      });
      
      client.accept();
      const closeEvent = await closePromise;
      
      expect(closeEvent.code).toBe(4004); 
    } finally {
      await cleanupClient(client);
    }
  });

  it.only('should enforce the room capacity limit (MAX_CONNECTIONS) via state injection', async () => {
    await initRoom();

    await runInDurableObject(roomStub, (instance: any) => {
      for (let i = 0; i < 40; i++) {
        instance.sessions.set({ close: () => {} }, { id: `dummy_${i}`, role: 'guest' });
      }
    });

    const failRes = await roomStub.fetch(new Request('http://localhost/?pass=pass123', {
      headers: { 'Upgrade': 'websocket', 'cf-connecting-ip': '10.0.0.5' },
    }));
    
    const failWs = failRes.webSocket!;
    try {
      const closePromise = new Promise<{code: number}>((resolve) => {
        failWs.addEventListener('close', (e) => resolve({ code: e.code }));
      });
      
      failWs.accept();
      const closeEvent = await closePromise;
      
      expect(closeEvent.code).toBe(4001); 
    } finally {
      await cleanupClient(failWs);
    }
  });

  it.only('should reject messages larger than MAX_PAYLOAD_SIZE_BYTES', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();

    try {
      const massivePayload = 'a'.repeat((2 * 1024 * 1024) + 10);
      client.send(massivePayload);

      await vi.waitFor(() => {
        expect(received.some(m => m.message === 'Payload too large (Max 2MB)')).toBe(true);
      });
    } finally {
      await cleanupClient(client);
    }
  });
  
  it.only('should return early from log() if roomState is null', async () => {
    await runInDurableObject(roomStub, async (instance: any) => {
      instance.roomState = null;
      // This should gracefully return without throwing an error
      await instance.log('some-encrypted-log'); 
      expect(instance.roomState).toBeNull();
    });
  });

  describe('Deep Edge Cases and Catch Blocks', () => {
    it.only('should ignore errors when closing sockets during CLOSE_ROOM', async () => {
      await initRoom();
      await runInDurableObject(roomStub, async (instance: any) => {
        // Create a mock socket that intentionally throws an error when close() is called
        const mockSocket = { 
          send: vi.fn(), 
          close: vi.fn().mockImplementation(() => { throw new Error('Close failed'); }) 
        };
        instance.sessions.set(mockSocket, { id: 'admin1', role: 'admin' });
        
        // Trigger CLOSE_ROOM. The catch block should silently absorb the error.
        await instance.handleMessage({ 
          data: JSON.stringify({ type: 'CLOSE_ROOM', encryptedLogBlob: 'log' }) 
        } as any, mockSocket);
        
        expect(instance.roomState).toBeNull(); // Room should still be successfully destroyed
        expect(instance.sessions.size).toBe(0);
      });
    });

    it.only('should ignore messages from unknown sockets', async () => {
      await initRoom();
      await runInDurableObject(roomStub, async (instance: any) => {
        const mockSocket = { send: vi.fn(), close: vi.fn() };
        
        await instance.handleMessage({ data: '{"type":"AUTH"}' } as any, mockSocket);
        
        expect(instance.sessions.has(mockSocket)).toBe(false);
      });
    });

    it.only('should catch global errors in handleMessage', async () => {
       await initRoom();
       await runInDurableObject(roomStub, async (instance: any) => {
          const mockSocket = { send: vi.fn(), close: vi.fn() };
          instance.sessions.set(mockSocket, { id: '123', role: 'guest' });
          
          const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          // Pass a null event to force a massive crash inside handleMessage
          await instance.handleMessage(null as any, mockSocket);
          
          expect(consoleSpy).toHaveBeenCalled();
          consoleSpy.mockRestore();
       });
    });

    it.only('should gracefully handle missing IP during handleClose', async () => {
        await initRoom();
        await runInDurableObject(roomStub, async (instance: any) => {
          const mockSocket = {};
          
          // Add a session but explicitly remove the IP
          instance.sessions.set(mockSocket, { id: '123', role: 'guest', ip: undefined });
          
          await instance.handleClose(mockSocket as any);
          expect(instance.sessions.has(mockSocket)).toBe(false);
        });
    });

    it.only('should allow production CORS origin signingroom.io', async () => {
      const req = new Request('http://localhost/api/health', {
        method: 'OPTIONS',
        headers: { 'Origin': 'https://app.signingroom.io', 'Access-Control-Request-Method': 'GET' }
      });
      const ctx = createExecutionContext();
      const res = await app.fetch(req, env as any, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.signingroom.io');
    });

    it.only('should allow localhost CORS origin in development', async () => {
      const req = new Request('http://localhost/api/health', {
        method: 'OPTIONS',
        headers: { 'Origin': 'http://localhost:4200', 'Access-Control-Request-Method': 'GET' }
      });
      const ctx = createExecutionContext();
      
      // Force development environment
      const devEnv = { ...env, ENVIRONMENT: 'development' };
      const res = await app.fetch(req, devEnv as any, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4200');
    });
  });
});

