# Technical Security & Compliance Roadmap (Now / Next / Later)

**Entity:** Stateless Research Ltd  
**Product:** Signing Room  
**Target Audience:** Enterprise CISOs, Compliance Auditors, Third-Party Reviewers  

---

## 1. NOW (Current Production Release)

### Core Security & Architecture
* **Stateless Relay Execution:** Cloudflare Workers Durable Objects operating purely in volatile RAM; zero database logging or persistent data retention.
* **Client-Side Encryption:** AES-256-GCM encrypted payload coordination prior to relay transit; private key material never leaves client memory.
* **Open Protocol Foundation:** Specification defined under public BIP draft (`bip-stateless-psbt-coordination`) using `CC0-1.0` and `BSD-3-Clause` licenses.

### Continuous Compliance & Supply-Chain Hygiene
* **Automated SBOM Generation:** CycloneDX 1.6 JSON export integrated into CI/CD pipelines (`actions/upload-artifact@v4`) for all `dev`, `staging`, and `main` builds.
* **Coordinated Vulnerability Disclosure (CVD):** Active PGP key published alongside a cryptographically signed, monthly-updated Warrant Canary (`SECURITY.md`).
* **Active Uptime & Health Monitoring:** Automated 24/7 HTTP/S checks via UptimeRobot targeting `api.signingroom.io/api/health` and `signingroom.io`.

---

## 2. NEXT (Target Horizon: Q3 / Q4)

### Enterprise Deployment & Whitelabeling
* **Self-Hosted Relay Helm/Compose Bundles:** Pre-configured deployment scripts for enterprise clients hosting relays on internal infrastructure (`relay.company.com`).
* **Automated Security Scanning in CI/CD:** Integration of static code analysis (SAST) and automated dependency vulnerability scanning (Trivy / Snyk / CodeQL) directly into GitHub Actions.

### Open-Source Security Certification & Badges
* **OpenSSF Best Practices Badge:** Self-certification under the Open Source Security Foundation (OpenSSF) framework to demonstrate adherence to FLOSS security guidelines.
* **OpenSSF Scorecard Integration:** Automated supply-chain and repository security risk scoring executed continuously via GitHub Actions.
* **Independent Third-Party CISO Validation:** Independent audit and attestation of regulatory scope, incident response runbooks, and threat boundaries.

---

## 3. LATER (Strategic Vision)

### Advanced Relay Verification & Protocol Evolution
* **Finalized BIP Registration:** Formal acceptance and integration of `bip-stateless-psbt-coordination` into the official Bitcoin Implementation Proposals repository.
* **EU CRA CE-Marking Formalization:** Complete compliance documentation and governance for enterprise whitelabel distributions under full Cyber Resilience Act guidelines.