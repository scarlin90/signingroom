import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { CreatePage } from '../support/create.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Suite: Edge Cases, Errors, and UX Features
 * Focuses on error resilience, participant management tools (labeling/nudging), 
 * batch operations, and the immediate enforcement of room destruction across active sessions.
 */
test.describe('Edge Cases, Errors, and UX Features', () => {

  test('Should handle invalid file uploads gracefully on Create Page', async ({ page }) => {
    // --- Interaction: Setup failure state ---
    const createPage = new CreatePage(page);
    await createPage.navigate();
    await createPage.launchButton.click();

    // Generate a non-PSBT file to trigger a parsing exception
    const invalidFilePath = path.join(__dirname, '../fixtures', 'dummy.jpg');
    fs.writeFileSync(invalidFilePath, 'fake image data');

    // --- Interaction: Upload incompatible data ---
    await createPage.fileInput.setInputFiles(invalidFilePath);

    // --- Verification: Assert error handling UI ---
    // Ensure the application provides clear feedback instead of crashing
    await expect(page.getByText('Parsing Error')).toBeVisible();
    await expect(page.getByText(/Invalid PSBT format/i)).toBeVisible();

    // Cleanup generated fixture
    fs.unlinkSync(invalidFilePath);
  });

  test('Coordinator should be able to label and nudge signers', async ({ page }) => {
    // --- Interaction: Setup coordinator session ---
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const roomPage = await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt');

    const aliceFingerprint = 'fe0fa7b4';

    // --- Interaction: Apply custom identity label ---
    await roomPage.getEditLabelButton(aliceFingerprint).click();
    await expect(roomPage.page.getByText('Label Signer')).toBeVisible();
    
    await roomPage.labelNameInput.fill('Vault Key A');
    await roomPage.saveLabelButton.click();

    // --- Verification: Assert label persistence ---
    await expect(roomPage.getSignerRow(aliceFingerprint)).toContainText('Vault Key A');

    // --- Interaction: Trigger participant nudge ---
    await roomPage.getNudgeButton(aliceFingerprint).click();
    
    // --- Verification: Assert feedback and clipboard content ---
    await expect(page.getByText('Nudge Message Copied')).toBeVisible();
    
    await roomPage.okButton.click();

    // Confirm the clipboard contains the personalized nudge message
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('Signature needed from: Vault Key A');
  });

  test.skip('Should allow Batch Whitelisting of outputs', async ({ page }) => {
    // --- Interaction: Load complex transaction ---
    const roomPage = await launchRoomFromFixture(page, 'many_outputs_fixture.psbt.txt'); 
    
    await roomPage.switchTab('Outputs');
    
    // --- Interaction: Trigger batch verification ---
    await expect(roomPage.verifyAllOutputsButton).toBeVisible();
    await roomPage.verifyAllOutputsButton.click();
    
    // --- Verification: Assert confirmation modal ---
    await expect(page.getByText(/Are you sure you want to verify all/i)).toBeVisible();
    await roomPage.confirmButton.click();

    // --- Verification: Assert state change for all items ---
    const outputCards = roomPage.page.locator('div.p-3').filter({ hasText: 'BTC' });
    const count = await outputCards.count();
    
    for (let i = 0; i < count; i++) {
        await expect(outputCards.nth(i)).toHaveClass(/border-emerald-500/);
    }
  });

  test('Room closure should immediately kick out connected Guests', async ({ browser }) => {
    // --- Setup: Secure multi-context environment ---
    const coordCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    await coordCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordPage = await coordCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // --- Interaction: Establish synchronized session ---
    const coordRoom = await launchRoomFromFixture(coordPage, '3_5_unsigned.psbt.txt');
    
    await coordRoom.shareLinkButton.click();
    await coordPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const sharedLink = await coordPage.evaluate(() => navigator.clipboard.readText());

    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    // --- Interaction: Coordinator terminates the room ---
    await coordRoom.closeButton.click();
    await coordPage.getByRole('button', { name: 'Confirm' }).click();

    // --- Verification: Assert immediate Guest eviction ---
    // Ensure the Guest session is terminated and private data is cleared from their view
    await expect(guestPage.getByRole('heading', { name: 'Signing Room Closed' })).toBeVisible();
    await expect(guestPage.getByText('All data has been securely wiped.')).toBeVisible();

    await coordCtx.close();
    await guestCtx.close();
  });
});