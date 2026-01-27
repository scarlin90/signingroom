/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { DurableObject } from 'cloudflare:workers';

// =============================================================================
// 1. CONFIGURATION & TYPES
// =============================================================================

const MAX_PAYLOAD_SIZE_BYTES = 500 * 1024; // 500KB Limit for PSBT uploads

interface Env {
  SIGNING_ROOM: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
  ENVIRONMENT: 'development' | 'production';
}

// =============================================================================
// 2. UTILITIES: RATE LIMITER
// =============================================================================

/**
 * Simple in-memory IP Rate Limiter to prevent abuse.
 * Allows 20 requests per minute per IP.
 */
const ipLimits = new Map<string, { count: number, expires: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipLimits.get(ip);

  if (record && now > record.expires) {
    ipLimits.delete(ip);
  }

  if (!ipLimits.has(ip)) {
    ipLimits.set(ip, { count: 1, expires: now + 60000 });
    return true;
  }

  const current = ipLimits.get(ip)!;
  current.count++;
  return current.count <= 20;
}

// =============================================================================
// 3. HONO APP & MIDDLEWARE
// =============================================================================

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors({
  origin: (origin, c) => {
    if (origin.endsWith('signingroom.io')) {
      return origin;
    }

    const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
    const isDevelopment = c.env.ENVIRONMENT === 'development';

    if (isLocalhost && isDevelopment) {
      return origin;
    }

    return null; 
  },
  allowHeaders: ['Upgrade', 'Content-Type', 'Authorization', 'X-Requested-With'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 86400,
  credentials: true,
}));

app.use('/*', async (c, next) => {
  c.header('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' wss: https:; " +
    "img-src 'self' data:; " + 
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  c.header('X-XSS-Protection', '1; mode=block');

  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  if (ip !== 'unknown' && !checkRateLimit(ip)) {
    return c.json({ error: "Rate limit exceeded." }, 429);
  }

  await next();
});


app.get('/api/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    version: '1.0.0-oss', 
    timestamp: Date.now() 
  });
});

// =============================================================================
// 4. API ROUTES: ROOM MANAGEMENT
// =============================================================================

app.post('/api/room', async (c) => {
  const body = await c.req.json();
  const { encryptedPsbt, network, adminToken } = body;

  if (encryptedPsbt && encryptedPsbt.length > MAX_PAYLOAD_SIZE_BYTES) {
    return c.json({ error: "Payload too large. Max 500KB." }, 413);
  }

  const roomId = crypto.randomUUID();
  const id = c.env.SIGNING_ROOM.idFromName(roomId);
  const room = c.env.SIGNING_ROOM.get(id);

  // Initialize the Durable Object
  await room.fetch(new Request('http://internal/init', {
    method: 'POST',
    body: JSON.stringify({ encryptedPsbt, adminToken, roomId, network })
  }));

  return c.json({ roomId, adminToken, socketUrl: `/api/room/${roomId}/websocket` });
});

// WebSocket Upgrade Handler
app.get('/api/room/:id/websocket', async (c) => {
  const roomId = c.req.param('id');
  const id = c.env.SIGNING_ROOM.idFromName(roomId);
  const room = c.env.SIGNING_ROOM.get(id);
  return room.fetch(c.req.raw);
});

export default app;

// =============================================================================
// 5. DURABLE OBJECT: SIGNING ROOM (STATELESS RELAY)
// =============================================================================

