# signingroom-sdk-demo

An interactive TypeScript demo demonstrating end-to-end programmatic integration with the **@signing-room/sdk**.

This demo orchestrates a complete 3-of-5 multisig signing ceremony lifecycle:
- Cryptographic room creation & FBEK encryption
- Zero-knowledge RBAC role link generation (Signer, Blind Signer, Observer)
- Concurrent hardware signature uploads and quorum alarms
- Tamper-evident transaction finalization & SHA-256 forensic anchor derivation
- Session recovery & dirty-disconnect identity resumption
- Offline third-party event timeline & Ed25519 license provenance attestation

---

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

node index.ts

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
  apiUrl: 'http://localhost:8080/api',
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