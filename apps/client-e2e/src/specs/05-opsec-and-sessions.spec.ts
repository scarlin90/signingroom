import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';

/**
 * Suite: OpSec and 3-Way Session Sync
 * Focuses on secure access control, including the "Split-Key" handshake protocol, 
 * administrative locking, and real-time synchronization of participant identities.
 */
test.describe('OpSec and 3-Way Session Sync', () => {
  
  test('Should handle Split-Key handshake and unauthorized access denial', async ({ browser }) => {
    // Mark this test as slow to triple the timeout, as it manages 4 browser contexts.
    test.slow();

    // --- Setup: Multi-context browser environment ---
    const coordCtx = await browser.newContext();
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    // --- Interaction: Split-Key Initialization ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    // Step A: Coordinator shares the secure link only (no decryption key)
    await coordRoom.shareLinkButton.click();
    await coordRoom.copySecureLinkButton.click();
    const secureLink = await coordPage.evaluate(() => navigator.clipboard.readText());

    // --- Interaction: Unauthorized Access Attempt ---
    await alicePage.goto(secureLink);

    // --- Verification: Assert OpSec Block ---
    await expect(alicePage.getByText('Decryption Key Required')).toBeVisible();

    // --- Interaction: Manual Decryption Workflow ---
    await coordRoom.keyActionButton.click();
    await coordRoom.copyKeyButton.click();
    const decryptionKey = await coordPage.evaluate(() => navigator.clipboard.readText());

    await alicePage.getByPlaceholder('Enter decryption key...').fill(decryptionKey);
    await alicePage.getByRole('button', { name: 'Decrypt Room' }).click();
    const aliceRoom = new RoomPage(alicePage);
    
    // --- Verification: Authorized Access ---
    await expect(aliceRoom.activeIndicator).toBeVisible();

    // --- Interaction: Combined-Key Entry for Bob ---
    await coordRoom.shareLinkButton.click();
    await coordPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const fullLink = await coordPage.evaluate(() => navigator.clipboard.readText());
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
    const intruderCtx = await browser.newContext();
    const intruderPage = await intruderCtx.newPage();
    await intruderPage.goto(fullLink);
    
    // --- Verification: Assert Locked Room Access Denial ---
    await expect(intruderPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible();
    await expect(intruderPage.getByText('The Coordinator has locked this room.')).toBeVisible();

    // --- Interaction: Administrative Unlock (Prevention of Cleanup Timeout) ---
    // Unlocking the room ensures the relay server processes session termination gracefully.
    await coordRoom.lockButton.click();
    await expect(coordPage.getByText(/Are you sure you want to Unlock/i)).toBeVisible();
    await coordRoom.confirmButton.click();

    // Verification: Confirm state restoration
    await expect(coordPage.getByTitle('Room Active')).toBeVisible();

    // --- Interaction: Secure Parallel Cleanup ---
    // Using Promise.all prevents sequential closing delays that cause timeouts.
    await Promise.all([
      aliceCtx.close(),
      bobCtx.close(),
      intruderCtx.close(),
      coordCtx.close()
    ]);
  });

  test('Should sync Participant Labels across all users', async ({ browser }) => {
    // --- Setup: Secure multi-context environment ---
    const coordCtx = await browser.newContext();
    const aliceCtx = await browser.newContext();
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await aliceCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const alicePage = await aliceCtx.newPage();

    // --- Interaction: Establish Session ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    await coordRoom.shareLinkButton.click();
    await coordPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const fullLink = await coordPage.evaluate(() => navigator.clipboard.readText());
    const aliceRoom = await joinRoomFromLink(alicePage, fullLink);

    // --- Interaction: Participant Identity Labeling ---
    await aliceRoom.sessionIdButton.click();
    await aliceRoom.sessionNameInput.fill('Alice (Ledger)');
    await aliceRoom.sessionSaveButton.click();

    // --- Verification: Remote Identity Propagation ---
    await coordRoom.sessionIdButton.click();
    await expect(coordPage.getByText('Alice (Ledger)')).toBeVisible();
    
    // --- Verification: Metadata Consistency ---
    const aliceSessionRow = coordPage.locator('div.flex.items-center.justify-between').filter({ hasText: 'Alice (Ledger)' });
    await aliceSessionRow.getByTitle('Copy Session Details').click();

    // Confirm the copied session metadata reflects the chosen label
    const copiedDetails = await coordPage.evaluate(() => navigator.clipboard.readText());
    expect(copiedDetails).toContain('Alice (Ledger)');

    await coordCtx.close();
    await aliceCtx.close();
  });

  test('Should synchronize Room ID and Participant Identity across 3 users', async ({ browser }) => {
    // --- Setup: Triple-participant browser simulation ---
    const contexts = [await browser.newContext(), await browser.newContext(), await browser.newContext()];
    const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));
    await contexts[0].grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // --- Interaction: Host Room and Distribute Links ---
    const coordRoom = await launchRoomFromFixture(pages[0], '3_5_unsigned.psbt.txt');
    await coordRoom.shareLinkButton.click();
    await pages[0].getByRole('button', { name: /Copy Full Link/i }).click();
    const fullLink = await pages[0].evaluate(() => navigator.clipboard.readText());

    const aliceRoom = await joinRoomFromLink(pages[1], fullLink);
    const bobRoom = await joinRoomFromLink(pages[2], fullLink);

    // --- Verification: Core Identity Metadata ---
    await coordRoom.roomIdButton.click();
    await expect(pages[0].getByText('Public Routing Data')).toBeVisible();
    await coordRoom.roomIdModalCopyButton.click();
    const copiedId = await pages[0].evaluate(() => navigator.clipboard.readText());
    expect(copiedId).toMatch(/^[0-9a-f]{8}-/); 

    // --- Interaction: Broadcast Identity Update ---
    const aliceName = 'Alice (Ledger)';
    await aliceRoom.sessionIdButton.click();
    await aliceRoom.sessionNameInput.fill(aliceName);
    await aliceRoom.sessionSaveButton.click();
    await expect(aliceRoom.sessionsModal).toBeHidden();

    // --- Verification: Distributed Session Consistency ---
    // Ensure both the Coordinator and Bob receive Alice's identity update in their respective session lists
    for (const p of [pages[0], pages[2]]) {
      const room = new RoomPage(p);
      await room.sessionIdButton.click();
      
      const aliceRow = room.getSessionRow(aliceName); 
      await expect(aliceRow).toBeVisible({ timeout: 10000 });
      
      await aliceRow.getByTitle('Copy Session Details').click();
      
      await room.closeSessionsModalButton.click();
      await expect(room.sessionsModal).toBeHidden();
    }

    for (const ctx of contexts) await ctx.close();
  });

  test('Should handle Split-Key vs Combined-Key entry', async ({ browser }) => {
    // --- Setup: Dual-context browser simulation ---
    const coordCtx = await browser.newContext();
    const aliceCtx = await browser.newContext();
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const alicePage = await aliceCtx.newPage();

    // --- Interaction: Split-Key Entry Protocol ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    await coordRoom.shareLinkButton.click();
    await coordRoom.copySecureLinkButton.click();
    const secureLink = await coordPage.evaluate(() => navigator.clipboard.readText());

    await alicePage.goto(secureLink);
    
    // --- Verification: Assert Security Barrier ---
    await expect(alicePage.getByText('Decryption Key Required')).toBeVisible();

    // --- Interaction: Manual Unlock ---
    await coordRoom.keyActionButton.click();
    await coordRoom.copyKeyButton.click();
    const key = await coordPage.evaluate(() => navigator.clipboard.readText());

    await alicePage.getByPlaceholder('Enter decryption key...').fill(key);
    await alicePage.getByRole('button', { name: 'Decrypt Room' }).click();
    
    // --- Verification: Entry Success ---
    await expect(alicePage.locator('span[title="Room Active"]')).toBeVisible();

    await coordCtx.close();
    await aliceCtx.close();
  });
});