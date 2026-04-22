import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';

/**
 * Suite: Threshold Finalization and Broadcast
 * Focuses on the end-to-end multi-user flow where participants aggregate signatures 
 * to reach the required threshold and enable the Coordinator to finalize the hex.
 */
test.describe('Threshold Finalization and Broadcast', () => {

  test('Should reach threshold and directly finalize transaction when whitelist is unused', async ({ browser }) => {
    // --- Setup: Secure multi-context browser environment ---
    // Simulate three independent participants: Coordinator, Alice, and Bob
    const coordCtx = await browser.newContext();
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    
    // Grant clipboard access to the Coordinator for credential sharing
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    // --- Interaction: Coordinator Initialization ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    // Extract the full encrypted link (Room ID + Key) for distribution
    await coordRoom.shareLinkButton.click();
    await coordPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const sharedLink = await coordPage.evaluate(() => navigator.clipboard.readText());

    // --- Interaction: Guest Entry ---
    // Alice and Bob join the active session
    const aliceRoom = await joinRoomFromLink(alicePage, sharedLink);
    const bobRoom = await joinRoomFromLink(bobPage, sharedLink);

    // --- Interaction: Signature Aggregation (3-of-5) ---
    // 1. Coordinator signs
    await coordRoom.uploadSignature('3_5_signed_charlie.psbt.txt');
    await expect(coordRoom.signedCountBadge).toContainText('1 Signed');

    // 2. Alice signs
    await aliceRoom.uploadSignature('3_5_signed_alice.psbt.txt');
    await expect(coordRoom.signedCountBadge).toContainText('2 Signed');

    // 3. Bob signs (Threshold Reached)
    await bobRoom.uploadSignature('3_5_signed_bob.psbt.txt');
    await expect(coordRoom.signedCountBadge).toContainText('3 Signed');

    // --- Verification: Finalization State ---
    // Only the coordinator should have the authority to finalize the transaction
    await expect(coordRoom.finalizeButton).toBeVisible();
    await expect(alicePage.getByRole('button', { name: /Finalize Transaction/i })).toBeHidden();
    await expect(bobPage.getByRole('button', { name: /Finalize Transaction/i })).toBeHidden();

    // --- Interaction: Execute Finalization ---
    await coordRoom.finalizeButton.click();

    // Because no addresses were whitelisted, the security warning is bypassed
    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await expect(coordRoom.broadcastButton).toBeVisible();
    
    // Ensure the loading/progress UI is cleared
    await expect(coordPage.getByText('Finalizing')).toBeHidden(); 

    // --- Verification: Cryptographic Integrity ---
    // Final check: Extract the finalized hex and verify it against the expected fixture output
    await coordRoom.copyHexButton.click();
    const clipboardHex = await coordPage.evaluate(() => navigator.clipboard.readText());
    
    const expectedHex = "0200000000010153ae6e073b20d3f9af214905175c6f952b3d10d6400d63ccbb79bcec6495eb400f03000000fdffffff01318a01000000000022002004e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196050047304402207fac03fca7ce176314431f203270a9a5913945527206a280ec75351b0e3a2bb502202c675657757430a79a4d5d2e664b2e8bc7a3acc8516cb2eee9615d935ef817300147304402202";
    expect(clipboardHex).toContain(expectedHex);

    await Promise.all([
      coordCtx.close(),
      aliceCtx.close(),
      bobCtx.close()
    ]);
  });

  test('Should handle v2 multisig change addresses and display Security Warning for unverified outputs', async ({ browser }) => {
    // --- Setup: Secure multi-context browser environment ---
    const coordCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // --- Interaction: Coordinator Initialization ---
    // Launch Room with v2 multisig on the Bitcoin network
    const coordRoom = await launchRoomFromFixture(coordPage, 'v2_multisig_unsigned.txt', 'bitcoin');

    await coordRoom.shareLinkButton.click();
    await coordPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const sharedLink = await coordPage.evaluate(() => navigator.clipboard.readText());

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
    await coordPage.getByRole('button', { name: /Approve Source/i }).first().click();
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

    await Promise.all([
      coordCtx.close(),
      guestCtx.close()
    ]);
  });

  test('Should successfully aggregate and finalize a v0 2-of-2 multisig transaction', async ({ browser }) => {
    // --- Setup: Secure multi-context browser environment ---
    const coordCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // --- Interaction: Coordinator Initialization ---
    // Launch Room with v0 multisig on the Bitcoin network
    const coordRoom = await launchRoomFromFixture(coordPage, 'v0_multisig_unsigned.txt', 'bitcoin');

    await coordRoom.shareLinkButton.click();
    await coordPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const sharedLink = await coordPage.evaluate(() => navigator.clipboard.readText());

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

    await Promise.all([
      coordCtx.close(),
      guestCtx.close()
    ]);
  });
});