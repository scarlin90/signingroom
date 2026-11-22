# Regulatory Scope & Compliance Boundary Memo

**Entity:** Stateless Research Ltd  
**Product / Protocol:** Signing Room (`signingroom.io` / `@signing-room/sdk`)  
**Standard Specification:** BIP Draft (`bip-stateless-psbt-coordination` | License: CC0-1.0 / Code: BSD-3-Clause)  
**License Model:** AGPLv3 Dual-License (Open Source Core / Enterprise Whitelabel)  
**Primary Architecture Pattern:** Client-Side Cryptographic Execution & Ephemeral Operator-Blind Relay Processing

**Last Reviewed:** 16 November 2026

---

## 1. System Boundary & Operational Overview

The Signing Room system consists of six primary components:

- **Protocol Standard & Specification:** An open, unencumbered Bitcoin Improvement Proposal (BIP) draft specifying ephemeral, operator-blind PSBT coordination, dedicated to the public domain under CC0-1.0.
- **Libraries / SDKs (`@signing-room/sdk`, `@signing-room/embed`):** Client-side TypeScript libraries distributed via npm under AGPLv3/BSD-3-Clause. All cryptographic signing, key management, and PSBT handling occur strictly within the user’s local execution environment (browser, mobile app, or backend agent).
- **Hosted Client (`signingroom.io`):** Static Angular frontend hosted on Cloudflare Pages, acting purely as an interface loader.
- **Relay Infrastructure (`apps/worker`):** Cloudflare Worker Durable Objects providing real-time encrypted state synchronization between signers. On hosted deployments, encrypted room ciphertext is stored ephemerally in Durable Object storage only for the lifetime of the active room (up to the 24-hour TTL) and purged via `storage.deleteAll()` upon closure or expiration. Self-hosted `workerd` containers operate in volatile memory (`inMemory = void`).
- **Enterprise Whitelabel Deployments:** Fully isolated, client-hosted infrastructure where enterprise operators host their own relay (`relay.company.com`) and export compliance artifacts directly into their internal SIEM/audit storage.
- **High Availability, Redundancy & Disaster Recovery:**
  - **Edge Redundancy:** Hosted client (`signingroom.io`) and worker relay (`api.signingroom.io`) leverage Cloudflare’s global edge network across 300+ locations with built-in DDoS protection and high availability.
  - **Provider-Agnostic Container Portability:** Immutable Docker images for worker relays and web clients are built and published to GitHub Container Registry (`ghcr.io`) on every CI build tagged by environment (`dev`, `staging`, `latest`) and commit SHA (`${{ github.sha }}`).
  - **Zero-Archive Recovery (RPO = 0 for historical data, RTO < 15 mins):** Because relays maintain no long-term database archives and ceremonies are ephemeral, Disaster Recovery (DR) requires no historical database restoration. In the event of a primary edge provider outage, relay infrastructure can fail over to any container orchestration platform (AWS ECS, GCP Cloud Run, or Kubernetes).

---

## 2. Regulatory Applicability Matrix

### A. General Data Protection Regulation (GDPR / UK GDPR)

- **Status:** Minimal, Transient Processing (Operator-Blind Ciphertext & Ephemeral Abuse-Prevention Metadata)
- **Technical Justification:**
  - **Ephemeral Lifecycle & No Long-Term Retention:** The hosted relay (`apps/worker`) maintains no user accounts, email addresses, or permanent transaction archives. Encrypted session state exists in Durable Object storage strictly for the active ceremony window (max 24 hours) and is cryptographically purged via `storage.deleteAll()` on room close or expiry. Application invocation logs are disabled (`invocation_logs: false`).
  - **Data Minimization & Privacy by Design (Art. 5(1)(c) & Art. 25):** All coordination payloads passing through the relay are end-to-end client-side encrypted (AES-256-GCM) using a key (`FBEK`) that never leaves the client URL fragment. Transient network metadata (client IP addresses) is processed in memory solely for rate-limiting and DDoS/abuse protection (Art. 6(1)(f) legitimate interest in network security), with Cloudflare acting as edge sub-processor on hosted deployments.
  - **Data Subject Access Requests (DSARs) & Right to Erasure (Art. 17):** Because Stateless Research Ltd holds no unencrypted personal identifiers, user accounts, or persistent logs after a room closes or expires, no post-session personal data is retained to disclose or erase (Art. 11).

### B. EU Cyber Resilience Act (CRA)

- **Status:** Compliant via Architecture & Open-Source Steward Strategy
- **Technical Justification:**
  - **Open-Source Steward Framework:** The core protocol specification (CC0-1.0) and SDK libraries (`@signing-room/sdk`) are distributed open-source.
  - **Commercial SaaS & Hosted Relays:** For commercial hosted instances, CRA obligations are supported via:
    1. **Automated Supply-Chain Hygiene:** Continuous CycloneDX 1.6 SBOM generation and SLSA build provenance integrated directly into CI/CD pipelines.
    2. **Coordinated Vulnerability Disclosure (CVD) & Warrant Canary:** A documented security disclosure policy (`SECURITY.md`), PGP-encrypted reporting channel (`security@signingroom.io`), and a cryptographically signed Warrant Canary mechanism.
    3. **Bounded Attack Surface:** Because relays hold only ephemeral AES-256-GCM ciphertext without the decryption key and purge state upon room closure/expiry, a relay compromise does not expose plaintext transaction data or private keys.

### C. Digital Operational Resilience Act (DORA) & NIS2

- **Status:** Non-Custodial Software & Ephemeral Relay Provider
- **Technical Justification:**
  - DORA and NIS2 govern financial institutions and critical ICT providers regarding operational risk, data residency, and third-party vendor risk.
  - **Risk Reduction for Institutional Users:** Enterprise customers deploying the Whitelabel Architecture host their own relay endpoints (`relay.company.com`) in their chosen jurisdiction and export signed audit records directly to their internal SIEM/Secure Storage.
  - **Zero Vendor Lock-In:** Because the underlying protocol is an open BIP specification, institutions retain 100% control over their key material, network traffic, and compliance logs.

---

## 3. Data Flow & Security Guarantees

| Data Type | Handled By | Retention | Regulatory Impact |
| :--- | :--- | :--- | :--- |
| **Private Keys / Seed Phrases** | Local Client / Hardware Wallet | **Never leaves client** | Zero custodial liability |
| **Transaction Payloads (PSBTs)** | Local Client / SDK | Client-side AES-256-GCM encrypted | Operator-blind; key never sent to server |
| **Session State Ciphertext** | Cloudflare Durable Objects (Hosted) / `workerd` RAM (Self-Hosted) | Ephemeral (Purged on room close or ≤24h TTL alarm) | Minimal, transient processing; no post-session retention |
| **Network Metadata (Client IP)** | Cloudflare Edge / Worker Memory | Transient in-memory rate-limiting (`invocation_logs: false`) | Legitimate-interest security processing (GDPR Art. 6(1)(f)) |
| **Audit Logs & Compliance Records** | Exported by Client / Enterprise SIEM | Retained locally by Customer | Compliance retention controlled by customer |

---

## 4. Summary Statement for Auditors / CISOs

> "Stateless Research Ltd acts as an open protocol contributor, software vendor, and ephemeral, operator-blind transport provider. By design, Signing Room does not hold customer funds, store private keys, have access to room decryption keys, or retain post-session transaction histories. All session payloads are end-to-end AES-256-GCM encrypted client-side and purged upon ceremony completion or TTL expiration. Long-term compliance archiving and regulatory retention remain entirely under the control of the enterprise customer."