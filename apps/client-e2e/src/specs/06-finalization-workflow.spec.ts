import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';

/**
 * Suite: Threshold Finalization and Broadcast
 * Focuses on the end-to-end multi-user flow where participants aggregate signatures 
 * to reach the 3-of-5 threshold and enable the Coordinator to finalize the hex.
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
    const fullLink = await coordPage.evaluate(() => navigator.clipboard.readText());

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
    
    // Verification: Confirm progress is synced across participants (2/5)
    await expect(coordPage.getByRole('button', { name: /Waiting for Signatures \(2 \/ 5\)/i })).toBeVisible();

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
    const clipboardHex = await coordPage.evaluate(() => navigator.clipboard.readText());
    
    const expectedHex = "0200000000010153ae6e073b20d3f9af214905175c6f952b3d10d6400d63ccbb79bcec6495eb400f03000000fdffffff01318a01000000000022002004e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196050047304402207fac03fca7ce176314431f203270a9a5913945527206a280ec75351b0e3a2bb502202c675657757430a79a4d5d2e664b2e8bc7a3acc8516cb2eee9615d935ef817300147304402202c64ce7fed64af95519ebcde490ccad33f4933c15bd2a979a999042bc207957002200d532cddb84b3d517bfd102776a3d2b6ce3d8212a72d45d7ecf36b683d86f5d601473044022030b5c004695d047fca3d53873048ab3aa9c2c92bfffd6dcd9520500dfd57018002200b9af3dfdb50278a4fd3d3caa57b834b3257075426ba6c10c3089ce861cde53401ad5321035a456be99d1f0a53a3427e3bb43f024bd204badccb0c6481425766e6b0f2ada7210378282eccf681b3b601314808bd59a8101379b676637c6d8d9727776e40fd1cc62103adbefda0db792b0c25685244fa2b148b59f2eb57d59e885f46c9be360c6e5bb92103ce8c5c2aa18e2e249ae22afc9d2a01840b93f215daec24152125e71e945091ff2103e7256efa55f2d3d362cc119b3d20618f53fda2db80e64443e3a3dfce3099b3f455ae90550400";
    expect(clipboardHex).toEqual(expectedHex);

    // --- Cleanup: Release resources ---
     await Promise.all([
      aliceCtx.close(),
      bobCtx.close(),
      coordCtx.close()
    ]);
  });
});