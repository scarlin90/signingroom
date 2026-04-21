import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';

test.describe('OpSec and 3-Way Session Sync', () => {
  
  test('Should handle Split-Key handshake and unauthorized access denial', async ({ browser }) => {
    // 1. Create three contexts for Coordinator, Alice, and Bob
    const coordCtx = await browser.newContext();
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    // PHASE 1: SPLIT-KEY HANDSHAKE
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    // A. Coordinator copies Link ONLY (No Key)
    await coordRoom.shareLinkButton.click();
    await coordRoom.copySecureLinkButton.click();
    const secureLink = await coordPage.evaluate(() => navigator.clipboard.readText());

    // B. Alice tries to join with secure link
    await alicePage.goto(secureLink);
    await expect(alicePage.getByText('Decryption Key Required')).toBeVisible();

    // C. Coordinator copies Key separately
    await coordRoom.keyActionButton.click();
    await coordRoom.copyKeyButton.click();
    const decryptionKey = await coordPage.evaluate(() => navigator.clipboard.readText());

    // D. Alice enters key and gains access
    await alicePage.getByPlaceholder('Enter decryption key...').fill(decryptionKey);
    await alicePage.getByRole('button', { name: 'Decrypt Room' }).click();
    const aliceRoom = new RoomPage(alicePage);
    await expect(aliceRoom.activeIndicator).toBeVisible();

    // PHASE 2: 3-WAY SESSION SYNC
    // Bob joins with a FULL link (Combined)
    await coordRoom.shareLinkButton.click();
    await coordPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const fullLink = await coordPage.evaluate(() => navigator.clipboard.readText());
    const bobRoom = await joinRoomFromLink(bobPage, fullLink);

    // Verify all 3 windows see '3 Active Sessions'
    await expect(coordRoom.sessionIdButton).toContainText('3');
    await expect(aliceRoom.sessionIdButton).toContainText('3');
    await expect(bobRoom.sessionIdButton).toContainText('3');

    // PHASE 3: ROOM LOCKING SYNC
    await coordRoom.lockButton.click();
    await coordRoom.confirmButton.click();

    // Verify visual update (Amber Locked Indicator) on all 3 windows
    await expect(coordPage.getByTitle('Room Locked')).toBeVisible();
    await expect(alicePage.getByTitle('Room Locked')).toBeVisible();
    await expect(bobPage.getByTitle('Room Locked')).toBeVisible();

    // PHASE 4: ACCESS DENIED FOR NEW USERS
    const intruderCtx = await browser.newContext();
    const intruderPage = await intruderCtx.newPage();
    await intruderPage.goto(fullLink);
    
    await expect(intruderPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible();
    await expect(intruderPage.getByText('The Coordinator has locked this room.')).toBeVisible();

    await coordCtx.close();
    await aliceCtx.close();
    await bobCtx.close();
    await intruderCtx.close();
  });

  test('Should sync Participant Labels across all users', async ({ browser }) => {
    const coordCtx = await browser.newContext();
    const aliceCtx = await browser.newContext();
    // Permissions are required for both contexts if they interact with the clipboard
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await aliceCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const alicePage = await aliceCtx.newPage();

    // 1. Setup Coordinator
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    // 2. GET FULL LINK (Correct Method)
    // We must use the share modal because the URL in the address bar is scrubbed
    await coordRoom.shareLinkButton.click();
    await coordPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const fullLink = await coordPage.evaluate(() => navigator.clipboard.readText());

    // 3. Guest (Alice) joins
    const aliceRoom = await joinRoomFromLink(alicePage, fullLink);

    // 4. Alice identifies herself
    await aliceRoom.sessionIdButton.click();
    await aliceRoom.sessionNameInput.fill('Alice (Ledger)');
    await aliceRoom.sessionSaveButton.click();

    // 5. Coordinator verifies Alice's identity in the Sessions list
    await coordRoom.sessionIdButton.click();
    await expect(coordPage.getByText('Alice (Ledger)')).toBeVisible();
    
    // 6. Coordinator copies Alice's Session ID specifically
    // Target the button inside the specific session row to satisfy Playwright's strict mode
    const aliceSessionRow = coordPage.locator('div.flex.items-center.justify-between').filter({ hasText: 'Alice (Ledger)' });
    await aliceSessionRow.getByTitle('Copy Session Details').click();

    // 7. Verify Clipboard Content
    const copiedDetails = await coordPage.evaluate(() => navigator.clipboard.readText());
    expect(copiedDetails).toContain('Alice (Ledger)');

    await coordCtx.close();
    await aliceCtx.close();
  });

  test('Should synchronize Room ID and Participant Identity across 3 users', async ({ browser }) => {
    // 1. Create three contexts
    const contexts = [await browser.newContext(), await browser.newContext(), await browser.newContext()];
    const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));
    await contexts[0].grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // 2. Setup Coordinator
    const coordRoom = await launchRoomFromFixture(pages[0], '3_5_unsigned.psbt.txt');
    await coordRoom.shareLinkButton.click();
    await pages[0].getByRole('button', { name: /Copy Full Link/i }).click();
    const fullLink = await pages[0].evaluate(() => navigator.clipboard.readText());

    // 3. Alice and Bob join
    const aliceRoom = await joinRoomFromLink(pages[1], fullLink);
    const bobRoom = await joinRoomFromLink(pages[2], fullLink);

    // ==========================================
    // TEST: Room ID Modal & Copying
    // ==========================================
    await coordRoom.roomIdButton.click();
    await expect(pages[0].getByText('Public Routing Data')).toBeVisible();
    await coordRoom.roomIdModalCopyButton.click();
    const copiedId = await pages[0].evaluate(() => navigator.clipboard.readText());
    expect(copiedId).toMatch(/^[0-9a-f]{8}-/); // Verify it looks like a UUID

    // ==========================================
    // TEST: 3-Way Identity Sync (Witness Labeling)
    // ==========================================
    const aliceName = 'Alice (Ledger)';

    // 1. Alice identifies herself
    await aliceRoom.sessionIdButton.click();
    await aliceRoom.sessionNameInput.fill(aliceName);
    await aliceRoom.sessionSaveButton.click();
    await expect(aliceRoom.sessionsModal).toBeHidden();

    // 2. Verify Coordinator and Bob both see the update
    for (const p of [pages[0], pages[2]]) {
      const room = new RoomPage(p);
      await room.sessionIdButton.click();
      
      // Wait for the specific row to appear in the list
      const aliceRow = room.getSessionRow(aliceName); 
      await expect(aliceRow).toBeVisible({ timeout: 10000 });
      
      // Verify "Copy Session Details" action within that row
      await aliceRow.getByTitle('Copy Session Details').click();
      
      // Close using our fixed locator
      await room.closeSessionsModalButton.click();
      await expect(room.sessionsModal).toBeHidden();
    }

    for (const ctx of contexts) await ctx.close();
  });

  test('Should handle Split-Key vs Combined-Key entry', async ({ browser }) => {
    const coordCtx = await browser.newContext();
    const aliceCtx = await browser.newContext();
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const alicePage = await aliceCtx.newPage();

    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    // 1. SPLIT-KEY ENTRY
    await coordRoom.shareLinkButton.click();
    await coordRoom.copySecureLinkButton.click();
    const secureLink = await coordPage.evaluate(() => navigator.clipboard.readText());

    await alicePage.goto(secureLink);
    await expect(alicePage.getByText('Decryption Key Required')).toBeVisible();

    // Get key separately
    await coordRoom.keyActionButton.click();
    await coordRoom.copyKeyButton.click();
    const key = await coordPage.evaluate(() => navigator.clipboard.readText());

    await alicePage.getByPlaceholder('Enter decryption key...').fill(key);
    await alicePage.getByRole('button', { name: 'Decrypt Room' }).click();
    await expect(alicePage.locator('span[title="Room Active"]')).toBeVisible();

    await coordCtx.close();
    await aliceCtx.close();
  });
});