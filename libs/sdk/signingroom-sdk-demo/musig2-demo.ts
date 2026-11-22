import { SigningRoomClient } from '@signing-room/sdk';
import { take } from 'rxjs';
import readline from 'readline';

// --- CONFIGURATION ---
const API_URL = 'http://localhost:8080';
const UI_APP_URL = 'http://localhost:8080';

const UNSIGNED_PSBT = 'cHNidP8BAF4CAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAD/////ARhzAQAAAAAAIlEgQYxGY22eGmg/WONbQjNud2/cw7LU4556C/GrBxbjxfoAAAAAAAEBK6CGAQAAAAAAIlEgq+k3TmDkUY/7xhmw3L2OVqWKJT3NKv7R+N6wlODGguwhFnm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeYGQARIjNEVgAAgAEAAIAAAACAAAAAAAAAAAAhFsYEf5RB7X1tMEVAbpXAfNhcd45LjO88p6usCblccJ7lGQBVZneIVgAAgAEAAIAAAACAAAAAAAAAAAABFyA7RtJi0vYQ6QOLRL6r3+l6taD+uJhwrMImTt+39j7C7CIaAjtG0mLS9hDpA4tEvqvf6Xq1oP64mHCswiZO37f2PsLsQgJ5vmZ++dy7rFWgYpXOhwsHApv82y3OKNlZ8oFbFvgXmALGBH+UQe19bTBFQG6VwHzYXHeOS4zvPKerrAm5XHCe5QAA';
const SIGNER1_NONCE_PSBT = 'cHNidP8BAF4CAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAD/////ARhzAQAAAAAAIlEgQYxGY22eGmg/WONbQjNud2/cw7LU4556C/GrBxbjxfoAAAAAAAEBK6CGAQAAAAAAIlEgq+k3TmDkUY/7xhmw3L2OVqWKJT3NKv7R+N6wlODGguwhFnm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeYGQARIjNEVgAAgAEAAIAAAACAAAAAAAAAAAAhFsYEf5RB7X1tMEVAbpXAfNhcd45LjO88p6usCblccJ7lGQBVZneIVgAAgAEAAIAAAACAAAAAAAAAAAABFyA7RtJi0vYQ6QOLRL6r3+l6taD+uJhwrMImTt+39j7C7CIaAjtG0mLS9hDpA4tEvqvf6Xq1oP64mHCswiZO37f2PsLsQgJ5vmZ++dy7rFWgYpXOhwsHApv82y3OKNlZ8oFbFvgXmALGBH+UQe19bTBFQG6VwHzYXHeOS4zvPKerrAm5XHCe5UMbAnm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeYAjtG0mLS9hDpA4tEvqvf6Xq1oP64mHCswiZO37f2PsLsQgIZd+p/hl0vUx+cv2pCwatgxU3J13OG/+zLYSyQJFdORgKDP6Fy2Bz5CTup5J9uT4/glVO+sOHzjXOHVeNd2c/P2AAA';
const SIGNER2_NONCE_PSBT = 'cHNidP8BAF4CAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAD/////ARhzAQAAAAAAIlEgQYxGY22eGmg/WONbQjNud2/cw7LU4556C/GrBxbjxfoAAAAAAAEBK6CGAQAAAAAAIlEgq+k3TmDkUY/7xhmw3L2OVqWKJT3NKv7R+N6wlODGguwhFnm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeYGQARIjNEVgAAgAEAAIAAAACAAAAAAAAAAAAhFsYEf5RB7X1tMEVAbpXAfNhcd45LjO88p6usCblccJ7lGQBVZneIVgAAgAEAAIAAAACAAAAAAAAAAAABFyA7RtJi0vYQ6QOLRL6r3+l6taD+uJhwrMImTt+39j7C7CIaAjtG0mLS9hDpA4tEvqvf6Xq1oP64mHCswiZO37f2PsLsQgJ5vmZ++dy7rFWgYpXOhwsHApv82y3OKNlZ8oFbFvgXmALGBH+UQe19bTBFQG6VwHzYXHeOS4zvPKerrAm5XHCe5UMbAsYEf5RB7X1tMEVAbpXAfNhcd45LjO88p6usCblccJ7lAjtG0mLS9hDpA4tEvqvf6Xq1oP64mHCswiZO37f2PsLsQgMYSJB7811lwL3aHIVur7NFOaigcL7L1uj9GHdGVIXVIgPHJfbUAlpMd3xmpWrNbs49A0e+2+IzhRWr9eMtK8zzRQAA';
const SIGNER1_PARTIAL_PSBT = 'cHNidP8BAF4CAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAD/////ARhzAQAAAAAAIlEgQYxGY22eGmg/WONbQjNud2/cw7LU4556C/GrBxbjxfoAAAAAAAEBK6CGAQAAAAAAIlEgq+k3TmDkUY/7xhmw3L2OVqWKJT3NKv7R+N6wlODGguwhFnm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeYGQARIjNEVgAAgAEAAIAAAACAAAAAAAAAAAAhFsYEf5RB7X1tMEVAbpXAfNhcd45LjO88p6usCblccJ7lGQBVZneIVgAAgAEAAIAAAACAAAAAAAAAAAABFyA7RtJi0vYQ6QOLRL6r3+l6taD+uJhwrMImTt+39j7C7CIaAjtG0mLS9hDpA4tEvqvf6Xq1oP64mHCswiZO37f2PsLsQgJ5vmZ++dy7rFWgYpXOhwsHApv82y3OKNlZ8oFbFvgXmALGBH+UQe19bTBFQG6VwHzYXHeOS4zvPKerrAm5XHCe5UMcAnm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeYAjtG0mLS9hDpA4tEvqvf6Xq1oP64mHCswiZO37f2PsLsIMIGLracIfX7IrK8TmmibWwrSnSrYh4cgQgtC21B6E2zAAA=';
const SIGNER2_PARTIAL_PSBT = 'cHNidP8BAF4CAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAD/////ARhzAQAAAAAAIlEgQYxGY22eGmg/WONbQjNud2/cw7LU4556C/GrBxbjxfoAAAAAAAEBK6CGAQAAAAAAIlEgq+k3TmDkUY/7xhmw3L2OVqWKJT3NKv7R+N6wlODGguwhFnm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeYGQARIjNEVgAAgAEAAIAAAACAAAAAAAAAAAAhFsYEf5RB7X1tMEVAbpXAfNhcd45LjO88p6usCblccJ7lGQBVZneIVgAAgAEAAIAAAACAAAAAAAAAAAABFyA7RtJi0vYQ6QOLRL6r3+l6taD+uJhwrMImTt+39j7C7CIaAjtG0mLS9hDpA4tEvqvf6Xq1oP64mHCswiZO37f2PsLsQgJ5vmZ++dy7rFWgYpXOhwsHApv82y3OKNlZ8oFbFvgXmALGBH+UQe19bTBFQG6VwHzYXHeOS4zvPKerrAm5XHCe5UMcAsYEf5RB7X1tMEVAbpXAfNhcd45LjO88p6usCblccJ7lAjtG0mLS9hDpA4tEvqvf6Xq1oP64mHCswiZO37f2PsLsIIX8p8Sdtjv1H1XIA4/Sx6azuuYxhaXbv2ctJTpL/6upAAA=';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- INTERACTIVE HELPER ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const wait = (stepName: string): Promise<void> => {
  return new Promise((resolve) => {
    rl.question(`\n[ Press ENTER to execute: ${stepName} ] > `, () => {
      resolve();
    });
  });
};

