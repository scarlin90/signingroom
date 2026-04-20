import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture } from '../support/room-helper';

test.describe('Room Management and OpSec', () => {
  let roomPage: RoomPage;

  test.beforeEach(async ({ page }) => {
    // Start every test by launching a standard room
    roomPage = await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt');
  });

  test('should allow renaming the room', async () => {
    await roomPage.renameButton.click();
    
    // Ensure the modal has actually appeared before typing
    await expect(roomPage.renameInput).toBeVisible();
    await roomPage.renameInput.fill('Project Omega Signing');
    await roomPage.saveNameButton.click();

    await expect(roomPage.roomTitle).toContainText('Project Omega Signing');
  });

  test('should toggle room lock status', async () => {
    // ==========================================
    // 1. LOCK THE ROOM
    // ==========================================
    await roomPage.lockButton.click();
    
    // Verify the LOCK confirmation modal
    await expect(roomPage.page.getByText(/Are you sure you want to LOCK/i)).toBeVisible();
    await roomPage.confirmButton.click();
    
    // Verify via the title attribute, not text
    await expect(roomPage.page.getByTitle('Room Locked')).toBeVisible();
    await expect(roomPage.page.getByTitle('Room Active')).toBeHidden();

    // ==========================================
    // 2. UNLOCK THE ROOM
    // ==========================================
    await roomPage.lockButton.click();

    // Verify the UNLOCK confirmation modal
    await expect(roomPage.page.getByText(/Are you sure you want to Unlock/i)).toBeVisible();
    await roomPage.confirmButton.click();

    // Verify indicators swap back
    await expect(roomPage.page.getByTitle('Room Locked')).toBeHidden();
    await expect(roomPage.page.getByTitle('Room Active')).toBeVisible();
  });

  test('should allow whitelisting (approving) addresses', async () => {
    const address = 'bc1q04e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196';
    const outputCard = roomPage.getCard(0, '0.00100913 BTC');
    const approveBtn = outputCard.getByRole('button', { name: /Approve Destination/i });

    // 1. Trigger the workflow
    await approveBtn.click();
    await expect(roomPage.page.getByText('Update Whitelist')).toBeVisible();
    await roomPage.confirmButton.click();

    // A. Visual Style: Emerald border
    await expect(outputCard).toHaveClass(/border-emerald-500/, { timeout: 10000 });

    // B. Verified Badge: Shield icon and text appear
    await expect(outputCard.getByText(/Verified Destination/i)).toBeVisible();
    // Verify the shield icon exists (lucide-icon) inside the badge area
    await expect(outputCard.locator('lucide-icon').filter({ hasText: '' }).nth(1)).toBeVisible();

    // C. Data Integrity: The specific address is still visible and correct
    await expect(outputCard.getByText(address)).toBeVisible();

    // D. Action Toggle: Approve button is gone, Revoke link appears
    await expect(approveBtn).toBeHidden();
    await expect(outputCard.getByRole('button', { name: 'Revoke' })).toBeVisible();
  });

  test('should record actions in the Audit Log and trigger download', async () => {
    // 1. Rename room to generate a log entry
    await roomPage.renameButton.click();
    await roomPage.renameInput.fill('Audited Room');
    await roomPage.saveNameButton.click();

    // 2. Open the modal
    await roomPage.auditLogButton.click();
    
    // 3. Setup download listener before clicking
    const downloadPromise = roomPage.page.waitForEvent('download');
    
    // Now this will no longer be undefined!
    await roomPage.downloadPdfButton.click();
    
    const download = await downloadPromise;

    // 4. Assertions
    expect(download.suggestedFilename()).toContain('SigningRoom_Audit');
    expect(download.suggestedFilename()).toContain('.pdf');
  });

  test('should trigger the settlement data CSV download', async () => {
    // 1. Open the CSV download modal
    await roomPage.csvActionButton.click();
    
    // 2. Verify modal content and privacy warning
    const csvModalHeader = roomPage.page.getByRole('heading', { name: /Download CSV Data/i });
    await expect(csvModalHeader).toBeVisible();
    await expect(roomPage.page.getByText(/Confidential Data/i)).toBeVisible();

    // 3. Set up the download listener
    const downloadPromise = roomPage.page.waitForEvent('download');
    
    // 4. Click the confirmation button inside the modal
    await roomPage.csvDownloadButton.click();
    
    const download = await downloadPromise;

    // 5. Final Assertion: Verify the filename matches the settlement logic
    // Expected format: settlement_[RoomID]_[YYYY-MM-DD].csv
    expect(download.suggestedFilename()).toContain('settlement_');
    expect(download.suggestedFilename()).toContain('.csv');
  });
});