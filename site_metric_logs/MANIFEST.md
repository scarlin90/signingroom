# 📂 Forensic Data Manifest

This directory contains raw traffic logs exported from the SigningRoom Cloudflare Worker instance. These logs are provided to verify the "Stateless" architecture claims and track the adoption of the PWA (Progressive Web App).

## 🗂 Directory Structure

To ensure immutable audit trails, logs are grouped by their specific Audit Date.

- `./2026-01-11_audit/` - (Pre-Launch / Prototype Traffic)
- `./2026-01-12_audit/` - (PWA Verification)
- `./2026-01-15_audit/` - (Stability & Growth)
- `./2026-01-19_audit/` - (High-Volume Stress Test)
- `./2026-02-03_audit/` - (Institutional Scale)
- `./2026-02-12_audit/` - (Stability & Convergence)
- `./2026-03-21_audit/` - (v1.6.0 Scalability & 30-Day Performance Audit)
- `./2026-03-25_audit/` - (Post-v1.6.1 Stability & Automated Probe Analysis)
- `./2026-04-02_audit/` - (v1.7.0 Trademark Rollout & Persistent Witness Verification)
- `./2026-04-15_audit/` - (Stateless Vacuum & WebSocket Stress Test)
- `./2026-05-01_audit/` - (v2.1.0 Architecture & Edge Cache Validation)
- `./2026-05-16_audit/` - (Optical Air-Gapped Release & 30-Day Performance Audit)
- `./2026-07-13_audit/` - (v2.5.0)
- `./2026-07-30_audit/` - (Post v3.0.0 and sdk v1.0.1)

## 📊 Performance Metrics (Global Aggregate)

| Metric                            | Value | Interpretation                                                            |
| :-------------------------------- | :---- | :------------------------------------------------------------------------ |
| **Database Footprint**            | 0 KB  | **Absolute Statelessness:** No user metadata or PSBTs are stored.         |
| **Current Cache Ratio (Avg 30d)** | 40.9% | **Healthy Equilibrium:** Balancing static delivery with dynamic relaying. |

---

## 🗂 File Legend & Interpretation

**1. data*cached*\*.csv**

- **Metric:** Volume of data served directly from Cloudflare's Edge Cache.
- **Interpretation:** Represents the Public Application Shell (HTML, JS, WebAssembly).
- **Significance:** A high value confirms the "Trust-on-First-Use" (TOFU) security model via a static binary.

**2. percent*cached*\*.csv**

- **Metric:** Percentage of requests served from cache.
- **Analysis:** High percentages (~80%+) indicate static UI delivery; 0% spikes indicate active WebSocket coordination (The "Vacuum" Mode).

**3. total*data_served*\*.csv**

- **Metric:** Total Bandwidth (Cached + Uncached).
- **Significance:** Measures the "Weight" of coordination. High bandwidth with low storage (0KB DB) validates the "Stateless" thesis.

---

### 📂 ./2026-01-11_audit/

| Metric                | Value    | Analysis                                                                                                                        |
| :-------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------ |
| **Total Requests**    | 358      | Initial internal testing and beta link sharing.                                                                                 |
| **Unique Visitors**   | 42       | Core development team and early auditors.                                                                                       |
| **Total Data Served** | 102.3 MB | High volume due to repeated re-deployments and cache busting during testing.                                                    |
| **Cache Ratio**       | 98.7%    | **Vending Machine Mode:** Traffic was almost exclusively file downloads (app updates), with very little WebSocket coordination. |

---

### 📂 ./2026-01-12_audit/

| Metric                | Value    | Analysis                                                      |
| :-------------------- | :------- | :------------------------------------------------------------ |
| **Total Requests**    | 684      | Public beta announcement.                                     |
| **Unique Visitors**   | 115      | First wave of organic traffic.                                |
| **Total Data Served** | 45.12 MB | Efficient caching observed.                                   |
| **Cache Ratio**       | 92.4%    | **Validation:** The PWA is caching correctly on user devices. |

