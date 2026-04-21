import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';

/**
 * Suite: Advanced Workflows and Edge Cases
 * Focuses on secondary administrative features including address filtering, 
 * secure file handling for PSBTs and QR codes, and role elevation via Admin Tokens.
 */
test.describe('Advanced Workflows and Edge Cases', () => {

  test('Should filter inputs and outputs using the search boxes', async ({ page }) => {
    // --- Interaction: Room Initialization ---
    const roomPage = await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt');

    // --- Interaction: Filtering Outputs ---
    await roomPage.switchTab('Outputs');
    const specificOutputAddress = 'bc1q04e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196'; 
    await roomPage.outputSearchInput.fill(specificOutputAddress);
    
    // --- Verification: Assert visibility and filter count ---
    await expect(roomPage.page.locator('div.p-3').filter({ hasText: specificOutputAddress })).toBeVisible();
    await expect(roomPage.page.getByTitle('Filtered Results')).toContainText('1');

    // --- Interaction: Filtering Inputs ---
    await roomPage.switchTab('Inputs');
    const specificInputAddress = 'bc1q739fe38612ee73e2a2efc24600a7485898615bc8c2607d159332c7cbcb4693e2';
    await roomPage.inputSearchInput.fill(specificInputAddress);

    // --- Verification: Assert search accuracy ---
    await expect(roomPage.page.locator('div.p-3').filter({ hasText: specificInputAddress })).toBeVisible();
    await expect(roomPage.page.getByTitle('Filtered Results')).toContainText('1');
  });

  test('Should download the unsigned PSBT file securely', async ({ page }) => {
    // --- Interaction: Trigger export workflow ---
    const roomPage = await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt');
    await roomPage.psbtDownloadAction.click();

    // --- Verification: Assert OpSec privacy warnings ---
    await expect(roomPage.page.getByText('Privacy Warning:')).toBeVisible();

    // --- Interaction: Execute and capture download ---
    const downloadPromise = roomPage.page.waitForEvent('download');
    await roomPage.psbtModalDownloadButton.click();
    const download = await downloadPromise;

    // --- Verification: File integrity check ---
    expect(download.suggestedFilename()).toContain('unsigned_tx_');
    expect(download.suggestedFilename()).toContain('.psbt');
  });

  test('Should generate, toggle, and download QR Codes', async ({ page }) => {
    // --- Interaction: Open QR Toolset ---
    const roomPage = await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt');
    await roomPage.qrCodeActionButton.click();
    
    // --- Verification: Assert security context ---
    await expect(roomPage.page.getByText('Maximum Security:')).toBeVisible();

    // --- Interaction: Toggle data density (Full Link + Key) ---
    await roomPage.qrFullLinkButton.click();
    await expect(roomPage.page.getByText('Contains Decryption Key:')).toBeVisible();

    // --- Interaction: Reveal obscured QR data ---
    await roomPage.qrRevealButton.click();
    await expect(roomPage.qrRevealButton).toBeHidden();

    // --- Interaction: Capture image download ---
    const downloadPromise = roomPage.page.waitForEvent('download');
    await roomPage.qrDownloadButton.click();
    const download = await downloadPromise;

    // --- Verification: Assert image export success ---
    expect(download.suggestedFilename()).toContain('signingroom-qr-');
    expect(download.suggestedFilename()).toContain('.png');
  });

  test('Guest should be able to claim the Coordinator role using an Admin Token', async ({ browser }) => {
    // --- Setup: Secure multi-context coordination ---
    const coordCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // --- Interaction: Host Setup & Token Extraction ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    await coordRoom.shareLinkButton.click();
    await coordPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const sharedLink = await coordPage.evaluate(() => navigator.clipboard.readText());

    await coordRoom.backupAdminActionButton.click();
    await coordRoom.copyAdminTokenButton.click();
    const adminToken = await coordPage.evaluate(() => navigator.clipboard.readText());

    // --- Interaction: Guest Entry ---
    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    // --- Verification: Assert initial Guest restrictions (RBAC) ---
    await expect(guestRoom.lockButton).toBeHidden();
    await expect(guestRoom.renameButton).toBeHidden();

    // --- Interaction: Administrative Claim Protocol ---
    await guestRoom.claimCoordinatorLink.click();
    await guestRoom.claimPasswordInput.fill(adminToken);
    await guestRoom.claimRoleButton.click();

    // --- Verification: Assert Role Elevation and UI transition ---
    await expect(guestPage.getByText('Coordinator', { exact: true })).toBeVisible();
    await expect(guestRoom.lockButton).toBeVisible();
    await expect(guestRoom.renameButton).toBeVisible();

    // Cleanup
    await coordCtx.close();
    await guestCtx.close();
  });
});