# Incident Response & Regulatory Notification Runbook

**Entity:** Stateless Research Ltd  
**Scope:** Signing Room Core (`@signing-room/sdk`), Relays (`apps/worker`), and Web Client (`signingroom.io`)  
**Primary Contact:** `security@signingroom.io`  
**Public PGP Fingerprint:** `C642EB5E3EB8519498CF653597A4B80F7970DD56`  
**Automated Telemetry:** UptimeRobot HTTP/S Health Monitoring

**Last Reviewed:** 7 August 2026

---

## 1. Active Infrastructure & Health Monitoring

Automated 24/7 external uptime monitoring is configured via UptimeRobot to ensure immediate incident detection and SLA tracking:

- **Production API Health Check:** `https://api.signingroom.io/api/health` (HTTP/S Monitor)
- **Production Web UI Check:** `https://signingroom.io` (HTTP/S Monitor)
- **Alert Escalation:** Automatic real-time notification triggers upon monitor failure or health check degradation to initiate immediate P1/P2 response workflows.

---

## 2. Incident Classification & Severity Matrix

| Level             | Definition                                                                                                                   | Impact on Signing Room                                             | SLA / Action Window       |
| :---------------- | :--------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------- | :------------------------ |
| **P1 - Critical** | Active zero-day exploitation, cryptographic library flaw, or hosted relay outage affecting live sessions (UptimeRobot fail). | Client-side key or payload exposure risk, or relay unavailability. | **Immediate (< 2 hours)** |
| **P2 - High**     | Non-exploited vulnerability in secondary dependencies or UI relay interface flaw.                                            | Potential localized denial of service or degraded session sync.    | **< 24 hours**            |
| **P3 - Medium**   | Dependency CVE with low exploitability or minor software bug.                                                                | No cryptographic or data safety risk.                              | **< 72 hours**            |
| **P4 - Low**      | Informational security report or minor documentation update.                                                                 | Zero operational impact.                                           | **Standard Sprint Cycle** |

---

## 3. Coordinated Vulnerability Disclosure (CVD) Workflow

1. **Ingress:** Security disclosures arrive via encrypted PGP email to `security@signingroom.io` or via automated health monitor alerts.
2. **Triage & Acknowledgment:** Receipt is acknowledged within 12 hours. Severity is classified using the matrix above.
3. **Remediation & CI Build:**
   - Fixes are applied in private development branches.
   - Automated CI pipelines execute continuous CycloneDX 1.6 SBOM export and integration test passes.
4. **Patch Release & Advisory:**
   - Updated SDK/npm packages (`@signing-room/sdk`) are published.
   - Security advisory is released alongside updated PGP-signed Warrant Canary updates if required.

---

## 4. Regulatory Notification Escalation Paths

### A. EU Cyber Resilience Act (CRA) Reporting

Under the EU CRA, providers of commercial software components and SaaS services must report actively exploited vulnerabilities to relevant European authorities:

- **24-Hour Early Warning:** Upon confirming an actively exploited vulnerability in hosted relay infrastructure or core SDK packages, Stateless Research notifies the appropriate EU CSIRT (Computer Security Incident Response Team) and ENISA.
  - _Content:_ Nature of the vulnerability, initial assessment of severity, and immediate mitigation steps.
- **72-Hour Detailed Notification:** A follow-up report is submitted within 72 hours detailing:
  - Full root-cause analysis.
  - Availability of patches/mitigation code.
  - Customer remediation guidance (e.g., upgrading `@signing-room/sdk` npm package).

### B. GDPR / UK GDPR Incident Reporting

- **72-Hour Breach Reporting Exemption / Standard:** Under GDPR Art. 33, data breaches must be reported to supervisory authorities (e.g., ICO/DPC) within 72 hours _unless the breach is unlikely to result in a risk to the rights and freedoms of natural persons_.
- **Zero-Data Impact Statement:** Because hosted relays operate statelessly in volatile RAM with zero persistent database storage, zero PII logging, and client-side AES-256-GCM encryption:
  - A physical or cloud worker compromise **yields no persistent personal data or readable transaction payloads**.
  - Formal GDPR data breach notifications are mitigated by design (_no data exfiltrated because no data exists_).

---

## 5. External Communication & Disclosure Plan

### Principles

- We prioritize user safety and responsible disclosure over speed of public announcement.
- Public technical disclosure occurs only after a patch is available or clear mitigation guidance exists.
- We avoid speculation and only publish verified facts.

### Notification Matrix

| Severity          | Internal Acknowledgment | Patch / Mitigation Target           | External Technical Disclosure                | Primary Channels                                                                                          |
| ----------------- | ----------------------- | ----------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **P1 – Critical** | < 2 hours               | Fastest possible (target < 24–48 h) | After patch or clear mitigation is available | Bitcoin Development Mailing List, Delving Bitcoin, GitHub Security Advisory, project README / status page |
| **P2 – High**     | < 12 hours              | < 7 days                            | After fix is released                        | GitHub Security Advisory + Delving Bitcoin (and Bitcoin-dev if impact is protocol-relevant)               |
| **P3 – Medium**   | < 24 hours              | Standard release cycle              | GitHub Security Advisory (if warranted)      | GitHub only                                                                                               |
| **P4 – Low**      | Standard triage         | Backlog                             | None required                                | None                                                                                                      |

### Channel Details

- **Bitcoin Development Mailing List** (`https://groups.google.com/g/bitcoindev`)  
  Used for P1 (and selected P2) issues that have potential impact on Bitcoin wallet or multisig coordination practices.

- **Delving Bitcoin** (`https://delvingbitcoin.org`)  
  Used for detailed technical discussion and coordinated disclosure with the broader Bitcoin research and development community.

- **GitHub Security Advisories**  
  Primary structured disclosure channel for the `signingroom` repository and related packages (`@signing-room/sdk`, etc.).

- **Project Status / README**  
  High-level notice for end users when a critical issue affects the hosted service.

### Process Notes

1. Draft disclosure is prepared internally and reviewed before any public post.
2. For P1 issues involving the hosted relay, a short status update may be posted earlier if users need immediate operational guidance (e.g. “service temporarily unavailable – investigating”).
3. Full technical details are released only once a fixed version is available or a reliable workaround exists.
4. Enterprise / whitelabel customers receive direct notification ahead of or in parallel with public disclosure.

---

## 6. Enterprise Whitelabel Incident Isolation

For enterprise clients hosting their own white-label relays (`relay.company.com`):

- **Local SIEM Containment:** Enterprise customers manage their own infrastructure, access control, health monitoring, and audit logs.
- **Notification SLA:** In the event of an upstream core SDK fix, Stateless Research issues a security bulletin directly to enterprise technical leads detailing required updates for their self-hosted worker instances.