---

### 📂 ./2026-01-15_audit/

| Metric                | Value    | Analysis                                                                                                             |
| :-------------------- | :------- | :------------------------------------------------------------------------------------------------------------------- |
| **Total Requests**    | 878      | Normalized traffic flow following the PWA update.                                                                    |
| **Unique Visitors**   | 153      | **Growth Trend:** Daily active users reached a new high (153) on Jan 14.                                             |
| **Total Data Served** | 50.67 MB | Efficient bandwidth usage (~70% cached).                                                                             |
| **Cache Ratio**       | 70.5%    | **Stability Signal:** Cache efficiency restored, proving the PWA is serving static assets correctly to repeat users. |

> **Forensic Note:** A distinct "Uncached" ceremony was detected at **16:00 (4:00 PM)**. The server relayed **4.2 MB** of data while maintaining a **0KB database state**.

---

### 📂 ./2026-01-19_audit/

| Metric                | Value    | Analysis                                                                                                                                                                             |
| :-------------------- | :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Total Requests**    | 1,002    | **All-Time High:** Traffic broke the 1k barrier, showing strong organic growth.                                                                                                      |
| **Total Data Served** | 43.53 MB | Consistent throughput for coordination events.                                                                                                                                       |
| **Cache Ratio**       | 29.8%    | **Dynamic Shift:** The lower cache rate (compared to 70% on Jan 15) indicates users are heavily utilizing the WebSocket relay (uncached) rather than just downloading static assets. |

> **Forensic Note:** A massive **Uncached Event** occurred at **22:00 (10 PM)**, moving **12.48 MB** with **0% caching**. This signature confirms a large, real-time encrypted coordination session where data passed ephemerally through the relay without writing to disk.

---

### 📂 ./2026-02-03_audit/

| Metric                | Value    | Analysis                                                                                                                                                                                                                     |
| :-------------------- | :------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Total Requests**    | 1,143    | **Sustained Velocity:** Daily traffic remains consistently above the 1,000 request baseline.                                                                                                                                 |
| **Unique Visitors**   | 569      | **High Engagement:** User-to-request ratio (~2.0) suggests focused, single-purpose sessions rather than idle browsing.                                                                                                       |
| **Total Data Served** | 66.78 MB | Significant volume for text-based coordination.                                                                                                                                                                              |
| **Cache Ratio**       | 52.5%    | **The "Hybrid" Signature:** A near-perfect 50/50 split indicates a healthy ecosystem: half the bandwidth is new users acquiring the PWA (Vending Machine), and half is established users executing live ceremonies (Vacuum). |

> **Forensic Note:** A massive **Uncached Event** was detected at **06:00 UTC**, moving **12.06 MB** of purely dynamic data in a single hour. This represents a high-density coordination event—likely a large institutional key ceremony or batch consolidation—occurring entirely in RAM with zero disk persistence.

---

### 📂 ./2026-02-12_audit/

| Metric                | Value    | Analysis                                                                                                                   |
| :-------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------- |
| **Total Requests**    | 962      | **Stability:** Successfully absorbed a 572-request bot probe at 15:00 GMT without impacting legitimate throughput.         |
| **Unique Visitors**   | 634      | **Global Growth:** Significant adoption in privacy-centric regions and institutional hubs.                                 |
| **Total Data Served** | 55.29 MB | **High-Density Coordination:** Average payload weight suggests a shift towards complex, high-participation multisig sets.  |
| **Peak Event**        | 14.09 MB | **Forensic Lock:** The 19:00 GMT "Atlantic Convergence" event represents the protocol's highest hourly throughput to date. |

---

### 📂 ./2026-03-21_audit/

