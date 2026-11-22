# signingroom-sdk-demo

Interactive TypeScript demos demonstrating end-to-end programmatic integration with the **@signing-room/sdk**.

This directory includes two interactive ceremony walkthroughs:

1. **Standard Multisig Ceremony (`index.ts`):** Orchestrates a 3-of-5 multisig signing lifecycle:
   - Cryptographic room creation & FBEK encryption
   - Zero-knowledge RBAC role link generation (Signer, Blind Signer, Observer)
   - Concurrent hardware signature uploads and quorum alarms
   - Tamper-evident transaction finalization & SHA-256 forensic anchor derivation
   - Session recovery & dirty-disconnect identity resumption
   - Offline third-party event timeline & Ed25519 license provenance attestation

2. **MuSig2 Taproot Ceremony (`musig2-demo.ts`):** Orchestrates a 2-round BIP-327 / BIP-373 MuSig2 keypath ceremony:
   - Round 1 setup PSBT (`0x1a` participant pubkeys) room initialization
   - Event-driven Round 1 public nonce (`0x1b`) collection (`NONCE_RECEIVED` & `NONCE_THRESHOLD_MET`)
   - Automated Coordinator nonce aggregation & transition to Round 2 (`aggregateMuSig2Nonces()`)
   - Round 2 partial signature (`0x1c`) collection and BIP-340 Schnorr keypath finalization

---

## Migration Guide (v1 to v2)

This release introduces the `v2.0.0` protocol, BIP-327/BIP-373 MuSig2 support, and the Enterprise licensing engine.

* **Breaking Protocol Change:** The relay protocol has been strictly bumped. Older `v1.x` SDK clients will be actively rejected by `v4.0.0` relays with an `ERROR_VERSION_MISMATCH` event.
* **Constructor Update:** The `SigningRoomClient` constructor now accepts `licenseToken` and `host` parameters to support cryptographic license attestation and dynamic whitelabeling for Enterprise nodes.
* **MuSig2 Support:** `createRoomAndJoin` and `createRoom` accept an optional `protocol: 'standard' | 'musig2'` parameter for 2-round nonce and partial signature aggregation.

## Prerequisites

Spin up the local Signing Room stack (Worker + Nginx Reverse Proxy + Web Clients) from the project root:

```bash
# From project root
docker compose up -d

```

This starts the local services:

* **Community Edition Node:** `http://localhost:8080`
* **Branded Enterprise Node:** `http://localhost:4201`
* **Relay Worker API:** Routed through Nginx via `/api` (headless access enabled)

Verify containers are running:

```bash
docker compose ps

```

---

## Running the SDK Demo

Open a terminal in the demo directory:

```bash
cd libs/sdk/signingroom-sdk-demo

```

### Option A: Run the Standard Multisig Demo (3-of-5)

```bash
node index.ts

```

### Option B: Run the MuSig2 2-Round Taproot Demo (2-of-2)

```bash
node musig2-demo.ts

```

### Live Interactive UI Pairing

During **Phase 1**, the terminal will output a ready-to-click room link:

```text
=========================================================
 READY TO WATCH
=========================================================
Open this Full Access link in your browser to watch and interact with the demo live:
-> http://localhost:8080/room/4234f401-47ed-4527-ae5c-a084c416f0cc#...

```

Paste this URL into your browser to watch participants join, addresses get whitelisted, device labels appear, and signatures aggregate in real time as you press **ENTER** through the terminal phases.

---

## Switching Between Community & Enterprise Modes

By default, the demo runs as an uncertified Community Edition node. To test commercial enterprise license attestation:

1. Open `index.ts`.
2. Update the `SigningRoomClient` constructor to supply the enterprise token and target host:

```typescript
const ENTERPRISE_TOKEN_EXAMPLE = 'srl_sbJbVsu3kGXet3...';

const coordinatorClient = new SigningRoomClient({
  apiUrl: 'http://localhost:8080',
  licenseToken: ENTERPRISE_TOKEN_EXAMPLE,
  host: 'localhost:4201', // Authorizes the branded node
});

```
---

## Teardown

To shut down the local background containers:

```bash
docker compose down

```

---

## 🏢 Enterprise & Commercial Licensing

[SigningRoom.io](https://signingroom.io/) is open-source under the **AGPLv3 License**.

* **Community Use**: If you modify the code and host it publicly, you must open-source your changes under AGPL-3.0.
* **Commercial Use**: Institutions requiring a Commercial License (AGPL Waiver) to integrate this technology into proprietary, closed-source infrastructure must contact [Stateless Research Ltd](https://statelessresearch.com/).

### 🔗 Contact Stateless Research for Licensing

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See `LICENSE` for more information.

```