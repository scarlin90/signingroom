# 🛡️ Security Policy & Warrant Canary

The security of the **Stateless Pattern** depends on two things: the integrity of the code and the transparency of the administration. This document provides the tools to verify both.

## 🔑 Public PGP Key
To verify the **Warrant Canary** or to send encrypted vulnerability reports, use the official Architect key.

**Fingerprint:** `C642EB5E3EB8519498CF653597A4B80F7970DD56`  
**Key Location:** [/pgp-key.asc](./apps/client/public/pgp-key.asc)

---

## 🐤 Warrant Canary
The Warrant Canary is updated monthly. If this file is not updated by the expiry date, or if the PGP signature is invalid, please assume the service has been compromised.

> 📄 **[View Current Signed Warrant Canary](./apps/client/public/security.txt)**

### How to Verify the Canary
We encourage users to cryptographically verify the Canary manually:

1. **Import the Public Key:**
   ```bash
   gpg --import pgp-key.asc
   ```
   
2. **Verify the Canary File:**

    ```bash
    gpg --verify security.txt
    ```
3. **Check the Output:**
Look for: gpg: Good signature from "Sean Carlin seancarlin90@googlemail.com"


🐛 Reporting Vulnerabilities
If you discover a security vulnerability, please do NOT open a public issue.

Stateless Research Ltd operates a responsible disclosure policy. Please encrypt your report using the PGP key above and send it to:

Email: security@signingroom.io

Why "Stateless" Matters for Security
Because the architecture is a "Vacuum" (Stateless Relay), the impact of a potential breach is fundamentally limited:

No Database: There are no user emails, passwords, or transaction histories to leak.

No Persistence: Payloads exist only in volatile RAM for the duration of the relay.

Encryption: All coordination is AES-256-GCM encrypted client-side before reaching the relay.