| Metric                      | Value   | Analysis                                                                                                           |
| :-------------------------- | :------ | :----------------------------------------------------------------------------------------------------------------- |
| **Total Requests (24h)**    | 812     | Steady throughput during the v1.6.0 deployment window.                                                             |
| **Total Requests (30d)**    | 41,020  | **High Velocity:** Sustained interest and protocol usage across the full month.                                    |
| **Unique Visitors (30d)**   | 3,915   | **Deep Engagement:** A diverse and active global user base.                                                        |
| **Total Data Served (30d)** | 1.94 GB | Significant throughput with zero persistent storage.                                                               |
| **Cache Ratio (Avg 30d)**   | 33.3%   | **The "Protocol" Ratio:** Consistent evidence that ~70% of traffic is real-time WebSocket coordination (uncached). |

> **Forensic Note (The 2GB Vacuum):** Over the last 30 days, the server successfully relayed **1.94 GB** of data. Despite this significant volume, the backend database remains at **0KB**. This is the strongest evidence to date of the "Vacuum" state: the server acts as an ephemeral conduit, where data is destroyed the moment it is consumed by the client.

> **Peak Event (24h):** A distinct high-density event occurred at **11:00 AM**, moving **34.82 MB** of data. While the cache ratio for this specific hour was ~66% (indicating users downloading the v1.6.0 update), the **11.72 MB** of uncached data suggests a large-scale institutional signing ceremony occurring simultaneously.

---

### 📂 ./2026-03-25_audit/

| Metric                   | Value     | Analysis                                                                                                                          |
| ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Total Requests (24h)** | 3,715     | High Volatility: Sharp spike compared to previous audits, largely due to automated probing at 1:00 AM.                            |
| **Unique Visitors**      | 537       | Stable organic base. Visitor count does not correlate with the request spike, confirming automated activity.                      |
| **Total Data Served**    | 107.32 MB | Consistent data weight despite high request volume, as probes resulted in minimal data transfer.                                  |
| **Cache Ratio (Avg)**    | 34.2%     | Probing Artifact: Low cache ratio during peak hours confirms traffic was directed at dynamic endpoints rather than static assets. |

### Forensic Notes

> **Automated Probe Detection**  
> A distinct automated event occurred at 1:00 AM, generating **1,260 requests** from only **22 unique visitors**. This 57:1 request-to-visitor ratio, combined with a 2.2% cache ratio and only ~0.8 MB of data transferred, is a textbook signature of an automated vulnerability scanner or bot probe.

> **High-Density Organic Event**  
> Despite the bot noise, a legitimate high-density coordination ceremony was detected at 12:00 PM, moving **28.72 MB** of data with **83 requests**. This represents the highest single-hour organic throughput for the v1.6.0 release.

### Audit Verdict

**Passed.** The "Stateless Vacuum" architecture successfully absorbed the automated probe volume at 1:00 AM without resource exhaustion or data retention.

### 📂 ./2026-04-02_audit/

| Metric                      | Value   | Analysis                                                                                                                                                             |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Total Requests (30d)**    | 42,129  | Robust and normalized monthly traffic following the late March bot probes.                                                                                           |
| **Unique Visitors (30d)**   | 3,704   | Continued strong adoption, indicating solid retention and recurring multi-party coordination globally.                                                               |
| **Total Data Served (30d)** | 2.66 GB | Massive cumulative throughput over the month, definitively validating the stateless WebSocket architecture at scale.                                                 |
| **Cache Ratio (Avg 30d)**   | 44.0%   | **Healthy Equilibrium:** Re-established stability around ~44%, perfectly balancing client-side app delivery (Vending Machine) with active WebSocket relays (Vacuum). |

### Forensic Notes

> **The "Triple Vacuum" Events (v1.7.0 Validation)** In a single 24-hour window, the relay absorbed three distinct, high-density coordination ceremonies, moving massive dynamic payloads entirely in RAM:

- **1:00 PM:** 11.91 MB relayed (0.31% cached)
- **6:00 AM:** 11.54 MB relayed (0.00% cached)
- **7:00 AM:** 11.72 MB relayed (0.32% cached)  
  This immense, purely dynamic throughput is consistent with complex N-of-M multisig rounds fully leveraging the new `PARTICIPANTS_UPDATE` synchronization mechanism to preserve witness audit logs. Despite moving ~35 MB of ephemeral data in just three hours, the server successfully maintained its 0KB database footprint.

