/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { DurableObject } from 'cloudflare:workers';

// =============================================================================
// CONFIGURATION & TYPES
// =============================================================================

interface Env {
    SIGNING_ROOM: DurableObjectNamespace;
    ALLOWED_ORIGIN: string;
    ENVIRONMENT: 'development' | 'production';
    RATE_LIMITER: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
    TRUSTED_IP_HEADER?: string;
    MAX_PAYLOAD_SIZE_BYTES?: string;
    MAX_CONNECTIONS?: string;
    RATE_LIMIT_WINDOW?: string;
    ALLOW_HEADLESS_ACCESS?: string;
    MAX_MSGS_PER_WINDOW?: string;
    MAX_CONNECTIONS_PER_IP?: string;
    MAX_AUDIT_LOG_LENGTH?: string;
    DEFAULT_ROOM_TTL_SECONDS?: string;
    MAX_AUTH_FAILURES?: string;
    MAX_SIGNATURES?: string;
    MAX_IP_TRACKERS?: string;
    LOCKOUT_DURATION_MS?: string;
}

export type ConfigKey =
    | 'MAX_PAYLOAD_SIZE_BYTES'
    | 'MAX_CONNECTIONS'
    | 'RATE_LIMIT_WINDOW'
    | 'MAX_MSGS_PER_WINDOW'
    | 'MAX_CONNECTIONS_PER_IP'
    | 'MAX_AUDIT_LOG_LENGTH'
    | 'DEFAULT_ROOM_TTL_SECONDS'
    | 'MAX_AUTH_FAILURES'
    | 'MAX_SIGNATURES'
    | 'MAX_IP_TRACKERS'
    | 'LOCKOUT_DURATION_MS';

const CONFIG_DEFAULTS: Record<ConfigKey, number> = {
    MAX_PAYLOAD_SIZE_BYTES: 2 * 1024 * 1024, // 2MB
    MAX_CONNECTIONS: 40, // Room Capacity
    RATE_LIMIT_WINDOW: 1000, // 1 Second
    MAX_MSGS_PER_WINDOW: 10, // 10 messages per second per user
    MAX_CONNECTIONS_PER_IP: 10, // Max connections per IP
    MAX_AUDIT_LOG_LENGTH: 2000, // Max entries in the audit log
    DEFAULT_ROOM_TTL_SECONDS: 86400, // 24 hours
    MAX_AUTH_FAILURES: 5, // Lockout threshold
    MAX_SIGNATURES: 100, // Max signatures per room
    MAX_IP_TRACKERS: 1000, // Memory exhaustion guard
    LOCKOUT_DURATION_MS: 30 * 60 * 1000, // 30 minutes
};

// Safe routes that even an unauthenticated guest can use
const GUEST_SAFE_ROUTES = new Set([
    'AUTH',
    'AUTH_ROLE',
    'SET_DISPLAY_NAME',
]);

function getConfig(env: Env, key: ConfigKey): number {
    const value = env[key];
    return value ? parseInt(value, 10) : CONFIG_DEFAULTS[key];
}

export interface RoleConstraints {
    tokenId?: string;
    canUploadSignature: boolean;
    canExportPsbt: boolean;
    canExportAudit: boolean;
}

export interface MessageMetadata {
    protocolVersion: string;
    sdkVersion: string;
    tier: 'PUBLIC_GOOD' | 'ENTERPRISE' | 'COMMUNITY';
    licensee: string;
    domain: string;
    clientTimestamp: number;
}

interface SessionData {
    id: string;
    role: 'admin' | 'guest';
    joinedAt: number;
    msgsInWindow: number;
    lastMsgTime: number;
    ip: string;
    encryptedDisplayName?: string;
    constraints?: { canUploadSignature: boolean };
    meta?: MessageMetadata;
}

// =============================================================================
// HONO APP & MIDDLEWARE
// =============================================================================

