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

const MAX_PAYLOAD_SIZE_BYTES = 2 * 1024 * 1024; // 2MB Hard Limit
const MAX_CONNECTIONS = 40;                     // Room Capacity
const RATE_LIMIT_WINDOW = 1000;                 // 1 Second
const MAX_MSGS_PER_WINDOW = 10;                 // 10 messages per second per user
const MAX_CONNECTIONS_PER_IP = 10;               // Maximum connections per IP address

interface Env {
  SIGNING_ROOM: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
  ENVIRONMENT: 'development' | 'production';
  RATE_LIMITER: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
}

interface SessionData {
  id: string;
  role: 'admin' | 'guest';
  joinedAt: number;
  msgsInWindow: number;
  lastMsgTime: number;
  ip: string;
  encryptedDisplayName?: string;
}

// =============================================================================
// HONO APP & MIDDLEWARE
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
  // Security Headers
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

  // --- RATE LIMITING (THE BOUNCER) ---
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';

  if (c.env.ENVIRONMENT === 'production' && ip !== 'unknown') {
    try {
      // use the global Cloudflare counter
      const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
      
      if (!success) {
        return c.json({ error: "Rate limit exceeded. Please wait." }, 429);
      }
    } catch (err) {
      console.error("Rate Limiter Error:", err);
    }
  }

  await next();
});


app.get('/api/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    version: '1.8.0', 
    timestamp: Date.now() 
  });
});

// =============================================================================
// API ROUTES: ROOM MANAGEMENT
// =============================================================================