> **Static Asset Rollout (The Vending Machine)** At **9:00 PM**, a prominent event generated **23.69 MB** of throughput with a **97.88% cache ratio**. This clearly maps to the v1.7.0 PWA cache-busting rollout, smoothly distributing the new "Signing Room®" trademarked assets via Cloudflare's Edge without invoking or straining the core Worker logic.

### Audit Verdict

**Passed.** The v1.7.0 deployment gracefully handled heavy WebSocket payload routing and seamless static binary distribution simultaneously, confirming absolute production-readiness out of Beta.

---

### 📂 ./2026-04-15_audit/

#### 🔍 Daily Snapshot: April 15, 2026 (Last 24 Hours)

This snapshot captures the transition to high-density coordination ceremonies and the v2.0.0 UI deployment.

| Category       | Metric                | Value     | Forensic Conclusion                                                       |
| :------------- | :-------------------- | :-------- | :------------------------------------------------------------------------ |
| **Throughput** | Total Data Served     | 113.31 MB | High-traffic day driven by dynamic coordination.                          |
| **Traffic**    | Total Requests        | 2,336     | Includes v2.0.0 asset fetches and sync tests.                             |
| **Relay**      | Peak Dynamic Event    | 11.64 MB  | **0% Cache Utilization.** Pure RAM-only relay.                            |
| **Frontend**   | Static Asset Ratio    | 62.33%    | Efficient Edge delivery of v2.0.0 UI assets.                              |
| **Visitors**   | Unique Hourly Visits  | 512       | Consistent engagement across multiple time zones.                         |
| **Visitors**   | Unique Visitors (30d) | **2,010** | Consistent engagement; daily log sums suggest high repeat usage per user. |

---

### Forensic Notes

> **The "Stateless Vacuum" (8:00 PM Stress Test)** > At **8:00 PM**, the relay processed **11.64 MB** of transaction metadata in a single hour with **0 bytes cached**. This is the definitive proof of the "Mist" model: a massive payload moved entirely through volatile RAM. No state was written to disk, ensuring that once the session ended, the server's memory was purged of all sensitive coordination data.

> **High-Frequency Automated Probe (5:00 AM)** > At **5:00 AM**, the system absorbed **1,314 requests** with a near-zero cache ratio (0.03%). This identifies an automated protocol-level probe or high-frequency synchronization test. The stateless Worker architecture handled the burst without scaling latency or requiring database lookups.

> **v2.0.0 Static Rollout Verification (1:00 PM)**
> At **1:00 PM**, the architecture served **25.36 MB** with a **96.35% cache ratio**. This confirms that the "Vending Machine" (Cloudflare Edge) is successfully distributed the new v2.0.0 UI assets, offloading the load from the core Worker logic.

### Audit Verdict

**Passed.** The April 15th audit confirms that SigningRoom.io remains a strictly stateless environment. Even under localized stress (11.64 MB dynamic relay), the system maintains a 0 KB database footprint, proving that metadata is treated as a transient resource, not a persistent asset.

---

### 📂 ./2026-05-01_audit/

| Metric                    | Value             | Forensic Implication                                                                                         |
| ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| **Audit Date**            | **May 1, 2026**   | Point-in-time snapshot of the v2.1.0 relay infrastructure in production.                                     |
| **Total Requests (24h)**  | 2,390             | Baseline daily interaction frequency.                                                                        |
| **Data Served (24h)**     | 469.45 MB         | Indicates heavy, real-time payload broadcasting via WebSockets.                                              |
| **Cached Data (24h)**     | 297.93 MB (63.4%) | Extremely high cache efficiency; the majority of static load is successfully offloaded from the core Worker. |
| **Peak Cache Ratio**      | 98.8%             | Confirms successful global CDN propagation during localized traffic spikes.                                  |
| **Total Requests (30d)**  | 48,241            | Sustained institutional and community adoption.                                                              |
| **Total Data (30d)**      | 2.94 GB           | Massive coordination throughput handled without bottlenecking.                                               |
| **Unique Visitors (30d)** | 3,866             | Consistent engagement; proves the relay is acting as a highly utilized public good.                          |

