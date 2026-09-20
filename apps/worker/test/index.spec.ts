import { env, createExecutionContext, waitOnExecutionContext, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
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
        const data = (await response.json()) as any;
        expect(data.status).toBe('healthy');
        expect(data.version).toBeDefined();
    });

    it('should enforce security headers', async () => {
        const request = new Request('http://localhost/api/health');
        const ctx = createExecutionContext();

        const response = await app.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        const csp = response.headers.get('Content-Security-Policy');

        expect(csp).toContain('frame-ancestors *;');
        expect(csp).toContain("default-src 'self'");
        expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should catch and log rate limiter errors gracefully', async () => {
        const request = new Request('http://localhost/api/health', {
            headers: { 'CF-Connecting-IP': '1.2.3.4' },
        });
        const ctx = createExecutionContext();

        const badEnv = {
            ...env,
            ENVIRONMENT: 'production',
            RATE_LIMITER: {
                limit: vi.fn().mockRejectedValue(new Error('Simulated KV failure')),
            },
        };

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const response = await app.fetch(request, badEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(consoleSpy).toHaveBeenCalled();
        expect(response.status).toBe(200);

        consoleSpy.mockRestore();
    });

    it('should respect environment variable overrides for limits', async () => {
        const request = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: TEST_ROOM_ID, encryptedPsbt: 'abcd' }),
        });

        const ctx = createExecutionContext();

        const customEnv = {
            ...env,
            MAX_PAYLOAD_SIZE_BYTES: '2',
        };

        const response = await app.fetch(request, customEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(413);
    });

    it('should return 429 when rate limit is exceeded', async () => {
        const request = new Request('http://localhost/api/health', {
            headers: { 'CF-Connecting-IP': '1.2.3.4' },
        });
        const ctx = createExecutionContext();

        const limitedEnv = {
            ...env,
            ENVIRONMENT: 'production',
            RATE_LIMITER: {
                limit: vi.fn().mockResolvedValue({ success: false }),
            },
        };

        const response = await app.fetch(request, limitedEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(429);
    });

    it('should return 413 if encryptedPsbt exceeds MAX_PAYLOAD_SIZE_BYTES on POST /api/room', async () => {
        const request = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: TEST_ROOM_ID,
                encryptedPsbt: 'a'.repeat(2 * 1024 * 1024 + 10),
            }),
        });
        const ctx = createExecutionContext();
        const response = await app.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(413);
        const data = (await response.json()) as any;
        expect(data.error).toContain('Payload too large');
    });

    it('should omit Access-Control-Allow-Origin for unauthorized CORS requests', async () => {
        const request = new Request('http://localhost/api/health', {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://malicious-domain.com',
                'Access-Control-Request-Method': 'GET',
            },
        });
        const ctx = createExecutionContext();
        const response = await app.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

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

        const initRes = await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify(initBody),
            }),
        );

        await initRes.text();
        return initBody;
    }

    async function createWebSocketClient(queryParams = '?pass=pass123') {
        const wsResponse = await roomStub.fetch(
            new Request(`http://localhost${queryParams}`, {
                headers: { Upgrade: 'websocket' },
            }),
        );

        const client = wsResponse.webSocket;
        if (!client) throw new Error('No WebSocket returned');

        const received: any[] = [];

        client.addEventListener('message', (event) => {
            try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                received.push(data);
            } catch (err) {
                received.push({ raw: event.data, parseError: true });
            }
        });

        client.accept();
        await new Promise((r) => setTimeout(r, 10));

        return { client, received };
    }

    async function cleanupClient(client: WebSocket) {
        if (!client) return;

        if (client.readyState !== 3) {
            const closePromise = new Promise<void>((resolve) => {
                client.addEventListener('close', () => resolve(), { once: true });
            });

            if (client.readyState === 1) {
                client.close(1000, 'Test cleanup');
            }

            try {
                await Promise.race([closePromise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))]);
            } catch (e) {}
        }
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
        const data = (await response.json()) as any;
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
            await vi.waitFor(
                () => {
                    expect(received.length).toBeGreaterThan(0);
                },
                { timeout: 1000 },
            );

            expect(received.some((m) => m.type === 'SESSION_CONNECTED')).toBe(true);
            expect(received.some((m) => m.type === 'STATE_SYNC')).toBe(true);
        } finally {
            await cleanupClient(client);
        }
    });

    it('should wrap audit logs in a server-attested envelope for identity attribution', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ 
                type: 'LOG_ACTION', 
                encryptedLogBlob: 'secret-client-data' 
            }));

            await vi.waitFor(() => {
                const logUpdates = received.filter((m) => m.type === 'LOG_UPDATE');
                if (logUpdates.length === 0) return false;
                
                const latestLog = logUpdates[logUpdates.length - 1].auditLog.slice(-1)[0];
                
                expect(latestLog.blob).toBe('secret-client-data');
                expect(latestLog.role).toBe('guest');
                expect(latestLog.sessionId).toBeDefined();
                expect(latestLog.serverTimestamp).toBeDefined();
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should authorize a room reset if the correct admin token is provided', async () => {
        await initRoom({ adminToken: 'admin-secret' });
        
        const initRes = await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({ roomId: TEST_ROOM_ID, adminToken: 'admin-secret' }),
            }),
        );

        expect(initRes.status).toBe(200);
    });

    it('should reject a room reset if the wrong admin token is provided', async () => {
        await initRoom({ adminToken: 'admin-secret' });
        
        const initRes = await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({ roomId: TEST_ROOM_ID, adminToken: 'wrong-token' }),
            }),
        );

        expect(initRes.status).toBe(401);
        expect(await initRes.text()).toBe('Unauthorized: Invalid Admin Token for Reset');
    });

    it('should forward initialization errors (like 401 Unauthorized) from the Durable Object', async () => {
        await app.fetch(
            new Request('http://localhost/api/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: TEST_ROOM_ID, adminToken: 'admin-secret' }),
            }),
            env as any,
            createExecutionContext()
        );

        const request = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: TEST_ROOM_ID, adminToken: 'wrong-token' }),
        });

        const ctx = createExecutionContext();
        const response = await app.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(401);
        const data = await response.json() as any;
        expect(data.error).toBe('Unauthorized: Invalid Admin Token for Reset');
    });

    it('should maintain persistent participants state and broadcast updates', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            await vi.waitFor(() => {
                expect(
                    received.some((m) => m.type === 'PARTICIPANTS_UPDATE' && Object.values(m.participants).some((p: any) => p.role === 'guest')),
                ).toBe(true);
            });

            client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
            await vi.waitFor(() => {
                expect(
                    received.some((m) => m.type === 'PARTICIPANTS_UPDATE' && Object.values(m.participants).some((p: any) => p.role === 'admin')),
                ).toBe(true);
            });

            client.send(JSON.stringify({ type: 'SET_DISPLAY_NAME', encryptedDisplayName: 'EncryptedNameBlob' }));
            await vi.waitFor(() => {
                expect(
                    received.some(
                        (m) =>
                            m.type === 'PARTICIPANTS_UPDATE' &&
                            Object.values(m.participants).some((p: any) => p.encryptedDisplayName === 'EncryptedNameBlob'),
                    ),
                ).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should authenticate admin with correct token', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(
                JSON.stringify({
                    type: 'AUTH',
                    token: 'admin-secret',
                }),
            );

            await vi.waitFor(
                () => {
                    expect(received.some((m) => m.type === 'ROLE_UPDATE' && m.role === 'admin')).toBe(true);
                },
                { timeout: 800 },
            );
        } finally {
            await cleanupClient(client);
        }
    });

    it('should reject invalid admin token and lock out the specific IP after 5 failures', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            for (let i = 0; i < 6; i++) {
                client.send(JSON.stringify({ type: 'AUTH', token: 'wrong' }));
            }

            await vi.waitFor(() => {
                expect(received.some((m) => m.message?.includes('IP temporarily locked'))).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should update signer labels (admin only)', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'UPDATE_LABEL',
                    fingerprint: 'abc123',
                    label: 'Coordinator Label',
                    encryptedLogBlob: 'label-log',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'LABELS_UPDATED')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should update address labels (admin only)', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'UPDATE_ADDRESS_LABEL',
                    blindedAddress: 'blinded-addr-123',
                    label: 'Corporate Treasury',
                    encryptedLogBlob: 'address-label-log',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'ADDRESS_LABELS_UPDATED')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should reject UPDATE_LABEL if the encrypted label payload exceeds 200 characters', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            const massiveLabel = 'a'.repeat(201);
            client.send(
                JSON.stringify({
                    type: 'UPDATE_LABEL',
                    fingerprint: 'abc123',
                    label: massiveLabel,
                    encryptedLogBlob: 'label-log',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'ERROR' && m.message === 'Label payload too large.')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should reject UPDATE_ADDRESS_LABEL if the encrypted label payload exceeds 200 characters', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            const massiveLabel = 'a'.repeat(201);
            client.send(
                JSON.stringify({
                    type: 'UPDATE_ADDRESS_LABEL',
                    blindedAddress: 'blinded-addr-123',
                    label: massiveLabel,
                    encryptedLogBlob: 'address-label-log',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'ERROR' && m.message === 'Label payload too large.')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should close room and clean up on CLOSE_ROOM (admin)', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'CLOSE_ROOM',
                    encryptedLogBlob: 'closing-room',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'ROOM_CLOSED')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should reject connection on protocol version mismatch', async () => {
        await initRoom({ protocolVersion: '2.0.0' });

        const wsResponse = await roomStub.fetch(
            new Request('http://localhost/?pass=pass123&v=1.0.0', {
                headers: { Upgrade: 'websocket' },
            }),
        );

        const client = wsResponse.webSocket!;
        client.accept();

        const received: any[] = [];
        client.addEventListener('message', (e) => {
            received.push(JSON.parse(e.data as string));
        });

        try {
            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'ERROR_VERSION_MISMATCH')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should ignore UPLOAD_PARTIAL if payload exceeds MAX_PAYLOAD_SIZE_BYTES', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            const massiveData = 'a'.repeat(2 * 1024 * 1024 + 10);
            client.send(
                JSON.stringify({
                    type: 'UPLOAD_PARTIAL',
                    fingerprint: '123456',
                    data: { encryptedData: massiveData },
                    encryptedLogBlob: 'upload-log',
                }),
            );

            await new Promise((r) => setTimeout(r, 100)); // Wait for processing

            expect(received.some((m) => m.type === 'NEW_PARTIAL_DATA')).toBe(false);
        } finally {
            await cleanupClient(client);
        }
    });

    it('should enforce message rate limiting', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            for (let i = 0; i < 20; i++) {
                client.send(
                    JSON.stringify({
                        type: 'LOG_ACTION',
                        encryptedLogBlob: `log-${i}`,
                    }),
                );
            }

            await vi.waitFor(
                () => {
                    const logUpdates = received.filter((m) => m.type === 'LOG_UPDATE');
                    return logUpdates.length > 0;
                },
                { timeout: 800 },
            );

            const logUpdates = received.filter((m) => m.type === 'LOG_UPDATE');
            expect(logUpdates.length).toBeLessThan(15);
        } finally {
            await cleanupClient(client);
        }
    });

    it('should reject more than 10 connections from the same IP', async () => {
        await initRoom();
        const clients: WebSocket[] = [];

        for (let i = 0; i < 10; i++) {
            const res = await roomStub.fetch(
                new Request('http://localhost/?pass=pass123', {
                    headers: { Upgrade: 'websocket', 'cf-connecting-ip': '1.2.3.4' },
                }),
            );
            if (res.webSocket) {
                res.webSocket.accept();
                await new Promise((r) => setTimeout(r, 5));
                clients.push(res.webSocket);
            }
        }

        const failRes = await roomStub.fetch(
            new Request('http://localhost/?pass=pass123', {
                headers: { Upgrade: 'websocket', 'cf-connecting-ip': '1.2.3.4' },
            }),
        );

        expect(failRes.status).toBe(429);

        for (const c of clients) {
            await cleanupClient(c);
        }
    });

    it('should set display name and broadcast connections', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(
                JSON.stringify({
                    type: 'SET_DISPLAY_NAME',
                    encryptedDisplayName: 'EncryptedNameBlob',
                }),
            );

            await vi.waitFor(() => {
                expect(
                    received.some(
                        (m) => m.type === 'CONNECTIONS_UPDATE' && m.sessions.some((s: any) => s.encryptedDisplayName === 'EncryptedNameBlob'),
                    ),
                ).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should rename the room (admin only)', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'RENAME_ROOM',
                    encryptedName: 'New Encrypted Room Name',
                    encryptedLogBlob: 'rename-log',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'ROOM_RENAMED' && m.encryptedName === 'New Encrypted Room Name')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should accept partial uploads and enforce limit', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(
                JSON.stringify({
                    type: 'UPLOAD_PARTIAL',
                    fingerprint: '123456',
                    data: { encryptedData: 'sig-data' },
                    encryptedLogBlob: 'upload-log',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'NEW_PARTIAL_DATA' && m.fingerprint === '123456')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should allow admin to update whitelist and lock room', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'UPDATE_WHITELIST',
                    encryptedWhitelist: ['pubkey1', 'pubkey2'],
                    encryptedLogBlob: 'whitelist-log',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'WHITELIST_UPDATED')).toBe(true);
            });

            client.send(
                JSON.stringify({
                    type: 'TOGGLE_LOCK',
                    isLocked: true,
                    encryptedLogBlob: 'lock-log',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'LOCK_UPDATED' && m.isLocked === true)).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should finalize transaction (admin only)', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'TX_FINALIZED',
                    encryptedFinalTxHex: 'hex-data',
                    encryptedFinalTxId: 'txid-data',
                    encryptedLogBlob: 'tx-log',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'TX_FINALIZED_BROADCAST')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should safely catch malformed JSON messages', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send('this { is [ not valid json');

            await new Promise((r) => setTimeout(r, 100));

            expect(client.readyState).toBe(WebSocket.OPEN);
            expect(received.some((m) => m.parseError)).toBe(false);
        } finally {
            await cleanupClient(client);
        }
    });

    it('should reject connection with an invalid password', async () => {
        await initRoom();

        const response = await roomStub.fetch(
            new Request('http://localhost/?pass=wrongpassword', {
                headers: { Upgrade: 'websocket' },
            }),
        );

        expect(response.status).toBe(401);
        expect(await response.text()).toBe('Unauthorized: Invalid Room Pass');
    });

    it('should enforce the 100 signature upload limit safely via state injection', async () => {
        await initRoom();

        await runInDurableObject(roomStub, (instance: any) => {
            const sigs: Record<string, string> = {};
            for (let i = 0; i < 100; i++) {
                sigs[`dummy-fp-${i}`] = 'dummy-signature';
            }
            instance.roomState.signatures = sigs;
        });

        const { client, received } = await createWebSocketClient();
        try {
            client.send(
                JSON.stringify({
                    type: 'UPLOAD_PARTIAL',
                    fingerprint: `fp-overflow`,
                    data: { encryptedData: 'sig-overflow' },
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.message === 'Signature limit reached.')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should remove disconnected clients gracefully during broadcast', async () => {
        await initRoom();
        const { client: client1 } = await createWebSocketClient();
        const { client: client2 } = await createWebSocketClient();

        try {
            await cleanupClient(client1);

            client2.send(
                JSON.stringify({
                    type: 'SET_DISPLAY_NAME',
                    encryptedDisplayName: 'test',
                }),
            );

            await new Promise((r) => setTimeout(r, 150));
        } finally {
            await cleanupClient(client2);
        }
    });

    it('should reject connection if room is not initialized', async () => {
        const wsResponse = await roomStub.fetch(
            new Request('http://localhost/?pass=pass123', {
                headers: { Upgrade: 'websocket' },
            }),
        );

        const client = wsResponse.webSocket!;
        try {
            const closePromise = new Promise<{ code: number }>((resolve) => {
                client.addEventListener('close', (e) => resolve({ code: e.code }));
            });

            client.accept();
            const closeEvent = await closePromise;

            expect(closeEvent.code).toBe(4004);
        } finally {
            await cleanupClient(client);
        }
    });

    it('should enforce the room capacity limit (MAX_CONNECTIONS) via state injection', async () => {
        await initRoom();

        await runInDurableObject(roomStub, (instance: any) => {
            for (let i = 0; i < 40; i++) {
                instance.sessions.set({ close: () => {} }, { id: `dummy_${i}`, role: 'guest' });
            }
        });

        const failRes = await roomStub.fetch(
            new Request('http://localhost/?pass=pass123', {
                headers: { Upgrade: 'websocket', 'cf-connecting-ip': '10.0.0.5' },
            }),
        );

        const failWs = failRes.webSocket!;
        try {
            const closePromise = new Promise<{ code: number }>((resolve) => {
                failWs.addEventListener('close', (e) => resolve({ code: e.code }));
            });

            failWs.accept();
            const closeEvent = await closePromise;

            expect(closeEvent.code).toBe(4001);
        } finally {
            await cleanupClient(failWs);
        }
    });

    it('should reject messages larger than MAX_PAYLOAD_SIZE_BYTES', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            const massivePayload = 'a'.repeat(2 * 1024 * 1024 + 10);
            client.send(massivePayload);

            await vi.waitFor(() => {
                expect(received.some((m) => m.message === 'Payload too large (Max 2MB)')).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should return early from log() if roomState is null', async () => {
        await runInDurableObject(roomStub, async (instance: any) => {
            instance.roomState = null;
            await instance.log('some-encrypted-log', { id: 'sys', role: 'admin' });
            expect(instance.roomState).toBeNull();
        });
    });

    describe('RBAC & Role Management', () => {
        it('should allow admins to register new role tokens up to the limit', async () => {
            await initRoom();
            const { client, received } = await createWebSocketClient();

            try {
                // Verify non-admins are rejected
                client.send(
                    JSON.stringify({
                        type: 'REGISTER_ROLE',
                        tokenHash: 'hash',
                        canUpload: true,
                        policyBlob: 'encrypted-blob'
                    }),
                );
                await vi.waitFor(() => expect(received.some((m) => m.type === 'ERROR' && m.message === 'Unauthorized')).toBe(true));

                // Auth as Admin
                client.send(JSON.stringify({ type: 'AUTH', token: 'admin-secret' }));
                await vi.waitFor(() => expect(received.some((m) => m.type === 'ROLE_UPDATE')).toBe(true));

                // Register successfully
                client.send(
                    JSON.stringify({
                        type: 'REGISTER_ROLE',
                        tokenHash: 'hashed-token-123',
                        canUpload: true,
                        policyBlob: 'encrypted-blob'
                    }),
                );
                await vi.waitFor(() => expect(received.some((m) => m.type === 'ROLE_REGISTERED_SUCCESS')).toBe(true));

                // Hit the 50 limit guard
                await runInDurableObject(roomStub, async (instance: any) => {
                    instance.roomState.roleTokens = {};
                    for (let i = 0; i < 50; i++) instance.roomState.roleTokens[`hash${i}`] = { canUpload: true, policyBlob: 'blob' };
                });

                client.send(
                    JSON.stringify({
                        type: 'REGISTER_ROLE',
                        tokenHash: 'hashed-token-51',
                        canUpload: true,
                        policyBlob: 'encrypted-blob'
                    }),
                );
                await vi.waitFor(() =>
                    expect(received.some((m) => m.type === 'ERROR' && m.message.includes('Maximum role links generated'))).toBe(true),
                );
            } finally {
                await cleanupClient(client);
            }
        });

        it('should authenticate a valid role token and dispatch constraints', async () => {
            const rawToken = 'my-secret-token';
            const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
            const tokenHash = Array.from(new Uint8Array(hashBuffer))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');

            await initRoom({
                roleTokens: {
                    [tokenHash]: { canUpload: true, policyBlob: 'mock-policy-blob' },
                },
            });

            const { client, received } = await createWebSocketClient();
            try {
                // Invalid Token
                client.send(JSON.stringify({ type: 'AUTH_ROLE', token: 'wrong-token' }));
                await vi.waitFor(() => expect(received.some((m) => m.type === 'ERROR' && m.message.includes('Invalid or revoked'))).toBe(true));

                // Valid Token
                client.send(JSON.stringify({ type: 'AUTH_ROLE', token: rawToken }));
                await vi.waitFor(() =>
                    expect(received.some((m) => m.type === 'CONSTRAINT_UPDATE' && m.policyBlob === 'mock-policy-blob')).toBe(true),
                );

                // Exception branch - Node TextEncoder coerces objects to "[object Object]" so it just fails auth.
                client.send(JSON.stringify({ type: 'AUTH_ROLE', token: { unexpected: 'object' } }));
                await vi.waitFor(() => expect(received.some((m) => m.type === 'ERROR' && m.message === 'Invalid or revoked role token')).toBe(true));
            } finally {
                await cleanupClient(client);
            }
        });

        it('should enforce strict mode policy violations for guests without tokens or with restricted tokens', async () => {
            const rawToken = 'restricted-token';
            const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
            const tokenHash = Array.from(new Uint8Array(hashBuffer))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');

            await initRoom({
                roleTokens: {
                    [tokenHash]: { canUpload: false, policyBlob: 'restricted-policy-blob' },
                },
            });

            const { client, received } = await createWebSocketClient();
            try {
                // Try to upload without ANY token (Downgrade protection)
                client.send(JSON.stringify({ type: 'UPLOAD_PARTIAL', data: {} }));
                await vi.waitFor(() =>
                    expect(received.some((m) => m.type === 'ERROR_POLICY_VIOLATION' && m.message.includes('A valid role token is required'))).toBe(
                        true,
                    ),
                );

                // Authenticate using the restricted token
                client.send(JSON.stringify({ type: 'AUTH_ROLE', token: rawToken }));
                await vi.waitFor(() => expect(received.some((m) => m.type === 'CONSTRAINT_UPDATE' && m.policyBlob === 'restricted-policy-blob')).toBe(true));

                const currentMsgCount = received.length;

                // Try to upload again (Blocked by token constraints)
                client.send(JSON.stringify({ type: 'UPLOAD_PARTIAL', data: {} }));
                await vi.waitFor(() =>
                    expect(
                        received
                            .slice(currentMsgCount)
                            .some((m) => m.type === 'ERROR_POLICY_VIOLATION' && m.message.includes('restricts signature uploads')),
                    ).toBe(true),
                );
            } finally {
                await cleanupClient(client);
            }
        });
    });

    describe('Deep Edge Cases and Catch Blocks', () => {

        it('should track msgsInWindow, reset on expiry, and ignore rapid spammers', async () => {
            vi.useFakeTimers();
            await initRoom();
            
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = { send: vi.fn(), close: vi.fn() };
                instance.env = { ...instance.env, RATE_LIMIT_WINDOW: '100', MAX_MSGS_PER_WINDOW: '1' };
                
                instance.sessions.set(mockSocket, { 
                    id: '123', role: 'guest', msgsInWindow: 0, lastMsgTime: Date.now(), ip: '1.1.1.1' 
                });
                
                // First message
                await instance.handleMessage({ data: JSON.stringify({ type: 'PING' }) } as any, mockSocket);
                expect(instance.sessions.get(mockSocket).msgsInWindow).toBe(1);

                // Second message immediately (rapid)
                await instance.handleMessage({ data: JSON.stringify({ type: 'PING' }) } as any, mockSocket);
                expect(instance.sessions.get(mockSocket).msgsInWindow).toBe(2);

                // Third message immediately -> Exceeds MAX_MSGS_PER_WINDOW of 1.
                // The worker increments it to 3, but returns early.
                await instance.handleMessage({ data: JSON.stringify({ type: 'PING' }) } as any, mockSocket);
                expect(instance.sessions.get(mockSocket).msgsInWindow).toBe(3); 
                
                // Now advance time past RATE_LIMIT_WINDOW
                vi.advanceTimersByTime(150);
                
                // Fourth message -> Should reset msgsInWindow to 1
                await instance.handleMessage({ data: JSON.stringify({ type: 'PING' }) } as any, mockSocket);
                expect(instance.sessions.get(mockSocket).msgsInWindow).toBe(1);
            });
            
            vi.useRealTimers();
        });

        it('should shift auditLog array if it exceeds MAX_AUDIT_LOG_LENGTH', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                instance.env = { ...instance.env, MAX_AUDIT_LOG_LENGTH: '2' };
                instance.roomState.auditLog = [
                    { serverTimestamp: 1, sessionId: 'a', role: 'guest', blob: 'log1' },
                    { serverTimestamp: 2, sessionId: 'b', role: 'guest', blob: 'log2' }
                ];
                
                await instance.log('log3');
                
                expect(instance.roomState.auditLog.length).toBe(2);
                expect(instance.roomState.auditLog[0].blob).toBe('log2'); 
                expect(instance.roomState.auditLog[1].blob).toBe('log3'); 
            });
        });

        it('should drop broken sockets gracefully during broadcast()', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockBrokenSocket = {
                    send: vi.fn().mockImplementation(() => { throw new Error('Broken pipe'); }),
                    close: vi.fn()
                };
                instance.sessions.set(mockBrokenSocket, { id: '123', role: 'guest' });
                
                expect(() => instance.broadcast({ type: 'TEST' })).not.toThrow();
                expect(instance.sessions.has(mockBrokenSocket)).toBe(false);
            });
        });

        it('should ignore errors when attempting to close sockets during alarm()', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockBrokenSocket = {
                    send: vi.fn(),
                    close: vi.fn().mockImplementation(() => { throw new Error('Close fail'); })
                };
                instance.sessions.set(mockBrokenSocket, { id: '123', role: 'guest' });
                
                await instance.alarm();
                
                expect(instance.sessions.size).toBe(0);
                expect(instance.roomState).toBeNull();
            });
        });

        it('should ignore errors when closing sockets during CLOSE_ROOM', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = {
                    send: vi.fn(),
                    close: vi.fn().mockImplementation(() => { throw new Error('Close failed'); }),
                };
                instance.sessions.set(mockSocket, { id: 'admin1', role: 'admin' });

                await instance.handleMessage({ data: JSON.stringify({ type: 'CLOSE_ROOM' }) } as any, mockSocket);

                expect(instance.roomState).toBeNull();
                expect(instance.sessions.size).toBe(0);
            });
        });

        it('should gracefully handle socket closure errors during session resumption', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockOldSocket = {
                    send: vi.fn(),
                    close: vi.fn().mockImplementation(() => { throw new Error('Already closed'); })
                };
                const mockNewSocket = { send: vi.fn(), close: vi.fn(), accept: vi.fn(), addEventListener: vi.fn() };

                instance.sessions.set(mockOldSocket, { id: 'ABCD', role: 'guest' });

                // Pass ABCD (4 characters) so it matches the Regex
                await instance.handleSession(mockNewSocket as any, '1.1.1.1', 'ABCD');

                expect(instance.sessions.has(mockOldSocket)).toBe(false);
                expect(instance.sessions.has(mockNewSocket as any)).toBe(true);
            });
        });

        it('should initialize missing dictionary objects on label updates and display name changes', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = { send: vi.fn(), close: vi.fn() };
                instance.sessions.set(mockSocket, { id: '123', role: 'admin' });

                delete instance.roomState.signerLabels;
                delete instance.roomState.addressLabels;
                delete instance.roomState.participants;

                await instance.handleMessage({ data: JSON.stringify({ type: 'UPDATE_LABEL', fingerprint: '1', label: 'A' }) } as any, mockSocket);
                expect(instance.roomState.signerLabels).toBeDefined();

                await instance.handleMessage({ data: JSON.stringify({ type: 'UPDATE_ADDRESS_LABEL', blindedAddress: '2', label: 'B' }) } as any, mockSocket);
                expect(instance.roomState.addressLabels).toBeDefined();

                await instance.handleMessage({ data: JSON.stringify({ type: 'SET_DISPLAY_NAME', encryptedDisplayName: 'C' }) } as any, mockSocket);
                expect(instance.roomState.participants).toBeDefined();
            });
        });

        it('should catch and handle errors inside AUTH_ROLE JSON parsing', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = { send: vi.fn(), close: vi.fn() };
                instance.sessions.set(mockSocket, { id: '123', role: 'guest', msgsInWindow: 0, lastMsgTime: Date.now() });
                
                // 1. Invalid payload coerces to string, but fails hash match
                await instance.handleMessage({ 
                    data: JSON.stringify({ type: 'AUTH_ROLE', token: { bad: 'type' } }) 
                } as any, mockSocket);
                
                expect(mockSocket.send).toHaveBeenCalledWith(
                    JSON.stringify({ type: 'ERROR', message: 'Invalid or revoked role token' })
                );

                // 2. Force an actual exception inside the block to hit the catch
                const digestSpy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('Crypto failure'));
                await instance.handleMessage({ 
                    data: JSON.stringify({ type: 'AUTH_ROLE', token: 'valid-token' }) 
                } as any, mockSocket);

                expect(mockSocket.send).toHaveBeenCalledWith(
                    JSON.stringify({ type: 'ERROR', message: 'Failed to authenticate role' })
                );
                digestSpy.mockRestore();
            });
        });

        it('should clear the ipAuthFailures map if it exceeds MAX_IP_TRACKERS to prevent memory exhaustion', async () => {
            await initRoom();
            
            await runInDurableObject(roomStub, async (instance: any) => {
                const maxTrackers = 1000;
                
                for (let i = 0; i < maxTrackers; i++) {
                    instance.ipAuthFailures.set(`192.168.0.${i}`, { count: 1, lockedUntil: 0 });
                }

                const mockSocket = { send: vi.fn(), close: vi.fn() };
                instance.sessions.set(mockSocket, { id: 'test-session', role: 'guest', ip: '10.0.0.1' });

                await instance.handleMessage(
                    { data: JSON.stringify({ type: 'AUTH', token: 'wrong-password' }) } as any,
                    mockSocket
                );

                expect(instance.ipAuthFailures.size).toBe(1);
                expect(instance.ipAuthFailures.has('10.0.0.1')).toBe(true);
            });
        });

        it('should ignore messages from unknown sockets', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = { send: vi.fn(), close: vi.fn() };
                await instance.handleMessage({ data: '{"type":"AUTH"}' } as any, mockSocket);
                expect(instance.sessions.has(mockSocket)).toBe(false);
            });
        });

        it('should catch global errors in handleMessage', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = { send: vi.fn(), close: vi.fn() };
                instance.sessions.set(mockSocket, { id: '123', role: 'guest' });

                const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
                await instance.handleMessage(null as any, mockSocket);

                expect(consoleSpy).toHaveBeenCalled();
                consoleSpy.mockRestore();
            });
        });

        it('should gracefully handle missing IP during handleClose', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = {};
                instance.sessions.set(mockSocket, { id: '123', role: 'guest', ip: undefined });

                await instance.handleClose(mockSocket as any);
                expect(instance.sessions.has(mockSocket)).toBe(false);
            });
        });

        it('should allow production CORS origin signingroom.io', async () => {
            const req = new Request('http://localhost/api/health', {
                method: 'OPTIONS',
                headers: { Origin: 'https://app.signingroom.io', 'Access-Control-Request-Method': 'GET' },
            });
            const ctx = createExecutionContext();

            const prodEnv = { ...env, ALLOWED_ORIGIN: 'signingroom.io' };
            const res = await app.fetch(req, prodEnv as any, ctx);
            await waitOnExecutionContext(ctx);

            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.signingroom.io');
        });

        it('should allow localhost CORS origin in development', async () => {
            const req = new Request('http://localhost/api/health', {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:4200', 'Access-Control-Request-Method': 'GET' },
            });
            const ctx = createExecutionContext();

            const devEnv = { ...env, ENVIRONMENT: 'development' };
            const res = await app.fetch(req, devEnv as any, ctx);
            await waitOnExecutionContext(ctx);

            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4200');
        });
    });

    describe('SigningRoom Data Chunking & Storage', () => {
        it('should save and load small state without chunking', async () => {
            const id = env.SIGNING_ROOM.idFromName('chunk-test-small');
            const stub = env.SIGNING_ROOM.get(id);

            await runInDurableObject(stub, async (instance: any) => {
                instance.roomState = { roomId: 'small-room', signatures: { 'fp1': 'sig1' } };

                await instance.saveRoomState();

                const dataChunks = await instance.state.storage.get('data_chunks');
                const dataKey = await instance.state.storage.get('data');

                expect(dataChunks).toBeUndefined();
                expect(typeof dataKey).toBe('string');
                expect(JSON.parse(dataKey as string)).toEqual({ roomId: 'small-room', signatures: { 'fp1': 'sig1' } });

                const loaded = await instance.loadRoomState();
                expect(loaded).toEqual({ roomId: 'small-room', signatures: { 'fp1': 'sig1' } });
            });
        });

        it('should automatically chunk large state over 100KB', async () => {
            const id = env.SIGNING_ROOM.idFromName('chunk-test-large');
            const stub = env.SIGNING_ROOM.get(id);

            await runInDurableObject(stub, async (instance: any) => {
                const massivePayload = 'a'.repeat(150 * 1024);
                instance.roomState = { roomId: 'large-room', data: massivePayload };

                await instance.saveRoomState();

                const dataChunks = await instance.state.storage.get('data_chunks');
                const dataKey = await instance.state.storage.get('data');
                const chunk0 = await instance.state.storage.get('data_0');
                const chunk1 = await instance.state.storage.get('data_1');

                expect(dataKey).toBeUndefined();
                expect(dataChunks).toBe(2); 
                expect(chunk0).toBeDefined();
                expect(chunk1).toBeDefined();

                const loaded = await instance.loadRoomState();
                expect(loaded.roomId).toBe('large-room');
                expect(loaded.data.length).toBe(150 * 1024);
                expect(loaded.data).toBe(massivePayload);
            });
        });

        it('should gracefully load legacy un-stringified production data', async () => {
            const id = env.SIGNING_ROOM.idFromName('chunk-test-legacy');
            const stub = env.SIGNING_ROOM.get(id);

            await runInDurableObject(stub, async (instance: any) => {
                await instance.state.storage.put('data', { roomId: 'legacy-room', oldFormat: true });

                const loaded = await instance.loadRoomState();
                expect(loaded).toEqual({ roomId: 'legacy-room', oldFormat: true });

                instance.roomState = loaded;
                await instance.saveRoomState();

                const upgradedData = await instance.state.storage.get('data');
                expect(typeof upgradedData).toBe('string');
            });
        });
    });
});
