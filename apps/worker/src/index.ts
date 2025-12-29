/*
 * Copyright (C) 2025 Sean Carlin
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { DurableObject } from 'cloudflare:workers';

// =============================================================================
// 1. CONFIGURATION & TYPES
// =============================================================================

const MAX_PAYLOAD_SIZE_BYTES = 500 * 1024; // 500KB Limit for PSBT uploads

// Payment Constants (in milliSatoshis)
// 1 Sat = 1000 mSats
const UNLOCK_PRICE_MSATS = 21000 * 1000;       // 21,000 sats
const EXTEND_PRICE_MSATS = 5000 * 1000;        // 5,000 sats
const LICENSE_ANNUAL_MSATS = 300000 * 1000;    // 300,000 sats
const LICENSE_GENESIS_MSATS = 2100000 * 1000;  // 2,100,000 sats

interface Env {
  SIGNING_ROOM: DurableObjectNamespace;
  SALES_COUNTER: DurableObjectNamespace;
  LICENSES: KVNamespace;
  LNBITS_URL: string;
  LNBITS_KEY: string;
  ALLOWED_ORIGIN: string;
  API_PUBLIC_URL: string;
}

// =============================================================================
// 2. UTILITIES & MANAGERS
// =============================================================================

/**
 * Manages the lifecycle of API License Keys (Generation, Validation, Rotation).
 */
