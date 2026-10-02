import { test, expect, Browser, Page, BrowserContext } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';

// --- HELPER: Resilient Context Setup ---
// Injects a mock clipboard into the browser before any page loads to prevent 
// headless OS-level permission exceptions during multi-user simulation.
async function createSecurePage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  
  await page.addInitScript(() => {
    (window as any).__capturedClipboard = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          (window as any).__capturedClipboard = text;
          return Promise.resolve();
        },
        readText: () => Promise.resolve((window as any).__capturedClipboard)
      },
      configurable: true, 
      writable: true
    });
  });
  
  return { ctx, page };
}

/**
 * Suite: Threshold Finalization and Broadcast
 * Focuses on the end-to-end multi-user flow where participants aggregate signatures 
 * to reach the required threshold and enable the Coordinator to finalize the hex.
 */
test.describe('Threshold Finalization and Broadcast', () => {

  test('Should reach 3-5 threshold and directly finalize transaction when whitelist is unused', async ({ browser }) => {
    // --- Setup: Secure multi-context browser environment ---
    // Simulate three independent participants: Coordinator, Alice, and Bob
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: aliceCtx, page: alicePage } = await createSecurePage(browser);
    const { ctx: bobCtx, page: bobPage } = await createSecurePage(browser);
    
    // --- Interaction: Coordinator Initialization ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    // Extract the full encrypted link (Room ID + Key) for distribution via the wizard.
    // Explicitly grant 'viewSigners' so Alice and Bob can view each other's status.
    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const fullLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    // --- Interaction: Guest Entry ---
    // Participants join the same room session using the shared link
    const aliceRoom = await joinRoomFromLink(alicePage, fullLink);
    const bobRoom = await joinRoomFromLink(bobPage, fullLink);

    // --- Interaction: Step-by-Step Threshold Progression ---
    // 1. Coordinator (Charlie) uploads first signature
    await coordRoom.uploadSignature('3_5_signed_charlie.psbt.txt');
    await coordRoom.expectSignerStatus('7fd7cacb', 'Signed');
    
    // 2. Alice uploads second signature
    await aliceRoom.uploadSignature('3_5_signed_alice.psbt.txt');
    await aliceRoom.expectSignerStatus('fe0fa7b4', 'Signed');

    // Verification: Confirm progress is synced across participants (2/3)
    await expect(coordPage.getByRole('button', { name: /Waiting for Signatures \(2 \/ 3\)/i })).toBeVisible();

    // 3. Bob uploads third signature (Reaching the required 3/5 threshold)
    await bobRoom.uploadSignature('3_5_signed_bob.psbt.txt');
    await bobRoom.expectSignerStatus('57308a20', 'Signed'); 

    // --- Verification: Threshold Readiness ---
    // The Finalize button should transition to a ready state for the Coordinator
    await expect(coordRoom.finalizeButton).toBeVisible();
    await expect(coordRoom.finalizeButton).toContainText('Finalize Transaction (3/3)');

    // Verification: Role Enforcement (RBAC)
    // Ensure guests are prohibited from triggering the finalization process
    await expect(alicePage.getByText('Only the Coordinator can finalize.')).toBeVisible();

    // --- Interaction: Finalization Trigger ---
    await coordRoom.finalizeButton.click();

    // --- Verification: Coordinator Success State ---
    // Confirm post-finalization controls are visible for the Coordinator
    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await expect(coordPage.getByText('Ready to broadcast')).toBeVisible();
    await expect(coordRoom.copyHexButton).toBeVisible();
    await expect(coordRoom.broadcastButton).toBeVisible();

    // --- Verification: Guest Success State ---
    // Confirm the Guest UI reflects the finalized state but restricts broadcast actions
    await expect(alicePage.getByText('Transaction Signed')).toBeVisible();
    await expect(alicePage.getByText('Awaiting Coordinator broadcast')).toBeVisible();
    await expect(aliceRoom.broadcastButton).toBeHidden(); 

    // --- Verification: Cryptographic Integrity ---
    // Final check: Extract the finalized hex and verify it against the expected fixture output
    await coordRoom.copyHexButton.click();
    const clipboardHex = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const expectedHex = "0200000000010153ae6e073b20d3f9af214905175c6f952b3d10d6400d63ccbb79bcec6495eb400f03000000fdffffff01318a01000000000022002004e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196050047304402207fac03fca7ce176314431f203270a9a5913945527206a280ec75351b0e3a2bb502202c675657757430a79a4d5d2e664b2e8bc7a3acc8516cb2eee9615d935ef817300147304402202c64ce7fed64af95519ebcde490ccad33f4933c15bd2a979a999042bc207957002200d532cddb84b3d517bfd102776a3d2b6ce3d8212a72d45d7ecf36b683d86f5d601473044022030b5c004695d047fca3d53873048ab3aa9c2c92bfffd6dcd9520500dfd57018002200b9af3dfdb50278a4fd3d3caa57b834b3257075426ba6c10c3089ce861cde53401ad5321035a456be99d1f0a53a3427e3bb43f024bd204badccb0c6481425766e6b0f2ada7210378282eccf681b3b601314808bd59a8101379b676637c6d8d9727776e40fd1cc62103adbefda0db792b0c25685244fa2b148b59f2eb57d59e885f46c9be360c6e5bb92103ce8c5c2aa18e2e249ae22afc9d2a01840b93f215daec24152125e71e945091ff2103e7256efa55f2d3d362cc119b3d20618f53fda2db80e64443e3a3dfce3099b3f455ae90550400";
    expect(clipboardHex).toEqual(expectedHex);

    // --- Cleanup: Release resources ---
    await Promise.all([coordCtx.close(), aliceCtx.close(), bobCtx.close()]);
  });

  test.skip('Should handle v2 multisig change addresses and display Security Warning for unverified outputs', async ({ browser }) => {
    // --- Setup: Secure multi-context browser environment ---
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    // --- Interaction: Coordinator Initialization ---
    const coordRoom = await launchRoomFromFixture(coordPage, 'v2_multisig_unsigned.txt', 'bitcoin');

    await coordRoom.generateRoleLink('full');
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    // --- Interaction: Reach Threshold (2-of-2) ---
    // Guest uploads Signer 1
    await guestRoom.uploadSignature('v2_multisig_signer_1.txt');
    await expect(guestRoom.signedCountBadge).toContainText('1 Signed');

    // Coordinator uploads Signer 2
    await coordRoom.uploadSignature('v2_multisig_signer_2.txt');
    await expect(coordRoom.signedCountBadge).toContainText('2 Signed');

    // --- Verification: Change Address Detection ---
    // Verify that the parser correctly identified 2 outputs (1 destination, 1 change)
    await coordRoom.switchTab('Outputs');
    await expect(coordPage.getByRole('button', { name: /Outputs \(2\)/i })).toBeVisible();

    // --- Interaction: Activate Whitelist ---
    // We approve the Input source. This activates the room's whitelist security protocol.
    // Because the destination output is NOT on the whitelist, it will be flagged as unverified.
    await coordRoom.switchTab('Inputs');
    await coordPage.getByRole('button', { name: /Verify/i }).first().click();
    await coordPage.getByRole('button', { name: 'Confirm' }).click();

    // --- Interaction: Attempt Finalization ---
    await coordRoom.finalizeButton.click();

    // --- Verification: Security Warning Modal ---
    const securityWarningModal = coordPage.getByRole('heading', { name: 'Security Warning' });
    await expect(securityWarningModal).toBeVisible();
    await expect(coordPage.getByText('You are sending funds to 1 unverified address(es). Are you sure you want to proceed?')).toBeVisible();

    // --- Interaction: Confirm and Bypass Warning ---
    await coordRoom.confirmButton.click();

    // --- Verification: Finalization Success ---
    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await expect(coordRoom.broadcastButton).toBeVisible();

    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });

  test('Should successfully aggregate and finalize a v0 2-of-2 multisig transaction', async ({ browser }) => {
    // --- Setup: Secure multi-context browser environment ---
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    // --- Interaction: Coordinator Initialization ---
    // Launch Room with v0 multisig on the Bitcoin network
    const coordRoom = await launchRoomFromFixture(coordPage, 'v0_multisig_unsigned.txt', 'bitcoin');

    await coordRoom.generateRoleLink('full');
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    // --- Interaction: Reach Threshold (2-of-2) ---
    // Guest uploads Signer 1
    await guestRoom.uploadSignature('v0_multisig_signer_1.txt');
    await expect(guestRoom.signedCountBadge).toContainText('1 Signed');

    // Coordinator uploads Signer 2
    await coordRoom.uploadSignature('v0_multisig_signer_2.txt');
    await expect(coordRoom.signedCountBadge).toContainText('2 Signed');

    // --- Verification: Finalization State ---
    await expect(coordRoom.finalizeButton).toBeVisible();

    // --- Interaction: Execute Finalization ---
    await coordRoom.finalizeButton.click();

    // --- Verification: Finalization Success ---
    // Expected to succeed directly without the whitelist warning modal
    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await expect(coordRoom.broadcastButton).toBeVisible();

    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });
});

