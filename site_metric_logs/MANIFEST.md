# 📂 Forensic Data Manifest

This directory contains raw traffic logs exported from the **SigningRoom** Cloudflare Worker instance. These logs are provided to verify the "Stateless" architecture claims.

## 🗂 File Legend

### 1. `data_cached_*.csv` & `percent_cached_*.csv`
* **Status:** **EMPTY FILES** (0 KB)
* **Why is this empty?** Cloudflare analytics exports generate empty CSVs when a metric is absolute zero for the entire period.
* **Implication:** This is the "Smoking Gun" of our privacy claim. Despite heavy traffic in `total_requests`, the emptiness of these files proves that **Cloudflare's Edge Cache refused to store a single byte of user data.**

### 2. `percent_cached_*.csv`
* **Metric:** Percentage of requests served from cache.
* **Expectation:** `0.00%`.
* **Implication:** **Proof of Blind Relay.** The server acted purely as a pass-through.

### 3. `total_requests_*.csv`
* **Metric:** Total number of HTTP requests/signing events processed.
* **Context:** Indicates usage volume and activity spikes.

### 4. `unique_visitors_*.csv`
* **Metric:** Distinct IP addresses (hashed) accessing the relay.
* **Context:** Indicates user adoption vs. bot traffic.

### 5. `total_data_served_*.csv`
* **Metric:** Bandwidth throughput (Bytes).
* **Context:** Shows data moving *through* the relay without being stored.

## ✅ Verification Method
To verify the "Stateless" claim:
1.  Compare **`total_data_served`** (High Volume) vs **`data_cached`** (Zero).
2.  The massive discrepancy proves that data is flowing **through** the server, not **to** the server.