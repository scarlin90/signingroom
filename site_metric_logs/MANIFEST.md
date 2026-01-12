📂 Forensic Data Manifest
This directory contains raw traffic logs exported from the SigningRoom Cloudflare Worker instance. These logs are provided to verify the "Stateless" architecture claims and track the adoption of the PWA (Progressive Web App).

🗂 Directory Structure
To ensure immutable audit trails, logs are grouped by their specific Audit Date.

./2026-01-11_audit/ - (Pre-Launch / Prototype Traffic)

./2026-01-12_audit/ - (PWA Verification)

🗂 File Legend & Interpretation
1. data_cached_*.csv
Metric: Volume of data served directly from Cloudflare's Edge Cache.

Interpretation: Represents the Public Application Shell (HTML, JS, WebAssembly).

Why is this high? A high value (e.g., ~132 MB) confirms that users are downloading the Client-Side Code successfully. This verifies that the security model is "Trust-on-First-Use" (TOFU) via a static binary.

2. percent_cached_*.csv
Metric: Percentage of requests served from cache.

Target: > 80% (indicating efficient PWA delivery).

Analysis:

Cached (~82%): Static assets (Security Code, UI).

Uncached (~18%): The Ephemeral Coordination Signals. This small slice of traffic represents the actual encrypted PSBT exchange, which is never written to disk.

3. total_data_served_*.csv
Metric: Total bandwidth throughput (Bytes).

Context: Used to calculate the average payload size.

Formula: Total Data / Total Requests

Result: ~600KB/request indicates a full application download (WASM binary) rather than just API chatter.

4. unique_visitors_*.csv
Metric: Distinct IP addresses (hashed) accessing the relay.

Context: Indicates distinct coordination sessions.

✅ Verification Method (The Stateless Proof)
To verify the "Blind Relay" claim, an auditor should observe the following pattern:

High Cache Rate: The bulk of the data (MBs) is static, public code.

No "User State" Logs: Cloudflare does not generate a KV_storage_write or D1_database_write log file.

Ephemeral Throughput: The discrepancy between Total Requests and Cached Requests represents the "Blind" traffic—encrypted signals that pass through the worker RAM without triggering a storage event.

Maintained by: Sean Carlin, Technical Architect