# Technical Security & Compliance Roadmap (Now / Next / Later)

**Entity:** Stateless Research Ltd  
**Product:** Signing Room  
**Target Audience:** Enterprise CISOs, Compliance Auditors, Third-Party Reviewers

**Last Reviewed:** 16 November 2026

---

## 1. NOW (Current Production Release)

### Core Security & Architecture

- **Ephemeral, Operator-Blind Relay Execution:** Cloudflare Workers Durable Objects hold encrypted room ciphertext strictly for the duration of an active signing ceremony (up to the 24-hour TTL) and cryptographically purge all state via `storage.deleteAll()` upon room closure or TTL expiration. Self-hosted `workerd` deployments operate in volatile memory (`inMemory = void`). Application request invocation logging is disabled (`invocation_logs: false`).
- **End-to-End Client-Side Encryption:** All transaction payloads (PSBTs), participant aliases, labels, and audit logs are AES-256-GCM encrypted client-side prior to relay transit; private key material and the room decryption key (`FBEK`) never leave client memory.
- **Multi-Round MuSig2 & Taproot Keypath Support:** Native coordination and SDK support for 2-round BIP-327 / BIP-373 MuSig2 Taproot keypath ceremonies alongside standard Legacy, SegWit, and Taproot multisig workflows.
- **Open Protocol Foundation:** Specification defined under public BIP draft (`bip-stateless-psbt-coordination`) using `CC0-1.0` and `BSD-3-Clause` licenses.

### Continuous Compliance & Supply-Chain Hygiene

- **Automated SBOM Generation:** CycloneDX 1.6 JSON export integrated into CI/CD pipelines for all `dev`, `staging`, and `main` builds (artifacts retained 90 days).
- **Static Application Security Testing (SAST):** Semgrep (TypeScript rules) runs on every push/PR and nightly, with SARIF upload to GitHub Code Scanning.
- **Container & Dependency Scanning:** Trivy scans for CRITICAL vulnerabilities on SBOM and container images (worker + client); fails the pipeline on critical findings where appropriate.
- **Image Signing & Provenance:** Keyless Cosign signatures + OpenSSF SLSA Level 3 provenance attestations generated for all published container images.
- **Automated Warrant Canary Verification:** CI/CD pipeline cryptographically verifies the PGP signature (`gpg --verify`) and expiration window of `security.txt` against the published `/pgp-key.asc` on every build, blocking deployments if expired or mismatched.
- **OpenSSF Scorecard:** Automated supply-chain and repository security scoring runs daily and on pushes to `main`, with results published to the Security tab.
- **Dependency Review:** GitHub Dependency Review action runs on every pull request.
- **Coordinated Vulnerability Disclosure (CVD):** Active PGP key published alongside a cryptographically signed Warrant Canary (`SECURITY.md`).
- **Active Uptime & Health Monitoring:** Automated 24/7 HTTP/S checks via UptimeRobot targeting `api.signingroom.io/api/health` and `signingroom.io`.

---

## 2. NEXT (Target Horizon: Q4 2026 / Q1 2027)

### Protocol & Feature Evolution

- **Tapscript (Script-Path) Multisig Support:** Extend coordination and SDK capabilities to support `OP_CHECKSIGADD` Tapscript leaf spending paths alongside MuSig2 keypath spends.
- **Authenticated Envelope Context Binding (AAD):** Bind room ID, message type, sender session, and monotonic sequence counters into AES-256-GCM Additional Authenticated Data (AAD) across the protocol specification and SDK.

### Enterprise Deployment & Whitelabeling

- **Production Self-Hosted Relay Helm/Compose Bundles:** Hardened production deployment manifests (with pinned image digests and reverse-proxy header sanitization) for enterprise clients hosting relays on internal infrastructure (`relay.company.com`).

### Open-Source Security Certification & Assurance

- **OpenSSF Best Practices Badge:** Self-certification under the Open Source Security Foundation (OpenSSF) framework.
- **Independent Third-Party Security Re-Verification:** Ongoing independent security reviews of threat boundaries, session resumption controls, and compliance documentation.
- **Cyber Essentials:** Gain certification

---

## 3. LATER (Strategic Vision)

### Advanced Relay Verification & Protocol Evolution

- **Finalized BIP Registration:** Formal acceptance and integration of `bip-stateless-psbt-coordination` into the official Bitcoin Improvement Proposals repository.
- **EU CRA CE-Marking Formalization:** Complete compliance documentation and governance for enterprise whitelabel distributions under full Cyber Resilience Act guidelines.
- **Stealth Room / Advanced Transport:** Prototype OHTTP with WebTransport/QUIC and MASQUE for enhanced network metadata resistance.
- **More usecases:** Explore how pattern can solve other problems