function isOriginAllowed(
    originOrReferer: string | null | undefined,
    c: { env: Env; req: { header: (name: string) => string | undefined } },
): boolean {
    const isDev = c.env.ENVIRONMENT === 'development';
    const allowHeadless = c.env.ALLOW_HEADLESS_ACCESS === 'true';

    if (!originOrReferer) {
        return isDev || allowHeadless;
    }

    if (c.env.ALLOWED_ORIGIN && originOrReferer === c.env.ALLOWED_ORIGIN) {
        return true;
    }

    try {
        const parsed = new URL(originOrReferer);
        const hostname = parsed.hostname.toLowerCase();

        if (isDev && (hostname === 'localhost' || hostname === '127.0.0.1')) {
            return true;
        }

        const rawConfig = c.env.ALLOWED_ORIGIN || 'signingroom.io';
        const baseDomain = rawConfig
            .replace(/^https?:\/\//i, '')
            .replace(/:\d+$/, '')
            .replace(/\/.*$/, '')
            .toLowerCase();

        if (!isDev && parsed.protocol !== 'https:') {
            return false;
        }

        return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
    } catch {
        return false;
    }
}

/**
 * Resolves the client IP from Cloudflare's header or a configured trusted reverse-proxy header
 * (e.g. TRUSTED_IP_HEADER="X-Real-IP" when behind the bundled Nginx container).
 */
function resolveClientIp(
    getHeader: (name: string) => string | undefined | null,
    env: Env,
): string {
    const cfIp = getHeader('CF-Connecting-IP') || getHeader('cf-connecting-ip');
    if (cfIp && cfIp.trim()) {
        return cfIp.trim();
    }

    if (env.TRUSTED_IP_HEADER) {
        const customHeader = getHeader(env.TRUSTED_IP_HEADER) || getHeader(env.TRUSTED_IP_HEADER.toLowerCase());
        if (customHeader && customHeader.trim()) {
            // Take the first IP if a comma-separated list was passed
            return customHeader.split(',')[0].trim();
        }
    }

    return 'unknown';
}

// Fallback rate limiter for self-hosted workerd where Cloudflare's RATE_LIMITER binding is absent
const fallbackHttpRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkFallbackRateLimit(key: string, limit = 300, windowMs = 60_000): boolean {
    const now = Date.now();
    if (fallbackHttpRateLimits.size > 5000) {
        for (const [k, v] of fallbackHttpRateLimits.entries()) {
            if (now > v.resetAt) fallbackHttpRateLimits.delete(k);
        }
    }
    const entry = fallbackHttpRateLimits.get(key);
    if (!entry || now > entry.resetAt) {
        fallbackHttpRateLimits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    entry.count++;
    return entry.count <= limit;
}

const app = new Hono<{ Bindings: Env }>();

app.use(
    '/*',
    cors({
        origin: (origin, c) => (isOriginAllowed(origin, c) ? origin : null),
        allowHeaders: ['Upgrade', 'Content-Type', 'X-Requested-With', 'Sec-WebSocket-Protocol'],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        maxAge: 86400,
        credentials: true,
    }),
);

app.use('/*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    c.header('X-Frame-Options', 'DENY');

    const ip = resolveClientIp((name) => c.req.header(name), c.env);

    if (ip !== 'unknown') {
        if (c.env.RATE_LIMITER) {
            try {
                const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
                if (!success) {
                    return c.json({ error: 'Rate limit exceeded. Please wait.' }, 429);
                }
            } catch (err) {
                console.error('Rate Limiter Error:', err);
            }
        } else if (!checkFallbackRateLimit(ip)) {
            return c.json({ error: 'Rate limit exceeded. Please wait.' }, 429);
        }
    }

    await next();
});

app.get('/api/health', (c) => {
    return c.json({
        status: 'healthy',
        version: '4.2.0',
        timestamp: Date.now(),
    });
});

// =============================================================================
// API ROUTES: ROOM MANAGEMENT
// =============================================================================

// Gated Room Creation
app.post('/api/room', async (c) => {
    const origin = c.req.header('Origin');
    const referer = c.req.header('Referer');

    const isFirstParty = isOriginAllowed(origin, c) || isOriginAllowed(referer, c);

    if (!isFirstParty) {
        return c.json({ error: 'Unauthorized: First-party origin required.' }, 401);
    }

    const rawBody = await c.req.text();

    if (rawBody.length > getConfig(c.env, 'MAX_PAYLOAD_SIZE_BYTES')) {
        return c.json({ error: 'Payload too large. Max allowed size exceeded.' }, 413);
    }

    let body;
    try {
        body = JSON.parse(rawBody);
    } catch (e) {
        return c.json({ error: 'Invalid JSON payload.' }, 400);
    }

    const { roomId, expectedPass, encryptedPsbt, network, adminToken, protocolVersion, roleTokens, licenseToken, protocol } = body;

    const attestedLicense = await verifyServerLicense(licenseToken, origin || referer);

    const id = c.env.SIGNING_ROOM.idFromName(roomId);
    const room = c.env.SIGNING_ROOM.get(id);

    const initRes = await room.fetch(
        new Request('http://internal/init', {
            method: 'POST',
            body: JSON.stringify({
                roomId,
                expectedPass,
                encryptedPsbt,
                adminToken,
                network,
                protocolVersion,
                roleTokens,
                attestedLicense,
                licenseToken,
                protocol
            }),
        }),
    );

    if (!initRes.ok) {
        return c.json({ error: await initRes.text() }, initRes.status as any);
    }

    await initRes.text();

    return c.json({ roomId, socketUrl: `/api/room/${roomId}/websocket` });
});

// Gated WebSocket Handshake
app.get('/api/room/:id/websocket', async (c) => {
    const origin = c.req.header('Origin');

    if (!isOriginAllowed(origin, c)) {
        return new Response('Cross-Origin WebSocket Access Forbidden', { status: 403 });
    }

    const roomId = c.req.param('id');
    const id = c.env.SIGNING_ROOM.idFromName(roomId);
    const room = c.env.SIGNING_ROOM.get(id);
    return room.fetch(c.req.raw);
});

export default app;

// =============================================================================
// DURABLE OBJECT: SIGNING ROOM (STATELESS RELAY)
// =============================================================================

export class SigningRoom implements DurableObject {
    state: DurableObjectState;
    sessions = new Map<WebSocket, SessionData>();
    roomState: any = null;
    env: Env;
    private isLockedOut = false;
    private ipConnectionCounts = new Map<string, number>();
    private ipAuthFailures = new Map<string, { count: number; lockedUntil: number }>();

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;

        this.state.blockConcurrencyWhile(async () => {
            this.roomState = await this.loadRoomState();
        });
    }

    async saveRoomState() {
        if (!this.roomState) return;
        const json = JSON.stringify(this.roomState);
        const chunkSize = 100 * 1024;

        if (json.length < chunkSize) {
            await this.state.storage.put('data', json);
            await this.state.storage.delete('data_chunks');
            return;
        }

        const chunks = Math.ceil(json.length / chunkSize);
        const storageObj: Record<string, any> = { data_chunks: chunks };

        for (let i = 0; i < chunks; i++) {
            storageObj[`data_${i}`] = json.slice(i * chunkSize, (i + 1) * chunkSize);
        }

        await this.state.storage.put(storageObj);
        await this.state.storage.delete('data');
    }

    async loadRoomState() {
        const chunkCount = await this.state.storage.get<number>('data_chunks');

        if (chunkCount) {
            let json = '';
            for (let i = 0; i < chunkCount; i++) {
                const chunk = await this.state.storage.get<string>(`data_${i}`);
                if (chunk) json += chunk;
            }
            return JSON.parse(json);
        }

        const legacyData = await this.state.storage.get<any>('data');
        return typeof legacyData === 'string' ? JSON.parse(legacyData) : legacyData;
    }

    async log(encryptedLogBlob: string, session?: SessionData) {
		if (!this.roomState) return;
		if (!this.roomState.auditLog) this.roomState.auditLog = [];

		if (this.roomState.auditLog.length >= getConfig(this.env, 'MAX_AUDIT_LOG_LENGTH')) {
			this.roomState.auditLog.shift();
		}

		const envelope = {
			serverTimestamp: Date.now(),
			sessionId: session ? session.id : 'system',
			role: session ? session.role : 'system',
			blob: encryptedLogBlob,
		};

		this.roomState.auditLog.push(envelope);
		await this.saveRoomState();
		this.broadcast({ type: 'LOG_UPDATE', auditLog: this.roomState.auditLog });
	}

    async fetch(request: Request) {
        const url = new URL(request.url);

        // Initialize Room
        if (url.pathname === '/init') {
            const body = await request.json<any>();
            const { 
                roomId, 
                expectedPass, 
                encryptedPsbt, 
                adminToken, 
                network, 
                protocolVersion, 
                encryptedLogBlob, 
                encryptedRoomName, 
                roleTokens, 
                attestedLicense,
                licenseToken,
                protocol
            } = body;
            
            const now = Date.now();
            const ttlSeconds = getConfig(this.env, 'DEFAULT_ROOM_TTL_SECONDS');

            const tokenBuffer = new TextEncoder().encode(adminToken);
            const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBuffer);
            const secureStoredHash = Array.from(new Uint8Array(hashBuffer))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');

            if (this.roomState) {
                if (secureStoredHash !== this.roomState.adminToken) {
                    return new Response('Unauthorized: Invalid Admin Token for Reset', { status: 401 });
                }
            }

            const initialTier = attestedLicense?.tier || 'COMMUNITY';
            const initialLicensee = attestedLicense?.licensee || 'Signing Room Community Edition';

            this.roomState = {
                roomId,
                expectedPass,
                protocol: protocol || 'standard',
                transientPsbt: protocol === 'musig2' ? encryptedPsbt : null,
                encryptedPsbt: protocol === 'musig2' ? null : encryptedPsbt,
                nonces: {},
                signatures: {},
                createdAt: now,
                adminToken: secureStoredHash,
                expiresAt: now + ttlSeconds * 1000,
                auditLog: [],
                signerLabels: {},
                addressLabels: {},
                whitelist: [],
                participants: {},
                isLocked: false,
                network: network || 'bitcoin',
                protocolVersion: protocolVersion || '2.0.0',
                roomName: encryptedRoomName || 'Untitled Room',
                roleTokens: roleTokens || {},
                strictRoles: roleTokens !== undefined && Object.keys(roleTokens).length > 0,
                tier: attestedLicense?.tier || 'COMMUNITY',
                licensee: attestedLicense?.licensee || 'Signing Room Community Edition',
                licenseToken: licenseToken || null,
            };

            if (encryptedLogBlob) {
                this.roomState.auditLog.push({
                    serverTimestamp: now,
                    sessionId: 'system',
                    role: 'admin',
                    tier: initialTier,
                    licensee: initialLicensee,
                    blob: encryptedLogBlob,
                });
            }

            await this.saveRoomState();
            await this.state.storage.setAlarm(now + ttlSeconds * 1000);
            return new Response('OK');
        }

        // Handle WebSocket Upgrade
        if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected Websocket', { status: 426 });

        // Extract room pass from Sec-WebSocket-Protocol header
        // with fallback to query param for backward compatibility
        const protocolHeader = request.headers.get('Sec-WebSocket-Protocol') || '';
        const protocolParts = protocolHeader.split(',').map((p) => p.trim());
        const passProtocol = protocolParts.find((p) => p.startsWith('pass.'));
        const providedPass = passProtocol ? passProtocol.slice(5) : url.searchParams.get('pass');
        const responseHeaders = new Headers();
        if (protocolParts.includes('signingroom-v2')) {
            responseHeaders.set('Sec-WebSocket-Protocol', 'signingroom-v2');
        }

        if (this.roomState && this.roomState.expectedPass) {
            if (providedPass !== this.roomState.expectedPass) {
                return new Response('Unauthorized: Invalid Room Pass', { status: 401 });
            }
        }

        const clientVersion = url.searchParams.get('v') || '2.0.0';
        const roomVersion = this.roomState?.protocolVersion || '2.0.0';

        const clientMajor = clientVersion.split('.')[0];
        const roomMajor = roomVersion.split('.')[0];

        const { 0: client, 1: server } = new WebSocketPair();

        if (clientMajor !== roomMajor) {
            
            server.accept();

            server.send(
                JSON.stringify({
                    type: 'ERROR_VERSION_MISMATCH',
                    roomVersion: roomVersion,
                }),
            );

            server.close(4026, 'Protocol Mismatch');
            this.handleSession(server, ip, requestedSessionId);
            return new Response(null, { status: 101, webSocket: client, headers: responseHeaders });
        }

        const ip = resolveClientIp((name) => request.headers.get(name), this.env);

        // Only enforce per-IP connection cap when a real client IP is resolved
        if (ip !== 'unknown') {
            const currentIpCount = this.ipConnectionCounts.get(ip) || 0;
            if (currentIpCount >= getConfig(this.env, 'MAX_CONNECTIONS_PER_IP')) {
                return new Response('Rate Limit Exceeded: Too many concurrent connections from this IP.', { status: 429 });
            }
        }

        const resumeProtocol = protocolParts.find((p) => p.startsWith('resume.'));
        let requestedSessionId: string | null = null;
        let providedResumeToken: string | null = null;

        if (resumeProtocol) {
            const parts = resumeProtocol.split('.');
            if (parts.length >= 3) {
                requestedSessionId = parts[1];
                providedResumeToken = parts.slice(2).join('.');
            }
        } else {
            requestedSessionId = url.searchParams.get('sessionId');
            providedResumeToken = url.searchParams.get('resumeToken');
        }

        this.state.waitUntil(
            this.handleSession(server, ip, requestedSessionId, providedResumeToken),
        );
        return new Response(null, { status: 101, webSocket: client, headers: responseHeaders });
    }

    async handleSession(
        webSocket: WebSocket,
        ip: string,
        requestedSessionId: string | null,
        providedResumeToken: string | null,
    ) {
        if (!this.roomState) {
            webSocket.accept();
            webSocket.send(JSON.stringify({ type: 'ERROR_NOT_FOUND' }));
            webSocket.close(4004, 'Room Not Found');
            return;
        }

        // Cryptographically verify session resumption via SHA-256(resumeToken)
        let isVerifiedResume = false;
        let sessionId = '';
        let resumeToken = '';
        let resumeTokenHash = '';

        if (
            requestedSessionId &&
            /^[A-Z0-9]{4}$/.test(requestedSessionId) &&
            providedResumeToken &&
            /^[a-f0-9]{32,128}$/i.test(providedResumeToken) &&
            this.roomState.participants?.[requestedSessionId]?.resumeTokenHash
        ) {
            const tokenBytes = new TextEncoder().encode(providedResumeToken);
            const digest = await crypto.subtle.digest('SHA-256', tokenBytes);
            const presentedHash = Array.from(new Uint8Array(digest))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');

            if (presentedHash === this.roomState.participants[requestedSessionId].resumeTokenHash) {
                isVerifiedResume = true;
                sessionId = requestedSessionId;
                resumeToken = providedResumeToken;
                resumeTokenHash = presentedHash;
            }
        }

        // Allow verified returning participants to reconnect when room is locked; reject all new entrants
        if (this.roomState.isLocked && !isVerifiedResume) {
            webSocket.accept();
            webSocket.send(JSON.stringify({ type: 'ERROR_LOCKED' }));
            webSocket.close(1000, 'Room is Locked');
            return;
        }

        // Only enforce MAX_CONNECTIONS against net-new sessions (resuming sessions replace their old slot)
        if (!isVerifiedResume && this.sessions.size >= getConfig(this.env, 'MAX_CONNECTIONS')) {
            webSocket.accept();
            webSocket.close(4001, 'Room Full');
            return;
        }

        webSocket.accept();

        if (isVerifiedResume) {
            // Displace only when resumeToken is cryptographically proven, and decrement old socket's IP count!
            for (const [existingSocket, sess] of this.sessions.entries()) {
                if (sess.id === sessionId) {
                    if (sess.ip && sess.ip !== 'unknown') {
                        const oldCount = this.ipConnectionCounts.get(sess.ip) || 1;
                        const nextCount = Math.max(0, oldCount - 1);
                        if (nextCount === 0) {
                            this.ipConnectionCounts.delete(sess.ip);
                        } else {
                            this.ipConnectionCounts.set(sess.ip, nextCount);
                        }
                    }
                    this.sessions.delete(existingSocket);
                    try {
                        existingSocket.close(1000, 'Session Replaced');
                    } catch (e) {}
                }
            }
        } else {
            // Generate a fresh, non-colliding 4-char Session ID and a 256-bit (64-hex-char) resumeToken
            do {
                sessionId = crypto.randomUUID().substring(0, 4).toUpperCase();
            } while (this.roomState.participants && this.roomState.participants[sessionId]);

            resumeToken =
                crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
            const tokenBytes = new TextEncoder().encode(resumeToken);
            const digest = await crypto.subtle.digest('SHA-256', tokenBytes);
            resumeTokenHash = Array.from(new Uint8Array(digest))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');
        }

        if (ip !== 'unknown') {
            const currentIpCount = this.ipConnectionCounts.get(ip) || 0;
            this.ipConnectionCounts.set(ip, currentIpCount + 1);
        }

        let safeDisplayName = undefined;
        if (this.roomState.participants && this.roomState.participants[sessionId]) {
            safeDisplayName = this.roomState.participants[sessionId].encryptedDisplayName;
        }

        this.sessions.set(webSocket, {
            role: 'guest',
            id: sessionId,
            joinedAt: Date.now(),
            msgsInWindow: 0,
            lastMsgTime: 0,
            ip: ip,
            encryptedDisplayName: safeDisplayName,
        });

        if (!this.roomState.participants) this.roomState.participants = {};
        const existingRole = isVerifiedResume
            ? this.roomState.participants[sessionId]?.role || 'guest'
            : 'guest';

        this.roomState.participants[sessionId] = {
            id: sessionId,
            role: existingRole,
            encryptedDisplayName: safeDisplayName,
            resumeTokenHash: resumeTokenHash,
        };

        await this.saveRoomState();

        // Strip internal resumeTokenHash before broadcasting participant metadata to peers
        this.broadcast({
            type: 'PARTICIPANTS_UPDATE',
            participants: this.getSanitizedParticipants(),
        });

        // Send resumeToken privately to this socket only
        webSocket.send(
            JSON.stringify({
                type: 'SESSION_CONNECTED',
                sessionId: sessionId,
                resumeToken: resumeToken,
            }),
        );

        this.broadcastConnections();

        const { adminToken, roleTokens, signatures, nonces, ...safeRoomState } = this.roomState;

        webSocket.send(
            JSON.stringify({
                type: 'STATE_SYNC',
                ...safeRoomState,
                participants: this.getSanitizedParticipants(),
                signatures: Object.values(signatures || {}),
                nonces: Object.values(nonces || {}),
                connectedCount: this.sessions.size,
            }),
        );

        webSocket.addEventListener('message', (event) => {
            this.state.waitUntil(this.handleMessage(event, webSocket));
        });

        webSocket.addEventListener('close', () => {
            this.handleClose(webSocket);
        });
    }

    async handleMessage(event: MessageEvent, webSocket: WebSocket) {
        try {
            const session = this.sessions.get(webSocket);
            if (!session) return;

            const rawData = event.data;
            const size = typeof rawData === 'string' ? rawData.length : rawData.byteLength;

            if (size > getConfig(this.env, 'MAX_PAYLOAD_SIZE_BYTES')) {
                webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Payload too large (Max 2MB)' }));
                return;
            }

            const now = Date.now();
            if (now - session.lastMsgTime > getConfig(this.env, 'RATE_LIMIT_WINDOW')) {
                session.msgsInWindow = 1;
                session.lastMsgTime = now;
            } else {
                session.msgsInWindow++;
                if (session.msgsInWindow > getConfig(this.env, 'MAX_MSGS_PER_WINDOW')) {
                    return;
                }
            }

            const msg = JSON.parse(event.data as string);

            // Record client-attested license metadata onto the session
            if (msg.meta) {
                session.meta = msg.meta;
            }

            if (session.role !== 'admin' && this.roomState.strictRoles) {
                if (!GUEST_SAFE_ROUTES.has(msg.type)) {
                    if (!session.constraints) {
                        return webSocket.send(
                            JSON.stringify({
                                type: 'ERROR_POLICY_VIOLATION',
                                message: 'Strict Mode Active: A valid role token is required to interact.',
                            }),
                        );
                    }

                    if ((msg.type === 'UPLOAD_PARTIAL' || msg.type === 'UPLOAD_NONCE') && session.constraints.canUploadSignature === false) {
                        return webSocket.send(
                            JSON.stringify({
                                type: 'ERROR_POLICY_VIOLATION',
                                message: 'Your assigned role restricts signature uploads.',
                            }),
                        );
                    }
                }
            }

            if (msg.type === 'AUTH') {
                const ip = session.ip;

                // Never share lockout state across 'unknown' IPs; fall back to per-session lockout
                const authKey = ip !== 'unknown' ? ip : `session:${session.id}`;
                const penalty = this.ipAuthFailures.get(authKey) || { count: 0, lockedUntil: 0 };

                if (Date.now() < penalty.lockedUntil) {
                    return webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Too many failed attempts. Temporarily locked.' }));
                }

                const incomingBuffer = new TextEncoder().encode(msg.token);
                const incomingHashBuffer = await crypto.subtle.digest('SHA-256', incomingBuffer);
                const attemptedHash = Array.from(new Uint8Array(incomingHashBuffer))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('');

                if (attemptedHash === this.roomState?.adminToken) {
                    this.ipAuthFailures.delete(authKey);
                    this.sessions.set(webSocket, { ...session!, role: 'admin' });

                    if (this.roomState.participants && this.roomState.participants[session.id]) {
                        this.roomState.participants[session.id].role = 'admin';
                        await this.saveRoomState();
                        this.broadcast({ type: 'PARTICIPANTS_UPDATE', participants: this.roomState.participants });
                    }

                    webSocket.send(JSON.stringify({ type: 'ROLE_UPDATE', role: 'admin' }));
                } else {
                    penalty.count++;
                    if (penalty.count >= getConfig(this.env, 'MAX_AUTH_FAILURES')) {
                        penalty.lockedUntil = Date.now() + getConfig(this.env, 'LOCKOUT_DURATION_MS');
                    }

                    if (this.ipAuthFailures.size >= getConfig(this.env, 'MAX_IP_TRACKERS')) {
                        const now = Date.now();
                        for (const [trackedIp, data] of this.ipAuthFailures.entries()) {
                            if (now > data.lockedUntil) {
                                this.ipAuthFailures.delete(trackedIp);
                            }
                        }
                    }
                    this.ipAuthFailures.set(authKey, penalty);
                    return webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid Admin Token' }));
                }
                this.broadcastConnections();
            }

            // Register Role Link (Admin Only)
            if (msg.type === 'REGISTER_ROLE') {
                if (session?.role !== 'admin') {
                    return webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Unauthorized' }));
                }

                if (!this.roomState.roleTokens) this.roomState.roleTokens = {};

                if (Object.keys(this.roomState.roleTokens).length >= 50) {
                    return webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Maximum role links generated (50)' }));
                }

                this.roomState.roleTokens[msg.tokenHash] = {
                    canUpload: msg.canUpload,
                    policyBlob: msg.policyBlob,
                };
                await this.saveRoomState();

                return webSocket.send(JSON.stringify({ type: 'ROLE_REGISTERED_SUCCESS' }));
            }

            // Authenticate Role Link (Guest Flow)
            if (msg.type === 'AUTH_ROLE') {
                try {
                    const incomingBuffer = new TextEncoder().encode(msg.token);
                    const incomingHashBuffer = await crypto.subtle.digest('SHA-256', incomingBuffer);
                    const tokenHash = Array.from(new Uint8Array(incomingHashBuffer))
                        .map((b) => b.toString(16).padStart(2, '0'))
                        .join('');

                    if (this.roomState?.roleTokens && this.roomState.roleTokens[tokenHash]) {
                        const roleData = this.roomState.roleTokens[tokenHash];

                        this.sessions.set(webSocket, { ...session!, constraints: { canUploadSignature: roleData.canUpload } });

                        webSocket.send(JSON.stringify({ 
                            type: 'CONSTRAINT_UPDATE', 
                            policyBlob: roleData.policyBlob,
                        }));
                    } else {
                        webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid or revoked role token' }));
                    }
                } catch (e) {
                    webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Failed to authenticate role' }));
                }
                return;
            }

            // Label Updates (Admin Only)
            if (msg.type === 'UPDATE_LABEL' && session?.role === 'admin') {
                if (msg.label && msg.label.length > 200) {
                    return webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Label payload too large.' }));
                }
                if (!this.roomState.signerLabels) this.roomState.signerLabels = {};

                this.roomState.signerLabels[msg.fingerprint] = msg.label;

                await this.saveRoomState();

                await this.log(msg.encryptedLogBlob, session, msg.meta);
                this.broadcast({ type: 'LABELS_UPDATED', signerLabels: this.roomState.signerLabels });
            }

            // Address Label Updates (Admin Only)
            if (msg.type === 'UPDATE_ADDRESS_LABEL' && session?.role === 'admin') {
                if (msg.label && msg.label.length > 200) {
                    return webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Label payload too large.' }));
                }
                if (!this.roomState.addressLabels) this.roomState.addressLabels = {};

                this.roomState.addressLabels[msg.blindedAddress] = msg.label;

                await this.saveRoomState();

                await this.log(msg.encryptedLogBlob, session, msg.meta);
                this.broadcast({ type: 'ADDRESS_LABELS_UPDATED', addressLabels: this.roomState.addressLabels });
            }

            // Set Display Name (Self-Identify)
            if (msg.type === 'SET_DISPLAY_NAME') {
                const safeName = msg.encryptedDisplayName ? String(msg.encryptedDisplayName).substring(0, 500) : undefined;

                this.sessions.set(webSocket, { ...session!, encryptedDisplayName: safeName });

                if (!this.roomState.participants) this.roomState.participants = {};
                if (!this.roomState.participants[session.id]) {
                    this.roomState.participants[session.id] = { id: session.id, role: session.role };
                }

                this.roomState.participants[session.id].encryptedDisplayName = safeName;
                await this.saveRoomState();
                this.broadcast({ type: 'PARTICIPANTS_UPDATE', participants: this.roomState.participants });

                this.broadcastConnections();
            }

            // Rename Room (Admin Only)
            if (msg.type === 'RENAME_ROOM' && session?.role === 'admin') {
                this.roomState.roomName = msg.encryptedName;
                await this.saveRoomState();

                await this.log(msg.encryptedLogBlob, session, msg.meta);
                this.broadcast({ type: 'ROOM_RENAMED', encryptedName: msg.encryptedName });
            }

            // Action Logging
            if (msg.type === 'LOG_ACTION') {
                if (typeof msg.encryptedLogBlob === 'string' && msg.encryptedLogBlob.length <= 10000) {
                    await this.log(msg.encryptedLogBlob, session, msg.meta);
                }
            }

            // MuSig2: PSBT Nonce Upload (Round 1)
            if (msg.type === 'UPLOAD_NONCE') {
                if (msg.data?.encryptedData && msg.data.encryptedData.length > getConfig(this.env, 'MAX_PAYLOAD_SIZE_BYTES')) return;
                
                if (!this.roomState.nonces) this.roomState.nonces = {};
                const nonces = this.roomState.nonces;
                const isNewNonce = !nonces[msg.fingerprint];

                if (isNewNonce && Object.keys(nonces).length >= getConfig(this.env, 'MAX_SIGNATURES')) {
                    webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Nonce limit reached.' }));
                    return;
                }

                nonces[msg.fingerprint] = msg.data.encryptedData;
                await this.saveRoomState();

                await this.log(msg.encryptedLogBlob, session, msg.meta);
                this.broadcast({ type: 'NEW_NONCE_DATA', data: msg.data, fingerprint: msg.fingerprint, sessionId: session?.id });
            }

            // MuSig2: Coordinator Publishes Aggregate Base PSBT (Transitions to Round 2)
            if (msg.type === 'PUBLISH_AGGREGATE_PSBT' && session?.role === 'admin') {
                if (msg.encryptedPsbt && msg.encryptedPsbt.length > getConfig(this.env, 'MAX_PAYLOAD_SIZE_BYTES')) return;

                this.roomState.encryptedPsbt = msg.encryptedPsbt;
                await this.saveRoomState();

                await this.log(msg.encryptedLogBlob, session, msg.meta);
                this.broadcast({ type: 'AGGREGATE_PSBT_PUBLISHED', encryptedPsbt: msg.encryptedPsbt });
            }

            // PSBT Chunk Upload
            if (msg.type === 'UPLOAD_PARTIAL') {
                if (msg.data?.encryptedData && msg.data.encryptedData.length > getConfig(this.env, 'MAX_PAYLOAD_SIZE_BYTES')) return;
                
                const sigs = this.roomState.signatures || {};
                const isNewSigner = !sigs[msg.fingerprint];

                if (isNewSigner && Object.keys(sigs).length >= getConfig(this.env, 'MAX_SIGNATURES')) {
                    webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Signature limit reached.' }));
                    return;
                }

                this.roomState.signatures[msg.fingerprint] = msg.data.encryptedData;
                await this.saveRoomState();

                await this.log(msg.encryptedLogBlob, session, msg.meta);
                this.broadcast({ type: 'NEW_PARTIAL_DATA', data: msg.data, fingerprint: msg.fingerprint, sessionId: session?.id });
            }

            // Destroy Room (Admin Only)
            if (msg.type === 'CLOSE_ROOM' && session?.role === 'admin') {
                await this.log(msg.encryptedLogBlob, session, msg.meta);
                this.broadcast({ type: 'ROOM_CLOSED', finalLog: this.roomState.auditLog });
                await this.state.storage.deleteAll();
                this.roomState = null;
                for (const sock of this.sessions.keys()) {
                    try {
                        sock.close(1000, 'Room Closed by Coordinator');
                    } catch (e) {}
                }
                this.sessions.clear();
            }

            // Whitelist Management (Admin Only)
            if (msg.type === 'UPDATE_WHITELIST' && session?.role === 'admin') {
                this.roomState.whitelist = msg.encryptedWhitelist;
                await this.saveRoomState();

                await this.log(msg.encryptedLogBlob, session, msg.meta);
                this.broadcast({ type: 'WHITELIST_UPDATED', encryptedWhitelist: msg.encryptedWhitelist });
            }

            // Room Lock (Admin Only)
            if (msg.type === 'TOGGLE_LOCK' && session?.role === 'admin') {
                this.roomState.isLocked = msg.isLocked;
                await this.saveRoomState();
                await this.log(msg.encryptedLogBlob, session, msg.meta);
                this.broadcast({ type: 'LOCK_UPDATED', isLocked: this.roomState.isLocked });
            }

            // Finalize Transaction (Admin Only)
            if (msg.type === 'TX_FINALIZED' && session?.role === 'admin') {
                this.roomState.encryptedFinalTxHex = msg.encryptedFinalTxHex;
                this.roomState.encryptedFinalTxId = msg.encryptedFinalTxId;
                await this.saveRoomState();

                await this.log(msg.encryptedLogBlob, session, msg.meta);

                this.broadcast({
                    type: 'TX_FINALIZED_BROADCAST',
                    encryptedFinalTxHex: msg.encryptedFinalTxHex,
                    encryptedFinalTxId: msg.encryptedFinalTxId,
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    private handleClose(webSocket: WebSocket) {
        const session = this.sessions.get(webSocket);

        if (session && session.ip && session.ip !== 'unknown') {
            const currentIpCount = this.ipConnectionCounts.get(session.ip) || 1;
            const newCount = Math.max(0, currentIpCount - 1);

            if (newCount === 0) {
                this.ipConnectionCounts.delete(session.ip);
            } else {
                this.ipConnectionCounts.set(session.ip, newCount);
            }
        }

        this.sessions.delete(webSocket);
        this.broadcastConnections();
    }

    broadcast(msg: any) {
        const data = JSON.stringify(msg);
        for (const socket of this.sessions.keys()) {
            try {
                socket.send(data);
            } catch (e) {
                this.sessions.delete(socket);
            }
        }
    }

    async alarm() {
        await this.state.storage.deleteAll();
        this.roomState = null;
        for (const socket of this.sessions.keys()) {
            try {
                socket.close(1000, 'Expired');
            } catch (e) {}
        }
        this.sessions.clear();
    }

    private getSanitizedParticipants() {
        const clean: Record<string, any> = {};
        if (!this.roomState?.participants) return clean;
        for (const [id, p] of Object.entries(this.roomState.participants as Record<string, any>)) {
            const { resumeTokenHash, ...publicFields } = p;
            clean[id] = publicFields;
        }
        return clean;
    }

    broadcastConnections() {
        const activeSessions = Array.from(this.sessions.values()).map((s) => ({
            id: s.id,
            role: s.role,
            encryptedDisplayName: s.encryptedDisplayName,
        }));

        this.broadcast({
            type: 'CONNECTIONS_UPDATE',
            count: this.sessions.size,
            sessions: activeSessions,
        });
    }
}

// =============================================================================
// SERVER-SIDE LICENSE VERIFIER
// =============================================================================

const MASTER_PUBKEY_SPKI = 'MCowBQYDK2VwAyEAVHmMGOonAgglS98rsyHOycwc7acID4LBUXTE/b41TCY=';

export interface ServerLicenseResult {
    tier: 'PUBLIC_GOOD' | 'ENTERPRISE' | 'COMMUNITY';
    licensee: string;
    domain: string;
}

const DEFAULT_COMMUNITY_RESULT: ServerLicenseResult = {
    tier: 'COMMUNITY',
    licensee: 'Signing Room Community Edition',
    domain: '*',
};

function base64UrlToBytes(str: string): Uint8Array {
    if (!str) return new Uint8Array(0);
    const cleaned = str
        .replace(/-----BEGIN[^-]+-----/g, '')
        .replace(/-----END[^-]+-----/g, '')
        .replace(/\s+/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const unpadded = cleaned.replace(/=+$/, '');
    const padLength = (4 - (unpadded.length % 4)) % 4;
    const padded = unpadded + '='.repeat(padLength);

    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
}

async function verifyServerLicense(
    token: string | undefined | null,
    originOrReferer: string | null | undefined,
): Promise<ServerLicenseResult> {
    if (!token || !token.startsWith('srl_')) {
        return DEFAULT_COMMUNITY_RESULT;
    }

    if (!MASTER_PUBKEY_SPKI) {
        return DEFAULT_COMMUNITY_RESULT;
    }

    try {
        const rawBytes = base64UrlToBytes(token.slice(4));
        if (rawBytes.length < 87) return DEFAULT_COMMUNITY_RESULT;

        const checksum = rawBytes.slice(0, 4);
        const signature = rawBytes.slice(4, 68);
        const payloadBytes = rawBytes.slice(68);

        const hashBuffer = await crypto.subtle.digest('SHA-256', payloadBytes);
        const expectedChecksum = new Uint8Array(hashBuffer).slice(0, 4);
        for (let i = 0; i < 4; i++) {
            if (checksum[i] !== expectedChecksum[i]) return DEFAULT_COMMUNITY_RESULT;
        }

        const view = new DataView(payloadBytes.buffer, payloadBytes.byteOffset, payloadBytes.byteLength);
        if (view.getUint8(0) !== 1) return DEFAULT_COMMUNITY_RESULT;

        const tierByte = view.getUint8(1);
        const tier = tierByte === 1 ? 'PUBLIC_GOOD' : tierByte === 2 ? 'ENTERPRISE' : 'COMMUNITY';
        const expiresAt = Number(view.getBigUint64(3));

        if (expiresAt !== 0 && Date.now() > expiresAt) {
            return DEFAULT_COMMUNITY_RESULT;
        }

        let offset = 19;
        const decoder = new TextDecoder();

        const domainLen = view.getUint8(offset++);
        const domain = decoder.decode(payloadBytes.slice(offset, offset + domainLen)).toLowerCase();
        offset += domainLen;

        const licenseeLen = view.getUint8(offset++);
        const licensee = decoder.decode(payloadBytes.slice(offset, offset + licenseeLen));

        if (domain !== '*' && originOrReferer) {
            try {
                const url = new URL(originOrReferer);
                const reqHost = url.host.toLowerCase();
                const reqHostname = url.hostname.toLowerCase();
                const allowedList = domain.toLowerCase().split(',').map((d) => d.trim());

                const isMatch = allowedList.some((allowed) => {
                    if (allowed === '*') return true;
                    if (allowed.includes(':')) {
                        return reqHost === allowed;
                    }
                    return reqHostname === allowed || reqHostname.endsWith(`.${allowed}`);
                });

                if (!isMatch) {
                    return DEFAULT_COMMUNITY_RESULT;
                }
            } catch {
                return DEFAULT_COMMUNITY_RESULT;
            }
        }

        const keyBytes = base64UrlToBytes(MASTER_PUBKEY_SPKI);
        const cryptoKey = await crypto.subtle.importKey(
            'spki',
            keyBytes,
            { name: 'Ed25519' },
            false,
            ['verify'],
        );

        const isValid = await crypto.subtle.verify(
            'Ed25519',
            cryptoKey,
            signature,
            payloadBytes,
        );

        if (!isValid) return DEFAULT_COMMUNITY_RESULT;

        return { tier, licensee, domain };
    } catch {
        return DEFAULT_COMMUNITY_RESULT;
    }
}