const LicenseManager = {
  async create(env: Env, type: 'annual' | 'genesis', email?: string) {
    const licenseId = crypto.randomUUID();
    const apiKey = `sk_${type}_${crypto.randomUUID().split('-')[0]}${crypto.randomUUID().split('-')[1]}`;

    const expiresAt = type === 'genesis'
      ? 253402300799 // Year 9999
      : Math.floor(Date.now() / 1000) + 31536000; // Now + 1 Year

    const licenseData = {
      id: licenseId,
      type,
      createdAt: Date.now(),
      expiresAt,
      email: email || 'anon',
      activeKey: apiKey
    };

    await env.LICENSES.put(`license:${licenseId}`, JSON.stringify(licenseData));
    await env.LICENSES.put(apiKey, `license:${licenseId}`);

    return { apiKey, expiresAt };
  },

  async validate(env: Env, key: string) {
    const licenseIdRef = await env.LICENSES.get(key);
    if (!licenseIdRef) return null;

    const licenseJson = await env.LICENSES.get(licenseIdRef);
    if (!licenseJson) return null;

    const license = JSON.parse(licenseJson);

    if (license.expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return license;
  },

  async rotate(env: Env, oldKey: string) {
    const licenseIdRef = await env.LICENSES.get(oldKey);
    if (!licenseIdRef) throw new Error("Invalid Key");

    const licenseJson = await env.LICENSES.get(licenseIdRef);
    if (!licenseJson) throw new Error("License not found");

    const license = JSON.parse(licenseJson);
    const newKey = `sk_${license.type}_${crypto.randomUUID().split('-')[0]}${crypto.randomUUID().split('-')[1]}`;

    license.activeKey = newKey;
    license.updatedAt = Date.now();

    await env.LICENSES.put(licenseIdRef, JSON.stringify(license));
    await env.LICENSES.put(newKey, licenseIdRef);
    await env.LICENSES.delete(oldKey);

    return newKey;
  }
};

/**
 * Simple in-memory IP Rate Limiter.
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

app.use('/*', async (c, next) => {
  // A. CORS
  const corsMiddleware = cors({
    origin: (origin) => {
      return origin.endsWith('signingroom.io') || origin.includes('localhost')
        ? origin
        : c.env.ALLOWED_ORIGIN;
    },
    allowHeaders: ['Upgrade', 'Content-Type', 'Authorization', 'X-Requested-With'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 86400,
    credentials: true,
  });

  await corsMiddleware(c, async () => { });

  // B. Security Headers
  c.header('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' wss: https:; " +
    "img-src 'self' data: https://api.qrserver.com; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  c.header('X-XSS-Protection', '1; mode=block');

  if (c.req.method === 'OPTIONS') return c.text('', 204);

  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  if (ip !== 'unknown' && !checkRateLimit(ip)) {
    return c.json({ error: "Rate limit exceeded." }, 429);
  }

  await next();
});

// =============================================================================
// 4. API ROUTES: ROOM MANAGEMENT
// =============================================================================

app.post('/api/room', async (c) => {
  const body = await c.req.json();
  const { encryptedPsbt, tier, licenseKey, network } = body;

  if (encryptedPsbt && encryptedPsbt.length > MAX_PAYLOAD_SIZE_BYTES) {
    return c.json({ error: "Payload too large. Max 500KB." }, 413);
  }

  const roomId = crypto.randomUUID();
  const adminToken = crypto.randomUUID();

  const id = c.env.SIGNING_ROOM.idFromName(roomId);
  const room = c.env.SIGNING_ROOM.get(id);

  await room.fetch(new Request('http://internal/init', {
    method: 'POST',
    body: JSON.stringify({ encryptedPsbt, adminToken, tier, roomId, licenseKey, network })
  }));

  return c.json({ roomId, adminToken, socketUrl: `/api/room/${roomId}/websocket` });
});

app.post('/api/room/:id/invoice', async (c) => {
  const roomId = c.req.param('id');
  const { amount, memo } = await c.req.json();

  if (!c.env.LNBITS_KEY) {
    return c.json({ payment_request: "lnbc1...", payment_hash: "123" });
  }

  const lnbitsResponse = await fetch(`${c.env.LNBITS_URL}/api/v1/payments`, {
    method: 'POST',
    headers: { 'X-Api-Key': c.env.LNBITS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      out: false,
      amount: amount || 5000,
      memo: memo || `Extend Room ${roomId}`,
      webhook: `${c.env.API_PUBLIC_URL}/api/webhook/lnbits?roomId=${roomId}`
    })
  });

  const invoiceData = await lnbitsResponse.json();
  return c.json(invoiceData);
});

app.post('/api/room/:id/extend', async (c) => {
  const roomId = c.req.param('id');
  const { paymentHash } = await c.req.json();

  const res = await fetch(`${c.env.LNBITS_URL}/api/v1/payments/${paymentHash}`, {
    headers: { 'X-Api-Key': c.env.LNBITS_KEY }
  });
  const data: any = await res.json();

  if (data.paid) {
    // SECURITY CHECK: 5,000 sats
    if ((data.details?.amount || 0) < EXTEND_PRICE_MSATS) return c.json({ success: false, error: "Insufficient amount" });

    const id = c.env.SIGNING_ROOM.idFromName(roomId);
    const room = c.env.SIGNING_ROOM.get(id);
    await room.fetch(new Request('http://internal/extend', { method: 'POST' }));
    return c.json({ success: true });
  }

  return c.json({ success: false, status: 'unpaid' });
});

app.post('/api/room/:id/unlock', async (c) => {
  const roomId = c.req.param('id');
  const { paymentHash } = await c.req.json();

  const res = await fetch(`${c.env.LNBITS_URL}/api/v1/payments/${paymentHash}`, {
    headers: { 'X-Api-Key': c.env.LNBITS_KEY }
  });
  const data: any = await res.json();

  if (data.paid) {
    // SECURITY CHECK: 21,000 sats
    if ((data.details?.amount || 0) < UNLOCK_PRICE_MSATS) return c.json({ success: false, error: "Insufficient amount" });

    const id = c.env.SIGNING_ROOM.idFromName(roomId);
    const room = c.env.SIGNING_ROOM.get(id);
    await room.fetch(new Request('http://internal/unlock', { method: 'POST' }));
    return c.json({ success: true });
  }

  return c.json({ success: false, status: 'unpaid' });
});

app.get('/api/room/:id/websocket', async (c) => {
  const roomId = c.req.param('id');
  const id = c.env.SIGNING_ROOM.idFromName(roomId);
  const room = c.env.SIGNING_ROOM.get(id);
  return room.fetch(c.req.raw);
});

app.post('/api/webhook/lnbits', async (c) => {
  const roomId = c.req.query('roomId');
  if (roomId) {
    const id = c.env.SIGNING_ROOM.idFromName(roomId);
    const room = c.env.SIGNING_ROOM.get(id);
    await room.fetch(new Request('http://internal/extend', { method: 'POST' }));
  }
  return c.text('OK');
});

// =============================================================================
// 5. API ROUTES: LICENSING & PAYMENTS
// =============================================================================

app.get('/api/license/stock', async (c) => {
  const id = c.env.SALES_COUNTER.idFromName('GENESIS_COUNTER');
  const counter = c.env.SALES_COUNTER.get(id);
  return counter.fetch(new Request('http://internal/stock'));
});

/**
 * POST /api/license/buy
 * Uses constants to ensure consistent pricing.
 */
app.post('/api/license/buy', async (c) => {
  const { type } = await c.req.json();

  let amount = LICENSE_ANNUAL_MSATS / 1000; // 300,000 sats
  let memo = "SigningRoom Annual License";

  if (type === 'genesis') {
    amount = LICENSE_GENESIS_MSATS / 1000; // 2,100,000 sats
    memo = "SigningRoom GENESIS License (Lifetime)";

    const id = c.env.SALES_COUNTER.idFromName('GENESIS_COUNTER');
    const counter = c.env.SALES_COUNTER.get(id);
    const res = await counter.fetch('http://internal/reserve');
    if (res.status !== 200) return c.json({ error: "Sold Out" }, 410);
  }

  if (!c.env.LNBITS_KEY) return c.json({ error: "No Payment Backend" }, 500);

  const lnbits = await fetch(`${c.env.LNBITS_URL}/api/v1/payments`, {
    method: 'POST',
    headers: { 'X-Api-Key': c.env.LNBITS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      out: false,
      amount,
      memo,
      webhook: `${c.env.API_PUBLIC_URL}/api/webhook/license?type=${type}`
    })
  });

  const invoice = await lnbits.json();
  return c.json(invoice);
});

