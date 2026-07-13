# @signing-room/sdk

[![npm version](https://img.shields.io/npm/v/@signing-room/sdk.svg)](https://www.npmjs.com/package/@signing-room/sdk)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

The official JavaScript/TypeScript SDK for **SigningRoom**.

This SDK provides a robust, programmatic interface to create, manage, and participate in secure, ephemeral Bitcoin multi-signature ceremonies. It handles end-to-end encryption, WebSocket relay coordination, and PSBT (Partially Signed Bitcoin Transaction) merging automatically.

---

## Installation

Install the package via npm:

```bash
npm install @signing-room/sdk
```

---

# Quick Start & Core API

The SDK is built around the `SigningRoomClient`.

A user can act as either:

- **Coordinator** — administrative privileges, room management, finalization, auditing
- **Guest** — signing, monitoring, and participation

Below is a complete lifecycle example demonstrating how to orchestrate a Bitcoin multi-signature signing ceremony.

---

## 1. Initialization & Room Creation (Coordinator)

To start a new signing ceremony, instantiate the client and provide an unsigned PSBT.

```javascript
import { SigningRoomClient } from '@signing-room/sdk';

const API_URL = 'https://api.signingroom.io';
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

## 2. Joining an Existing Room (Guest / Signer)

Guests only require the `roomId` and the `encryptionKey` to securely connect and decrypt the room state.

```javascript
import { SigningRoomClient } from '@signing-room/sdk';

const guest = new SigningRoomClient({
  apiUrl: API_URL,
});

await guest.joinRoom(session.roomId, session.encryptionKey);

await guest.setDisplayName('Alice (Hardware Wallet 1)');

// Listen for live room updates
guest.onStateChange().subscribe((state) => {
  console.log(`Connected Participants: ${state.connectedCount}`);
});
```

---

## 3. Room Management & Operational Security

The Coordinator can rename the room, map signer fingerprints, manage address whitelists, and lock the room.

```javascript
// Rename the room
await coordinator.setRoomName('Q1 Settlement - Approved');

// Associate a fingerprint with a human-readable label
await coordinator.setSignerLabel('fe0fa7b4', "Alice's Coldcard MK4");

// Update approved destination/source addresses
const approvedAddresses = [
  'tb1qqn3pzlcmp8mudfhljtdwe7u6fhjhh3x2rr3njvlj35gx0kqmxxtqlqrzyc',
  'tb1qww078psjaee79gh0cfrqpf6gtzvxzk7gcfs869vnxtruhj6xj03qjfdnh8',
];

await coordinator.updateWhitelist(approvedAddresses, false);

// Prevent any new participants from joining
await coordinator.toggleLock(true, 'Coordinator');
```

---

## 4. Event-Driven Monitoring & Uploading Signatures

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

await guest.uploadSignature(ALICE_SIGNED_PSBT, fingerprint);

// (Note: For procedural CLI scripts, you can also use await coordinator.waitForState(state => state.signatures.length >= 1) instead of event listeners).
```

---

## 5. Automated Finalization & Forensic Auditing

When the PSBT signature threshold is met, the SDK emits a THRESHOLD_MET event. The Coordinator can use this to instantly finalize the transaction and extract cryptographic audit proofs.

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

    // Verify integrity
    const isValid = await coordinator.verifyIntegrity(report.anchor);
    console.log(`Integrity Check: ${isValid.isValid ? 'PASSED ✅' : 'FAILED ❌'}`);

    // Destroy the room
    await coordinator.closeRoom();
    coordinator.disconnect();
  });
```

---

## 6. Coordinator Role Recovery

If the Coordinator disconnects, they can reclaim administrative privileges using the encrypted admin token returned during room creation.

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

[SigningRoom.io](https://signingroom.io/) is fully open-source under the **AGPLv3 License**.

- **Community Use**: If you modify the code and host it publicly, you must open-source your changes.
- **Commercial Use**: Institutions requiring a Commercial License (AGPL Waiver) to integrate this technology into proprietary, closed-source infrastructure (e.g., internal banking systems, custodial platforms) must contact [Stateless Research Ltd](https://statelessresearch.com/).

### 🔗 Contact Stateless Research for Licensing

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.  
If you modify this code and run it over a network, you must release your source code. See `LICENSE` for more information.
