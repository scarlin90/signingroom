# Regulatory Scope & Compliance Boundary Memo

**Entity:** Stateless Research Ltd  
**Product / Protocol:** Signing Room (`signingroom.io` / `@signing-room/sdk`)  
**Standard Specification:** BIP Draft (`bip-stateless-psbt-coordination` | License: CC0-1.0 / Code: BSD-3-Clause)  
**License Model:** AGPLv3 Dual-License (Open Source Core / Enterprise Whitelabel)  
**Primary Architecture Pattern:** Client-Side Cryptographic Execution & Ephemeral Relay Processing

**Last Reviewed:** 7 August 2026

---

## 1. System Boundary & Operational Overview

The Signing Room system consists of six primary components:

- **Protocol Standard & Specification:** An open, unencumbered Bitcoin Implementation Proposal (BIP) draft specifying stateless PSBT coordination, dedicated to the public domain under CC0-1.0.
- **Libraries / SDKs (`@signing-room/sdk`, `@signing-room/embed`):** Client-side TypeScript libraries distributed via npm under AGPLv3/BSD-3-Clause. All cryptographic signing, key management, and PSBT handling occur strictly within the user’s local execution environment (browser, mobile app, or backend agent).
- **Hosted Client (`signingroom.io`):** Static Angular frontend hosted on Cloudflare Pages, acting purely as an interface loader.
- **Relay Infrastructure (`apps/worker`):** Cloudflare Worker Durable Objects providing real-time state synchronization between signers.
- **Enterprise Whitelabel Deployments:** Fully isolated, client-hosted infrastructure where company users host their own relay (`relay.company.com`) and stream logs directly into their enterprise SIEM/audit storage.
- **High Availability, Redundancy & Disaster Recovery:**
  - **Edge Redundancy:** Hosted client (`signingroom.io`) and worker relay (`api.signingroom.io`) leverage Cloudflare’s global edge network across 300+ locations with built-in DDoS protection and high availability.
  - **Provider-Agnostic Container Portability:** Immutable Docker images for worker relays and web clients are built and published to GitHub Container Registry (`ghcr.io`) on every CI build tagged by environment (`dev`, `staging`, `latest`) and commit SHA (`${{ github.sha }}`).
  - **Zero-State Recovery (RPO = 0, RTO < 15 mins):** Because relays operate statelessly in volatile RAM without persistent database dependencies, Disaster Recovery (DR) requires zero data restoration. In the event of a primary edge provider outage, relay infrastructure can failover seamlessly to any container orchestration platform (AWS ECS, GCP Cloud Run, or Kubernetes).

---

## 2. Regulatory Applicability Matrix

### A. General Data Protection Regulation (GDPR / UK GDPR)

- **Status:** Out of Scope / Zero PII Retained
- **Technical Justification:**
  - **No Persistent Data Storage:** The hosted relay (`apps/worker`) operates ephemerally using Durable Objects in RAM. No user identities, email addresses, IP logs, or transaction payloads are written to disk.
  - **Data Minimization (Art. 5(1)(c)):** Cryptographic payloads passing through the relay are ephemeral and end-to-end client-side encrypted (AES-256-GCM).
  - **Data Subject Access Requests (DSARs) & Right to be Forgotten (Art. 17):** Because Stateless Research stores zero Personal Identifiable Information (PII) or transaction history on its relays, DSARs are non-applicable by design (_cannot disclose or delete data that does not exist_).

### B. EU Cyber Resilience Act (CRA)

- **Status:** Compliant via Architecture & Open-Source Steward Strategy
- **Technical Justification:**
  - **Open-Source Steward Exemption:** The core protocol specification (CC0-1.0) and SDK libraries (`@signing-room/sdk`) are distributed open-source under permissive/copyleft licenses. This layer operates under the CRA Open-Source Steward framework, shielding non-commercial distribution from standard CE-marking and complex conformity assessments.
  - **Commercial SaaS & Hosted Relays:** For commercial hosted instances, CRA compliance is satisfied via:
    1. **Automated Supply-Chain Hygiene:** Continuous CycloneDX 1.6 SBOM generation integrated directly into CI/CD pipelines.
    2. **Coordinated Vulnerability Disclosure (CVD) & Warrant Canary:** A documented security disclosure policy (`SECURITY.MD`), PGP-encrypted reporting channel (`security@signingroom.io`), and a cryptographically signed Warrant Canary mechanism.
    3. **Zero-Retained Attack Surface:** Because relays hold no persistent state, a physical or cloud worker compromise cannot result in customer data exfiltration.

### C. Digital Operational Resilience Act (DORA) & NIS2

- **Status:** Non-Custodial Infrastructure Provider / Reduced Operational Risk
- **Technical Justification:**
  - DORA and NIS2 primarily govern financial institutions and critical ICT providers regarding operational risk, data residency, and third-party vendor risk.
  - **Risk Elimination for Institutional Users:** Enterprise customers deploying the Whitelabel Architecture host their own relay endpoints (`relay.company.com`) and log audit events directly to their internal SIEM/Secure Storage.
  - **Zero Vendor Lock-In:** Because the underlying protocol is an open BIP specification, institutions retain 100% control over their key material, network traffic, and compliance logs, eliminating third-party vendor lock-in and vendor liability.

---

## 3. Data Flow & Security Guarantees

| Data Type                           | Handled By                        | Retention                         | Regulatory Impact                               |
| :---------------------------------- | :-------------------------------- | :-------------------------------- | :---------------------------------------------- |
| **Private Keys / Seed Phrases**     | Local Client / Hardware Wallet    | **Never leaves client**           | Zero liability                                  |
| **Transaction Payloads (PSBTs)**    | Local Client / SDK                | Ephemeral (RAM only, AES-256-GCM) | Zero persistent storage                         |
| **Session State Events**            | Cloudflare Worker Durable Objects | Transient (In-Memory)             | Bypasses GDPR storage rules                     |
| **Audit Logs & Compliance Records** | Enterprise Internal SIEM          | Retained by Customer              | Compliance responsibility stays with enterprise |

---

## 4. Summary Statement for Auditors / CISOs

> "Stateless Research Ltd acts strictly as an open protocol contributor, software vendor, and ephemeral transport provider. By design, Signing Room does not hold customer funds, store private keys, maintain database logs of transaction contents, or process PII. Operational compliance, audit logging, and regulatory retention remain entirely in the hands of the enterprise customer, supported by our self-hosted white-label architecture, PGP/Warrant Canary transparency model, containerized redundancy infrastructure, and open BIP standard."
