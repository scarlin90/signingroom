# SigningRoom.io

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-signingroom.io-blue?style=for-the-badge)](https://signingroom.io)

> **Stateless. Zero-Knowledge. Real-Time.**
> A stateless coordination layer for Bitcoin multisig transactions.

![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-emerald.svg)
![Bitcoin](https://img.shields.io/badge/Bitcoin-21M-orange.svg)
![Encryption](https://img.shields.io/badge/Encryption-AES--256--GCM-blue.svg)
![Status](https://img.shields.io/badge/Status-Beta-yellow.svg)

---

### ⚠️ Disclaimer

**THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.**

SigningRoom is an open-source coordination tool, **not** a wallet, custodian, or financial institution.
* **We do not** hold your private keys.
* **We do not** hold your funds.
* **We cannot** recover lost data (rooms are ephemeral and exist only in RAM).

You are solely responsible for verifying the details of any transaction (address, amount, fees) on your hardware device screen before signing.

---

**SigningRoom** replaces the insecurity of emailing files and the friction of USB sticks with a secure, ephemeral, real-time signing room. We do not want your data. We cannot read your data.

## 🏴 The Manifesto

1.  **Statelessness is Security:** Databases are liabilities. SigningRoom stores data in RAM (Cloudflare Durable Objects) only for the duration of the session. When the room expires, the data ceases to exist.
2.  **Zero Knowledge:** All transaction data is encrypted **client-side** (AES-GCM) before it ever touches the network. The decryption key exists only in the URL fragment (`#key`), which is never sent to the server.
3.  **Don't Trust, Verify:** The client is verifiable. The cryptography is standard (Web Crypto API). The code is open.

## ⚡ Features

* **Real-Time Sync:** Utilizing WebSockets for instant state propagation between signers.
* **Hardware Agnostic:** Works with Coldcard, Sparrow, Electrum, Ledger, Trezor, and any BIP-174 compatible wallet.
* **Ephemeral Rooms:** All rooms and data self-destruct after **24 hours**.
* **Audit Logs:** Automatically generates a client-side, cryptographically verifiable PDF audit trail of the signing ceremony.
* **Tor Friendly:** Works beautifully over Tor / VPNs. No PII required.

## 🛠️ Architecture

SigningRoom uses a **"Blind Relay"** architecture.



1.  **Alice (Coordinator)** uploads a PSBT.
2.  **Client** generates a random 256-bit key and encrypts the PSBT.
3.  **Worker** receives the *encrypted blob* and stores it in ephemeral RAM.
4.  **Bob (Signer)** clicks the link. His browser decrypts the blob locally.
5.  **Bob** signs and uploads. The *encrypted signature* is relayed back to Alice.

The server **never** sees the transaction details, addresses, or amounts.

## 🚀 Quick Start (Development)

Prerequisites: `Node.js v20+`.

```bash
# 1. Clone the repo
git clone [https://github.com/seancarlin/signing-room.git](https://github.com/seancarlin/signing-room.git)
cd signing-room

# 2. Install dependencies
npm install

# 3. Start the Development Server
npm start
Frontend: http://localhost:4200

Worker: http://localhost:8787

🏰 Self-Hosting (Sovereign)
We believe in true sovereignty. You should never be locked into a platform. While SigningRoom.io offers a hosted demo for convenience, you are free to inspect the code and run your own infrastructure.

1. Cloudflare Workers
You need a Cloudflare account to deploy the backend.

Bash

# Deploy the Worker (Backend)
npm run deploy:worker

# Deploy the Client (Frontend)
npm run deploy:client
2. Environment Variables
Set these in your wrangler.toml or Cloudflare Dashboard:

ALLOWED_ORIGIN: Your frontend URL (e.g., https://my-signing-room.com).

🤝 Contributing
Pull Requests are welcome. This is a public good project. If you are adding a feature, please ensure it adheres to our core principle: The server must remain blind.

Fork the Project

Create your Feature Branch (git checkout -b feature/AmazingFeature)

Commit your Changes (git commit -m 'Add some AmazingFeature')

Push to the Branch (git push origin feature/AmazingFeature)

Open a Pull Request

📄 License
Distributed under the GNU Affero General Public License v3.0 (AGPL-3.0). If you modify this code and run it over a network, you must release your source code. See LICENSE for more information.

🔐 Security
If you discover a vulnerability, please do NOT open a public issue. Email the maintainer directly or use PGP.

PGP Fingerprint: C642 EB5E 3EB8 5194 98CF 6535 97A4 B80F 7970 DD56

Email: security@signingroom.io

Built with 🧡 and ⚡ by Sean Carlin.