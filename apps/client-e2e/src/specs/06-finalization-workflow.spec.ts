import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';

test.describe('Threshold Finalization and Broadcast', () => {

  test('Should reach threshold and directly finalize transaction when whitelist is unused', async ({ browser }) => {
    // 1. Setup 3 Contexts (Coordinator, Alice, Bob)
    const coordCtx = await browser.newContext();
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    // 2. Launch Room and Join Guests
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    await coordRoom.shareLinkButton.click();
    await coordPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const fullLink = await coordPage.evaluate(() => navigator.clipboard.readText());

    const aliceRoom = await joinRoomFromLink(alicePage, fullLink);
    const bobRoom = await joinRoomFromLink(bobPage, fullLink);

    // ==========================================
    // TEST: REACHING THE THRESHOLD
    // ==========================================
    
    // Upload Signature 1 (Coordinator)
    await coordRoom.uploadSignature('3_5_signed_charlie.psbt.txt');
    await coordRoom.expectSignerStatus('7fd7cacb', 'Signed');
    
    // Upload Signature 2 (Alice)
    await aliceRoom.uploadSignature('3_5_signed_alice.psbt.txt');
    await aliceRoom.expectSignerStatus('fe0fa7b4', 'Signed');
    
    // Verify Coordinator's Finalize button is still disabled/waiting
    // Note: The waiting button shows total signers (5)
    await expect(coordPage.getByRole('button', { name: /Waiting for Signatures \(2 \/ 5\)/i })).toBeVisible();

    // Upload Signature 3 (Bob) - Threshold Reached!
    await bobRoom.uploadSignature('3_5_signed_bob.psbt.txt');
    await bobRoom.expectSignerStatus('57308a20', 'Signed'); 

    // ==========================================
    // TEST: FINALIZATION GUARDRAILS
    // ==========================================
    
    // Verify Coordinator sees the active Finalize button
    await expect(coordRoom.finalizeButton).toBeVisible();
    
    // The active Finalize button shows the threshold denominator (3)
    await expect(coordRoom.finalizeButton).toContainText('Finalize Transaction (3/3)');
    
    // Verify Guests see the "Only Coordinator can finalize" message
    await expect(alicePage.getByText('Only the Coordinator can finalize.')).toBeVisible();

    // Coordinator clicks Finalize
    await coordRoom.finalizeButton.click();

    // ==========================================
    // TEST: FINAL STATE & BROADCAST
    // ==========================================
    
    // Verify Coordinator's success view
    await expect(coordPage.getByText('Transaction Signed')).toBeVisible();
    await expect(coordPage.getByText('Ready to broadcast')).toBeVisible();
    await expect(coordRoom.copyHexButton).toBeVisible();
    await expect(coordRoom.broadcastButton).toBeVisible();

    // Verify Guests see the read-only success view
    await expect(alicePage.getByText('Transaction Signed')).toBeVisible();
    await expect(alicePage.getByText('Awaiting Coordinator broadcast')).toBeVisible();
    await expect(aliceRoom.broadcastButton).toBeHidden(); 

    // ==========================================
    // TEST: CLIPBOARD INTEGRITY
    // ==========================================
    
    // Verify the "Copy Hex" button successfully copies the exact final payload
    await coordRoom.copyHexButton.click();
    const clipboardHex = await coordPage.evaluate(() => navigator.clipboard.readText());
    
    const expectedHex = "0200000000010153ae6e073b20d3f9af214905175c6f952b3d10d6400d63ccbb79bcec6495eb400f03000000fdffffff01318a01000000000022002004e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196050047304402207fac03fca7ce176314431f203270a9a5913945527206a280ec75351b0e3a2bb502202c675657757430a79a4d5d2e664b2e8bc7a3acc8516cb2eee9615d935ef817300147304402202c64ce7fed64af95519ebcde490ccad33f4933c15bd2a979a999042bc207957002200d532cddb84b3d517bfd102776a3d2b6ce3d8212a72d45d7ecf36b683d86f5d601473044022030b5c004695d047fca3d53873048ab3aa9c2c92bfffd6dcd9520500dfd57018002200b9af3dfdb50278a4fd3d3caa57b834b3257075426ba6c10c3089ce861cde53401ad5321035a456be99d1f0a53a3427e3bb43f024bd204badccb0c6481425766e6b0f2ada7210378282eccf681b3b601314808bd59a8101379b676637c6d8d9727776e40fd1cc62103adbefda0db792b0c25685244fa2b148b59f2eb57d59e885f46c9be360c6e5bb92103ce8c5c2aa18e2e249ae22afc9d2a01840b93f215daec24152125e71e945091ff2103e7256efa55f2d3d362cc119b3d20618f53fda2db80e64443e3a3dfce3099b3f455ae90550400";
    expect(clipboardHex).toEqual(expectedHex);

    await coordCtx.close();
    await aliceCtx.close();
    await bobCtx.close();
  });
});