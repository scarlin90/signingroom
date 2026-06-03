# @signing-room/embed

A framework-agnostic Web Component for integrating the [SigningRoom.io](https://signingroom.io/) Multisig Coordination Dashboard directly into your web app.

![NPM Version](https://img.shields.io/npm/v/@signing-room/embed)
![License](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)

The Signing Room widget provides a stateless, non-custodial, real-time interface for coordinating Bitcoin multisig transactions via PSBTs (Partially Signed Bitcoin Transactions). It requires zero framework dependencies and works seamlessly with React, Vue, Angular, or Vanilla JS.

**👉 [View the Live Demo & API Documentation](https://signingroom.io/webcomponent-demo.html)**

## 🚀 Installation

Install via package manager to use with modern build tools like Vite, Webpack, or Next.js:

```bash
# npm
npm install @signing-room/embed

# yarn
yarn add @signing-room/embed
```

Alternatively, you can drop the Web Component bundle directly into your HTML via CDN:

```
<script type="module" src="[https://cdn.jsdelivr.net/npm/@signing-room/embed/index.js](https://cdn.jsdelivr.net/npm/@signing-room/embed/index.js)"></script>
```

## 💻 Usage
Once imported, you can use the `<signing-room>` custom element anywhere in your DOM.
```
<div style="min-height: 650px;">
  <signing-room 
    network="signet" 
    hide-header="true"
    relay-endpoint="https://signingroom.io">
  </signing-room>
</div>
```

**Layout Tip:** The widget is fully responsive but requires a parent container with a minimum height of 600px to properly display the signer dashboard.

### Component Attributes

| Attribute        | Description |
|------------------|-------------|
| `network`        | Sets the Bitcoin network. Options: `bitcoin`, `testnet`, `signet`. (Default: `bitcoin`) |
| `hide-header`    | If `true`, hides the top header and network badges for a cleaner white-label embed. |
| `relay-endpoint` | (Optional) Overrides the default relay server URL (useful for local testing). |
| `view`           | (Optional) Set to `inject` to load into a specific flow context. |
| `room-id`        | (Optional) The public ID of an existing room to join automatically. |
| `decryption-key` | (Optional) The private decryption key required to unlock the room. |

## ⚡ Coordinator Injection API

If your application already holds an Unsigned PSBT in memory, you can inject it directly into the component to instantly create a new room without requiring file uploads.

```javascript
// 1. Target the element
const widget = document.querySelector('signing-room');

// 2. Inject the PSBT (Base64)
const base64Psbt = "cHNidP8BAFICAAAA...";
widget.loadPsbt(base64Psbt);
```

## 🎧 Webhook Events (Output)

The component emits standard DOM CustomEvents. You can listen for the `transactionFinalized` event to capture the fully signed transaction, raw state, and generated audit logs.

```javascript
const widget = document.querySelector('signing-room');

widget.addEventListener('transactionFinalized', (e) => {
    const data = e.detail;

    console.log("Fully Signed Hex:", data.txHex);
    console.log("Transaction ID:", data.txId);
    
    // Compliance & Audit Data
    console.log("Audit Log (CSV):\n", data.auditLogCsv);
    console.log("PDF Document Data URI:", data.auditPdfUri);
    
    // Full room state (participants, labels, whitelist, etc.)
    console.log("Room State Object:", data.roomState);
});

// Catch errors (parsing issues, network mismatches, etc.)
widget.addEventListener('signingError', (e) => {
    console.error("Room Failed:", e.detail.message);
});
```

### Universal Event Context
Every event payload (except signingError) implicitly includes a BaseEventContext object, ensuring your host application always knows who triggered the event, and in which room.
```
export interface BaseEventContext {
  roomId: string | null;
  sessionId: string | null;
  role: 'coordinator' | 'guest' | 'unknown';
  network: 'bitcoin' | 'testnet' | 'signet' | null;
  timestamp: number;
}
```

### Event List
All event properties listed below are attached directly to event.detail (alongside the BaseEventContext properties above).

#### Core Lifecycle & Security
```
roomCreated: { roomId: string, network: string }
transactionFinalized: { txId: string, txHex: string, auditPdfUri: string, auditLogCsv: string, settlementCsv: string, roomState: RoomState }
roomStateChanged: { state: 'locked' | 'unlocked' | 'closed' }
participantPresence: { action: 'joined' | 'left', participantId: string, participantRole: string, displayName?: string }
destinationVerified: { type: 'inputs' | 'outputs', address: string | 'batch', isVerified: boolean }
securityAlert: { alertType: 'access_denied', severity: 'low' | 'medium' | 'high', message: string }
```

#### Hardware & Cryptographic Imports
```
signatureReceived: { fingerprint: string, signerLabel?: string, signerSessionId?: string, signerName?: string }
psbtImported: { method: 'scan' | 'upload' }
qrStateChanged: { includesKey: boolean, isRevealed: boolean }
fountainFormatChanged: { format: 'ur' | 'bbqr' }
fountainStateChanged: { isRevealed: boolean, format: 'ur' | 'bbqr' }
```

#### User Actions & Data Management
```
dataCopied: { dataType: 'room-id' | 'session-id' | 'decryption-key' | 'admin-token' | 'share-link' | 'share-link-full' | 'final-hex' }
downloadTriggered: { fileType: 'audit-log' | 'csv' | 'unsigned-psbt' | 'qr-code-image' }
roomRenamed: { newName: string }
participantLabelled: { target: 'self' | 'participant' | 'signer', label: string, fingerprint?: string, participantId?: string }
```

#### Privacy & UI Telemetry
```
privacyToggled: { section: string, state: 'blurred' | 'reveal-all' | 'reveal-section' | 'hidden' }
modalViewed: { modalName: string, context?: string }
transactionViewChanged: { view: 'inputs' | 'outputs' }
```

## 🏢 Enterprise & Commercial Licensing

[SigningRoom.io](https://signingroom.io/) is fully open-source under the **AGPLv3 License**.

- **Community Use**: Free for everyone. If you modify the code and host it publicly, you must open-source your changes.
- **Commercial Use**: Institutions requiring a Commercial License (AGPL Waiver) to integrate this technology into proprietary, closed-source infrastructure (e.g., internal banking systems, custodial platforms) must contact [Stateless Research Ltd](https://statelessresearch.com/).

### 🔗 Contact Stateless Research for Licensing

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.  
If you modify this code and run it over a network, you must release your source code. See `LICENSE` for more information.