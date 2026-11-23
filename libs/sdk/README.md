# @signing-room/sdk

The official JavaScript/TypeScript SDK for **SigningRoom**.

This SDK provides a robust, programmatic interface to create, manage, and participate in secure, ephemeral Bitcoin multi-signature and **MuSig2 (BIP-327 / BIP-373)** Taproot ceremonies. It handles end-to-end encryption, Zero-knowledge RBAC (server-enforced upload limits; policy delivered encrypted), WebSocket relay coordination, automatic session resumption, and PSBT (Partially Signed Bitcoin Transaction) nonce and signature aggregation automatically.

---

## Installation

Install the package via npm:

```bash
npm install @signing-room/sdk

```

---

## Live Demo & Examples

Looking for a working implementation? Check out our **[signingroom-sdk-demo](https://github.com/scarlin90/signingroom/blob/main/libs/sdk/signingroom-sdk-demo)**.

This repository provides complete, runnable TypeScript walkthroughs for both **Standard M-of-N Multisig (`index.ts`)** and **2-Round MuSig2 Taproot Keypath (`musig2-demo.ts`)** ceremonies—demonstrating room creation, granular RBAC enforcement, Round 1 nonce aggregation, Round 2 threshold signing, session resumption, and forensic offline audit verification.

---

## Relay Requirements & Headless Access (Self-Hosting)

When connecting the SDK to a hosted relay Worker (e.g., `https://api.my-relay.com`), the relay's environment variables must be configured to accommodate your architecture:

| Environment Variable | Required Setting | Description |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | `"my-relay.com"` | The root domain or exact origin permitted to access the coordinator. Automatically authorizes subdomains (e.g., `app.my-relay.com`) and enforces HTTPS in production. |
| `ALLOW_HEADLESS_ACCESS` | `"true"` | **Required for Node.js / CLI integrations against remote relays.** Because Node.js runtimes do not emit browser `Origin` headers, self-hosted relays must set this to `"true"` to allow backend daemons, bots, and CI/CD runners to communicate with the API and WebSockets. |
| `ENVIRONMENT` | `"development"` or `"production"` | When set to `"development"`, headless calls and `localhost`/`127.0.0.1` origins on any port are permitted automatically without additional configuration. |

> **Note:**
> The official public deployment at `api.signingroom.io` enforces `ALLOW_HEADLESS_ACCESS="false"`. Programmatic SDK scripts must target a self-hosted relay instance with `ALLOW_HEADLESS_ACCESS="true"` enabled or run locally with `ENVIRONMENT="development"`.

---

# Quick Start & Core API

The SDK is built around the `SigningRoomClient`.

A user can act as either:

* **Coordinator** — administrative privileges, room management, capability generation, MuSig2 nonce aggregation, finalization, auditing
* **Guest** — cryptographically restricted access (e.g., Signer, Blind Signer, Auditor)

Below is a complete lifecycle example demonstrating how to orchestrate a secure Bitcoin multi-signature signing ceremony.

---

## 1. Initialization & Room Creation (Coordinator)

To start a new signing ceremony, instantiate the client and provide an unsigned PSBT. The SDK automatically inspects the PSBT to detect whether it is a standard multisig transaction or a 2-round **MuSig2 (BIP-373)** ceremony.

*If operating an Enterprise or Custom White-label tier, inject your commercial license token here to securely attest infrastructure provenance.*

```javascript
import { SigningRoomClient } from '@signing-room/sdk';

// Target a local development relay or your self-hosted instance
const API_URL = 'http://localhost:8787';
const UNSIGNED_PSBT = 'cHNidP8BA...'; // Your base64 PSBT

// Optional: Provide a commercial license token to authorize enterprise features
const ENTERPRISE_TOKEN = 'srl_sbJbVsu3kGXet3...';

const coordinator = new SigningRoomClient({
  apiUrl: API_URL,
  licenseToken: ENTERPRISE_TOKEN, // Injects commercial license
  host: 'api.my-relay.com'        // Target domain for cryptographic verification
});

// Create the room and automatically join as Coordinator
// (Automatically detects 'standard' vs 'musig2' protocol from PSBT fields)
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

## 2. Generating Capability-based RBAC Roles (Coordinator)

The Coordinator can generate cryptographically secure, capability-restricted role tokens. The server stores role token hashes and enforces coarse constraints (e.g. nonce and signature uploads) without access to the encryption key. Fine-grained UI policies travel in an encrypted policy blob.

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

The SDK exposes an RxJS event bus, making it easy to build reactive UIs or trigger automated alarms when certain conditions are met.

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

When the PSBT signature threshold is met, the SDK emits a `THRESHOLD_MET` event. The Coordinator can use this to finalize the transaction and extract cryptographic audit proofs.

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

## 8. MuSig2 Two-Round Ceremonies (BIP-327 / BIP-373)

The SDK natively supports 2-round **MuSig2 Taproot keypath ceremonies** using BIP-373 PSBT fields (`0x1a` participant pubkeys, `0x1b` public nonces, and `0x1c` partial signatures).

### MuSig2 Methods & Events

| Method / Event | Type | Role | Description |
| --- | --- | --- | --- |
| `client.detectProtocol(psbt)` | Method | Any | Inspects a PSBT and returns `'musig2'` if BIP-373 fields (`0x1a`/`0x1b`/`0x1c`) are present, or `'standard'`. Called automatically by `createRoomAndJoin()`. |
| `client.uploadNonce(psbt, fp)` | Method | Signer | Encrypts and uploads a Round 1 PSBT containing the participant's `0x1b` public nonce. |
| `client.aggregateMuSig2Nonces()` | Method | Coordinator | Merges all collected Round 1 `0x1b` nonces into the setup PSBT and publishes the Round 2 signing PSBT to the room. |
| `'NONCE_RECEIVED'` | Event | Any | Emitted whenever a participant uploads a Round 1 public nonce (`{ fingerprint, noncesReceived, threshold }`). |
| `'NONCE_THRESHOLD_MET'` | Event | Any | Emitted when all required Round 1 public nonces have been collected (`{ noncesReceived, threshold }`). |
| `'AGGREGATE_PSBT_DECRYPTED'` | Event | Any | Emitted on all connected clients when the Coordinator publishes the aggregated Round 2 PSBT, signaling that signers can now export and sign. |

### Complete 2-Round MuSig2 Lifecycle Example

```javascript
import { SigningRoomClient } from '@signing-room/sdk';
import { take } from 'rxjs';

// 1. Coordinator initializes the MuSig2 room
// The SDK auto-detects BIP-373 (0x1a) fields and places the setup PSBT into Round 1 (transientPsbt)
const protocol = coordinator.detectProtocol(MUSIG2_SETUP_PSBT); // 'musig2'

const session = await coordinator.createRoomAndJoin(
  MUSIG2_SETUP_PSBT,
  'signet',
  'MuSig2 Taproot Vault (2-of-2)',
);

// 2. Monitor Round 1 Public Nonce Uploads
coordinator.onEvent('NONCE_RECEIVED').subscribe(({ payload }) => {
  console.log(
    `[Round 1] Nonce received from ${payload.fingerprint} (${payload.noncesReceived}/${payload.threshold})`,
  );
});

// 3. Automatically aggregate nonces & transition to Round 2 when all nonces arrive
coordinator
  .onEvent('NONCE_THRESHOLD_MET')
  .pipe(take(1))
  .subscribe(async ({ payload }) => {
    console.log(`All ${payload.noncesReceived}/${payload.threshold} nonces collected! Aggregating...`);

    // Merges all Round 1 public nonces (0x1b) and broadcasts the Round 2 Base PSBT
    await coordinator.aggregateMuSig2Nonces();
    console.log('Room transitioned to Round 2 (Signing Phase).');
  });

// Signers extract their device fingerprint and upload Round 1 Public Nonces (0x1b)
const fp1 = signer1.extractFingerprintFromSignature(SIGNER1_NONCE_PSBT);
await signer1.uploadNonce(SIGNER1_NONCE_PSBT, fp1);

const fp2 = signer2.extractFingerprintFromSignature(SIGNER2_NONCE_PSBT);
await signer2.uploadNonce(SIGNER2_NONCE_PSBT, fp2);

// 4. Guests can listen for the Round 2 transition to export the aggregated PSBT and upload partial signatures (0x1c)
signer1
  .onEvent('AGGREGATE_PSBT_DECRYPTED')
  .pipe(take(1))
  .subscribe(async (event) => {
    const round2PsbtBase64 = event.payload; // Contains all participants' 0x1b nonces
    console.log('Round 2 PSBT received! Uploading partial signatures...');

    await signer1.uploadSignature(SIGNER1_PARTIAL_PSBT, fp1);
    await signer2.uploadSignature(SIGNER2_PARTIAL_PSBT, fp2);
  });

// 5. Coordinator finalizes into a single 64-byte Schnorr Taproot keypath witness once THRESHOLD_MET fires
coordinator
  .onEvent('THRESHOLD_MET')
  .pipe(take(1))
  .subscribe(async () => {
    // Runs BIP-327 nonceAggregate + Session.partialSigAgg with BIP-341 TapTweak verification
    const finalTx = await coordinator.finalizeTransaction();

    console.log(`Finalized Taproot Keypath TX Hex: ${finalTx.hex}`);
    console.log(`TXID: ${finalTx.txId}`);
  });

```

---

## 9. Independent Offline Auditing & License Verification

A true Zero-Trust architecture means external auditors can independently verify the cryptographic math and software provenance *after* the infrastructure is destroyed. The SDK provides static methods to verify the transaction history and infrastructure licensing using nothing but the exported CSV file.

### A. Verify Forensic Event Timeline Integrity

Auditors can re-calculate the SHA-256 anchor offline to prove the exported event logs and finalized transaction hex match perfectly.

```javascript
import { SigningRoomClient } from '@signing-room/sdk';

// The auditor only needs the raw strings exported during the ceremony.
const exportedCsvString = `# --- SIGNING ROOM FORENSIC AUDIT RECORD ---\n...`;
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

### B. Verify Infrastructure Provenance (Enterprise License)

Auditors can mathematically prove the origin of the software that executed the ceremony by verifying the Ed25519 commercial license signature embedded within the CSV header.

```javascript
// Extract the embedded license token from the CSV and verify its Ed25519 signature
const licenseReport = await SigningRoomClient.verifyLicenseFromCsv(exportedCsvString);

if (licenseReport.isValid) {
  console.log(`Tier: ${licenseReport.tier}`);
  console.log(`Licensee: ${licenseReport.licensee}`);
  console.log(`Issued To: ${licenseReport.domain}`);
} else {
  console.log(`Verification Failed: ${licenseReport.tamperEvidentError}`);
}

// Alternatively, synchronously inspect a raw token string (useful for UI Dashboards)
const rawToken = SigningRoomClient.extractLicenseTokenFromCsv(exportedCsvString);
if (rawToken) {
  const info = SigningRoomClient.inspectLicenseToken(rawToken);
  console.log(`Optimistic Expiry Check: ${info.isExpired ? 'Expired' : 'Valid'}`);
}

```

---

## 10. Coordinator Role Recovery

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

[SigningRoom.io](https://signingroom.io/) is open-source under the **AGPLv3 License**.

* **Community Use**: If you modify the code and host it publicly, you must open-source your changes under AGPL-3.0.
* **Commercial Use**: Institutions requiring a Commercial License (AGPL Waiver) to integrate this technology into proprietary, closed-source infrastructure (e.g., internal banking systems, custodial platforms) must contact [Stateless Research Ltd](https://statelessresearch.com/).

### 🔗 Contact Stateless Research for Licensing

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

If you modify this code and run it over a network, you must release your source code. See `LICENSE` for more information.

```