/**
 * POST /api/webhook/license
 * CRITICAL: Now verifies amount before minting.
 */
app.post('/api/webhook/license', async (c) => {
  const type = c.req.query('type') as 'annual' | 'genesis';
  const body = await c.req.json(); // LNBits webhook payload
  const paymentHash = body.payment_hash;

  if (!c.env.LNBITS_KEY) return c.json({ error: "Config Error" }, 500);

  try {
    // 1. Verify Payment Authenticity & Amount
    const res = await fetch(`${c.env.LNBITS_URL}/api/v1/payments/${paymentHash}`, {
      headers: { 'X-Api-Key': c.env.LNBITS_KEY }
    });
    const data: any = await res.json();

    if (!data.paid) return c.json({ error: "Not paid" }, 402);

    const paidMsats = data.details?.amount || 0;
    const requiredMsats = type === 'genesis' ? LICENSE_GENESIS_MSATS : LICENSE_ANNUAL_MSATS;

    if (paidMsats < requiredMsats) {
      console.error(`Attempted Fraud: Paid ${paidMsats} msats for ${type} (req ${requiredMsats})`);
      return c.json({ error: "Insufficient amount" }, 402);
    }

    // 2. Confirm Stock (if Genesis)
    if (type === 'genesis') {
      const id = c.env.SALES_COUNTER.idFromName('GENESIS_COUNTER');
      const counter = c.env.SALES_COUNTER.get(id);
      await counter.fetch('http://internal/confirm');
    }

    // 3. Mint Key
    const { apiKey } = await LicenseManager.create(c.env, type);
    await c.env.LICENSES.put(`pending:${paymentHash}`, apiKey, { expirationTtl: 3600 });

    return c.text('OK');

  } catch (e) {
    console.error("Webhook verification failed", e);
    return c.json({ error: "Verification Failed" }, 500);
  }
});

/**
 * GET /api/license/claim/:hash
 * CRITICAL: Now verifies amount during poll.
 */
app.get('/api/license/claim/:hash', async (c) => {
  const hash = c.req.param('hash');

  // 1. Check Cache
  let apiKey = await c.env.LICENSES.get(`pending:${hash}`);
  if (apiKey) return c.json({ ready: true, apiKey });

  // 2. Check LNBits
  if (!c.env.LNBITS_KEY) return c.json({ ready: false });

  try {
    const res = await fetch(`${c.env.LNBITS_URL}/api/v1/payments/${hash}`, {
      headers: { 'X-Api-Key': c.env.LNBITS_KEY }
    });
    const data: any = await res.json();

    if (data.paid) {
      const memo = data.details?.memo || "";
      let type: 'annual' | 'genesis' = 'annual';
      if (memo.includes("GENESIS")) type = 'genesis';

      // SECURITY CHECK: Verify amount
      const paidMsats = data.details?.amount || 0;
      const requiredMsats = type === 'genesis' ? LICENSE_GENESIS_MSATS : LICENSE_ANNUAL_MSATS;

      if (paidMsats < requiredMsats) {
        return c.json({ ready: false, error: "Insufficient amount" });
      }

      if (type === 'genesis') {
        const id = c.env.SALES_COUNTER.idFromName('GENESIS_COUNTER');
        const counter = c.env.SALES_COUNTER.get(id);
        await counter.fetch('http://internal/confirm');
      }

      const result = await LicenseManager.create(c.env, type);
      apiKey = result.apiKey;

      await c.env.LICENSES.put(`pending:${hash}`, apiKey, { expirationTtl: 3600 });
      return c.json({ ready: true, apiKey });
    }
  } catch (e) { console.error("Active poll failed", e); }

  return c.json({ ready: false });
});