const printHeader = (title: string) => {
  console.log('\n=========================================================');
  console.log(` ${title.toUpperCase()}`);
  console.log('=========================================================');
};

async function runMuSig2Demo() {
  console.clear();
  printHeader('Signing Room SDK - MuSig2 (BIP-327 / BIP-373) 2-Round Demo');
  console.log(`Target Relayer API: ${API_URL}`);

  // ==========================================
  // SECTION 1: Initialization & MuSig2 Room Creation
  // ==========================================
  await wait('1. Initialization & MuSig2 Room Creation (Coordinator)');
  printHeader('Phase 1: MuSig2 Room Creation (Setup Phase)');

  const COMMUNITY_TOKEN =
    'srl_0DGPSeBK6w99XjmrwvdFBbfIC6XH-_czfymlxEgguusg5mb9tpEmNfuPBZdNSittYGuQiei1jvD67XKdxUYuVkdCgQEBAwAAAAAAAAAAAAAAAaFTwDzFASoeU2lnbmluZyBSb29tIENvbW11bml0eSBFZGl0aW9uAAAA';

  const coordinatorClient = new SigningRoomClient({
    apiUrl: API_URL,
    licenseToken: COMMUNITY_TOKEN,
  });

  // The SDK automatically detects BIP-373 MuSig2 fields during room creation
  const detectedProtocol = coordinatorClient.detectProtocol(UNSIGNED_PSBT);
  console.log(`-> SDK Auto-detected PSBT Protocol: ${detectedProtocol.toUpperCase()}`);

  const roomInfo = await coordinatorClient.createRoomAndJoin(
    UNSIGNED_PSBT,
    'signet',
    'MuSig2 Taproot Vault (2-of-2)',
  );

  console.log('Room ID:              ', roomInfo.roomId);
  console.log('Encryption Key:       ', roomInfo.encryptionKey);
  console.log('Encrypted Admin Token:', roomInfo.encryptedAdminToken);

  console.log('\n-> Updating Room Metadata...');
  await coordinatorClient.setRoomName('Q1 MuSig2 Keypath Settlement');
  await coordinatorClient.setDisplayName('Coordinator (Bob)');
  console.log('-> Metadata applied successfully.');

  // ==========================================
  // SECTION 1.5: Generate RBAC Constraints
  // ==========================================
  console.log('\n-> Generating Zero-Trust RBAC Role Links...');
  await sleep(1500);

  const signerRole = await coordinatorClient.generateAndRegisterRole({
    canUploadSignature: true,
    canExportPsbt: true,
    canExportAudit: false,
    canViewDetails: true,
    canViewSigners: true,
    canShareSession: false,
  });
  console.log(`   [Generated] Standard Signer Role`);

  const fullAccessRole = await coordinatorClient.generateAndRegisterRole({
    canUploadSignature: true,
    canExportPsbt: true,
    canExportAudit: true,
    canViewDetails: true,
    canViewSigners: true,
    canShareSession: true,
  });
  console.log(`   [Generated] Full Access Role`);

  printHeader('Ready to Watch Live in Browser');
  console.log(`Open this Full Access link in your browser to watch the 2-step MuSig2 ceremony live:`);
  console.log(`-> ${coordinatorClient.getRoomLink(UI_APP_URL, true, fullAccessRole)}\n`);

  // ==========================================
  // SECTION 2: Guest Join & Device Labelling
  // ==========================================
  await wait('2. Guest Join (Signer 1 & Signer 2) + Device & Address Labelling');
  printHeader('Phase 2: Participant Entry & OpSec Labelling');

  const signer1Client = new SigningRoomClient({ apiUrl: API_URL });
  await signer1Client.joinRoom(roomInfo.roomId, roomInfo.encryptionKey, signerRole);
  await signer1Client.setDisplayName('Signer 1 (Coldcard Q)');
  console.log('-> Signer 1 joined the room.');

  const signer2Client = new SigningRoomClient({ apiUrl: API_URL });
  await signer2Client.joinRoom(roomInfo.roomId, roomInfo.encryptionKey, signerRole);
  await signer2Client.setDisplayName('Signer 2 (Alice Ledger)');
  console.log('-> Signer 2 joined the room.');

  // Extract fingerprints and label devices prior to Round 1
  const fp1 = coordinatorClient.extractFingerprintFromSignature(SIGNER1_NONCE_PSBT);
  const fp2 = coordinatorClient.extractFingerprintFromSignature(SIGNER2_NONCE_PSBT);

  if (fp1) {
    console.log(`-> Labelling Signer 1 Device [${fp1}] as 'Coldcard Q'`);
    await coordinatorClient.setSignerLabel(fp1, 'Coldcard Q');
  }
  if (fp2) {
    console.log(`-> Labelling Signer 2 Device [${fp2}] as 'Alice Ledger'`);
    await coordinatorClient.setSignerLabel(fp2, 'Alice Ledger');
  }

  // Dynamically whitelist and label the input and output addresses from the PSBT
  const txDetails = coordinatorClient.getTxDetails(coordinatorClient.getRoomState());
  const inputAddress = txDetails?.inputsList?.[0]?.address;
  const outputAddress = txDetails?.outputs?.[0]?.address;

  if (inputAddress) {
    console.log(`-> Whitelisting & Labelling Input (...${inputAddress.slice(-8)}) as 'MuSig2 Cold Vault'`);
    await coordinatorClient.updateWhitelist([inputAddress]);
    await coordinatorClient.setAddressLabel(inputAddress, 'MuSig2 Cold Vault');
  }

  if (outputAddress) {
    console.log(`-> Whitelisting & Labelling Output (...${outputAddress.slice(-8)}) as 'Teco Corp Treasury'`);
    await coordinatorClient.updateWhitelist([outputAddress]);
    await coordinatorClient.setAddressLabel(outputAddress, 'Teco Corp Treasury');
  }

  // ==========================================
  // SECTION 3: Round 1 - Public Nonce Collection (0x1b)
  // ==========================================
  await wait('3. Step 1 of 2: Collect Public Nonces (Round 1)');
  printHeader('Phase 3: Round 1 - Public Nonce Collection & Aggregation');

  coordinatorClient.onEvent('NONCE_RECEIVED' as any).subscribe((event: any) => {
    console.log(
      `\n[Round 1 Event] Public Nonce received from ${event.payload.fingerprint} (${event.payload.noncesReceived}/${event.payload.threshold})`,
    );
  });

  if (fp1) {
    console.log(`-> Signer 1 uploading Round 1 Public Nonce [FP: ${fp1}]...`);
    await signer1Client.uploadNonce(SIGNER1_NONCE_PSBT.trim(), fp1);
  }

  await sleep(800);

  if (fp2) {
    console.log(`-> Signer 2 uploading Round 1 Public Nonce [FP: ${fp2}]...`);
    await signer2Client.uploadNonce(SIGNER2_NONCE_PSBT.trim(), fp2);
  }

  console.log('\n[Round 1 Complete] All Public Nonces Collected! (2/2)');
  console.log('-> Pausing 1.8s so browser viewers can observe 2/2 Nonce Ready state...');
  await sleep(1800);

  console.log('-> Coordinator aggregating BIP-373 (0x1b) nonces & publishing Round 2 PSBT...');
  await coordinatorClient.aggregateMuSig2Nonces();
  console.log('-> Round 2 Base PSBT published! Room transitioned to GATHERING_SIGNATURES.');

  // ==========================================
  // SECTION 4: Round 2 - Partial Signature Collection (0x1c)
  // ==========================================
  await wait('4. Step 2 of 2: Collect Partial Signatures (Round 2)');
  printHeader('Phase 4: Round 2 - Partial Signature Collection');

  coordinatorClient.onEvent('SIGNATURE_RECEIVED').subscribe((event) => {
    console.log(
      `\n[Round 2 Event] Partial Signature received from ${event.payload.fingerprint} (${event.payload.signaturesReceived}/${event.payload.totalSigners})`,
    );
  });

  await new Promise<void>(async (resolve) => {
    coordinatorClient
      .onEvent('THRESHOLD_MET')
      .pipe(take(1))
      .subscribe((event) => {
        console.log(
          `\n[Round 2 Event] MuSig2 Signature Threshold Met! (${event.payload.signaturesReceived}/${event.payload.threshold})`,
        );
        resolve();
      });

    if (fp1) {
      console.log(`-> Signer 1 uploading Round 2 Partial Signature [FP: ${fp1}]...`);
      await signer1Client.uploadSignature(SIGNER1_PARTIAL_PSBT, fp1);
    }

    await sleep(800);

    if (fp2) {
      console.log(`-> Signer 2 uploading Round 2 Partial Signature [FP: ${fp2}]...`);
      await signer2Client.uploadSignature(SIGNER2_PARTIAL_PSBT, fp2);
    }
  });

  // ==========================================
  // SECTION 5: BIP-327 Schnorr Aggregation & Finalization
  // ==========================================
  await wait('5. Finalize MuSig2 Keypath Spend & Verify Forensic Seal');
  printHeader('Phase 5: BIP-327 Schnorr Aggregation & Finalization');

  const finalTx = await coordinatorClient.finalizeTransaction();
  console.log(`Finalized Taproot Keypath TX HEX: ${finalTx?.hex.slice(0, 48)}...`);
  console.log(`TXID:                             ${finalTx?.txId}`);

  console.log('\n-> Generating Forensic Audit Log...');
  const csvLog = coordinatorClient.getAuditLogCsv();
  console.log(csvLog);

  console.log('\n-> Requesting Cryptographic Integrity Seal...');
  const report = await coordinatorClient.getIntegrityReport();
  console.log(`Forensic SHA-256 Anchor: ${report.anchor}`);

  const isValid = await coordinatorClient.verifyIntegrity(report.anchor);
  console.log(`Active Integrity Result: ${isValid.isValid ? 'PASSED [Valid]' : 'FAILED [Compromised]'}`);

  // ==========================================
  // SECTION 6: Teardown & Offline Audit Verification
  // ==========================================
  await wait('6. Close Room & Run Offline Third-Party Audit');
  printHeader('Phase 6: Teardown & Offline Audit Verification');

  await coordinatorClient.closeRoom();
  signer1Client.disconnect();
  signer2Client.disconnect();
  coordinatorClient.disconnect();

  if (finalTx?.hex && csvLog && report?.anchor) {
    const offlineResult = await SigningRoomClient.verifyOfflineIntegrity(
      csvLog,
      finalTx.hex,
      report.anchor,
    );
    console.log(`Auditor Computed Anchor: ${offlineResult.anchor}`);
    console.log(`Expected Anchor:         ${report.anchor}`);
    console.log(
      `Offline Audit Result:    ${offlineResult.isValid ? 'PASSED [Cryptographically Proven]' : 'FAILED [Data Tampered]'}`,
    );
  }

  printHeader('MUSIG2 SDK LIFECYCLE WALKTHROUGH COMPLETE!');
  rl.close();
}

runMuSig2Demo().catch((err) => {
  console.error('\n[Execution Error]:', err);
  rl.close();
});