### Forensic Notes

> **The "Vending Machine" Spike (5:00 AM Stress Test)** > At **5:00 AM**, the relay absorbed a sudden spike in traffic, achieving a **98.8% cache hit rate**. This is the definitive proof of the "Vending Machine" model: Cloudflare's Edge network successfully caught the incoming requests and served the coordination payloads directly from RAM in data centers closest to the users. The core Durable Object remained completely shielded from the burst.

> **Sustained Gigabyte Throughput (30-Day Analysis)** > Over the last 30 days, the v2.1.0 architecture routed **2.94 GB** of data across **48,241 requests**. Despite this massive bandwidth, the system maintained an average cache hit rate of 38.44%, serving over **1.52 GB** directly from the edge. This identifies a highly efficient, production-ready routing layer capable of handling enterprise-grade multisig coordination without escalating compute costs.

### Audit Verdict

**Passed.** The May 1st audit confirms that SigningRoom.io's v2.1.0 infrastructure is incredibly resilient. The massive edge-caching metrics prove that the relay infrastructure is scaling flawlessly as a high-speed, zero-latency public good for the community.

### [2026-05-16] Optical Air-Gapped Release & 30-Day Performance Audit

| Metric                    | Value   | Impact                                                                                         |
| :------------------------ | :------ | :--------------------------------------------------------------------------------------------- |
| **Total Requests (30d)**  | 78,806  | Massive surge in institutional and community adoption following the v2.3.0 release.            |
| **Total Data (30d)**      | 3.19 GB | High-volume coordination throughput handled flawlessly.                                        |
| **Unique Visitors (30d)** | 4,311   | Sustained and growing engagement; proves the relay is acting as a highly utilized public good. |

### Forensic Notes

> **The Fountain Code Traffic Surge (24-Hour Analysis)**
> Following the v2.3.0 optical scanner release, the relay absorbed a massive localized request spike at **10:00 AM (1,337 requests)**. Shortly after, at **2:00 PM**, the edge caching network demonstrated a staggering **92.59% cache hit rate**, efficiently serving 26.1 MB of coordination data in a single hour. Cloudflare's Edge network successfully caught the incoming payloads, shielding the Durable Object completely.

> **Zero-Latency Live Ceremonies (0% Cache Analysis)**
> A key indicator of real-time architectural success is the system's ability to bypass the cache during deeply synchronous, live-mutating signing ceremonies. The 24-hour logs reveal intense coordination spikes at **1:00 PM (160 requests)** and **10:00 PM (11.1 MB transferred)** that registered a **0% cache hit rate**. This confirms the CDN is correctly identifying highly-dynamic WebSocket and API state modifications, routing them instantaneously to the core Durable Object to guarantee absolute zero-latency synchronization for connected peers.

> **Sustained Gigabyte Throughput (30-Day Analysis)**
> Over the last 30 days, the architecture routed **3.19 GB** of data across **78,806 requests**. Despite this incredible volume, the system maintained a robust average cache hit rate of **51.36%**, serving over **1.64 GB** directly from the edge. Peak daily efficiency hit an impressive **81%** on May 13th. This confirms the infrastructure is fully capable of handling enterprise-grade multisig coordination without escalating compute costs.

### Audit Verdict

**Passed.** The system processed record-breaking bandwidth (3.19 GB) while simultaneously proving its dynamic routing intelligence. It achieved blistering >92% edge-cache efficiency during traffic surges, while flawlessly executing 0% cache pass-throughs during live, low-latency signing ceremonies. The infrastructure is scaling flawlessly.

