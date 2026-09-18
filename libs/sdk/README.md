# @signing-room/sdk

[![npm version](https://img.shields.io/npm/v/@signing-room/sdk.svg)](https://www.npmjs.com/package/@signing-room/sdk)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

The official JavaScript/TypeScript SDK for **SigningRoom**.

This SDK provides a robust, programmatic interface to create, manage, and participate in secure, ephemeral Bitcoin multi-signature ceremonies. It handles end-to-end encryption, Zero-Trust Role-Based Access Control (RBAC), WebSocket relay coordination, automatic session resumption, and PSBT (Partially Signed Bitcoin Transaction) merging automatically.

---

## Installation

Install the package via npm:

```bash
npm install @signing-room/sdk

```

---

## Live Demo & Examples

Looking for a working implementation? Check out our **[signingroom-sdk-demo](https://github.com/scarlin90/signingroom/blob/main/libs/sdk/signingroom-sdk-demo?utm_source=gemini)**.

This repository provides a complete, runnable TypeScript project that demonstrates the full SDK lifecycle—from room creation and granular RBAC enforcement to threshold signing, session resumption, and forensic offline audit verification.

---

# Quick Start & Core API

The SDK is built around the `SigningRoomClient`.

A user can act as either:

* **Coordinator** — administrative privileges, room management, capability generation, finalization, auditing
* **Guest** — cryptographically restricted access (e.g., Signer, Blind Signer, Auditor)

Below is a complete lifecycle example demonstrating how to orchestrate a secure Bitcoin multi-signature signing ceremony.

---

## 1. Initialization & Room Creation (Coordinator)

To start a new signing ceremony, instantiate the client and provide an unsigned PSBT.

```javascript
import { SigningRoomClient } from '@signing-room/sdk';

const API_URL = 'http://localhost:8787';
const UNSIGNED_PSBT = 'cHNidP8BA...'; // Your base64 PSBT

const coordinator = new SigningRoomClient({
  apiUrl: API_URL,
});

// Create the room and automatically join as Coordinator
const session = await coordinator.createRoomAndJoin(
  UNSIGNED_PSBT,
  'bitcoin', // 'bitcoin' | 'testnet' | 'signet'
  'Project Titan Vault (3-of-5)',
);

console.log(`Room ID: ${session.roomId}`);
console.log(`Encryption Key: ${session.encryptionKey}`);
console.log(`Admin Secret: ${session.encryptedAdminToken}`);

// Set your display name
await coordinator.setDisplayName('Treasury Manager');

```

---

## 2. Generating Zero-Trust RBAC Roles (Coordinator)

The Coordinator can generate cryptographically secure, capability-restricted role tokens. The server statelessly enforces these constraints without ever having access to the base encryption keys.

```javascript
// Generate a Standard Signer Role
const signerRole = await coordinator.generateAndRegisterRole({
  canUploadSignature: true,
  canExportPsbt: true,
  canExportAudit: false,
  canViewDetails: true,
  canViewSigners: true,
  canShareSession: false,
});

// Generate an Auditor / Observer Role
const auditorRole = await coordinator.generateAndRegisterRole({
  canUploadSignature: false,
  canExportPsbt: false,
  canExportAudit: true,
  canViewDetails: true,
  canViewSigners: true,
  canShareSession: false,
});

// Easily generate ready-to-click share links for frontend UIs
const UI_APP_URL = '[https://signingroom.io](https://signingroom.io)';
console.log(`Signer Link: ${coordinator.getRoomLink(UI_APP_URL, true, signerRole)}`);

```

---

## 3. Joining an Existing Room (Guest)

Guests securely connect and authenticate their specific capabilities using the room ID, base encryption key, and their assigned role token.

```javascript
import { SigningRoomClient } from '@signing-room/sdk';

const guest = new SigningRoomClient({
  apiUrl: API_URL,
});

// Capture the 4-character Session ID when the network connects (Useful for reconnects)
let cachedSessionId = '';
guest.onEvent('SESSION_CONNECTED').subscribe((e) => {
  cachedSessionId = e.payload; 
});

// Join the room using the explicit role token generated above
await guest.joinRoom(session.roomId, session.encryptionKey, signerRole);

await guest.setDisplayName('Alice (Hardware Wallet 1)');

// Listen for live room updates
guest.onStateChange().subscribe((state) => {
  console.log(`Connected Participants: ${state.payload.connectedCount}`);
});

```

---

## 4. Seamless Session Resumption (Network Drops)

If a user loses internet connection (e.g., cell tower handoff), the SDK allows them to seamlessly resume their exact identity without spawning duplicate "ghost" users in the cryptographic audit log.

```javascript
// Assume 'guest' disconnected due to a dirty network drop
const reconnectedGuest = new SigningRoomClient({ apiUrl: API_URL });

// 1. Inject the cached Session ID from the initial connection BEFORE joining
reconnectedGuest.restoreSessionId(cachedSessionId);

// 2. Rejoin using the exact same credentials
await reconnectedGuest.joinRoom(session.roomId, session.encryptionKey, signerRole);

// The backend will safely strip the old dead socket, bind this new socket to the existing 
// identity, and silently update the audit log with a clean "Session Reconnected" entry.

```

---

## 5. Room Management & Operational Security

The Coordinator can rename the room, map signer fingerprints, label UTXO addresses, manage address whitelists, and lock the room to prevent new participants from joining.

```javascript
// Rename the room
await coordinator.setRoomName('Q1 Settlement - Approved');

// Associate a fingerprint with a human-readable label
await coordinator.setSignerLabel('fe0fa7b4', "Alice's Wallet");

// Update approved destination/source addresses
const approvedAddresses = [
  'tb1qqn3pzlcmp8mudfhljtdwe7u6fhjhh3x2rr3njvlj35gx0kqmxxtqlqrzyc',
  'tb1qww078psjaee79gh0cfrqpf6gtzvxzk7gcfs869vnxtruhj6xj03qjfdnh8',
];

await coordinator.updateWhitelist(approvedAddresses, false);

// Associate a UTXO address with a human-readable label
await coordinator.setAddressLabel(
  'tb1qqn3pzlcmp8mudfhljtdwe7u6fhjhh3x2rr3njvlj35gx0kqmxxtqlqrzyc',
  'Corporate Treasury',
);

// Prevent any new participants from joining
await coordinator.toggleLock(true);

```

---

## 6. Event-Driven Monitoring & Uploading Signatures

The SDK exposes an RxJS event bus, making it incredibly easy to build reactive UIs or trigger automated alarms when certain conditions are met.

```javascript
import { filter, take } from 'rxjs';

// Monitor all incoming signatures
coordinator.onEvent('SIGNATURE_RECEIVED').subscribe((event) => {
  console.log(
    `Signature received! Total: ${event.payload.signaturesReceived}/${event.payload.totalSigners}`,
  );
});

// Set an "Alarm" for human-in-the-loop notifications
coordinator
  .onEvent('SIGNATURE_RECEIVED')
  .pipe(
    filter((e) => e.payload.signaturesReceived === 2),
    take(1), // Only fire once
  )
  .subscribe(() => {
    console.log('2 Signatures collected. Paging CEO for final review...');
  });

// Upload a signature (Guest)
const ALICE_SIGNED_PSBT = 'cHNidP8BA...';
const fingerprint = guest.extractFingerprintFromSignature(ALICE_SIGNED_PSBT);

// Will automatically be rejected by the server if the guest's role restricts uploads
await guest.uploadSignature(ALICE_SIGNED_PSBT, fingerprint);

```

---

## 7. Automated Finalization & Forensic Auditing

When the PSBT signature threshold is met, the SDK emits a `THRESHOLD_MET` event. The Coordinator can use this to instantly finalize the transaction and extract cryptographic audit proofs.

```javascript
coordinator
  .onEvent('THRESHOLD_MET')
  .pipe(take(1)) // Ensure we only finalize once
  .subscribe(async (event) => {
    console.log(`Quorum Reached! (${event.payload.signaturesReceived}/${event.payload.threshold})`);

    // Finalize transaction
    const finalTx = await coordinator.finalizeTransaction();

    console.log(`Ready to Broadcast HEX: ${finalTx.hex}`);
    console.log(`TXID: ${finalTx.txId}`);

    // Export audit log
    const csvLog = coordinator.getAuditLogCsv();

    // Generate integrity report
    const report = await coordinator.getIntegrityReport();
    console.log(`Forensic SHA-256 Anchor: ${report.anchor}`);

    // Verify active integrity in-memory
    const isValid = await coordinator.verifyIntegrity(report.anchor);
    console.log(`Integrity Check: ${isValid.isValid ? 'PASSED' : 'FAILED'}`);

    // Destroy the room permanently
    await coordinator.closeRoom();
    coordinator.disconnect();
  });

```

---

## 8. Independent Offline Auditing

A true Zero-Trust architecture means external auditors can independently verify the cryptographic math *after* the infrastructure is destroyed. The SDK provides a static method to verify the SHA-256 anchor using nothing but the exported artifacts.

```javascript
import { SigningRoomClient } from '@signing-room/sdk';

// The auditor does NOT need to connect to a server or join a room.
// They only need the raw strings exported during the ceremony.
const exportedCsvString = `Timestamp,Event,User,Detail...`;
const broadcastedHex = '02000000000101...';
const publishedAnchor = 'a1b2c3d4e5f6...';

const offlineResult = await SigningRoomClient.verifyOfflineIntegrity(
  exportedCsvString,
  broadcastedHex,
  publishedAnchor
);

console.log(`Computed Anchor: ${offlineResult.anchor}`);
console.log(`Cryptographic Match: ${offlineResult.isValid ? 'PASSED' : 'FAILED'}`);

```

---

## 9. Coordinator Role Recovery

If the Coordinator disconnects or closes their browser, they can reclaim administrative privileges using the encrypted admin token returned during room creation.

```javascript
const recoveryClient = new SigningRoomClient({
  apiUrl: API_URL,
});

await recoveryClient.joinRoom(session.roomId, session.encryptionKey);

// Recover Coordinator privileges
await recoveryClient.claimCoordinator(session.encryptedAdminToken);

```

---

## 🏢 Enterprise & Commercial Licensing

[SigningRoom.io](https://signingroom.io/?utm_source=gemini) is fully open-source under the **AGPLv3 License**.

* **Community Use**: If you modify the code and host it publicly, you must open-source your changes.
* **Commercial Use**: Institutions requiring a Commercial License (AGPL Waiver) to integrate this technology into proprietary, closed-source infrastructure (e.g., internal banking systems, custodial platforms) must contact [Stateless Research Ltd](https://statelessresearch.com/?utm_source=gemini).

### 🔗 Contact Stateless Research for Licensing

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

If you modify this code and run it over a network, you must release your source code. See `LICENSE` for more information.

```