test.describe('Cryptographic Protocol Scenarios', () => {

  test('Scenario A: 2-of-3 Tapscript (multi_a via p2tr_ms) Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario A: 2-of-3 Tapscript (multi_a via p2tr_ms)/unsigned.txt', 'signet');
    
    // --- Verification: Cryptographic & Protocol Badging ---
    await coordRoom.switchTab('Inputs');
    await expect(coordPage.getByText('TAPROOT').first()).toBeVisible();
    
    // STRICT NEGATIVE ASSERTIONS: This scenario should NOT have RBF or Timelocks
    await expect(coordPage.getByText('RBF').first()).toBeHidden();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    await guestRoom.uploadSignature('scenarios/Scenario A: 2-of-3 Tapscript (multi_a via p2tr_ms)/signer1.txt');
    await expect(guestRoom.signedCountBadge).toContainText('1 Signed');

    await coordRoom.uploadSignature('scenarios/Scenario A: 2-of-3 Tapscript (multi_a via p2tr_ms)/signer2.txt');
    await expect(coordRoom.signedCountBadge).toContainText('2 Signed');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await expect(coordRoom.broadcastButton).toBeVisible();

    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });

  test('Scenario B: Keypath Spend (Single Sig) Verification and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario B: Keypath Spend (Single Sig)/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    await expect(coordPage.getByText('TAPROOT').first()).toBeVisible();

    // STRICT NEGATIVE ASSERTIONS
    await expect(coordPage.getByText('RBF').first()).toBeHidden();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();

    await coordRoom.uploadSignature('scenarios/Scenario B: Keypath Spend (Single Sig)/signer1.txt');
    
    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await coordCtx.close();
  });

  test('Scenario C: Multi-Leaf Tree (Branching paths) Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario C: Multi-Leaf Tree (Branching paths)/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    await expect(coordPage.getByText('TAPROOT').first()).toBeVisible();

    // STRICT NEGATIVE ASSERTIONS
    await expect(coordPage.getByText('RBF').first()).toBeHidden();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    await guestRoom.uploadSignature('scenarios/Scenario C: Multi-Leaf Tree (Branching paths)/signer1.txt');
    await coordRoom.uploadSignature('scenarios/Scenario C: Multi-Leaf Tree (Branching paths)/signer2.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });

  test('Scenario D: Decaying Threshold (Active 2-of-3 fallback path) Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario D: Decaying Threshold (Active 2-of-3 fallback path)/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    await expect(coordPage.getByText('TAPROOT').first()).toBeVisible();

    // STRICT NEGATIVE ASSERTIONS
    // branching for its fallback and does not include an explicit OP_CSV constraint.
    await expect(coordPage.getByText('RBF').first()).toBeHidden();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    await guestRoom.uploadSignature('scenarios/Scenario D: Decaying Threshold (Active 2-of-3 fallback path)/signer1.txt');
    await coordRoom.uploadSignature('scenarios/Scenario D: Decaying Threshold (Active 2-of-3 fallback path)/signer3.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });

  test('Scenario E: 3-of-5 Tapscript Multisig (Institutional Quorum) Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guest1Ctx, page: guest1Page } = await createSecurePage(browser);
    const { ctx: guest2Ctx, page: guest2Page } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario E: 3-of-5 Tapscript Multisig (Institutional Quorum)/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    await expect(coordPage.getByText('TAPROOT').first()).toBeVisible();

    // STRICT NEGATIVE ASSERTIONS
    await expect(coordPage.getByText('RBF').first()).toBeHidden();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guest1Room = await joinRoomFromLink(guest1Page, sharedLink);
    const guest2Room = await joinRoomFromLink(guest2Page, sharedLink);

    await guest1Room.uploadSignature('scenarios/Scenario E: 3-of-5 Tapscript Multisig (Institutional Quorum)/signer4.txt');
    await guest2Room.uploadSignature('scenarios/Scenario E: 3-of-5 Tapscript Multisig (Institutional Quorum)/signer5.txt');
    await coordRoom.uploadSignature('scenarios/Scenario E: 3-of-5 Tapscript Multisig (Institutional Quorum)/signer1.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await Promise.all([coordCtx.close(), guest1Ctx.close(), guest2Ctx.close()]);
  });

  test('Scenario F: Absolute Timelock via CLTV Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario F: Absolute Timelock via CLTV/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    await expect(coordPage.getByText('RBF').first()).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();


    await expect(coordPage.getByText('Absolute Timelock Active')).toBeVisible();
    await expect(coordPage.getByText(/Block Height: 900,000/i)).toBeVisible();

    await coordRoom.uploadSignature('scenarios/Scenario F: Absolute Timelock via CLTV/signer1.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await coordCtx.close();
  });

  test('Scenario G: Keypath (MuSig2) + Scriptpath (Recovery) Combined Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario G: Keypath (MuSig2) + Scriptpath (Recovery) Combined/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    await expect(coordPage.getByText('TAPROOT').first()).toBeVisible();

    // STRICT NEGATIVE ASSERTIONS
    await expect(coordPage.getByText('RBF').first()).toBeHidden();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    await guestRoom.uploadSignature('scenarios/Scenario G: Keypath (MuSig2) + Scriptpath (Recovery) Combined/signer1_recovery.txt');
    await coordRoom.uploadSignature('scenarios/Scenario G: Keypath (MuSig2) + Scriptpath (Recovery) Combined/signer2_recovery.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });

  test('Scenario H: Relative Timelock (CSV) Multisig Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario H: Relative Timelock (CSV) Multisig/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    
    await expect(coordPage.getByText('RBF').first()).toBeVisible();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();

    // STRICT ASSERTIONS: Relative CSV
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeVisible();
    await expect(coordPage.getByText(/144 Blocks/i)).toBeVisible();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    await guestRoom.uploadSignature('scenarios/Scenario H: Relative Timelock (CSV) Multisig/signer1.txt');
    await coordRoom.uploadSignature('scenarios/Scenario H: Relative Timelock (CSV) Multisig/signer2.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });

  test('Scenario I: Native SegWit (P2WSH) 2-of-3 Multisig Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario I: Native SegWit (P2WSH) 2-of-3 Multisig/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    await expect(coordPage.getByText(/SEGWIT/i).first()).toBeVisible();

    // STRICT NEGATIVE ASSERTIONS
    await expect(coordPage.getByText('RBF').first()).toBeHidden();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    await guestRoom.uploadSignature('scenarios/Scenario I: Native SegWit (P2WSH) 2-of-3 Multisig/signer1.txt');
    await coordRoom.uploadSignature('scenarios/Scenario I: Native SegWit (P2WSH) 2-of-3 Multisig/signer3.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });

  test('Scenario J: Legacy P2SH (Non-Segwit) 2-of-3 Multisig Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario J: Legacy P2SH (Non-Segwit) 2-of-3 Multisig/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    await expect(coordPage.getByText(/LEGACY|P2SH/i).first()).toBeVisible();

    // STRICT NEGATIVE ASSERTIONS
    await expect(coordPage.getByText('RBF').first()).toBeHidden();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    await guestRoom.uploadSignature('scenarios/Scenario J: Legacy P2SH (Non-Segwit) 2-of-3 Multisig/signer1_legacy.txt');
    await coordRoom.uploadSignature('scenarios/Scenario J: Legacy P2SH (Non-Segwit) 2-of-3 Multisig/signer2_legacy.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });

  test('Scenario K: Mixed Inputs (Taproot + Native Segwit + Relative Timelock) Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario K: Mixed Inputs (Taproot + Native Segwit + Relative Timelock)/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    await expect(coordPage.getByText('TAPROOT').first()).toBeVisible();
    await expect(coordPage.getByText(/SEGWIT/i).first()).toBeVisible();

    await expect(coordPage.getByText('RBF').first()).toBeVisible();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();

    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeVisible();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    await guestRoom.uploadSignature('scenarios/Scenario K: Mixed Inputs (Taproot + Native Segwit + Relative Timelock)/signer1_both_inputs.txt');
    await coordRoom.uploadSignature('scenarios/Scenario K: Mixed Inputs (Taproot + Native Segwit + Relative Timelock)/signer2_input_1_only.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });

  test('Scenario L: Replace-By-Fee (RBF) Opt-In Aggregation and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario L: Replace-By-Fee (RBF) Opt-In/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    
    // STRICT ASSERTIONS: RBF should be active, others hidden
    await expect(coordPage.getByText('RBF').first()).toBeVisible();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    await guestRoom.uploadSignature('scenarios/Scenario L: Replace-By-Fee (RBF) Opt-In/signer1.txt');
    await coordRoom.uploadSignature('scenarios/Scenario L: Replace-By-Fee (RBF) Opt-In/signer2.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });

  test('Scenario M: Institutional Change Output Verification and Finalization', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    const coordRoom = await launchRoomFromFixture(coordPage, 'scenarios/Scenario M: Institutional Change Output Verification/unsigned.txt', 'signet');
    
    await coordRoom.switchTab('Inputs');
    
    // STRICT NEGATIVE ASSERTIONS
    await expect(coordPage.getByText('RBF').first()).toBeHidden();
    await expect(coordPage.getByText('Absolute Timelock Active')).toBeHidden();
    await expect(coordPage.getByText('Relative Timelock (CSV) Active')).toBeHidden();

    await coordRoom.switchTab('Outputs');
    await expect(coordPage.getByRole('button', { name: /Outputs \(\d+\)/i })).toBeVisible();
    await expect(coordRoom.verifyAllOutputsButton).toBeVisible();

    await coordRoom.generateRoleLink('full', { viewSigners: true });
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    await guestRoom.uploadSignature('scenarios/Scenario M: Institutional Change Output Verification/signer1.txt');
    await coordRoom.uploadSignature('scenarios/Scenario M: Institutional Change Output Verification/signer3.txt');

    await expect(coordRoom.finalizeButton).toBeVisible();
    await coordRoom.finalizeButton.click();

    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });
});