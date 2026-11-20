import { env, createExecutionContext, waitOnExecutionContext, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import app from '../src/index';

const PASS = 'room-pass-16chars-ok';
const ADMIN = 'admin-secret-token-24chars-ok';
const ENC_PSBT = 'cHNidP8BAgQCAAAAAQAAAAAAAAAAAAAAAAAAAAA=';
const FP_HEX = 'a1b2c3d4';
const ADDR_HEX = '1122334455667788';

let TEST_ROOM_ID = '';

async function sha256Hex(val: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(val));
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

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

        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
        expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload');
        expect(response.headers.get('X-Frame-Options')).toBe('DENY');

        expect(response.headers.get('Content-Security-Policy')).toBeNull();
        expect(response.headers.get('X-XSS-Protection')).toBeNull();
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
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://signingroom.io',
            },
            body: JSON.stringify({ roomId: TEST_ROOM_ID || 'room-12345678', encryptedPsbt: ENC_PSBT }),
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

    it('should reject payloads exceeding MAX_PAYLOAD_SIZE_BYTES before attempting to parse JSON (OOM Protection)', async () => {
        const massiveInvalidJson = 'a'.repeat(2 * 1024 * 1024 + 10);

        const request = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://signingroom.io',
            },
            body: massiveInvalidJson,
        });

        const ctx = createExecutionContext();
        const response = await app.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(413);
        const data = (await response.json()) as any;
        expect(data.error).toContain('Payload too large');
    });

    it('should cleanly handle malformed JSON payloads under the size limit', async () => {
        const request = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://signingroom.io',
            },
            body: '{"roomId": "test", "brokenJson: true',
        });

        const ctx = createExecutionContext();
        const response = await app.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(400);
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
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://signingroom.io',
            },
            body: JSON.stringify({
                roomId: TEST_ROOM_ID || 'room-12345678',
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

describe('Origin Validation & Domain Lockdown (isOriginAllowed branches)', () => {
    const prodEnv = {
        ...env,
        ENVIRONMENT: 'production',
        ALLOWED_ORIGIN: 'signingroom.io',
    };

    it('should allow production root domain and valid subdomains', async () => {
        const origins = [
            'https://signingroom.io',
            'https://dev.signingroom.io',
            'https://staging.signingroom.io',
            'https://staging-branded.signingroom.io',
            'https://api.signingroom.io',
        ];

        for (const origin of origins) {
            const req = new Request('http://localhost/api/health', {
                method: 'OPTIONS',
                headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
            });
            const ctx = createExecutionContext();
            const res = await app.fetch(req, prodEnv as any, ctx);
            await waitOnExecutionContext(ctx);

            expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        }
    });

    it('should reject unencrypted HTTP origins in production', async () => {
        const req = new Request('http://localhost/api/health', {
            method: 'OPTIONS',
            headers: { Origin: 'http://signingroom.io', 'Access-Control-Request-Method': 'GET' },
        });
        const ctx = createExecutionContext();
        const res = await app.fetch(req, prodEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should block suffix domain impersonation attempts', async () => {
        const maliciousOrigins = [
            'https://evil-signingroom.io',
            'https://fakesigningroom.io',
            'https://signingroom.io.attacker.com',
            'https://attacker-signingroom.io',
        ];

        for (const origin of maliciousOrigins) {
            const req = new Request('http://localhost/api/health', {
                method: 'OPTIONS',
                headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
            });
            const ctx = createExecutionContext();
            const res = await app.fetch(req, prodEnv as any, ctx);
            await waitOnExecutionContext(ctx);

            expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
        }
    });

    it('should allow exact match against ALLOWED_ORIGIN even if non-standard or port-based', async () => {
        const customEnv = {
            ...env,
            ENVIRONMENT: 'production',
            ALLOWED_ORIGIN: 'http://127.0.0.1:4200',
        };

        const req = new Request('http://localhost/api/health', {
            method: 'OPTIONS',
            headers: { Origin: 'http://127.0.0.1:4200', 'Access-Control-Request-Method': 'GET' },
        });
        const ctx = createExecutionContext();
        const res = await app.fetch(req, customEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4200');
    });

    it('should permit localhost and 127.0.0.1 on arbitrary ports in development mode', async () => {
        const devEnv = {
            ...env,
            ENVIRONMENT: 'development',
        };

        const testOrigins = ['http://localhost:3000', 'http://127.0.0.1:5173', 'http://localhost:8787'];

        for (const origin of testOrigins) {
            const req = new Request('http://localhost/api/health', {
                method: 'OPTIONS',
                headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
            });
            const ctx = createExecutionContext();
            const res = await app.fetch(req, devEnv as any, ctx);
            await waitOnExecutionContext(ctx);

            expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        }
    });

    it('should cleanly handle malformed unparseable URLs in the catch block', async () => {
        const req = new Request('http://localhost/api/health', {
            method: 'OPTIONS',
            headers: { Origin: '://invalid-uri', 'Access-Control-Request-Method': 'GET' },
        });
        const ctx = createExecutionContext();
        const res = await app.fetch(req, prodEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should support ALLOW_HEADLESS_ACCESS for self-hosted server-to-server calls', async () => {
        const headlessEnv = {
            ...env,
            ENVIRONMENT: 'production',
            ALLOWED_ORIGIN: 'my-relay.com',
            ALLOW_HEADLESS_ACCESS: 'true',
        };

        const req = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: 'headless-room-1',
                expectedPass: PASS,
                adminToken: ADMIN,
                encryptedPsbt: ENC_PSBT,
            }),
        });
        const ctx = createExecutionContext();
        const res = await app.fetch(req, headlessEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);
    });

    it('should block headless requests in production when ALLOW_HEADLESS_ACCESS is disabled or unset', async () => {
        const strictProdEnv = {
            ...env,
            ENVIRONMENT: 'production',
            ALLOWED_ORIGIN: 'signingroom.io',
            ALLOW_HEADLESS_ACCESS: 'false',
        };

        const req = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: 'headless-room-2',
                expectedPass: PASS,
                adminToken: ADMIN,
                encryptedPsbt: ENC_PSBT,
            }),
        });
        const ctx = createExecutionContext();
        const res = await app.fetch(req, strictProdEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(401);
        const data = (await res.json()) as any;
        expect(data.error).toBe('Unauthorized: First-party origin required.');
    });
});

describe('Gated API Endpoints: POST /api/room & GET /api/room/:id/websocket', () => {
    const prodEnv = {
        ...env,
        ENVIRONMENT: 'production',
        ALLOWED_ORIGIN: 'signingroom.io',
    };

    it('should reject POST /api/room if origin is unauthorized', async () => {
        const req = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://unauthorized-wallet.com',
            },
            body: JSON.stringify({ roomId: 'unauth-room-1' }),
        });
        const ctx = createExecutionContext();
        const res = await app.fetch(req, prodEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(401);
        const data = (await res.json()) as any;
        expect(data.error).toBe('Unauthorized: First-party origin required.');
    });

    it('should authorize POST /api/room when a valid first-party Referer is supplied', async () => {
        const req = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Referer: 'https://staging.signingroom.io/dashboard/create',
            },
            body: JSON.stringify({
                roomId: 'referer-auth-room',
                expectedPass: PASS,
                adminToken: ADMIN,
                encryptedPsbt: ENC_PSBT,
            }),
        });
        const ctx = createExecutionContext();
        const res = await app.fetch(req, prodEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.roomId).toBe('referer-auth-room');
    });

    it('should reject GET /api/room/:id/websocket with 403 on cross-origin WebSocket hijack attempt', async () => {
        const req = new Request('http://localhost/api/room/test-room-1234/websocket', {
            headers: {
                Upgrade: 'websocket',
                Origin: 'https://thirdparty-dapp.com',
            },
        });
        const ctx = createExecutionContext();
        const res = await app.fetch(req, prodEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(403);
        expect(await res.text()).toBe('Cross-Origin WebSocket Access Forbidden');
    });

    it('should permit GET /api/room/:id/websocket when origin is verified', async () => {
        const req = new Request('http://localhost/api/room/test-room-1234/websocket', {
            headers: {
                Upgrade: 'websocket',
                Origin: 'https://signingroom.io',
            },
        });
        const ctx = createExecutionContext();
        const res = await app.fetch(req, prodEnv as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).not.toBe(403);
    });
});

