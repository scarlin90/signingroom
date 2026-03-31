// index.spec.ts
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
  it('should return healthy on /api/health', async () => {
    const request = new Request('http://localhost/api/health');
    const ctx = createExecutionContext();

    const response = await app.fetch(request, env as any, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.status).toBe('healthy');
    expect(data.version).toBeDefined();
  });

  it('should enforce security headers', async () => {
    const request = new Request('http://localhost/api/health');
    const ctx = createExecutionContext();

    const response = await app.fetch(request, env as any, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('should catch and log rate limiter errors gracefully', async () => {
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

  it('should return 429 when rate limit is exceeded', async () => {
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
});

describe('SigningRoom Durable Object', () => {
  let roomStub: DurableObjectStub;

  beforeEach(() => {
    TEST_ROOM_ID = `test-room-${crypto.randomUUID()}`;
    const id = env.SIGNING_ROOM.idFromName(TEST_ROOM_ID);
    roomStub = env.SIGNING_ROOM.get(id);
  });

  afterEach(async () => {
    try {
      await runDurableObjectAlarm(roomStub);
    } catch (_) {}

    await new Promise((r) => setTimeout(r, 200));
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

    client.addEventListener('close', () => {});
    client.accept();
    await new Promise(r => setTimeout(r, 10));

    return { client, received };
  }

  async function cleanupClient(client: WebSocket, stub: DurableObjectStub) {
    if (!client) return;

    const closePromise = new Promise<void>((resolve) => {
      const onClose = () => {
        client.removeEventListener('close', onClose);
        resolve();
      };
      client.addEventListener('close', onClose, { once: true });
      client.close(1000, "Test cleanup");
    });

    try {
      await Promise.race([
        closePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('WebSocket close timeout')), 500))
      ]);
    } catch (e) {
      console.warn('WebSocket close timed out during cleanup');
      try { client.close(); } catch {}
    }

    await new Promise(r => setTimeout(r, 150));

    try {
      await runDurableObjectAlarm(stub);
    } catch (_) {}

    await new Promise(r => setTimeout(r, 50));
  }

  it('should initialize a room via POST /api/room', async () => {
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

  it('should reject non-websocket upgrade requests', async () => {
    const response = await roomStub.fetch(new Request('http://localhost/'));
    expect(response.status).toBe(426);
  });

  it('should successfully upgrade to a WebSocket and send initial state', async () => {
    await initRoom({ encryptedLogBlob: 'initial-creation-log' });
    const { client, received } = await createWebSocketClient();

    try {
      await vi.waitFor(() => {
        expect(received.length).toBeGreaterThan(0);
      }, { timeout: 1000 });

      expect(received.some((m) => m.type === 'SESSION_CONNECTED')).toBe(true);
      expect(received.some((m) => m.type === 'STATE_SYNC')).toBe(true);
    } finally {
      await cleanupClient(client, roomStub);
    }
  });

  it('should maintain persistent participants state and broadcast updates', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should authenticate admin with correct token', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should reject invalid admin token and lock out after 5 failures', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should update signer labels (admin only)', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should close room and clean up on CLOSE_ROOM (admin)', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should reject connection on protocol version mismatch', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should enforce message rate limiting', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should reject more than 10 connections from the same IP', async () => {
    await initRoom();
    const clients = [];

    for (let i = 0; i < 10; i++) {
      const res = await roomStub.fetch(new Request('http://localhost/?pass=pass123', {
        headers: { 'Upgrade': 'websocket', 'cf-connecting-ip': '1.2.3.4' },
      }));
      if (res.webSocket) {
        res.webSocket.accept();
        clients.push(res.webSocket);
      }
    }

    const failRes = await roomStub.fetch(new Request('http://localhost/?pass=pass123', {
      headers: { 'Upgrade': 'websocket', 'cf-connecting-ip': '1.2.3.4' },
    }));

    expect(failRes.status).toBe(429);
    
    for (const c of clients) {
      try { c.close(1000, "Test end"); } catch {}
    }
    await new Promise(r => setTimeout(r, 200));
    try {
      await runDurableObjectAlarm(roomStub);
    } catch (_) {}
  });

  it('should set display name and broadcast connections', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should rename the room (admin only)', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should accept partial uploads and enforce limit', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should allow admin to update whitelist and lock room', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should finalize transaction (admin only)', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should safely catch malformed JSON messages', async () => {
    await initRoom();
    const { client, received } = await createWebSocketClient();
    
    try {
      client.send('this { is [ not valid json');
      
      await new Promise(r => setTimeout(r, 100));
      
      expect(client.readyState).toBe(WebSocket.OPEN);
      expect(received.some(m => m.parseError)).toBe(false); 
    } finally {
      await cleanupClient(client, roomStub);
    }
  });

  it('should reject connection with an invalid password', async () => {
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
      await cleanupClient(client, roomStub);
    }
  });

  it('should remove disconnected clients gracefully during broadcast', async () => {
    await initRoom();
    const { client: client1 } = await createWebSocketClient();
    const { client: client2 } = await createWebSocketClient();
    
    try {
      client1.close(1000);

      client2.send(JSON.stringify({ 
        type: 'SET_DISPLAY_NAME', 
        encryptedDisplayName: 'test' 
      }));
      
      await new Promise(r => setTimeout(r, 150));
    } finally {
      await cleanupClient(client2, roomStub);
    }
  });

  it('should reject connection if room is not initialized', async () => {
    const wsResponse = await roomStub.fetch(new Request('http://localhost/?pass=pass123', {
      headers: { 'Upgrade': 'websocket' },
    }));

    const client = wsResponse.webSocket!;
    
    const closePromise = new Promise<{code: number}>((resolve) => {
      client.addEventListener('close', (e) => resolve({ code: e.code }));
    });
    
    client.accept();
    const closeEvent = await closePromise;
    
    expect(closeEvent.code).toBe(4004); 
  });

  it('should enforce the room capacity limit (MAX_CONNECTIONS) via state injection', async () => {
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
    
    const closePromise = new Promise<{code: number}>((resolve) => {
      failWs.addEventListener('close', (e) => resolve({ code: e.code }));
    });
    
    failWs.accept();
    const closeEvent = await closePromise;
    
    expect(closeEvent.code).toBe(4001); 
  });
});