app.post('/api/license/rotate', async (c) => {
  const { oldKey } = await c.req.json();
  if (!oldKey) return c.json({ error: "Missing key" }, 400);

  try {
    const newKey = await LicenseManager.rotate(c.env, oldKey);
    return c.json({ newKey });
  } catch (e: any) {
    return c.json({ error: e.message }, 403);
  }
});

export default app;

// =============================================================================
// 6. DURABLE OBJECT: SIGNING ROOM
// =============================================================================

export class SigningRoom implements DurableObject {
  state: DurableObjectState;
  sessions = new Map<WebSocket, { role: string; id: string }>();
  roomState: any = null;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      this.roomState = await this.state.storage.get('data');
    });
  }

  async log(event: string, detail: string = '', user: string = 'System') {
    if (!this.roomState) return;
    if (!this.roomState.auditLog) this.roomState.auditLog = [];
    this.roomState.auditLog.push({ timestamp: Date.now(), event, detail, user });
    await this.state.storage.put('data', this.roomState);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === '/state') return new Response(JSON.stringify(this.roomState || {}));

    if (url.pathname === '/init') {
      const { encryptedPsbt, adminToken, tier, roomId, licenseKey, network } = await request.json<any>();
      const now = Date.now();
      let finalTier = tier || 'free';
      let isPaid = !((tier === 'enterprise'));
      let isGenesis = false;

      if (licenseKey) {
        const validLicense = await LicenseManager.validate(this.env, licenseKey);
        if (validLicense) {
          finalTier = 'enterprise';
          isPaid = true;
          if (validLicense.type === 'genesis') isGenesis = true;
        }
      }

      const ttl = finalTier === 'enterprise' ? 86400 : 1200;

      this.roomState = {
        roomId, encryptedPsbt, adminToken, signatures: [], tier: finalTier, isPaid: isPaid,
        createdAt: now, expiresAt: now + (ttl * 1000), isExtended: false, auditLog: [],
        signerLabels: {}, roomName: "Untitled Room", whitelist: [], isLocked: false,
        isGenesis: isGenesis, network: network || 'bitcoin'
      };

      this.roomState.auditLog.push({ timestamp: now, event: 'Room Created', detail: `Tier: ${tier}`, user: 'System' });
      await this.state.storage.put('data', this.roomState);
      await this.state.storage.setAlarm(now + (ttl * 1000));
      return new Response('OK');
    }

    if (url.pathname === '/unlock') {
      if (!this.roomState) return new Response('404', { status: 404 });
      this.roomState.isPaid = true;
      await this.log('Room Unlocked', 'Payment confirmed', 'System');
      this.broadcast({ type: 'ROOM_UNLOCKED' });
      return new Response('OK');
    }

    if (url.pathname === '/extend') {
      if (!this.roomState) return new Response('Room not found', { status: 404 });
      const currentExpiry = this.roomState.expiresAt || Date.now();
      const baseTime = Math.max(Date.now(), currentExpiry);
      const newExpiry = baseTime + (24 * 60 * 60 * 1000);
      this.roomState.expiresAt = newExpiry;
      this.roomState.isExtended = true;
      await this.log('Time Extended', '+24 Hours added', 'System');
      await this.state.storage.put('data', this.roomState);
      await this.state.storage.setAlarm(newExpiry);
      this.broadcast({ type: 'TIME_EXTENDED', expiresAt: newExpiry });
      return new Response('OK');
    }

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

    let limit = 10;
    if (this.roomState?.tier === 'enterprise') limit = this.roomState.isPaid ? 40 : 5;

    if (this.sessions.size >= limit) {
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
    webSocket.send(JSON.stringify({ type: 'STATE_SYNC', ...this.roomState, connectedCount: this.sessions.size }));

    webSocket.addEventListener('message', async (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        const session = this.sessions.get(webSocket);
        const userLabel = session?.role === 'admin' ? 'Coordinator' : `Guest (${session?.id})`;

        if (msg.type === 'VERIFY_LICENSE') {
          if (this.roomState.tier === 'enterprise' && this.roomState.isPaid) return;
          const validLicense = await LicenseManager.validate(this.env, msg.key);
          if (validLicense) {
            this.roomState.tier = 'enterprise';
            this.roomState.isPaid = true;
            const now = Date.now();
            if (this.roomState.expiresAt - now < 86400000) {
              this.roomState.expiresAt = now + 86400000;
              await this.state.storage.setAlarm(this.roomState.expiresAt);
            }
            await this.state.storage.put('data', this.roomState);
            await this.log('License Verified', `Type: ${validLicense.type}`, userLabel);
            this.broadcast({ type: 'ROOM_UNLOCKED', tier: 'enterprise', isPaid: true, expiresAt: this.roomState.expiresAt });
          }
        }

        if (msg.type === 'AUTH' && this.roomState && msg.token === this.roomState.adminToken) {
          this.sessions.set(webSocket, { ...session!, role: 'admin' });
          webSocket.send(JSON.stringify({ type: 'ROLE_UPDATE', role: 'admin' }));
          this.log('Role Claimed', 'User became Coordinator', userLabel);
        }

        if (msg.type === 'UPDATE_LABEL' && session?.role === 'admin') {
          if (!this.roomState.signerLabels) this.roomState.signerLabels = {};
          this.roomState.signerLabels[msg.fingerprint] = msg.label;
          await this.state.storage.put('data', this.roomState);
          this.log('Label Updated', `${msg.fingerprint} -> ${msg.label}`, userLabel);
          this.broadcast({ type: 'LABELS_UPDATED', signerLabels: this.roomState.signerLabels });
        }

        if (msg.type === 'RENAME_ROOM' && session?.role === 'admin' && this.roomState.tier === 'enterprise') {
          const oldName = this.roomState.roomName;
          this.roomState.roomName = msg.name;
          await this.state.storage.put('data', this.roomState);
          this.log('Room Renamed', `${oldName} -> ${msg.name}`, userLabel);
          this.broadcast({ type: 'ROOM_RENAMED', name: this.roomState.roomName });
        }

        if (msg.type === 'LOG_ACTION') {
          await this.log(msg.action, msg.detail, userLabel);
          this.broadcast({ type: 'LOG_UPDATE', auditLog: this.roomState.auditLog });
        }

        if (msg.type === 'UPLOAD_PARTIAL') {
          if (msg.data?.encryptedData && msg.data.encryptedData.length > MAX_PAYLOAD_SIZE_BYTES) return;
          if (this.roomState.signatures.length >= 50) {
            webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Signature limit reached.' }));
            return;
          }
          this.roomState.signatures.push(msg.data);
          const detail = msg.fingerprint ? `Signer: ${msg.fingerprint}` : 'Unknown Signer';
          await this.log('Signature Uploaded', detail, userLabel);
          await this.state.storage.put('data', this.roomState);
          this.broadcast({ type: 'NEW_PARTIAL_DATA', data: msg.data, signerId: msg.signerId, auditLog: this.roomState.auditLog });
        }

        if (msg.type === 'CLOSE_ROOM' && session?.role === 'admin') {
          await this.log('Room Destroyed', 'Coordinator closed session', 'Coordinator');
          this.broadcast({ type: 'ROOM_CLOSED', finalLog: this.roomState.auditLog });
          await this.state.storage.deleteAll();
          this.roomState = null;
          for (const s of this.sessions.keys()) s.close(1000, "Closed");
        }

        if (msg.type === 'UPDATE_WHITELIST' && session?.role === 'admin') {
          const list = this.roomState.whitelist || [];
          if (msg.remove) this.roomState.whitelist = list.filter((a: string) => a !== msg.address);
          else if (!list.includes(msg.address)) this.roomState.whitelist.push(msg.address);
          await this.state.storage.put('data', this.roomState);
          this.log('Whitelist Updated', `${msg.remove ? 'Removed' : 'Added'} ${msg.address}`, userLabel);
          this.broadcast({ type: 'WHITELIST_UPDATED', whitelist: this.roomState.whitelist });
        }

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
    await this.state.storage.deleteAll();
    this.roomState = null;
    for (const socket of this.sessions.keys()) socket.close(1000, "Expired");
  }
}

// =============================================================================
// 7. DURABLE OBJECT: SALES COUNTER
// =============================================================================

export class SalesCounter implements DurableObject {
  state: DurableObjectState;
  constructor(state: DurableObjectState) { this.state = state; }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/stock') {
      const sold = (await this.state.storage.get<number>('genesis_sold')) || 0;
      return new Response(JSON.stringify({ sold, remaining: 21 - sold }));
    }
    if (url.pathname === '/reserve') {
      let sold = (await this.state.storage.get<number>('genesis_sold')) || 0;
      if (sold >= 21) return new Response("Sold Out", { status: 410 });
      return new Response("OK");
    }
    if (url.pathname === '/confirm') {
      let sold = (await this.state.storage.get<number>('genesis_sold')) || 0;
      if (sold >= 21) return new Response("Sold Out", { status: 410 });
      sold++;
      await this.state.storage.put('genesis_sold', sold);
      return new Response(JSON.stringify({ sold }));
    }
    return new Response("Not Found", { status: 404 });
  }
}