export class SigningRoom implements DurableObject {
  state: DurableObjectState;
  sessions = new Map<WebSocket, { role: string; id: string }>();
  roomState: any = null;
  env: Env;
  private authFailures = 0;
  private isLockedOut = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // Load state from disk (if any exists from a previous hibernation)
    this.state.blockConcurrencyWhile(async () => {
      this.roomState = await this.state.storage.get('data');
    });
  }

  async log(event: string, detail: string = '', user: string = 'System') {
    if (!this.roomState) return;
    if (!this.roomState.auditLog) this.roomState.auditLog = [];
    // Keep log reasonable size
    if (this.roomState.auditLog.length > 100) this.roomState.auditLog.shift();
    
    this.roomState.auditLog.push({ timestamp: Date.now(), event, detail, user });
    await this.state.storage.put('data', this.roomState);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // 1. Initialize Room
    if (url.pathname === '/init') {
      const { encryptedPsbt, adminToken, roomId, network } = await request.json<any>();
      const now = Date.now();
      
      // Default to 24 hour (86400s)
      const ttlSeconds = 86400; 

      this.roomState = {
        roomId, encryptedPsbt, adminToken, signatures: [], 
        createdAt: now, expiresAt: now + (ttlSeconds * 1000), 
        auditLog: [], signerLabels: {}, roomName: "Untitled Room", whitelist: [], 
        isLocked: false, network: network || 'bitcoin'
      };

      this.roomState.auditLog.push({ timestamp: now, event: 'Room Created', detail: 'Public Session', user: 'System' });
      
      await this.state.storage.put('data', this.roomState);
      await this.state.storage.setAlarm(now + (ttlSeconds * 1000));
      return new Response('OK');
    }

    // 2. Handle WebSocket Upgrade
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected Websocket', { status: 426 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(webSocket: WebSocket) {
    if (!this.roomState) {
      webSocket.accept();
      webSocket.send(JSON.stringify({ type: 'ERROR_NOT_FOUND' }));
      webSocket.close(4004, "Room Not Found");
      return;
    }

    // Generous limit for free version
    if (this.sessions.size >= 40) {
      webSocket.accept();
      webSocket.close(4001, "Room Full");
      return;
    }

    if (this.roomState.isLocked) {
      webSocket.accept();
      webSocket.send(JSON.stringify({ type: 'ERROR_LOCKED' }));
      webSocket.close(1000, "Room is Locked");
      return;
    }

    webSocket.accept();
    const sessionId = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.sessions.set(webSocket, { role: 'guest', id: sessionId });
    
    this.log('User Joined', `Session: ${sessionId}`, 'Guest');
    this.broadcast({ type: 'CONNECTIONS_UPDATE', count: this.sessions.size });
    
    // Send initial state sync
    webSocket.send(JSON.stringify({ type: 'STATE_SYNC', ...this.roomState, connectedCount: this.sessions.size }));

    webSocket.addEventListener('message', async (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        const session = this.sessions.get(webSocket);
        const userLabel = session?.role === 'admin' ? 'Coordinator' : `Guest (${session?.id})`;

          if (msg.type === 'AUTH') {
            if (this.isLockedOut) {
              return webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Room locked due to multiple failed attempts' }));
            }

            if (msg.token === this.roomState.adminToken) {
              this.authFailures = 0; 
              this.sessions.set(webSocket, { ...session!, role: 'admin' });
              webSocket.send(JSON.stringify({ type: 'ROLE_UPDATE', role: 'admin' }));
          } else {
              this.authFailures++;
              if (this.authFailures >= 5) {
                  this.isLockedOut = true;
                  await this.state.storage.setAlarm(Date.now() + 30 * 60 * 1000);
              }
              return webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid Admin Token' }));
            }
        }

        // Label Updates (Admin Only)
        if (msg.type === 'UPDATE_LABEL' && session?.role === 'admin') {
            if (!this.roomState.signerLabels) this.roomState.signerLabels = {};

            const cleanLabel = sanitizeInput(msg.label, 120); 
            this.roomState.signerLabels[msg.fingerprint] = cleanLabel;
            
            await this.state.storage.put('data', this.roomState);
            this.log('Label Updated', `${msg.fingerprint} -> ${cleanLabel}`, userLabel);
            this.broadcast({ type: 'LABELS_UPDATED', signerLabels: this.roomState.signerLabels });
        }

        // Rename Room (Admin Only)
        if (msg.type === 'RENAME_ROOM' && session?.role === 'admin') {
          const oldName = this.roomState.roomName;
          
          const cleanName = sanitizeInput(msg.name, 120);
          this.roomState.roomName = cleanName;
          
          await this.state.storage.put('data', this.roomState);
          this.log('Room Renamed', `${oldName} -> ${cleanName}`, userLabel);
          this.broadcast({ type: 'ROOM_RENAMED', name: this.roomState.roomName });
      }

        // Action Logging
        if (msg.type === 'LOG_ACTION') {
          await this.log(msg.action, msg.detail, userLabel);
          this.broadcast({ type: 'LOG_UPDATE', auditLog: this.roomState.auditLog });
        }

        // PSBT Chunk Upload (Blind Relay)
        if (msg.type === 'UPLOAD_PARTIAL') {
          if (msg.data?.encryptedData && msg.data.encryptedData.length > MAX_PAYLOAD_SIZE_BYTES) return;
          if (this.roomState.signatures.length >= 100) { // Safety Cap
            webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Signature limit reached.' }));
            return;
          }
          this.roomState.signatures.push(msg.data);
          const detail = msg.fingerprint ? `Signer: ${msg.fingerprint}` : 'Unknown Signer';
          await this.log('Signature Uploaded', detail, userLabel);
          await this.state.storage.put('data', this.roomState);
          this.broadcast({ type: 'NEW_PARTIAL_DATA', data: msg.data, signerId: msg.signerId, auditLog: this.roomState.auditLog });
        }

        // Destroy Room (Admin Only)
        if (msg.type === 'CLOSE_ROOM' && session?.role === 'admin') {
          await this.log('Room Destroyed', 'Coordinator closed session', 'Coordinator');
          this.broadcast({ type: 'ROOM_CLOSED', finalLog: this.roomState.auditLog });
          await this.state.storage.deleteAll();
          this.roomState = null;
          for (const s of this.sessions.keys()) s.close(1000, "Closed");
        }

        // Whitelist Management (Admin Only)
        if (msg.type === 'UPDATE_WHITELIST' && session?.role === 'admin') {
          const list = this.roomState.whitelist || [];
          if (msg.remove) this.roomState.whitelist = list.filter((a: string) => a !== msg.address);
          else if (!list.includes(msg.address)) this.roomState.whitelist.push(msg.address);
          await this.state.storage.put('data', this.roomState);
          this.log('Whitelist Updated', `${msg.remove ? 'Removed' : 'Added'} ${msg.address}`, userLabel);
          this.broadcast({ type: 'WHITELIST_UPDATED', whitelist: this.roomState.whitelist });
        }

        // Room Lock (Admin Only)
        if (msg.type === 'TOGGLE_LOCK' && session?.role === 'admin') {
          this.roomState.isLocked = msg.locked;
          await this.state.storage.put('data', this.roomState);
          this.log('Security Alert', `Room ${msg.locked ? 'LOCKED' : 'UNLOCKED'}`, 'Coordinator');
          this.broadcast({ type: 'LOCK_UPDATED', isLocked: this.roomState.isLocked });
        }

      } catch (e) { console.error(e); }
    });

    webSocket.addEventListener('close', () => {
      const session = this.sessions.get(webSocket);
      this.sessions.delete(webSocket);
      this.broadcast({ type: 'CONNECTIONS_UPDATE', count: this.sessions.size });
      if (this.roomState) this.log('User Left', `Session ID: ${session?.id}`, 'Guest');
    });
  }

  broadcast(msg: any) {
    const data = JSON.stringify(msg);
    for (const socket of this.sessions.keys()) {
      try { socket.send(data); } catch (e) { this.sessions.delete(socket); }
    }
  }

  async alarm() {
    const now = Date.now();

    if (this.isLockedOut) {
        this.isLockedOut = false;
        this.authFailures = 0;
        
        if (this.roomState && now < this.roomState.expiresAt) {
            
            await this.state.storage.setAlarm(this.roomState.expiresAt);
            return; 
        }
    }

    this.isLockedOut = false;
    this.authFailures = 0;
    await this.state.storage.deleteAll();
    this.roomState = null;
    for (const socket of this.sessions.keys()) {
        socket.close(1000, "Expired");
    }
  }
}

function sanitizeInput(input: string, maxLength: number = 120): string {
    if (typeof input !== 'string') return '';
    return input
        .replace(/[<>'"&]/g, '')
        .trim()
        .substring(0, maxLength);
}