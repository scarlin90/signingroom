const fs = require('fs');
const https = require('https');
const path = require('path');

// CORRECT PATH: Relative to the 'tools' folder where this script lives
// This places the file at: <repo-root>/apps/client/public/security.txt
const CANARY_PATH = path.join(__dirname, '../apps/client/public/security.txt');

// 1. Fetch latest Bitcoin Block
https.get('https://blockchain.info/q/latesthash', (resp) => {
  let data = '';
  resp.on('data', (chunk) => data += chunk);
  resp.on('end', () => {
    const blockHash = data.trim();
    createCanary(blockHash);
  });
}).on("error", (err) => {
  console.log("Error fetching block: " + err.message);
});

function createCanary(blockHash) {
  const date = new Date().toISOString().split('T')[0];
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30); // Valid for 30 days

  const content = `-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

SigningRoom.io Warrant Canary
Date: ${date}

I, the administrator of SigningRoom.io, represent that:

1. I have NOT received any National Security Letters.
2. I have NOT received any FISA court orders.
3. I have NOT received any gag orders preventing me from stating that I have received legal process.
4. I have NOT been forced to modify the system code to introduce backdoors.

To prove this message was generated recently, here is the latest Bitcoin block hash:
Block Hash: ${blockHash}

This statement is valid until: ${expiry.toISOString().split('T')[0]}

If this file is not updated by the expiry date, or if the PGP signature is invalid, please assume the service has been compromised or seized.

-----BEGIN PGP SIGNATURE-----
[ PASTE YOUR PGP SIGNATURE HERE IF YOU HAVE ONE ]
-----END PGP SIGNATURE-----
`;

  // Ensure directory exists (safe for CI/CD)
  const dir = path.dirname(CANARY_PATH);
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(CANARY_PATH, content);
  
  console.log(`\n✅ Canary generated at:`);
  console.log(`   ${CANARY_PATH}`);
  console.log(`\nℹ️  Latest Block: ${blockHash}`);
  console.log(`⚠️  ACTION REQUIRED: Sign this file with GPG if you have a key, then deploy.\n`);
}