### [2026-06-05] v2.3.x Optical & Address Parity Validation

| Metric                    | Value   | Impact                                                                                       |
| :------------------------ | :------ | :------------------------------------------------------------------------------------------- |
| **Total Requests (30d)**  | 85,650  | Continued surge in adoption following the v2.3.0 optical and v2.3.1 address parity releases. |
| **Total Data (30d)**      | 4.45 GB | Unprecedented coordination throughput demonstrating enterprise scale.                        |
| **Unique Visitors (30d)** | 5,979   | Deeply sustained engagement; proves the relay is acting as a highly utilized public good.    |

### Forensic Notes

> **The Hardware Wallet Traffic Surge (24-Hour Analysis)**
> Following the rollout of v2.3.1 (Universal Address Type Parity) and the v2.3.0 Omni-Decoder, the relay absorbed a request spike at **1:00 AM (344 requests)**. Later, at **10:00 PM**, the edge caching network demonstrated a staggering **98.54% cache hit rate**, efficiently serving the updated cryptographic parsing engine (`@scure/btc-signer`) and application shell from the edge. Cloudflare's Edge network successfully caught the incoming payloads, shielding the Durable Object completely.

> **Zero-Latency Live Ceremonies (0% Cache Analysis)**
> A key indicator of real-time architectural success is the system's ability to bypass the cache during deeply synchronous, live-mutating signing ceremonies. The 24-hour logs reveal intense coordination spikes at **2:00 PM** that registered a **0% cache hit rate**. This confirms the CDN is correctly identifying highly-dynamic WebSocket and API state modifications, routing them instantaneously to the core Durable Object to guarantee absolute zero-latency synchronization for connected peers scanning air-gapped fountain codes.

> **Sustained Multi-Gigabyte Throughput (30-Day Analysis)**
> Over the last 30 days, the architecture routed **4.45 GB** of data across **85,650 requests**. Despite this incredible volume, the system maintained a robust average cache hit rate of **50.18%**, serving over **2.59 GB** directly from the edge. Peak daily efficiency hit an impressive **81%** on May 13th. This confirms the infrastructure is fully capable of handling enterprise-grade multisig coordination (including heavy Base32/Zlib BBQr payloads and Taproot addresses) without escalating compute costs.

### Audit Verdict

**Passed.** The system processed record-breaking bandwidth (4.45 GB) while simultaneously proving its dynamic routing intelligence. It achieved blistering >98% edge-cache efficiency during traffic surges, while flawlessly executing 0% cache pass-throughs during live, low-latency signing ceremonies using complex hardware wallet setups.

### 📂 ./2026-06-21_audit/

#### 🔍 Daily Snapshot: June 21, 2026 (Last 24 Hours)

| Category       | Metric               | Value     | Forensic Conclusion                                                                                                                            |
| :------------- | :------------------- | :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| **Traffic**    | Total Requests       | 3,063     | High-frequency interaction.                                                                                                                    |
| **Throughput** | Total Data Served    | 114.45 MB | Daily baseline for coordination.                                                                                                               |
| **Relay**      | Peak Dynamic Event   | 1.83 MB   | **0.00% Cache Utilization at 2:00 PM.** Pure RAM-only relay validating the stateless vacuum architecture during a deeply synchronous ceremony. |
| **Frontend**   | Static Asset Ratio   | 84.30%    | Massive edge offload efficiency.                                                                                                               |
| **Visitors**   | Unique Hourly Visits | 758       | Aggregated hourly footprint.                                                                                                                   |

#### 🔍 7-Day & 30-Day Aggregates