describe('SigningRoom Durable Object', () => {
    let roomStub: DurableObjectStub;

    beforeEach(() => {
        TEST_ROOM_ID = `test-room-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const id = env.SIGNING_ROOM.idFromName(TEST_ROOM_ID);
        roomStub = env.SIGNING_ROOM.get(id);
    });

    afterEach(async () => {
        await new Promise((r) => setTimeout(r, 20));
    });

    async function initRoom(overrides: any = {}) {
        const initBody = {
            roomId: TEST_ROOM_ID,
            expectedPass: PASS,
            adminToken: ADMIN,
            encryptedPsbt: ENC_PSBT,
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

    async function createWebSocketClient(queryParams = `?pass=${PASS}`) {
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
        try {
            if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
                client.close(1000, 'Test cleanup');
            }
        } catch {}
        await new Promise((r) => setTimeout(r, 15));
    }

    it('should initialize a room via POST /api/room with first-party origin', async () => {
        const request = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://signingroom.io',
            },
            body: JSON.stringify({
                roomId: TEST_ROOM_ID,
                expectedPass: PASS,
                adminToken: ADMIN,
                encryptedPsbt: ENC_PSBT,
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
            client.send(
                JSON.stringify({
                    type: 'LOG_ACTION',
                    encryptedLogBlob: 'secret-client-data',
                }),
            );

            await vi.waitFor(() => {
                const logUpdates = received.filter((m) => m.type === 'LOG_UPDATE');
                if (logUpdates.length === 0) return false;

                const latest = logUpdates[logUpdates.length - 1];
                expect(latest.entry.blob).toBe('secret-client-data');
                expect(latest.entry.role).toBe('guest');
                expect(latest.entry.sessionId).toBeDefined();
                expect(latest.entry.serverTimestamp).toBeDefined();
                expect(latest.entry.chainHash).toMatch(/^[a-f0-9]{64}$/);
                return true;
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should ignore LOG_ACTION if encryptedLogBlob exceeds 10,000 characters', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            const massiveBlob = 'a'.repeat(10001);
            client.send(
                JSON.stringify({
                    type: 'LOG_ACTION',
                    encryptedLogBlob: massiveBlob,
                }),
            );

            await new Promise((r) => setTimeout(r, 100));
            expect(received.some((m) => m.type === 'LOG_UPDATE')).toBe(false);
        } finally {
            await cleanupClient(client);
        }
    });

    it('should ignore LOG_ACTION if encryptedLogBlob is not a string', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(
                JSON.stringify({
                    type: 'LOG_ACTION',
                    encryptedLogBlob: { invalid: 'object' },
                }),
            );

            await new Promise((r) => setTimeout(r, 100));
            expect(received.some((m) => m.type === 'LOG_UPDATE')).toBe(false);
        } finally {
            await cleanupClient(client);
        }
    });

    it('should authorize a room reset if the correct admin token is provided', async () => {
        await initRoom({ adminToken: ADMIN });

        const initRes = await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId: TEST_ROOM_ID,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                }),
            }),
        );

        expect(initRes.status).toBe(200);
    });

    it('should reject a room reset if the wrong admin token is provided', async () => {
        await initRoom({ adminToken: ADMIN });

        const initRes = await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId: TEST_ROOM_ID,
                    expectedPass: PASS,
                    adminToken: 'wrong-token-24chars-invalid',
                    encryptedPsbt: ENC_PSBT,
                }),
            }),
        );

        expect(initRes.status).toBe(401);
        expect(await initRes.text()).toBe('Unauthorized: Invalid Admin Token for Reset');
    });

    it('should forward initialization errors (like 401 Unauthorized) from the Durable Object', async () => {
        await app.fetch(
            new Request('http://localhost/api/room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://signingroom.io',
                },
                body: JSON.stringify({
                    roomId: TEST_ROOM_ID,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                }),
            }),
            env as any,
            createExecutionContext(),
        );

        const request = new Request('http://localhost/api/room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://signingroom.io',
            },
            body: JSON.stringify({
                roomId: TEST_ROOM_ID,
                expectedPass: PASS,
                adminToken: 'wrong-token-24chars-invalid',
                encryptedPsbt: ENC_PSBT,
            }),
        });

        const ctx = createExecutionContext();
        const response = await app.fetch(request, env as any, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(401);
        const data = (await response.json()) as any;
        expect(data.error).toBe('Unauthorized: Invalid Admin Token for Reset');
    });

    it('should maintain persistent participants state and broadcast updates', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            await vi.waitFor(() => {
                expect(
                    received.some(
                        (m) =>
                            m.type === 'PARTICIPANTS_UPDATE' &&
                            Object.values(m.participants).some((p: any) => p.role === 'guest'),
                    ),
                ).toBe(true);
            });

            client.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
            await vi.waitFor(() => {
                expect(
                    received.some(
                        (m) =>
                            m.type === 'PARTICIPANTS_UPDATE' &&
                            Object.values(m.participants).some((p: any) => p.role === 'admin'),
                    ),
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
                    token: ADMIN,
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
                expect(received.some((m) => m.message?.includes('Too many failed attempts'))).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should prune only expired trackers when exceeding MAX_IP_TRACKERS and preserve active lockouts', async () => {
        await initRoom();

        await runInDurableObject(roomStub, async (instance: any) => {
            instance.env = { ...instance.env, MAX_IP_TRACKERS: '5' };
            const now = Date.now();

            instance.ipAuthFailures.set('192.168.1.1', { count: 5, lockedUntil: now - 10000 });
            instance.ipAuthFailures.set('192.168.1.2', { count: 5, lockedUntil: now - 5000 });
            instance.ipAuthFailures.set('192.168.1.3', { count: 5, lockedUntil: now - 1000 });

            instance.ipAuthFailures.set('192.168.1.100', { count: 5, lockedUntil: now + 60000 });
            instance.ipAuthFailures.set('192.168.1.101', { count: 5, lockedUntil: now + 120000 });

            expect(instance.ipAuthFailures.size).toBe(5);

            const mockSocket = { send: vi.fn(), close: vi.fn() };
            instance.sessions.set(mockSocket, { id: 'test-session', role: 'guest', ip: '10.0.0.99' });

            await instance.handleMessage(
                { data: JSON.stringify({ type: 'AUTH', token: 'wrong-password' }) } as any,
                mockSocket,
            );

            expect(instance.ipAuthFailures.has('192.168.1.1')).toBe(false);
            expect(instance.ipAuthFailures.has('192.168.1.2')).toBe(false);
            expect(instance.ipAuthFailures.has('192.168.1.3')).toBe(false);
            expect(instance.ipAuthFailures.has('192.168.1.100')).toBe(true);
            expect(instance.ipAuthFailures.has('192.168.1.101')).toBe(true);
            expect(instance.ipAuthFailures.has('10.0.0.99')).toBe(true);
            expect(instance.ipAuthFailures.size).toBe(3);
        });
    });

    it('should update signer labels (admin only)', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'UPDATE_LABEL',
                    fingerprint: FP_HEX,
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
            client.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'UPDATE_ADDRESS_LABEL',
                    blindedAddress: ADDR_HEX,
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
            client.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'UPDATE_LABEL',
                    fingerprint: FP_HEX,
                    label: 'a'.repeat(201),
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
            client.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'UPDATE_ADDRESS_LABEL',
                    blindedAddress: ADDR_HEX,
                    label: 'a'.repeat(201),
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
            client.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
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
            new Request(`http://localhost/?pass=${PASS}&v=1.0.0`, {
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
                    fingerprint: FP_HEX,
                    data: { encryptedData: massiveData },
                    encryptedLogBlob: 'upload-log',
                }),
            );

            await new Promise((r) => setTimeout(r, 100));
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
                new Request(`http://localhost/?pass=${PASS}`, {
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
            new Request(`http://localhost/?pass=${PASS}`, {
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
                        (m) =>
                            m.type === 'CONNECTIONS_UPDATE' &&
                            m.sessions.some((s: any) => s.encryptedDisplayName === 'EncryptedNameBlob'),
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
            client.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'RENAME_ROOM',
                    encryptedName: 'New Encrypted Room Name',
                    encryptedLogBlob: 'rename-log',
                }),
            );

            await vi.waitFor(() => {
                expect(
                    received.some((m) => m.type === 'ROOM_RENAMED' && m.encryptedName === 'New Encrypted Room Name'),
                ).toBe(true);
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
                    fingerprint: FP_HEX,
                    data: { encryptedData: 'sig-data' },
                    encryptedLogBlob: 'upload-log',
                }),
            );

            await vi.waitFor(() => {
                expect(received.some((m) => m.type === 'NEW_PARTIAL_DATA' && m.fingerprint === FP_HEX)).toBe(true);
            });
        } finally {
            await cleanupClient(client);
        }
    });

    it('should allow admin to update whitelist and lock room', async () => {
        await initRoom();
        const { client, received } = await createWebSocketClient();

        try {
            client.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
            await vi.waitFor(() => received.some((m) => m.type === 'ROLE_UPDATE'));

            client.send(
                JSON.stringify({
                    type: 'UPDATE_WHITELIST',
                    encryptedWhitelist: 'enc-whitelist-blob',
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
            client.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
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
            new Request('http://localhost/?pass=wrongpassword-16chars', {
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
                sigs[`deadbeef${i.toString(16).padStart(4, '0')}`] = 'dummy-signature';
            }
            instance.roomState.signatures = sigs;
        });

        const { client, received } = await createWebSocketClient();
        try {
            client.send(
                JSON.stringify({
                    type: 'UPLOAD_PARTIAL',
                    fingerprint: 'cafebabe',
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
            new Request(`http://localhost/?pass=${PASS}`, {
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
            new Request(`http://localhost/?pass=${PASS}`, {
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
                client.send(
                    JSON.stringify({
                        type: 'REGISTER_ROLE',
                        tokenHash: 'hash',
                        canUpload: true,
                        policyBlob: 'encrypted-blob',
                    }),
                );
                await vi.waitFor(() => expect(received.some((m) => m.type === 'ERROR' && m.message === 'Unauthorized')).toBe(true));

                client.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
                await vi.waitFor(() => expect(received.some((m) => m.type === 'ROLE_UPDATE')).toBe(true));

                client.send(
                    JSON.stringify({
                        type: 'REGISTER_ROLE',
                        tokenHash: 'hashed-token-123',
                        canUpload: true,
                        policyBlob: 'encrypted-blob',
                    }),
                );
                await vi.waitFor(() => expect(received.some((m) => m.type === 'ROLE_REGISTERED_SUCCESS')).toBe(true));

                await runInDurableObject(roomStub, async (instance: any) => {
                    instance.roomState.roleTokens = {};
                    for (let i = 0; i < 50; i++) instance.roomState.roleTokens[`hash${i}`] = { canUpload: true, policyBlob: 'blob' };
                });

                client.send(
                    JSON.stringify({
                        type: 'REGISTER_ROLE',
                        tokenHash: 'hashed-token-51',
                        canUpload: true,
                        policyBlob: 'encrypted-blob',
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
            const tokenHash = await sha256Hex(rawToken);

            await initRoom({
                roleTokens: {
                    [tokenHash]: { canUpload: true, policyBlob: 'mock-policy-blob' },
                },
            });

            const { client, received } = await createWebSocketClient();
            try {
                client.send(JSON.stringify({ type: 'AUTH_ROLE', token: 'wrong-token' }));
                await vi.waitFor(() => expect(received.some((m) => m.type === 'ERROR' && m.message.includes('Invalid or revoked'))).toBe(true));

                client.send(JSON.stringify({ type: 'AUTH_ROLE', token: rawToken }));
                await vi.waitFor(() =>
                    expect(received.some((m) => m.type === 'CONSTRAINT_UPDATE' && m.policyBlob === 'mock-policy-blob')).toBe(true),
                );

                client.send(JSON.stringify({ type: 'AUTH_ROLE', token: { unexpected: 'object' } }));
                await vi.waitFor(() => expect(received.some((m) => m.type === 'ERROR' && m.message === 'Invalid or revoked role token')).toBe(true));
            } finally {
                await cleanupClient(client);
            }
        });

        it('should enforce strict mode policy violations for guests without tokens or with restricted tokens', async () => {
            const rawToken = 'restricted-token';
            const tokenHash = await sha256Hex(rawToken);

            await initRoom({
                roleTokens: {
                    [tokenHash]: { canUpload: false, policyBlob: 'restricted-policy-blob' },
                },
            });

            const { client, received } = await createWebSocketClient();
            try {
                client.send(JSON.stringify({ type: 'UPLOAD_PARTIAL', fingerprint: FP_HEX, data: {} }));
                await vi.waitFor(() =>
                    expect(
                        received.some((m) => m.type === 'ERROR_POLICY_VIOLATION' && m.message.includes('A valid role token is required')),
                    ).toBe(true),
                );

                client.send(JSON.stringify({ type: 'AUTH_ROLE', token: rawToken }));
                await vi.waitFor(() =>
                    expect(received.some((m) => m.type === 'CONSTRAINT_UPDATE' && m.policyBlob === 'restricted-policy-blob')).toBe(true),
                );

                const currentMsgCount = received.length;

                client.send(JSON.stringify({ type: 'UPLOAD_PARTIAL', fingerprint: FP_HEX, data: {} }));
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
        it('should properly capture existing roles during session reconnection', async () => {
            await initRoom();
            const resumeToken = 'a'.repeat(64);
            const resumeTokenHash = await sha256Hex(resumeToken);

            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = { send: vi.fn(), close: vi.fn(), accept: vi.fn(), addEventListener: vi.fn() };

                instance.roomState.participants = {
                    ABCD: {
                        id: 'ABCD',
                        role: 'admin',
                        encryptedDisplayName: 'Admin',
                        resumeTokenHash,
                    },
                };

                await instance.handleSession(mockSocket as any, '1.1.1.1', 'ABCD', resumeToken);

                expect(instance.roomState.participants['ABCD'].role).toBe('admin');
            });
        });

        it('should trigger handleClose when the WebSocket native close event fires', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                let capturedCallback: any = null;
                const mockSocket = {
                    send: vi.fn(),
                    close: vi.fn(),
                    accept: vi.fn(),
                    addEventListener: (event: string, cb: any) => {
                        if (event === 'close') capturedCallback = cb;
                    },
                };

                await instance.handleSession(mockSocket as any, '1.2.3.4', null, null);
                expect(instance.sessions.has(mockSocket)).toBe(true);

                if (capturedCallback) {
                    capturedCallback();
                }

                expect(instance.sessions.has(mockSocket)).toBe(false);
            });
        });

        it('should track msgsInWindow, reset on expiry, and ignore rapid spammers', async () => {
            vi.useFakeTimers();
            await initRoom();

            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = { send: vi.fn(), close: vi.fn() };
                instance.env = { ...instance.env, RATE_LIMIT_WINDOW: '100', MAX_MSGS_PER_WINDOW: '1' };

                instance.sessions.set(mockSocket, {
                    id: '123',
                    role: 'guest',
                    msgsInWindow: 0,
                    lastMsgTime: Date.now(),
                    ip: '1.1.1.1',
                });

                await instance.handleMessage({ data: JSON.stringify({ type: 'PING' }) } as any, mockSocket);
                expect(instance.sessions.get(mockSocket).msgsInWindow).toBe(1);

                await instance.handleMessage({ data: JSON.stringify({ type: 'PING' }) } as any, mockSocket);
                expect(instance.sessions.get(mockSocket).msgsInWindow).toBe(2);

                await instance.handleMessage({ data: JSON.stringify({ type: 'PING' }) } as any, mockSocket);
                expect(instance.sessions.get(mockSocket).msgsInWindow).toBe(3);

                vi.advanceTimersByTime(150);

                await instance.handleMessage({ data: JSON.stringify({ type: 'PING' }) } as any, mockSocket);
                expect(instance.sessions.get(mockSocket).msgsInWindow).toBe(1);
            });

            vi.useRealTimers();
        });

        it('should refuse new auditLog entries once MAX_AUDIT_LOG_LENGTH is reached', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                instance.env = { ...instance.env, MAX_AUDIT_LOG_LENGTH: '2' };
                instance.roomState.auditLog = [
                    { seq: 0, serverTimestamp: 1, sessionId: 'a', role: 'guest', blob: 'log1', chainHash: '0'.repeat(64) },
                    { seq: 1, serverTimestamp: 2, sessionId: 'b', role: 'guest', blob: 'log2', chainHash: '0'.repeat(64) },
                ];

                const appended = await instance.log('log3');

                expect(appended).toBe(false);
                expect(instance.roomState.auditLog.length).toBe(2);
            });
        });

        it('should drop broken sockets gracefully during broadcast()', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockBrokenSocket = {
                    send: vi.fn().mockImplementation(() => {
                        throw new Error('Broken pipe');
                    }),
                    close: vi.fn(),
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
                    close: vi.fn().mockImplementation(() => {
                        throw new Error('Close fail');
                    }),
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
                    close: vi.fn().mockImplementation(() => {
                        throw new Error('Close failed');
                    }),
                };
                instance.sessions.set(mockSocket, { id: 'admin1', role: 'admin' });

                await instance.handleMessage({ data: JSON.stringify({ type: 'CLOSE_ROOM' }) } as any, mockSocket);

                expect(instance.roomState).toBeNull();
                expect(instance.sessions.size).toBe(0);
            });
        });

        it('should gracefully handle socket closure errors during session resumption', async () => {
            await initRoom();
            const resumeToken = 'b'.repeat(64);
            const resumeTokenHash = await sha256Hex(resumeToken);

            await runInDurableObject(roomStub, async (instance: any) => {
                const mockOldSocket = {
                    send: vi.fn(),
                    close: vi.fn().mockImplementation(() => {
                        throw new Error('Already closed');
                    }),
                };
                const mockNewSocket = { send: vi.fn(), close: vi.fn(), accept: vi.fn(), addEventListener: vi.fn() };

                instance.roomState.participants = {
                    ABCD: { id: 'ABCD', role: 'guest', resumeTokenHash },
                };
                instance.sessions.set(mockOldSocket, { id: 'ABCD', role: 'guest', ip: '1.1.1.1' });

                await instance.handleSession(mockNewSocket as any, '1.1.1.1', 'ABCD', resumeToken);

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

                await instance.handleMessage(
                    { data: JSON.stringify({ type: 'UPDATE_LABEL', fingerprint: FP_HEX, label: 'A' }) } as any,
                    mockSocket,
                );
                expect(instance.roomState.signerLabels).toBeDefined();

                await instance.handleMessage(
                    { data: JSON.stringify({ type: 'UPDATE_ADDRESS_LABEL', blindedAddress: ADDR_HEX, label: 'B' }) } as any,
                    mockSocket,
                );
                expect(instance.roomState.addressLabels).toBeDefined();

                await instance.handleMessage(
                    { data: JSON.stringify({ type: 'SET_DISPLAY_NAME', encryptedDisplayName: 'C' }) } as any,
                    mockSocket,
                );
                expect(instance.roomState.participants).toBeDefined();
            });
        });

        it('should catch and handle errors inside AUTH_ROLE JSON parsing', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = { send: vi.fn(), close: vi.fn() };
                instance.sessions.set(mockSocket, { id: '123', role: 'guest', msgsInWindow: 0, lastMsgTime: Date.now() });

                await instance.handleMessage(
                    { data: JSON.stringify({ type: 'AUTH_ROLE', token: { bad: 'type' } }) } as any,
                    mockSocket,
                );

                expect(mockSocket.send).toHaveBeenCalledWith(
                    JSON.stringify({ type: 'ERROR', message: 'Invalid or revoked role token' }),
                );

                const digestSpy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('Crypto failure'));
                await instance.handleMessage(
                    { data: JSON.stringify({ type: 'AUTH_ROLE', token: 'valid-token' }) } as any,
                    mockSocket,
                );

                expect(mockSocket.send).toHaveBeenCalledWith(
                    JSON.stringify({ type: 'ERROR', message: 'Failed to authenticate role' }),
                );
                digestSpy.mockRestore();
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

        it('should fallback securely if session participant metadata is missing during connection', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = { send: vi.fn(), close: vi.fn(), accept: vi.fn(), addEventListener: vi.fn() };

                instance.roomState.participants = null;

                await instance.handleSession(mockSocket as any, '1.2.3.4', null, null);

                expect(instance.sessions.get(mockSocket).role).toBe('guest');
                expect(Object.keys(instance.roomState.participants).length).toBe(1);
            });
        });

        it('should correctly attach client-attested metadata to the session object on first message', async () => {
            await initRoom();
            await runInDurableObject(roomStub, async (instance: any) => {
                const mockSocket = { send: vi.fn(), close: vi.fn() };
                instance.sessions.set(mockSocket, { id: 'META', role: 'guest', msgsInWindow: 0, lastMsgTime: Date.now() });

                await instance.handleMessage(
                    {
                        data: JSON.stringify({
                            type: 'PING',
                            meta: { tier: 'ENTERPRISE', sdkVersion: '1.5.0' },
                        }),
                    } as any,
                    mockSocket,
                );

                expect(instance.sessions.get(mockSocket).meta.tier).toBe('ENTERPRISE');
                expect(instance.sessions.get(mockSocket).meta.sdkVersion).toBe('1.5.0');
            });
        });
    });

    describe('SigningRoom Data Chunking & Storage', () => {
        it('should save and load small state without chunking', async () => {
            const id = env.SIGNING_ROOM.idFromName('chunk-test-small');
            const stub = env.SIGNING_ROOM.get(id);

            await runInDurableObject(stub, async (instance: any) => {
                instance.roomState = { roomId: 'small-room', signatures: { fp1: 'sig1' } };

                await instance.saveRoomState();

                const dataChunks = await instance.state.storage.get('data_chunks');
                const dataKey = await instance.state.storage.get('data');

                expect(dataChunks).toBeUndefined();
                expect(typeof dataKey).toBe('string');
                expect(JSON.parse(dataKey as string)).toEqual({ roomId: 'small-room', signatures: { fp1: 'sig1' } });

                const loaded = await instance.loadRoomState();
                expect(loaded).toEqual({ roomId: 'small-room', signatures: { fp1: 'sig1' } });
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

    describe('Worker License Attestation (verifyServerLicense)', () => {
        const validCommunityToken =
            'srl_0DGPSeBK6w99XjmrwvdFBbfIC6XH-_czfymlxEgguusg5mb9tpEmNfuPBZdNSittYGuQiei1jvD67XKdxUYuVkdCgQEBAwAAAAAAAAAAAAAAAaFTwDzFASoeU2lnbmluZyBSb29tIENvbW11bml0eSBFZGl0aW9uAAAA';

        it('should initialize a room as COMMUNITY if no license token is provided', async () => {
            const id = env.SIGNING_ROOM.idFromName('license-test-1');
            const stub = env.SIGNING_ROOM.get(id);

            await stub.fetch(
                new Request('http://internal/init', {
                    method: 'POST',
                    body: JSON.stringify({
                        roomId: 'license-test-1',
                        expectedPass: PASS,
                        adminToken: ADMIN,
                        encryptedPsbt: ENC_PSBT,
                    }),
                }),
            );

            await runInDurableObject(stub, async (instance: any) => {
                expect(instance.roomState.tier).toBe('COMMUNITY');
                expect(instance.roomState.licensee).toBe('Signing Room Community Edition');
                expect(instance.roomState.licenseToken).toBeNull();
            });
        });

        it('should fallback to COMMUNITY if the license token is malformed', async () => {
            const id = env.SIGNING_ROOM.idFromName('license-test-2');
            const stub = env.SIGNING_ROOM.get(id);

            await stub.fetch(
                new Request('http://internal/init', {
                    method: 'POST',
                    body: JSON.stringify({
                        roomId: 'license-test-2',
                        expectedPass: PASS,
                        adminToken: ADMIN,
                        encryptedPsbt: ENC_PSBT,
                        licenseToken: 'srl_badtoken',
                    }),
                }),
            );

            await runInDurableObject(stub, async (instance: any) => {
                expect(instance.roomState.tier).toBe('COMMUNITY');
            });
        });

        it('should reject a token with an invalid checksum but proper format', async () => {
            const badChecksumToken = validCommunityToken.replace('srl_0DGP', 'srl_9DGP');

            const id = env.SIGNING_ROOM.idFromName('license-test-3');
            const stub = env.SIGNING_ROOM.get(id);

            await stub.fetch(
                new Request('http://internal/init', {
                    method: 'POST',
                    body: JSON.stringify({
                        roomId: 'license-test-3',
                        expectedPass: PASS,
                        adminToken: ADMIN,
                        encryptedPsbt: ENC_PSBT,
                        licenseToken: badChecksumToken,
                    }),
                }),
            );

            await runInDurableObject(stub, async (instance: any) => {
                expect(instance.roomState.tier).toBe('COMMUNITY');
            });
        });

        it('should successfully attest and initialize a verified license token', async () => {
            const id = env.SIGNING_ROOM.idFromName('license-test-4');
            const stub = env.SIGNING_ROOM.get(id);

            await stub.fetch(
                new Request('http://internal/init', {
                    method: 'POST',
                    body: JSON.stringify({
                        roomId: 'license-test-4',
                        expectedPass: PASS,
                        adminToken: ADMIN,
                        encryptedPsbt: ENC_PSBT,
                        licenseToken: validCommunityToken,
                        attestedLicense: { tier: 'COMMUNITY', licensee: 'Verified Comm', domain: '*' },
                    }),
                }),
            );

            await runInDurableObject(stub, async (instance: any) => {
                expect(instance.roomState.tier).toBe('COMMUNITY');
                expect(instance.roomState.licensee).toBe('Verified Comm');
                expect(instance.roomState.licenseToken).toBe(validCommunityToken);
            });
        });

        it('should completely fallback if the token signature is rejected by crypto API', async () => {
            const request = new Request('http://localhost/api/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: 'https://signingroom.io' },
                body: JSON.stringify({
                    roomId: 'test-crypto-fail',
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    licenseToken: validCommunityToken,
                }),
            });

            const ctx = createExecutionContext();
            const verifySpy = vi.spyOn(crypto.subtle, 'verify').mockRejectedValueOnce(new Error('Crypto Error'));

            const response = await app.fetch(request, env as any, ctx);
            await waitOnExecutionContext(ctx);

            expect(response.status).toBe(200);
            verifySpy.mockRestore();
        });

        it('should reject a valid token if it is mathematically expired', async () => {
            const dvSpy = vi.spyOn(DataView.prototype, 'getBigUint64').mockImplementation((offset) => {
                if (offset === 3) return BigInt(1);
                return BigInt(Date.now());
            });

            const id = env.SIGNING_ROOM.idFromName('license-test-expired');
            const stub = env.SIGNING_ROOM.get(id);

            await stub.fetch(
                new Request('http://internal/init', {
                    method: 'POST',
                    body: JSON.stringify({
                        roomId: 'license-test-expired',
                        expectedPass: PASS,
                        adminToken: ADMIN,
                        encryptedPsbt: ENC_PSBT,
                        licenseToken: validCommunityToken,
                    }),
                }),
            );

            await runInDurableObject(stub, async (instance: any) => {
                expect(instance.roomState.tier).toBe('COMMUNITY');
            });

            dvSpy.mockRestore();
        });

        it('should fallback to COMMUNITY if the Origin/Referer header cannot be parsed as a URL', async () => {
            const tdSpy = vi.spyOn(TextDecoder.prototype, 'decode').mockReturnValue('strict-domain.com');

            const request = new Request('http://localhost/api/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: 'not-a-valid-url://^&*' },
                body: JSON.stringify({
                    roomId: 'test-url-parse-fail',
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    licenseToken: validCommunityToken,
                }),
            });

            const ctx = createExecutionContext();
            const response = await app.fetch(request, env as any, ctx);
            await waitOnExecutionContext(ctx);

            expect(response.status).toBe(200);

            const id = env.SIGNING_ROOM.idFromName('test-url-parse-fail');
            const stub = env.SIGNING_ROOM.get(id);
            await runInDurableObject(stub, async (instance: any) => {
                expect(instance.roomState.tier).toBe('COMMUNITY');
            });

            tdSpy.mockRestore();
        });

        it('should reject a strict domain token if the Origin hostname does not match', async () => {
            const tdSpy = vi.spyOn(TextDecoder.prototype, 'decode').mockImplementation((bytes) => {
                if (bytes.length === 1) return 'strict-domain.com';
                return 'Verified Enterprise';
            });

            const request = new Request('http://localhost/api/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: 'https://evil-hacker.com' },
                body: JSON.stringify({
                    roomId: 'test-wrong-domain',
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    licenseToken: validCommunityToken,
                }),
            });

            const ctx = createExecutionContext();
            await app.fetch(request, env as any, ctx);

            const id = env.SIGNING_ROOM.idFromName('test-wrong-domain');
            const stub = env.SIGNING_ROOM.get(id);
            await runInDurableObject(stub, async (instance: any) => {
                expect(instance.roomState.tier).toBe('COMMUNITY');
            });

            tdSpy.mockRestore();
        });

        it('should successfully attest a strict domain token if the Origin hostname matches exactly or as a subdomain', async () => {
            const tdSpy = vi.spyOn(TextDecoder.prototype, 'decode').mockImplementation((bytes) => {
                if (bytes.length === 1) return 'strict-domain.com,localhost:4201';
                return 'Verified Enterprise';
            });

            const cryptoSpy = vi.spyOn(crypto.subtle, 'verify').mockResolvedValue(true);

            const dvSpy = vi.spyOn(DataView.prototype, 'getUint8').mockImplementation(function (this: DataView, offset: number) {
                if (offset === 1) return 2;
                return 1;
            });

            const request = new Request('http://localhost/api/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: 'https://vault.strict-domain.com' },
                body: JSON.stringify({
                    roomId: 'test-correct-domain',
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    licenseToken: validCommunityToken,
                }),
            });

            const ctx = createExecutionContext();
            await app.fetch(request, { ...env, ALLOWED_ORIGIN: 'strict-domain.com' } as any, ctx);

            const id = env.SIGNING_ROOM.idFromName('test-correct-domain');
            const stub = env.SIGNING_ROOM.get(id);
            await runInDurableObject(stub, async (instance: any) => {
                expect(instance.roomState.tier).toBe('ENTERPRISE');
            });

            tdSpy.mockRestore();
            cryptoSpy.mockRestore();
            dvSpy.mockRestore();
        });

        it('should successfully attest an exact port match', async () => {
            const tdSpy = vi.spyOn(TextDecoder.prototype, 'decode').mockImplementation((bytes) => {
                if (bytes.length === 1) return 'localhost:4201';
                return 'Verified Dev';
            });
            const cryptoSpy = vi.spyOn(crypto.subtle, 'verify').mockResolvedValue(true);

            const request = new Request('http://localhost/api/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4201' },
                body: JSON.stringify({
                    roomId: 'test-port-domain',
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    licenseToken: validCommunityToken,
                }),
            });

            const ctx = createExecutionContext();
            await app.fetch(request, { ...env, ENVIRONMENT: 'development' } as any, ctx);

            const id = env.SIGNING_ROOM.idFromName('test-port-domain');
            const stub = env.SIGNING_ROOM.get(id);
            await runInDurableObject(stub, async (instance: any) => {
                expect(instance.roomState).toBeDefined();
            });

            tdSpy.mockRestore();
            cryptoSpy.mockRestore();
        });
    });

    describe('v2.0.0 Worker & Durable Object Coverage', () => {
    let roomId: string;
    let roomStub: DurableObjectStub;

    beforeEach(() => {
        roomId = `v2-room-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        roomStub = env.SIGNING_ROOM.get(env.SIGNING_ROOM.idFromName(roomId));
    });

    it('should handle Sec-WebSocket-Protocol pass and resume subprotocols and lock enforcement', async () => {
        await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    protocol: 'musig2',
                }),
            }),
        );

        const res1 = await roomStub.fetch(
            new Request('http://localhost/', {
                headers: {
                    Upgrade: 'websocket',
                    'Sec-WebSocket-Protocol': `signingroom-v2, pass.${PASS}`,
                },
            }),
        );
        const ws1 = res1.webSocket!;
        const msgs1: any[] = [];
        ws1.addEventListener('message', (e) => {
            if (typeof e.data === 'string') msgs1.push(JSON.parse(e.data));
        });
        ws1.accept();

        await vi.waitFor(() =>
            expect(msgs1.some((m) => m.type === 'SESSION_CONNECTED' && m.resumeToken)).toBe(true),
        );
        const { sessionId, resumeToken } = msgs1.find((m) => m.type === 'SESSION_CONNECTED');

        // Promote to admin and lock room
        ws1.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
        await vi.waitFor(() => expect(msgs1.some((m) => m.type === 'ROLE_UPDATE')).toBe(true));
        ws1.send(JSON.stringify({ type: 'TOGGLE_LOCK', isLocked: true, encryptedLogBlob: 'lock' }));
        await vi.waitFor(() => expect(msgs1.some((m) => m.type === 'LOCK_UPDATED')).toBe(true));

        // New guest blocked when locked
        const resBlocked = await roomStub.fetch(
            new Request(`http://localhost/?pass=${PASS}`, { headers: { Upgrade: 'websocket' } }),
        );
        const wsBlocked = resBlocked.webSocket!;
        const blockedMsgs: any[] = [];
        wsBlocked.addEventListener('message', (e) => {
            if (typeof e.data === 'string') blockedMsgs.push(JSON.parse(e.data));
        });
        wsBlocked.accept();
        await vi.waitFor(() => expect(blockedMsgs.some((m) => m.type === 'ERROR_LOCKED')).toBe(true));
        wsBlocked.close(1000);

        // Verified returning session resumes via Sec-WebSocket-Protocol resume.<sid>.<token>
        const resResume = await roomStub.fetch(
            new Request(`http://localhost/?pass=${PASS}`, {
                headers: {
                    Upgrade: 'websocket',
                    'Sec-WebSocket-Protocol': `signingroom-v2, resume.${sessionId}.${resumeToken}`,
                },
            }),
        );
        const wsResume = resResume.webSocket!;
        const resumeMsgs: any[] = [];
        wsResume.addEventListener('message', (e) => {
            if (typeof e.data === 'string') resumeMsgs.push(JSON.parse(e.data));
        });
        wsResume.accept();
        await vi.waitFor(() =>
            expect(resumeMsgs.some((m) => m.type === 'SESSION_CONNECTED' && m.sessionId === sessionId)).toBe(true),
        );

        wsResume.close(1000);
        ws1.close(1000);
        await new Promise((r) => setTimeout(r, 20));
    });

    it('should handle UPLOAD_NONCE, PUBLISH_AGGREGATE_PSBT, slot ownership, and quota/key checks', async () => {
        await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    protocol: 'musig2',
                }),
            }),
        );

        const resA = await roomStub.fetch(
            new Request(`http://localhost/?pass=${PASS}`, { headers: { Upgrade: 'websocket' } }),
        );
        const wsA = resA.webSocket!;
        const msgsA: any[] = [];
        wsA.addEventListener('message', (e) => {
            if (typeof e.data === 'string') msgsA.push(JSON.parse(e.data));
        });
        wsA.accept();

        const resB = await roomStub.fetch(
            new Request(`http://localhost/?pass=${PASS}`, { headers: { Upgrade: 'websocket' } }),
        );
        const wsB = resB.webSocket!;
        const msgsB: any[] = [];
        wsB.addEventListener('message', (e) => {
            if (typeof e.data === 'string') msgsB.push(JSON.parse(e.data));
        });
        wsB.accept();

        await vi.waitFor(() => {
            expect(msgsA.some((m) => m.type === 'STATE_SYNC')).toBe(true);
            expect(msgsB.some((m) => m.type === 'STATE_SYNC')).toBe(true);
        });

        // Invalid blinded key rejected
        wsA.send(
            JSON.stringify({
                type: 'UPLOAD_NONCE',
                fingerprint: 'bad!',
                data: { encryptedData: 'enc-n' },
            }),
        );
        await vi.waitFor(() =>
            expect(msgsA.some((m) => m.message === 'Invalid fingerprint format.')).toBe(true),
        );

        // Guest A claims nonce slot; Guest B cannot overwrite it
        wsA.send(
            JSON.stringify({
                type: 'UPLOAD_NONCE',
                fingerprint: FP_HEX,
                data: { encryptedData: 'enc-nonce-a' },
                encryptedLogBlob: 'log-nonce-a',
            }),
        );
        await vi.waitFor(() => expect(msgsA.some((m) => m.type === 'NEW_NONCE_DATA')).toBe(true));

        wsB.send(
            JSON.stringify({
                type: 'UPLOAD_NONCE',
                fingerprint: FP_HEX,
                data: { encryptedData: 'enc-nonce-b' },
            }),
        );
        await vi.waitFor(() =>
            expect(msgsB.some((m) => m.type === 'ERROR_POLICY_VIOLATION')).toBe(true),
        );

        // Admin publishes aggregate PSBT
        wsA.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
        await vi.waitFor(() => expect(msgsA.some((m) => m.type === 'ROLE_UPDATE')).toBe(true));

        wsA.send(
            JSON.stringify({
                type: 'PUBLISH_AGGREGATE_PSBT',
                encryptedPsbt: 'enc-agg-psbt',
                encryptedLogBlob: 'log-agg',
            }),
        );
        await vi.waitFor(() =>
            expect(msgsA.some((m) => m.type === 'AGGREGATE_PSBT_PUBLISHED')).toBe(true),
        );

        wsA.close(1000);
        wsB.close(1000);
        await new Promise((r) => setTimeout(r, 20));
    });

    it('should exercise TRUSTED_IP_HEADER, fallback rate limit, storage budget error, and tombstone expiry', async () => {
        const ctx1 = createExecutionContext();
        const res1 = await app.fetch(
            new Request('http://localhost/api/health', {
                headers: { 'X-Real-IP': '10.20.30.40, 10.20.30.41' },
            }),
            { ...env, RATE_LIMITER: undefined, TRUSTED_IP_HEADER: 'X-Real-IP' } as any,
            ctx1,
        );
        await waitOnExecutionContext(ctx1);
        expect(res1.status).toBe(200);

        await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                }),
            }),
        );

        await runInDurableObject(roomStub, async (instance: any) => {
            instance.env = { ...instance.env, MAX_ROOM_STATE_BYTES: '10' };
            await expect(instance.saveRoomState()).rejects.toThrow('ROOM_STATE_BUDGET_EXCEEDED');
        });

        await runInDurableObject(roomStub, async (instance: any) => {
            await instance.state.storage.put('tombstone', { closedAt: Date.now() });
            await instance.alarm();
            expect(await instance.state.storage.get('tombstone')).toBeUndefined();
        });
    });

    it('should cover remaining validation guards, slot conflicts, quotas, storage failure, and license branches', async () => {
        // Invalid roomId on POST /api/room (400)
        const ctxBadRoom = createExecutionContext();
        const resBadRoom = await app.fetch(
            new Request('http://localhost/api/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: 'https://signingroom.io' },
                body: JSON.stringify({
                    roomId: 'short',
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                }),
            }),
            env as any,
            ctxBadRoom,
        );
        await waitOnExecutionContext(ctxBadRoom);
        expect(resBadRoom.status).toBe(400);

        // 2. Initialize room and open two sockets
        await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                }),
            }),
        );

        const res1 = await roomStub.fetch(
            new Request(`http://localhost/?pass=${PASS}`, { headers: { Upgrade: 'websocket' } }),
        );
        const ws1 = res1.webSocket!;
        const msgs1: any[] = [];
        ws1.addEventListener('message', (e) => {
            if (typeof e.data === 'string') msgs1.push(JSON.parse(e.data));
        });
        ws1.accept();

        const res2 = await roomStub.fetch(
            new Request(`http://localhost/?pass=${PASS}`, { headers: { Upgrade: 'websocket' } }),
        );
        const ws2 = res2.webSocket!;
        const msgs2: any[] = [];
        ws2.addEventListener('message', (e) => {
            if (typeof e.data === 'string') msgs2.push(JSON.parse(e.data));
        });
        ws2.accept();

        await vi.waitFor(() => {
            expect(msgs1.some((m) => m.type === 'STATE_SYNC')).toBe(true);
            expect(msgs2.some((m) => m.type === 'STATE_SYNC')).toBe(true);
        });

        // Guest 1 claims partial signature slot; Guest 2 gets ERROR_POLICY_VIOLATION
        ws1.send(
            JSON.stringify({
                type: 'UPLOAD_PARTIAL',
                fingerprint: FP_HEX,
                data: { encryptedData: 'sig-1' },
                encryptedLogBlob: 'log-sig-1',
            }),
        );
        await vi.waitFor(() => expect(msgs1.some((m) => m.type === 'NEW_PARTIAL_DATA')).toBe(true));

        ws2.send(
            JSON.stringify({
                type: 'UPLOAD_PARTIAL',
                fingerprint: FP_HEX,
                data: { encryptedData: 'sig-2' },
            }),
        );
        await vi.waitFor(() =>
            expect(msgs2.some((m) => m.type === 'ERROR_POLICY_VIOLATION')).toBe(true),
        );

        // Promote ws1 to admin and test invalid key formats on label updates
        ws1.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
        await vi.waitFor(() => expect(msgs1.some((m) => m.type === 'ROLE_UPDATE')).toBe(true));

        ws1.send(
            JSON.stringify({
                type: 'UPDATE_LABEL',
                fingerprint: 'not-hex!',
                label: 'lbl',
            }),
        );
        ws1.send(
            JSON.stringify({
                type: 'UPDATE_ADDRESS_LABEL',
                blindedAddress: 'not-hex!',
                label: 'lbl',
            }),
        );
        await vi.waitFor(() =>
            expect(
                msgs1.filter((m) => m.type === 'ERROR' && m.message.includes('Invalid')).length,
            ).toBeGreaterThanOrEqual(2),
        );

        // Quota & storage failure paths inside DO
        await runInDurableObject(roomStub, async (instance: any) => {
            instance.env = { ...instance.env, MAX_LOGS_PER_SESSION: '0' };
            const sock = Array.from(instance.sessions.keys())[0] as any;
            const sess = instance.sessions.get(sock);
            sess.role = 'guest';
            const sendSpy = vi.spyOn(sock, 'send');

            try {
                instance.env = { ...instance.env, MAX_LOGS_PER_SESSION: '150', MAX_AUDIT_LOG_LENGTH: '1' };
                instance.roomState.auditLog = [{ seq: 0, blob: 'full', chainHash: '0'.repeat(64) }];
                sess.role = 'admin';
                await instance.handleMessage(
                    { data: JSON.stringify({ type: 'LOG_ACTION', encryptedLogBlob: 'at-cap' }) } as any,
                    sock,
                );
                expect(sendSpy).toHaveBeenCalledWith(
                    JSON.stringify({ type: 'ERROR', message: 'Audit log capacity reached.' }),
                );

                // Audit log capacity error from LOG_ACTION
                instance.env = { ...instance.env, MAX_LOGS_PER_SESSION: '150', MAX_AUDIT_LOG_LENGTH: '1' };
                instance.roomState.auditLog = [{ seq: 0, blob: 'full', chainHash: '0'.repeat(64) }];
                await instance.handleMessage(
                    { data: JSON.stringify({ type: 'LOG_ACTION', encryptedLogBlob: 'at-cap' }) } as any,
                    sock,
                );
                expect(sendSpy).toHaveBeenCalledWith(
                    JSON.stringify({ type: 'ERROR', message: 'Audit log capacity reached.' }),
                );

                // STORAGE_WRITE_FAILED error handler
                instance.env = { ...instance.env, MAX_AUDIT_LOG_LENGTH: '2000', MAX_ROOM_STATE_BYTES: '5242880' };
                const putSpy = vi.spyOn(instance.state.storage, 'put').mockRejectedValueOnce(new Error('disk full'));
                await expect(instance.saveRoomState()).rejects.toThrow('STORAGE_WRITE_FAILED');
                putSpy.mockRestore();
            } finally {
                sendSpy.mockRestore();
            }
        });

        ws1.close(1000);
        ws2.close(1000);
        await new Promise((r) => setTimeout(r, 20));
    });

    it('should cover fallback rate limit, nonce capacity, public_good license tier, and version check', async () => {
        // Fallback rate limiter when RATE_LIMITER is absent
        const rateEnv = { ...env, RATE_LIMITER: undefined, TRUSTED_IP_HEADER: 'X-Forwarded-For' };
        let blocked429 = false;
        for (let i = 0; i < 305; i++) {
            const ctx = createExecutionContext();
            const res = await app.fetch(
                new Request('http://localhost/api/health', {
                    headers: { 'x-forwarded-for': '198.51.100.77' },
                }),
                rateEnv as any,
                ctx,
            );
            await waitOnExecutionContext(ctx);
            if (res.status === 429) {
                blocked429 = true;
                break;
            }
        }
        expect(blocked429).toBe(true);

        // Nonce capacity limit & non-admin PUBLISH_AGGREGATE_PSBT ignored
        await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    protocol: 'musig2',
                }),
            }),
        );

        await runInDurableObject(roomStub, (instance: any) => {
            instance.env = { ...instance.env, MAX_SIGNATURES: '1' };
            instance.roomState.nonces = { existing01: 'enc-01' };
        });

        const res = await roomStub.fetch(
            new Request(`http://localhost/?pass=${PASS}`, { headers: { Upgrade: 'websocket' } }),
        );
        const ws = res.webSocket!;
        const msgs: any[] = [];
        ws.addEventListener('message', (e) => {
            if (typeof e.data === 'string') msgs.push(JSON.parse(e.data));
        });
        ws.accept();

        await vi.waitFor(() => expect(msgs.some((m) => m.type === 'STATE_SYNC')).toBe(true));

        await runInDurableObject(roomStub, async (instance: any) => {
            instance.env = { ...instance.env, MAX_SIGNATURES: '1' };
            instance.roomState.nonces = { existing01: 'enc-01' };
            const sock = Array.from(instance.sessions.keys())[0] as any;
            const sendSpy = vi.spyOn(sock, 'send');
            try {
                await instance.handleMessage(
                    {
                        data: JSON.stringify({
                            type: 'UPLOAD_NONCE',
                            fingerprint: '12345678',
                            data: { encryptedData: 'enc-new' },
                        }),
                    } as any,
                    sock,
                );
                expect(sendSpy).toHaveBeenCalledWith(
                    JSON.stringify({ type: 'ERROR', message: 'Nonce limit reached.' }),
                );
            } finally {
                sendSpy.mockRestore();
            }
        });

        // Non-admin PUBLISH_AGGREGATE_PSBT should not broadcast
        ws.send(
            JSON.stringify({
                type: 'PUBLISH_AGGREGATE_PSBT',
                encryptedPsbt: 'enc-unauth-agg',
            }),
        );
        await new Promise((r) => setTimeout(r, 40));
        expect(msgs.some((m) => m.type === 'AGGREGATE_PSBT_PUBLISHED')).toBe(false);

        // 3. PUBLIC_GOOD tier (tierByte === 1) & payload version != 1 rejection
        const tdSpy = vi.spyOn(TextDecoder.prototype, 'decode').mockImplementation((bytes) => {
            if (bytes.length === 1) return '*';
            return 'Public Good Org';
        });
        const cryptoSpy = vi.spyOn(crypto.subtle, 'verify').mockResolvedValue(true);
        const dvSpy = vi.spyOn(DataView.prototype, 'getUint8').mockImplementation(function (
            this: DataView,
            offset: number,
        ) {
            if (offset === 0) return 1;
            if (offset === 1) return 1; // PUBLIC_GOOD
            return 1;
        });

        const pgRoomId = `pg-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const ctxPg = createExecutionContext();
        await app.fetch(
            new Request('http://localhost/api/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: 'https://signingroom.io' },
                body: JSON.stringify({
                    roomId: pgRoomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    licenseToken:
                        'srl_0DGPSeBK6w99XjmrwvdFBbfIC6XH-_czfymlxEgguusg5mb9tpEmNfuPBZdNSittYGuQiei1jvD67XKdxUYuVkdCgQEBAwAAAAAAAAAAAAAAAaFTwDzFASoeU2lnbmluZyBSb29tIENvbW11bml0eSBFZGl0aW9uAAAA',
                }),
            }),
            env as any,
            ctxPg,
        );
        await waitOnExecutionContext(ctxPg);

        const pgStub = env.SIGNING_ROOM.get(env.SIGNING_ROOM.idFromName(pgRoomId));
        await runInDurableObject(pgStub, (instance: any) => {
            expect(instance.roomState.tier).toBe('PUBLIC_GOOD');
        });

        // Payload version byte != 1 -> falls back to COMMUNITY
        dvSpy.mockImplementationOnce(() => 2);
        const verRoomId = `ver-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const ctxVer = createExecutionContext();
        await app.fetch(
            new Request('http://localhost/api/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: 'https://signingroom.io' },
                body: JSON.stringify({
                    roomId: verRoomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    licenseToken:
                        'srl_0DGPSeBK6w99XjmrwvdFBbfIC6XH-_czfymlxEgguusg5mb9tpEmNfuPBZdNSittYGuQiei1jvD67XKdxUYuVkdCgQEBAwAAAAAAAAAAAAAAAaFTwDzFASoeU2lnbmluZyBSb29tIENvbW11bml0eSBFZGl0aW9uAAAA',
                }),
            }),
            env as any,
            ctxVer,
        );
        await waitOnExecutionContext(ctxVer);

        const verStub = env.SIGNING_ROOM.get(env.SIGNING_ROOM.idFromName(verRoomId));
        await runInDurableObject(verStub, (instance: any) => {
            expect(instance.roomState.tier).toBe('COMMUNITY');
        });

        tdSpy.mockRestore();
        cryptoSpy.mockRestore();
        dvSpy.mockRestore();

        ws.close(1000);
        await new Promise((r) => setTimeout(r, 20));
    });

    it('should hit remaining storage, alarm expiry, license wildcard/host, and message error branches', async () => {
        // 1. saveRoomState() when roomState is null -> returns false
        await runInDurableObject(roomStub, async (instance: any) => {
            instance.roomState = null;
            expect(await instance.saveRoomState()).toBe(false);
        });

        // 2. Initialize room with encryptedLogBlob, test first-time alarm() creating tombstone
        await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    encryptedLogBlob: 'enc-genesis-blob',
                }),
            }),
        );

        await runInDurableObject(roomStub, async (instance: any) => {
            expect(instance.roomState.auditLog.length).toBe(1);
            await instance.alarm();
            expect(instance.roomState).toBeNull();
            const tomb = await instance.state.storage.get('tombstone');
            expect(tomb?.closedAt).toBeDefined();
        });

        // Re-init a fresh room for WS & budget error tests
        const freshId = `fresh-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const freshStub = env.SIGNING_ROOM.get(env.SIGNING_ROOM.idFromName(freshId));
        await freshStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId: freshId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                }),
            }),
        );

        const res = await freshStub.fetch(
            new Request(`http://localhost/?pass=${PASS}`, { headers: { Upgrade: 'websocket' } }),
        );
        const ws = res.webSocket!;
        const msgs: any[] = [];
        ws.addEventListener('message', (e) => {
            if (typeof e.data === 'string') msgs.push(JSON.parse(e.data));
        });
        ws.accept();
        await vi.waitFor(() => expect(msgs.some((m) => m.type === 'STATE_SYNC')).toBe(true));

        // Oversized UPLOAD_NONCE & PUBLISH_AGGREGATE_PSBT (admin)
        ws.send(JSON.stringify({ type: 'AUTH', token: ADMIN }));
        await vi.waitFor(() => expect(msgs.some((m) => m.type === 'ROLE_UPDATE')).toBe(true));

        ws.send(
            JSON.stringify({
                type: 'UPLOAD_NONCE',
                fingerprint: FP_HEX,
                data: { encryptedData: 'x'.repeat(2 * 1024 * 1024 + 10) },
            }),
        );
        ws.send(
            JSON.stringify({
                type: 'PUBLISH_AGGREGATE_PSBT',
                encryptedPsbt: 'y'.repeat(2 * 1024 * 1024 + 10),
            }),
        );
        ws.send(JSON.stringify({ type: 'TOGGLE_LOCK', isLocked: false, encryptedLogBlob: 'unlock' }));
        await vi.waitFor(() =>
            expect(msgs.some((m) => m.type === 'LOCK_UPDATED' && m.isLocked === false)).toBe(true),
        );

        // Trigger ROOM_STATE_BUDGET_EXCEEDED inside handleMessage catch block
        await runInDurableObject(freshStub, async (instance: any) => {
            instance.env = { ...instance.env, MAX_ROOM_STATE_BYTES: '5' };
            const sock = Array.from(instance.sessions.keys())[0] as any;
            const sendSpy = vi.spyOn(sock, 'send');
            try {
                await instance.handleMessage(
                    { data: JSON.stringify({ type: 'SET_DISPLAY_NAME', encryptedDisplayName: 'name' }) } as any,
                    sock,
                );
                expect(sendSpy).toHaveBeenCalledWith(
                    JSON.stringify({
                        type: 'ERROR',
                        message: 'Room state storage limit exceeded or storage write failed.',
                    }),
                );
            } finally {
                sendSpy.mockRestore();
            }
        });

        // Wildcard '*' domain and host:port match in verifyServerLicense
        const tdSpy = vi.spyOn(TextDecoder.prototype, 'decode').mockImplementation((bytes) => {
            if (bytes.length === 1) return '*,localhost:8787';
            return 'Wildcard Licensee';
        });
        const cryptoSpy = vi.spyOn(crypto.subtle, 'verify').mockResolvedValue(true);

        const licRoomId = `lic-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const ctxLic = createExecutionContext();
        await app.fetch(
            new Request('http://localhost:8787/api/room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://signingroom.io',
                },
                body: JSON.stringify({
                    roomId: licRoomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    licenseToken:
                        'srl_0DGPSeBK6w99XjmrwvdFBbfIC6XH-_czfymlxEgguusg5mb9tpEmNfuPBZdNSittYGuQiei1jvD67XKdxUYuVkdCgQEBAwAAAAAAAAAAAAAAAaFTwDzFASoeU2lnbmluZyBSb29tIENvbW11bml0eSBFZGl0aW9uAAAA',
                }),
            }),
            env as any,
            ctxLic,
        );
        await waitOnExecutionContext(ctxLic);

        const licStub = env.SIGNING_ROOM.get(env.SIGNING_ROOM.idFromName(licRoomId));
        await runInDurableObject(licStub, (instance: any) => {
            expect(instance.roomState.licensee).toBe('Wildcard Licensee');
        });

        tdSpy.mockRestore();
        cryptoSpy.mockRestore();

        ws.close(1000);
        await new Promise((r) => setTimeout(r, 20));
    });

    it('should cover remaining CLOSE_ROOM without log, pass mismatch on WS, and license host/wildcard checks', async () => {
        // CLOSE_ROOM without encryptedLogBlob
        await roomStub.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                }),
            }),
        );

        await runInDurableObject(roomStub, async (instance: any) => {
            const mockAdminSock = { send: vi.fn(), close: vi.fn() };
            instance.sessions.set(mockAdminSock, { id: 'ADM1', role: 'admin', ip: '1.1.1.1' });
            await instance.handleMessage(
                { data: JSON.stringify({ type: 'CLOSE_ROOM' }) } as any,
                mockAdminSock,
            );
            expect(instance.roomState).toBeNull();
        });

        // Re-init & test invalid pass with Sec-WebSocket-Protocol pass.<wrong>
        const id2 = `pass-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const stub2 = env.SIGNING_ROOM.get(env.SIGNING_ROOM.idFromName(id2));
        await stub2.fetch(
            new Request('http://internal/init', {
                method: 'POST',
                body: JSON.stringify({
                    roomId: id2,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                }),
            }),
        );

        const badPassWs = await stub2.fetch(
            new Request('http://localhost/', {
                headers: {
                    Upgrade: 'websocket',
                    'Sec-WebSocket-Protocol': 'signingroom-v2, pass.wrong-pass-16chars',
                },
            }),
        );
        expect(badPassWs.status).toBe(401);

        // verifyServerLicense exact host:port match
        const tdSpy = vi.spyOn(TextDecoder.prototype, 'decode').mockImplementation((bytes) => {
            if (bytes.length === 1) return 'example.com:8443';
            return 'Port Match Org';
        });
        const cryptoSpy = vi.spyOn(crypto.subtle, 'verify').mockResolvedValue(true);

        const portRoomId = `port-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const ctxPort = createExecutionContext();
        await app.fetch(
            new Request('http://localhost/api/room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://example.com:8443',
                },
                body: JSON.stringify({
                    roomId: portRoomId,
                    expectedPass: PASS,
                    adminToken: ADMIN,
                    encryptedPsbt: ENC_PSBT,
                    licenseToken:
                        'srl_0DGPSeBK6w99XjmrwvdFBbfIC6XH-_czfymlxEgguusg5mb9tpEmNfuPBZdNSittYGuQiei1jvD67XKdxUYuVkdCgQEBAwAAAAAAAAAAAAAAAaFTwDzFASoeU2lnbmluZyBSb29tIENvbW11bml0eSBFZGl0aW9uAAAA',
                }),
            }),
            { ...env, ALLOWED_ORIGIN: 'example.com:8443' } as any,
            ctxPort,
        );
        await waitOnExecutionContext(ctxPort);

        const portStub = env.SIGNING_ROOM.get(env.SIGNING_ROOM.idFromName(portRoomId));
        await runInDurableObject(portStub, (instance: any) => {
            expect(instance.roomState.licensee).toBe('Port Match Org');
        });

        tdSpy.mockRestore();
        cryptoSpy.mockRestore();
    });
    
    });
});