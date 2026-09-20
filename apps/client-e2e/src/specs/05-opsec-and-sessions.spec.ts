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
 * Suite: OpSec and 3-Way Session Sync
 * Focuses on secure access control, including the "Split-Key" handshake protocol, 
 * administrative locking, and real-time synchronization of participant identities.
 */
test.describe('OpSec and 3-Way Session Sync', () => {
  
  test('Should handle Split-Key handshake and unauthorized access denial', async ({ browser }) => {
    test.slow(); // Multi-context test

    // --- Setup: Multi-context browser environment ---
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: aliceCtx, page: alicePage } = await createSecurePage(browser);
    const { ctx: bobCtx, page: bobPage } = await createSecurePage(browser);

    // --- Interaction: Split-Key Initialization ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    // Step A: Coordinator shares the secure link only (no decryption key)
    await coordRoom.generateRoleLink('url');
    const secureLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);
    
    // Manually close the share modal and wait for it to disappear
    await coordPage.locator('#modal-share-room #btn-modal-close').click();
    await expect(coordPage.locator('#modal-share-room')).toBeHidden();

    // --- Interaction: Unauthorized Access Attempt ---
    await alicePage.goto(secureLink);

    // --- Verification: Assert OpSec Block ---
    await expect(alicePage.getByText('Decryption Key Required')).toBeVisible();

    // --- Interaction: Manual Decryption Workflow ---
    await coordRoom.keyActionButton.click();
    await coordRoom.copyKeyButton.click();
    
    await expect(coordPage.locator('#modal-view-key')).toBeHidden({ timeout: 5000 });
    const decryptionKey = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    await alicePage.getByPlaceholder('Enter decryption key...').fill(decryptionKey);
    await alicePage.getByRole('button', { name: 'Decrypt Room' }).click();
    const aliceRoom = new RoomPage(alicePage);
    
    // --- Verification: Authorized Access ---
    await expect(aliceRoom.activeIndicator).toBeVisible();

    // --- Interaction: Combined-Key Entry for Bob ---
    await coordRoom.generateRoleLink('full');
    
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const fullLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);
    
    const bobRoom = await joinRoomFromLink(bobPage, fullLink);

    // --- Verification: 3-Way Real-time Sync ---
    await expect(coordRoom.sessionIdButton).toContainText('3');
    await expect(aliceRoom.sessionIdButton).toContainText('3');
    await expect(bobRoom.sessionIdButton).toContainText('3');

    // --- Interaction: Administrative Security Lock ---
    await coordRoom.lockButton.click();
    await coordRoom.confirmButton.click();

    // --- Verification: Global Lock Propagation ---
    await expect(coordPage.getByTitle('Room Locked')).toBeVisible();
    await expect(alicePage.getByTitle('Room Locked')).toBeVisible();
    await expect(bobPage.getByTitle('Room Locked')).toBeVisible();

    // --- Interaction: Block New Intruders ---
    const { ctx: intruderCtx, page: intruderPage } = await createSecurePage(browser);
    await intruderPage.goto(fullLink);
    
    // --- Verification: Assert Locked Room Access Denial ---
    await expect(intruderPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible();
    await expect(intruderPage.getByText('The Coordinator has locked this room.')).toBeVisible();

    // --- Interaction: Administrative Unlock (Prevention of Cleanup Timeout) ---
    await coordRoom.lockButton.click();
    await expect(coordPage.getByText(/Are you sure you want to Unlock/i)).toBeVisible();
    await coordRoom.confirmButton.click();

    // Verification: Confirm state restoration
    await expect(coordPage.getByTitle('Room Active')).toBeVisible();

    await Promise.all([
      aliceCtx.close(),
      bobCtx.close(),
      intruderCtx.close(),
      coordCtx.close()
    ]);
  });

  test('Should sync Participant Labels across all users', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: aliceCtx, page: alicePage } = await createSecurePage(browser);

    // --- Interaction: Establish Session ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');

    await coordRoom.generateRoleLink('full');
    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const fullLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);
    
    const aliceRoom = await joinRoomFromLink(alicePage, fullLink);

    // --- Interaction: Participant Identity Labeling ---
    await aliceRoom.sessionIdButton.click();
    await aliceRoom.sessionNameInput.fill('Alice (Ledger)');
    await aliceRoom.sessionSaveButton.click();

    // --- Verification: Remote Identity Propagation ---
    await coordRoom.sessionIdButton.click();
    await expect(coordPage.getByText('Alice (Ledger)')).toBeVisible();
    
    // --- Verification: Metadata Consistency ---
    const aliceSessionRow = coordRoom.getSessionRow('Alice (Ledger)');
    await aliceSessionRow.getByTitle('Copy Session Details').click();

    const copiedDetails = await coordPage.evaluate(() => (window as any).__capturedClipboard);
    expect(copiedDetails).toContain('Alice (Ledger)');

    await Promise.all([coordCtx.close(), aliceCtx.close()]);
  });

  test('Should synchronize Room ID and Participant Identity across 3 users', async ({ browser }) => {
    test.slow();
    const coord = await createSecurePage(browser);
    const alice = await createSecurePage(browser);
    const bob = await createSecurePage(browser);
    
    // --- Interaction: Host Room and Distribute Links ---
    const coordRoom = await launchRoomFromFixture(coord.page, '3_5_unsigned.psbt.txt');

    await coordRoom.generateRoleLink('full');
    await expect(coord.page.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const fullLink = await coord.page.evaluate(() => (window as any).__capturedClipboard);

    const aliceRoom = await joinRoomFromLink(alice.page, fullLink);
    await joinRoomFromLink(bob.page, fullLink);

    // --- Verification: Core Identity Metadata ---
    await coordRoom.roomIdButton.click();
    await expect(coord.page.getByText('Public Routing Data')).toBeVisible();
    await coordRoom.roomIdModalCopyButton.click();
    
    const copiedId = await coord.page.evaluate(() => (window as any).__capturedClipboard);
    expect(copiedId).toMatch(/^[0-9a-f]{8}-/); 

    // --- Interaction: Broadcast Identity Update ---
    const aliceName = 'Alice (Ledger)';
    await aliceRoom.sessionIdButton.click();
    await aliceRoom.sessionNameInput.fill(aliceName);
    await aliceRoom.sessionSaveButton.click();
    await expect(aliceRoom.sessionsModal).toBeHidden();

    // --- Verification: Distributed Session Consistency ---
    for (const p of [coord.page, bob.page]) {
      const room = new RoomPage(p);
      await room.sessionIdButton.click();
      
      const aliceRow = room.getSessionRow(aliceName); 
      await expect(aliceRow).toBeVisible({ timeout: 10000 });
      
      // The interceptor ensures this click succeeds seamlessly even on Bob's headless context
      await aliceRow.getByTitle('Copy Session Details').click();
      
      await room.closeSessionsModalButton.click();
      await expect(room.sessionsModal).toBeHidden();
    }

    await Promise.all([coord.ctx.close(), alice.ctx.close(), bob.ctx.close()]);
  });

  test('Should handle Split-Key vs Combined-Key entry', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: aliceCtx, page: alicePage } = await createSecurePage(browser);

    // --- Interaction: Split-Key Entry Protocol ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');

    await coordRoom.generateRoleLink('url');
    const secureLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);
    
    await coordPage.locator('#modal-share-room #btn-modal-close').click();
    await expect(coordPage.locator('#modal-share-room')).toBeHidden();

    await alicePage.goto(secureLink);
    
    // --- Verification: Assert Security Barrier ---
    await expect(alicePage.getByText('Decryption Key Required')).toBeVisible();

    // --- Interaction: Manual Unlock ---
    await coordRoom.keyActionButton.click();
    await coordRoom.copyKeyButton.click();
    await expect(coordPage.locator('#modal-view-key')).toBeHidden({ timeout: 5000 });
    
    const key = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    await alicePage.getByPlaceholder('Enter decryption key...').fill(key);
    await alicePage.getByRole('button', { name: 'Decrypt Room' }).click();
    
    // --- Verification: Entry Success ---
    await expect(alicePage.locator('span[title="Room Active"]')).toBeVisible();

    await Promise.all([coordCtx.close(), aliceCtx.close()]);
  });

  test('Should enforce strict UI restrictions when all role capabilities are revoked', async ({ browser }) => {
    const { ctx: coordCtx, page: coordPage } = await createSecurePage(browser);
    const { ctx: guestCtx, page: guestPage } = await createSecurePage(browser);

    // --- Interaction: Establish Session ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');

    // Generate a strictly locked-down Zero-Trust link with all permissions revoked
    await coordRoom.generateRoleLink('full', {
      upload: false,
      exportPsbt: false,
      exportAudit: false,
      viewDetails: false,
      viewSigners: false,
      shareSession: false,
    });

    await expect(coordPage.locator('#modal-share-room')).toBeHidden({ timeout: 5000 });
    const strictLink = await coordPage.evaluate(() => (window as any).__capturedClipboard);

    // --- Interaction: Guest Entry ---
    const guestRoom = await joinRoomFromLink(guestPage, strictLink);

    // ==========================================
    // VERIFICATION: Assert all OpSec UI Lockouts
    // ==========================================

    // Verify Imports/Exports are disabled
    await expect(guestPage.locator('#btn-export-show-qr')).toBeDisabled();
    await expect(guestPage.locator('#btn-export-download-file')).toBeDisabled();
    await expect(guestPage.locator('#btn-import-scan-qr')).toBeDisabled();
    await expect(guestPage.locator('#btn-import-upload-file input[type="file"]')).toBeDisabled();

    // Verify Analytics/Logs are disabled
    await expect(guestPage.locator('#btn-action-audit')).toBeDisabled();
    await expect(guestPage.locator('#btn-action-csv')).toBeDisabled();

    // Verify Lateral Sharing is disabled
    await expect(guestPage.locator('#btn-action-link-key')).toBeDisabled();
    await expect(guestPage.locator('#btn-action-qr')).toBeDisabled();

    // Verify Financial Details are obscured and un-toggable
    await expect(guestPage.locator('#btn-reveal-details')).toHaveClass(/cursor-not-allowed/);

    await expect(guestPage.getByText('•••••••• BTC').first()).toBeVisible();
    await expect(guestPage.getByText('••••••••••••••••••••••••••••••••••••••••').first()).toBeVisible();

    // Verify Signer Identities are obscured and un-toggable
    await expect(guestPage.locator('#btn-reveal-signers')).toHaveClass(/cursor-not-allowed/);
    await expect(guestPage.getByText('•••••••• (••••••••)').first()).toBeVisible();

    await Promise.all([coordCtx.close(), guestCtx.close()]);
  });
});