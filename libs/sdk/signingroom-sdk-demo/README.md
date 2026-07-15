# signingroom-sdk-demo

A Typescript demo application showing use of the signing room sdk

## Prerequisites

Run the Web UI - From Project Root - In Terminal 1:

```bash
cd ../../../

npm install

npx nx run client:serve --configuration=development

// loads
> nx run client:serve:development

> Building...
√ Building...
Browser bundles
Initial chunk files  | Names            |  Raw size
main.js              | main             | 110.25 kB |
styles.css           | styles           |  96.37 kB |
chunk-QPVKHORU.js    | -                |   1.81 kB |
polyfills.js         | polyfills        |  95 bytes |
                     | Initial total    | 208.53 kB
Lazy chunk files     | Names            |  Raw size
chunk-453BXOSS.js    | room-component   | 341.16 kB |
chunk-NLOEP5U2.js    | -                | 117.56 kB |
chunk-JHG2OBFL.js    | create-component | 104.80 kB |
Server bundles
Initial chunk files  | Names            |  Raw size
main.server.mjs      | main.server      | 111.65 kB |
chunk-3ODA65P6.mjs   | -                |   1.67 kB |
server.mjs           | server           |   1.09 kB |
polyfills.server.mjs | polyfills.server | 291 bytes |
Lazy chunk files     | Names            |  Raw size
chunk-C2VNF2TH.mjs   | room-component   | 341.20 kB |
chunk-7O65ZXRG.mjs   | -                | 117.83 kB |
chunk-PFZU2CAL.mjs   | create-component | 104.84 kB |
Application bundle generation complete. [5.294 seconds] - 2026-07-14T14:53:39.201Z

Watch mode enabled. Watching for file changes...
NOTE: Raw file sizes do not reflect development server per-request transformations.
  ➜  Local:   http://localhost:4200/
  ➜  press h + enter to show help
```

Run the Relay API - In Terminal 2:

```bash
cd ../../../apps/worker

npx wrangler dev

// loads
 ⛅️ wrangler 4.105.0
────────────────────
Using secrets defined in .dev.vars
Your Worker has access to the following bindings:
Binding                                   Resource                  Mode
env.SIGNING_ROOM (SigningRoom)            Durable Object            local
env.RATE_LIMITER (60 requests/60s)        Rate Limit                local
env.ALLOWED_ORIGIN ("(hidden)")           Environment Variable      local
env.API_PUBLIC_URL ("(hidden)")           Environment Variable      local
env.ENVIRONMENT ("(hidden)")              Environment Variable      local
env.LNBITS_URL ("(hidden)")               Environment Variable      local
env.LNBITS_KEY ("(hidden)")               Environment Variable      local

❓ Your types might be out of date. Re-run `wrangler types` to ensure your types are correct.
╭───────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│  [b] open a browser [d] open devtools [e] open local explorer [t] start tunnel [c] clear console [x] to exit  │
╰───────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
⎔ Starting local server...
[wrangler:info] Ready on http://127.0.0.1:8787

```

## Quick Start & Installation

Run the console app - In Terminal 3:

```bash
npm install
npm start

// loads
=========================================================
 SIGNING ROOM SDK - PROGRAMMATIC INTEGRATION DEMO
=========================================================
Target Relayer API: http://localhost:8787

[ Press ENTER to execute: 1. Initialization & Room Creation (Coordinator) ] >
```

---

## 🏢 Enterprise & Commercial Licensing

[SigningRoom.io](https://signingroom.io/) is fully open-source under the **AGPLv3 License**.

- **Community Use**: If you modify the code and host it publicly, you must open-source your changes.
- **Commercial Use**: Institutions requiring a Commercial License (AGPL Waiver) to integrate this technology into proprietary, closed-source infrastructure (e.g., internal banking systems, custodial platforms) must contact [Stateless Research Ltd](https://statelessresearch.com/).

### 🔗 Contact Stateless Research for Licensing

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.  
If you modify this code and run it over a network, you must release your source code. See `LICENSE` for more information.
