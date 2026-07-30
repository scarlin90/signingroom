# Incident Response & Regulatory Notification Runbook

**Entity:** Stateless Research Ltd  
**Scope:** Signing Room Core (`@signing-room/sdk`), Relays (`apps/worker`), and Web Client (`signingroom.io`)  
**Primary Contact:** `security@signingroom.io`  
**Public PGP Fingerprint:** `C642EB5E3EB8519498CF653597A4B80F7970DD56`  
**Automated Telemetry:** UptimeRobot HTTP/S Health Monitoring  

---

## 1. Active Infrastructure & Health Monitoring

Automated 24/7 external uptime monitoring is configured via UptimeRobot to ensure immediate incident detection and SLA tracking:

* **Production API Health Check:** `https://api.signingroom.io/api/health` (HTTP/S Monitor)
* **Production Web UI Check:** `https://signingroom.io` (HTTP/S Monitor)
* **Alert Escalation:** Automatic real-time notification triggers upon monitor failure or health check degradation to initiate immediate P1/P2 response workflows.

---

## 2. Incident Classification & Severity Matrix

| Level | Definition | Impact on Signing Room | SLA / Action Window |
| :--- | :--- | :--- | :--- |
| **P1 - Critical** | Active zero-day exploitation, cryptographic library flaw, or hosted relay outage affecting live sessions (UptimeRobot fail). | Client-side key or payload exposure risk, or relay unavailability. | **Immediate (< 2 hours)** |
| **P2 - High** | Non-exploited vulnerability in secondary dependencies or UI relay interface flaw. | Potential localized denial of service or degraded session sync. | **< 24 hours** |
| **P3 - Medium** | Dependency CVE with low exploitability or minor software bug. | No cryptographic or data safety risk. | **< 72 hours** |
| **P4 - Low** | Informational security report or minor documentation update. | Zero operational impact. | **Standard Sprint Cycle** |

---

## 3. Coordinated Vulnerability Disclosure (CVD) Workflow

1. **Ingress:** Security disclosures arrive via encrypted PGP email to `security@signingroom.io` or via automated health monitor alerts.
2. **Triage & Acknowledgment:** Receipt is acknowledged within 12 hours. Severity is classified using the matrix above.
3. **Remediation & CI Build:**
   * Fixes are applied in private development branches.
   * Automated CI pipelines execute continuous CycloneDX 1.6 SBOM export and integration test passes.
4. **Patch Release & Advisory:**
   * Updated SDK/npm packages (`@signing-room/sdk`) are published.
   * Security advisory is released alongside updated PGP-signed Warrant Canary updates if required.

---

## 4. Regulatory Notification Escalation Paths

### A. EU Cyber Resilience Act (CRA) Reporting
Under the EU CRA, providers of commercial software components and SaaS services must report actively exploited vulnerabilities to relevant European authorities:

* **24-Hour Early Warning:** Upon confirming an actively exploited vulnerability in hosted relay infrastructure or core SDK packages, Stateless Research notifies the appropriate EU CSIRT (Computer Security Incident Response Team) and ENISA.
  * *Content:* Nature of the vulnerability, initial assessment of severity, and immediate mitigation steps.
* **72-Hour Detailed Notification:** A follow-up report is submitted within 72 hours detailing:
  * Full root-cause analysis.
  * Availability of patches/mitigation code.
  * Customer remediation guidance (e.g., upgrading `@signing-room/sdk` npm package).

### B. GDPR / UK GDPR Incident Reporting
* **72-Hour Breach Reporting Exemption / Standard:** Under GDPR Art. 33, data breaches must be reported to supervisory authorities (e.g., ICO/DPC) within 72 hours *unless the breach is unlikely to result in a risk to the rights and freedoms of natural persons*.
* **Zero-Data Impact Statement:** Because hosted relays operate statelessly in volatile RAM with zero persistent database storage, zero PII logging, and client-side AES-256-GCM encryption:
  * A physical or cloud worker compromise **yields no persistent personal data or readable transaction payloads**.
  * Formal GDPR data breach notifications are mitigated by design (*no data exfiltrated because no data exists*).

---

## 5. Enterprise Whitelabel Incident Isolation

For enterprise clients hosting their own white-label relays (`relay.company.com`):

* **Local SIEM Containment:** Enterprise customers manage their own infrastructure, access control, health monitoring, and audit logs.
* **Notification SLA:** In the event of an upstream core SDK fix, Stateless Research issues a security bulletin directly to enterprise technical leads detailing required updates for their self-hosted worker instances.