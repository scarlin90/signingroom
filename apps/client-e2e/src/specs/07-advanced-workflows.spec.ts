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
    const specificOutputAddress = 'tb1qqn3pzlcmp8mudfhljtdwe7u6fhjhh3x2rr3njvlj35gx0kqmxxtqlqrzyc'; 
    await roomPage.outputSearchInput.fill(specificOutputAddress);
    
    // --- Verification: Assert visibility and filter count ---
    await expect(roomPage.page.locator('div.p-3').filter({ hasText: specificOutputAddress })).toBeVisible();
    await expect(roomPage.page.getByTitle('Filtered Results')).toContainText('1');

    // --- Interaction: Filtering Inputs ---
    await roomPage.switchTab('Inputs');
    const specificInputAddress = 'tb1qww078psjaee79gh0cfrqpf6gtzvxzk7gcfs869vnxtruhj6xj03qjfdnh8';
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
    
    // FIXED: Assert for the new HTML string "Sensitive Data:" instead of "Contains Decryption Key:"
    await expect(roomPage.page.getByText('Sensitive Data:')).toBeVisible();

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
    // --- Setup: Secure multi-context coordination using the resilient helper ---
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    // --- Interaction: Host Setup & Token Extraction ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    // FIXED: Use the 2-step share wizard and wait for the modal to close
    await coordRoom.generateRoleLink('full');
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const sharedLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    // Extract the Admin Token
    await coordRoom.backupAdminActionButton.click();
    await coordRoom.copyAdminTokenButton.click();
    await expect(coordPage.locator('#modal-backup-admin')).toBeHidden({ timeout: 5000 });
    const adminToken = await coordPage.evaluate(() => (window as any).__capturedClipboard);

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
    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });
});