| Metric                | 7-Day Value | 30-Day Value | Forensic Implication                                                          |
| :-------------------- | :---------- | :----------- | :---------------------------------------------------------------------------- |
| **Total Requests**    | 22,139      | 79,516       | Sustained adoption and high-density API polling.                              |
| **Total Data Served** | 0.78 GB     | 4.89 GB      | Massive coordination throughput handled without bottlenecking.                |
| **Edge Cached Data**  | 0.42 GB     | 2.99 GB      | Global CDN successfully offloading the static application shell.              |
| **Cache Ratio (Avg)** | 54.61%      | 61.02%       | Healthy equilibrium between dynamic real-time relays and static distribution. |
| **Unique Visitors**   | 1,330       | 5,953        | Proves the relay is acting as a highly utilized public good.                  |

### Forensic Notes

> **The "Vending Machine" Spike (24-Hour Analysis)**
> At **8:00 AM**, the relay absorbed a sudden spike in traffic, achieving a **97.97% cache hit rate** and serving over 36 MB of data. This is definitive proof of the "Vending Machine" model in action, with Cloudflare's Edge network successfully catching incoming requests and serving payloads without engaging the core Worker.

> **Zero-Latency Live Ceremonies (24-Hour Analysis)**
> The system demonstrated its ability to bypass the cache during deeply synchronous, live-mutating signing ceremonies. At **2:00 PM**, an intense coordination spike generated 1,353 rapid requests with a **0.00% cache hit rate**. This confirms the CDN correctly routes highly dynamic WebSocket state modifications instantaneously to the core Durable Object to guarantee absolute zero-latency synchronization.

> **Sustained Multi-Gigabyte Throughput (30-Day Analysis)**
> Over the last 30 days, the architecture routed **4.89 GB** of data across **79,516 requests**. Despite this massive volume, the system maintained a robust average cache hit rate of **61.02%**, serving nearly **3 GB** directly from the edge. This confirms the infrastructure is fully capable of handling enterprise-grade multisig coordination without escalating compute costs.

### Audit Verdict

**Passed.** The system processed multi-gigabyte bandwidth (4.89 GB) while simultaneously proving its dynamic routing intelligence. It achieved blistering >97% edge-cache efficiency during traffic surges, while flawlessly executing 0% cache pass-throughs during live, low-latency signing ceremonies.

### 📂 ./2026-07-13_audit/

#### 🔍 Daily Snapshot: July 13, 2026 (Last 24 Hours)

| Category       | Metric            | Value    | Forensic Conclusion                |
| :------------- | :---------------- | :------- | :--------------------------------- |
| **Traffic**    | Total Requests    | 1,080    | Normal daily operating volume.     |
| **Throughput** | Total Data Served | 21.30 MB | Efficient coordination throughput. |
| **Visitors**   | Unique Visitors   | 513      | Strong daily engagement.           |

#### 🔍 30-Day Aggregates (Ending July 13, 2026)

| Metric                      | 30-Day Value | Forensic Implication                                                                                        |
| :-------------------------- | :----------- | :---------------------------------------------------------------------------------------------------------- |
| **Total Requests (30d)**    | 88,057       | Robust and scaling interaction frequency.                                                                   |
| **Total Data Served (30d)** | 3.58 GB      | Significant coordination throughput handled without state persistence.                                      |
| **Total Cached Data (30d)** | 1.76 GB      | High-efficiency edge offloading.                                                                            |
| **Cache Ratio (Avg 30d)**   | 49.06%       | Healthy Equilibrium: A balanced ratio confirming both static PWA delivery and active WebSocket relay usage. |
| **Unique Visitors (30d)**   | 5,803        | Continued growth in community adoption.                                                                     |

### Forensic Notes

> **Stateless Verification (30-Day Analysis)**
> Over the last 30 days, the architecture routed 3.58 GB of data across 88,057 requests. Despite this volume, the system maintained a 0KB database footprint, definitively validating the "Stateless Vacuum" architecture at scale. All transaction metadata was processed in volatile RAM and purged upon session termination, ensuring no sensitive data retention.

> **Edge Caching Efficiency**
> During the 30-day period, 1.76 GB (49.06%) of traffic was served directly from the edge cache. This demonstrates that our global CDN architecture is effectively shielding the core Worker logic from static asset delivery, reserving server-side compute resources purely for low-latency multisig coordination.

