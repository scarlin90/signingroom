const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CANARY_PATH = path.join(__dirname, '../apps/client/public/security.txt');
const PUBKEY_PATH = path.join(__dirname, '../apps/client/public/pgp-key.asc');

// 1. Fetch latest Bitcoin Block
https
  .get('https://blockchain.info/q/latesthash', (resp) => {
    let data = '';
    resp.on('data', (chunk) => (data += chunk));
    resp.on('end', () => {
      const blockHash = data.trim();
      createAndSignCanary(blockHash);
    });
  })
  .on('error', (err) => {
    console.error('Error fetching block: ' + err.message);
    process.exit(1);
  });

function createAndSignCanary(blockHash) {
  const date = new Date().toISOString().split('T')[0];
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30); // Valid for 30 days
  const expiryDateStr = expiry.toISOString().split('T')[0];

  const rawStatement = `SigningRoom.io Warrant Canary
Date: ${date}

I, the administrator of SigningRoom.io (operated by Stateless Research Ltd), represent that:

1. Stateless Research Ltd has NOT received any US National Security Letters or FISA court orders.
2. Stateless Research Ltd has NOT received any UK Investigatory Powers Act 2016 notices (including Technical Capability Notices or National Security Notices under ss. 252-253) or equivalent compulsion orders.
3. Stateless Research Ltd has NOT received any gag orders or statutory non-disclosure notices preventing disclosure of legal process.
4. Stateless Research Ltd has NOT been forced to modify system code, container images, or SDK packages to introduce backdoors or weaken encryption.

To prove this message was generated recently, here is the latest Bitcoin block hash:
Block Hash: ${blockHash}

This statement is valid until: ${expiryDateStr}

If this file is not updated by the expiry date, or if the PGP signature is invalid, please assume the service has been compromised or seized.
`;

  const dir = path.dirname(CANARY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Extract the expected fingerprint directly from apps/client/public/pgp-key.asc
  let expectedFp = '';
  if (fs.existsSync(PUBKEY_PATH)) {
    const keyOut = execFileSync(
      'gpg',
      ['--with-colons', '--import-options', 'show-only', '--import', PUBKEY_PATH],
      { encoding: 'utf8' },
    );
    const fprLine = keyOut.split('\n').find((line) => line.startsWith('fpr:'));
    if (fprLine) {
      expectedFp = fprLine.split(':')[9];
    }
  }

  try {
    // Sign the statement into apps/client/public/security.txt
    const signArgs = ['--batch', '--yes', '--clearsign', '--digest-algo', 'SHA512', '--output', CANARY_PATH];
    if (expectedFp) {
      signArgs.push('--local-user', expectedFp);
    }

    execFileSync('gpg', signArgs, { input: rawStatement, stdio: ['pipe', 'inherit', 'inherit'] });

    // Verify the newly written security.txt strictly against apps/client/public/pgp-key.asc in an isolated keyring
    const tmpGpgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-canary-verify-'));
    try {
      execFileSync('gpg', ['--batch', '--import', PUBKEY_PATH], {
        env: { ...process.env, GNUPGHOME: tmpGpgHome },
        stdio: 'ignore',
      });
      execFileSync('gpg', ['--batch', '--verify', CANARY_PATH], {
        env: { ...process.env, GNUPGHOME: tmpGpgHome },
        stdio: 'inherit',
      });
    } finally {
      fs.rmSync(tmpGpgHome, { recursive: true, force: true });
    }

    console.log(`\n✅ Canary signed and verified in isolated keyring against published key (${expectedFp || 'default'}):`);
    console.log(`   ${CANARY_PATH}`);
    console.log(`ℹ️  Latest Block: ${blockHash}`);
    console.log(`ℹ️  Valid Until:  ${expiryDateStr}\n`);
  } catch (err) {
    // Fallback: write unsigned template if GPG secret key is unavailable
    fs.writeFileSync(CANARY_PATH, rawStatement);
    console.warn(`\n⚠️  Could not auto-sign with key ${expectedFp}. Wrote raw statement to:`);
    console.warn(`   ${CANARY_PATH}`);
    console.warn(`   Sign manually with: gpg --clearsign --local-user ${expectedFp} ${CANARY_PATH}\n`);
  }
}