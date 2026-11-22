# 🛡️ Security Policy & Warrant Canary

The security of the **Stateless Pattern** depends on two things: the integrity of the code and the transparency of the administration. This document provides the tools to verify both.

## 🔑 Public PGP Key
To verify the **Warrant Canary** or to send encrypted vulnerability reports, use the official Architect PGP key bundle.

* **Primary Key Fingerprint:** `C642 EB5E 3EB8 5194 98CF 6535 97A4 B80F 7970 DD56`
* **Ed25519 Signing Subkey Fingerprint:** `AE65 1FE8 0BA6 AEFD 6785 C6AC 4C6F D551 7130 66AF`
* **Key Location:** [/pgp-key.asc](./apps/client/public/pgp-key.asc)

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

Why Ephemeral, Operator-Blind Architecture Matters for Security
Because the architecture operates as an end-to-end encrypted, operator-blind relay, the impact of a potential infrastructure breach is fundamentally bounded:

No User Database or Long-Term Retention: There are no user accounts, email addresses, passwords, or historical transaction archives to leak.

Ephemeral Session State: On hosted infrastructure (Cloudflare Durable Objects), encrypted room ciphertext is held in ephemeral object storage solely for the duration of an active signing ceremony (up to the 24-hour TTL) and is purged via storage.deleteAll() immediately upon room closure or TTL expiry. Self-hosted workerd deployments operate in volatile memory (inMemory = void).

End-to-End Client-Side Encryption: All transaction payloads (PSBTs), participant aliases, labels, and audit logs are AES-256-GCM encrypted client-side before reaching the relay; the decryption key (FBEK) remains strictly in the client's URL fragment and is never transmitted to the server.