app.post('/api/room', async (c) => {
  const body = await c.req.json();
  const { roomId, expectedPass, encryptedPsbt, network, adminToken, protocolVersion } = body;

  if (encryptedPsbt && encryptedPsbt.length > MAX_PAYLOAD_SIZE_BYTES) {
    return c.json({ error: "Payload too large. Max 500KB." }, 413);
  }

  const id = c.env.SIGNING_ROOM.idFromName(roomId);
  const room = c.env.SIGNING_ROOM.get(id);

  // Initialize the Durable Object
  const initRes = await room.fetch(new Request('http://internal/init', {
    method: 'POST',
    body: JSON.stringify({ roomId, expectedPass, encryptedPsbt, adminToken, network, protocolVersion })
  }));

  await initRes.text();

  return c.json({ roomId, socketUrl: `/api/room/${roomId}/websocket` });
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
// DURABLE OBJECT: SIGNING ROOM (STATELESS RELAY)
// =============================================================================

export class SigningRoom implements DurableObject {
  state: DurableObjectState;
  sessions = new Map<WebSocket, SessionData>();
  roomState: any = null;
  env: Env;
  private authFailures = 0;
  private isLockedOut = false;
  private ipConnectionCounts = new Map<string, number>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // Load state from disk (if any exists from a previous hibernation)
    this.state.blockConcurrencyWhile(async () => {
      this.roomState = await this.state.storage.get('data');
    });
  }

  async log(encryptedLogBlob: string) {
    if (!this.roomState) return;
    if (!this.roomState.auditLog) this.roomState.auditLog = []; 
    
    if (this.roomState.auditLog.length > 2000) this.roomState.auditLog.shift();
    
    this.roomState.auditLog.push(encryptedLogBlob);
    
    await this.state.storage.put('data', this.roomState);
    this.broadcast({ type: 'LOG_UPDATE', auditLog: this.roomState.auditLog });
  }


  async fetch(request: Request) {
    const url = new URL(request.url);

    // 1. Initialize Room
    if (url.pathname === '/init') {
      const { roomId, expectedPass, encryptedPsbt, adminToken, network, protocolVersion, encryptedLogBlob, encryptedRoomName } = await request.json<any>();
      const now = Date.now();
      
      // Default to 24 hour (86400s)
      const ttlSeconds = 86400; 

      const tokenBuffer = new TextEncoder().encode(adminToken);
      const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBuffer);
      const secureStoredHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

      this.roomState = {
        roomId, 
        expectedPass,
        encryptedPsbt, 
        adminToken: secureStoredHash, 
        signatures: [], 
        createdAt: now, expiresAt: now + (ttlSeconds * 1000), 
        auditLog: [], signerLabels: {}, 
        whitelist: [], 
        participants: {},
        isLocked: false, network: network || 'bitcoin',
        protocolVersion: protocolVersion || '1.0.0',
        roomName: encryptedRoomName || "Untitled Room"
      };

      if (encryptedLogBlob) {
          this.roomState.auditLog.push(encryptedLogBlob);
      }

      await this.state.storage.put('data', this.roomState);
      await this.state.storage.setAlarm(now + (ttlSeconds * 1000));
      return new Response('OK');
    }

    // 2. Handle WebSocket Upgrade
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected Websocket', { status: 426 });

    const providedPass = url.searchParams.get('pass');
    if (this.roomState && this.roomState.expectedPass) {
        if (providedPass !== this.roomState.expectedPass) {
            return new Response("Unauthorized: Invalid Room Pass", { status: 401 });
        }
    }

    const clientVersion = url.searchParams.get('v') || '1.0.0';
    const roomVersion = this.roomState?.protocolVersion || '1.0.0';

    // Extract the Major version
    const clientMajor = clientVersion.split('.')[0];
    const roomMajor = roomVersion.split('.')[0];

    if (clientMajor !== roomMajor) {
        const { 0: client, 1: server } = new WebSocketPair();
        server.accept();
        
        server.send(JSON.stringify({ 
            type: 'ERROR_VERSION_MISMATCH', 
            roomVersion: roomVersion 
        }));
        
        server.close(4026, "Protocol Mismatch"); 
        
        return new Response(null, { status: 101, webSocket: client });
    }

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';

        const currentIpCount = this.ipConnectionCounts.get(ip) || 0;
        if (currentIpCount >= MAX_CONNECTIONS_PER_IP) {
            return new Response("Rate Limit Exceeded: Too many concurrent connections from this IP.", { status: 429 });
        }
    

    const { 0: client, 1: server } = new WebSocketPair();
    this.handleSession(server, ip);
    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(webSocket: WebSocket, ip: string) {
    if (!this.roomState) {
      webSocket.accept();
      webSocket.send(JSON.stringify({ type: 'ERROR_NOT_FOUND' }));
      webSocket.close(4004, "Room Not Found");
      return;
    }

    if (this.sessions.size >= MAX_CONNECTIONS) {
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
   

        const currentIpCount = this.ipConnectionCounts.get(ip) || 0;
        this.ipConnectionCounts.set(ip, currentIpCount + 1);
    
   
    this.sessions.set(webSocket, { 
        role: 'guest', 
        id: sessionId,
        joinedAt: Date.now(),
        msgsInWindow: 0,
        lastMsgTime: 0,
        ip: ip
    });

    if (!this.roomState.participants) this.roomState.participants = {};
    this.roomState.participants[sessionId] = { id: sessionId, role: 'guest' };
    this.state.storage.put('data', this.roomState);
    this.broadcast({ type: 'PARTICIPANTS_UPDATE', participants: this.roomState.participants });

    webSocket.send(JSON.stringify({ type: 'SESSION_CONNECTED', sessionId: sessionId }));
    
    this.broadcastConnections();
    
    // Send initial state sync
    const { adminToken, ...safeRoomState } = this.roomState;

    webSocket.send(JSON.stringify({ type: 'STATE_SYNC', ...safeRoomState, connectedCount: this.sessions.size }));

    webSocket.addEventListener('message', (event) => {
      void this.handleMessage(event, webSocket);
    });

    webSocket.addEventListener('close', () => {
      void this.handleClose(webSocket);
    });
  }

  async handleMessage(event: MessageEvent, webSocket: WebSocket) {
    try {

        const session = this.sessions.get(webSocket);
        if (!session) return;

        const rawData = event.data;
        const size = typeof rawData === 'string' ? rawData.length : rawData.byteLength;

        if (size > MAX_PAYLOAD_SIZE_BYTES) {
          webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Payload too large (Max 2MB)' }));
          return;
        }

        const now = Date.now();
        if (now - session.lastMsgTime > RATE_LIMIT_WINDOW) {
            // Reset window
            session.msgsInWindow = 1;
            session.lastMsgTime = now;
        } else {
            session.msgsInWindow++;
            if (session.msgsInWindow > MAX_MSGS_PER_WINDOW) {
                // Too fast - ignore
                return; 
            }
        }

        const msg = JSON.parse(event.data as string);
        const userLabel = session?.role === 'admin' ? 'Coordinator' : `Guest (${session?.id})`;

          if (msg.type === 'AUTH') {
            if (this.isLockedOut) {
              return webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Room locked due to multiple failed attempts' }));
            }

            const incomingBuffer = new TextEncoder().encode(msg.token);
            const incomingHashBuffer = await crypto.subtle.digest('SHA-256', incomingBuffer);
            const attemptedHash = Array.from(new Uint8Array(incomingHashBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            if (attemptedHash === this.roomState?.adminToken) {

              this.authFailures = 0; 
              this.sessions.set(webSocket, { ...session!, role: 'admin' });

              if (this.roomState.participants && this.roomState.participants[session.id]) {
                  this.roomState.participants[session.id].role = 'admin';
                  await this.state.storage.put('data', this.roomState);
                  this.broadcast({ type: 'PARTICIPANTS_UPDATE', participants: this.roomState.participants });
              }

              webSocket.send(JSON.stringify({ type: 'ROLE_UPDATE', role: 'admin' }));
            } else {
              this.authFailures++;
              if (this.authFailures >= 5) {
                  this.isLockedOut = true;
                  await this.state.storage.setAlarm(Date.now() + 30 * 60 * 1000);
              }
              return webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid Admin Token' }));
            }
            this.broadcastConnections();
        }

        // Label Updates (Admin Only)
        if (msg.type === 'UPDATE_LABEL' && session?.role === 'admin') {
            if (!this.roomState.signerLabels) this.roomState.signerLabels = {};

            // msg.label is now a secure Base64 blob, so no need to sanitize!
            this.roomState.signerLabels[msg.fingerprint] = msg.label;
            
            await this.state.storage.put('data', this.roomState);
            
            this.log(msg.encryptedLogBlob);
            this.broadcast({ type: 'LABELS_UPDATED', signerLabels: this.roomState.signerLabels });
        }

        // Set Display Name (Self-Identify)
        if (msg.type === 'SET_DISPLAY_NAME') {
            const safeName = msg.encryptedDisplayName ? String(msg.encryptedDisplayName).substring(0, 500) : undefined;
            
            this.sessions.set(webSocket, { ...session!, encryptedDisplayName: safeName });

            if (this.roomState.participants && this.roomState.participants[session.id]) {
                this.roomState.participants[session.id].encryptedDisplayName = safeName;
                await this.state.storage.put('data', this.roomState);
                this.broadcast({ type: 'PARTICIPANTS_UPDATE', participants: this.roomState.participants });
            }
            
            this.broadcastConnections();
        }

        // Rename Room (Admin Only)
        if (msg.type === 'RENAME_ROOM' && session?.role === 'admin') {
          this.roomState.roomName = msg.encryptedName; 
          await this.state.storage.put('data', this.roomState);
          
          this.log(msg.encryptedLogBlob);
          this.broadcast({ type: 'ROOM_RENAMED', encryptedName: msg.encryptedName });
        }

        // Action Logging
        if (msg.type === 'LOG_ACTION') {
          await this.log(msg.encryptedLogBlob);
          this.broadcast({ type: 'LOG_UPDATE', auditLog: this.roomState.auditLog });
        }

        // PSBT Chunk Upload
        if (msg.type === 'UPLOAD_PARTIAL') {
          if (msg.data?.encryptedData && msg.data.encryptedData.length > MAX_PAYLOAD_SIZE_BYTES) return;
          if (this.roomState.signatures.length >= 100) { 
            webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Signature limit reached.' }));
            return;
          }
          
          this.roomState.signatures.push(msg.data.encryptedData); 
          await this.state.storage.put('data', this.roomState);
          
          this.log(msg.encryptedLogBlob);
          this.broadcast({ type: 'NEW_PARTIAL_DATA', data: msg.data, fingerprint: msg.fingerprint });
        }

        // Destroy Room (Admin Only)
        if (msg.type === 'CLOSE_ROOM' && session?.role === 'admin') {
          await this.log(msg.encryptedLogBlob);
          this.broadcast({ type: 'ROOM_CLOSED', finalLog: this.roomState.auditLog });
          await this.state.storage.deleteAll();
          this.roomState = null;
          for (const sock of this.sessions.keys()) {
                try {
                    sock.close(1000, "Room Closed by Coordinator");
                } catch (e) {
                    // Ignore errors on close
                }
            }
          this.sessions.clear();
        }

        // Whitelist Management (Admin Only)
        if (msg.type === 'UPDATE_WHITELIST' && session?.role === 'admin') {
          this.roomState.whitelist = msg.encryptedWhitelist; 
          await this.state.storage.put('data', this.roomState);
          
          this.log(msg.encryptedLogBlob);
          this.broadcast({ type: 'WHITELIST_UPDATED', encryptedWhitelist: msg.encryptedWhitelist });
        }


        // Room Lock (Admin Only)
        if (msg.type === 'TOGGLE_LOCK' && session?.role === 'admin') {
          this.roomState.isLocked = msg.locked;
          await this.state.storage.put('data', this.roomState);
          this.log(msg.encryptedLogBlob);
          this.broadcast({ type: 'LOCK_UPDATED', isLocked: this.roomState.isLocked });
        }

        // Finalize Transaction (Admin Only)
        if (msg.type === 'TX_FINALIZED' && session?.role === 'admin') {
          this.roomState.encryptedFinalTxHex = msg.encryptedFinalTxHex;
          this.roomState.encryptedFinalTxId = msg.encryptedFinalTxId;
          await this.state.storage.put('data', this.roomState);
          
          this.log(msg.encryptedLogBlob);
          
          this.broadcast({ 
              type: 'TX_FINALIZED_BROADCAST', 
              encryptedFinalTxHex: msg.encryptedFinalTxHex,
              encryptedFinalTxId: msg.encryptedFinalTxId
          });
        }

      } catch (e) { console.error(e); }
  }

  private async handleClose(webSocket: WebSocket) {
  const session = this.sessions.get(webSocket);
      
      if (session && session.ip) {
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

  broadcastConnections() {
    const activeSessions = Array.from(this.sessions.values()).map(s => ({
        id: s.id,
        role: s.role,
        encryptedDisplayName: s.encryptedDisplayName
    }));

    this.broadcast({ 
        type: 'CONNECTIONS_UPDATE', 
        count: this.sessions.size,
        sessions: activeSessions 
    });
  }
}