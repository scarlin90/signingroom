# Technical Security & Compliance Roadmap (Now / Next / Later)

**Entity:** Stateless Research Ltd  
**Product:** Signing Room  
**Target Audience:** Enterprise CISOs, Compliance Auditors, Third-Party Reviewers

**Last Reviewed:** 7 August 2026

---

## 1. NOW (Current Production Release)

### Core Security & Architecture

- **Stateless Relay Execution:** Cloudflare Workers Durable Objects operating purely in volatile RAM; zero database logging or persistent data retention.
- **Client-Side Encryption:** AES-256-GCM encrypted payload coordination prior to relay transit; private key material never leaves client memory.
- **Open Protocol Foundation:** Specification defined under public BIP draft (`bip-stateless-psbt-coordination`) using `CC0-1.0` and `BSD-3-Clause` licenses.

### Continuous Compliance & Supply-Chain Hygiene

- **Automated SBOM Generation:** CycloneDX 1.6 JSON export integrated into CI/CD pipelines for all `dev`, `staging`, and `main` builds (artifacts retained 90 days).
- **Static Application Security Testing (SAST):** Semgrep (TypeScript rules) runs on every push/PR and nightly, with SARIF upload to GitHub Code Scanning.
- **Container & Dependency Scanning:** Trivy scans for CRITICAL vulnerabilities on SBOM and container images (worker + client); fails the pipeline on critical findings where appropriate.
- **Image Signing & Provenance:** Keyless Cosign signatures + OpenSSF SLSA Level 3 provenance attestations generated for all published container images.
- **OpenSSF Scorecard:** Automated supply-chain and repository security scoring runs daily and on pushes to `main`, with results published to the Security tab.
- **Dependency Review:** GitHub Dependency Review action runs on every pull request.
- **Coordinated Vulnerability Disclosure (CVD):** Active PGP key published alongside a cryptographically signed Warrant Canary (`SECURITY.md`).
- **Active Uptime & Health Monitoring:** Automated 24/7 HTTP/S checks via UptimeRobot targeting `api.signingroom.io/api/health` and `signingroom.io`.

---

## 2. NEXT (Target Horizon: Q3 / Q4 2026)

### Protocol & Feature Evolution

- **Tapscript Support:** Extend coordination and SDK capabilities to support Taproot / Tapscript scripts and related multisig constructions.

### Enterprise Deployment & Whitelabeling

- **Self-Hosted Relay Helm/Compose Bundles:** Pre-configured deployment scripts and manifests for enterprise clients hosting relays on internal infrastructure (`relay.company.com`).

### Open-Source Security Certification & Assurance

- **OpenSSF Best Practices Badge:** Self-certification under the Open Source Security Foundation (OpenSSF) framework.
- **Independent Third-Party CISO Validation:** Independent review and attestation of regulatory scope, incident response runbooks, and threat boundaries.

---

## 3. LATER (Strategic Vision)

### Advanced Relay Verification & Protocol Evolution

- **Finalized BIP Registration:** Formal acceptance and integration of `bip-stateless-psbt-coordination` into the official Bitcoin Implementation Proposals repository.
- **EU CRA CE-Marking Formalization:** Complete compliance documentation and governance for enterprise whitelabel distributions under full Cyber Resilience Act guidelines.
- **Stealth Room / Advanced Transport:** Prototype OHTTP with WebTransport/QUIC and MASQUE for enhanced metadata resistance.