### Audit Verdict

**Passed.** The July 13th audit confirms that SigningRoom.io continues to scale as a performant public good. The infrastructure processes significant bandwidth while maintaining strict architectural statelessness, validating the core promise of ephemeral, zero-knowledge coordination.

### 📂 ./2026-07-30_audit/

#### 🔍 Daily Snapshot: July 30, 2026 (Last 24 Hours)

| Category       | Metric               | Value     | Forensic Conclusion                                                              |
| :------------- | :------------------- | :-------- | :------------------------------------------------------------------------------- |
| **Traffic**    | Total Requests       | 3,935     | Elevated interaction volume across the full day.                                 |
| **Throughput** | Total Data Served    | 188.97 MB | Strong daily coordination weight.                                                |
| **Relay**      | Peak Dynamic Event   | 31.06 MB  | **~0.26% Cache at 9:00 AM.** Pure RAM-only vacuum relay of high-density payload. |
| **Frontend**   | Static Asset Ratio   | 26.10%    | Dynamic-heavy day; edge still efficiently handled major static bursts.           |
| **Visitors**   | Unique Hourly Visits | 901       | Aggregated hourly footprint showing sustained multi-timezone engagement.         |

#### 🔍 7-Day & 30-Day Aggregates

| Metric                | 7-Day Value | 30-Day Value | Forensic Implication                                                     |
| :-------------------- | :---------- | :----------- | :----------------------------------------------------------------------- |
| **Total Requests**    | 27,491      | 82,364       | Sustained high-frequency usage and institutional-grade polling.          |
| **Total Data Served** | 0.81 GB     | 3.36 GB      | Significant coordination throughput handled without bottlenecking.       |
| **Edge Cached Data**  | 0.25 GB     | 1.37 GB      | Global CDN continuing to offload the static application shell.           |
| **Cache Ratio (Avg)** | 31.32%      | 40.88%       | Healthy equilibrium biased toward active WebSocket relays (Vacuum mode). |
| **Unique Visitors**   | 2,216       | 8,785        | Confirms the relay remains a highly utilized public good.                |

### Forensic Notes

> **The "Stateless Vacuum" Peak (9:00 AM)**  
> At **9:00 AM** the relay moved **31.14 MB** of data with only **0.26%** cache utilization (~31.06 MB purely uncached). This is a textbook high-density coordination signature: ephemeral transaction metadata streamed entirely through volatile RAM and destroyed on session close. Zero disk persistence was maintained.

> **Secondary Vacuum Events**  
> Additional near-zero-cache high-bandwidth windows occurred at **8:00 AM** (~16.38 MB uncached) and **10:00–11:00 AM** (combined ~29.3 MB uncached). These reinforce the architecture’s ability to sustain multiple concurrent live ceremonies without state accumulation.

> **Vending Machine Confirmation**  
> At **1:00 PM** the edge delivered **26.45 MB** at **92.04%** cache hit rate, and at **4:00 PM** **12.32 MB** at **97.68%**. These spikes map cleanly to static PWA / shell asset distribution, fully offloaded from the Durable Object.

> **High-Frequency Dynamic Window**  
> **2:00 PM** produced the day’s highest request count (**835**) at essentially **0%** cache. This pattern is consistent with rapid WebSocket polling / synchronization rounds rather than static asset fetches.

> **30-Day Stateless Verification**  
> Across the full window the system routed **3.36 GB** of data over **82,364** requests while the database footprint remained **0 KB**. Average edge cache ratio of **40.88%** demonstrates continued healthy balance between static delivery and live relay traffic.

### Audit Verdict

**Passed.** The July 30th snapshot confirms that SigningRoom.io continues to operate as a strictly stateless, high-throughput public good. Multi-megabyte vacuum events, efficient edge offload of static assets, and sustained multi-gigabyte monthly throughput were all handled with zero persistent storage, validating the core architectural claims at current production scale.
