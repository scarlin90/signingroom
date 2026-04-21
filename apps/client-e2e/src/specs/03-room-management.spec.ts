import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture } from '../support/room-helper';

/**
 * Suite: Room Management and OpSec
 * Focuses on administrative actions available to the coordinator, 
 * including room configuration, security locks, address verification, 
 * and data export functionality.
 */
test.describe('Room Management and OpSec', () => {
  let roomPage: RoomPage;

  // Interaction: Initialize a standard room session before every test
  test.beforeEach(async ({ page }) => {
    roomPage = await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt');
  });

  test('should allow renaming the room', async () => {
    // --- Interaction: Trigger the rename workflow ---
    await roomPage.renameButton.click();
    
    // --- Verification: Assert modal presence and functionality ---
    await expect(roomPage.renameInput).toBeVisible();
    await roomPage.renameInput.fill('Project Omega Signing');
    await roomPage.saveNameButton.click();

    // --- Verification: Confirm identity persistence ---
    await expect(roomPage.roomTitle).toContainText('Project Omega Signing');
  });

  test('should toggle room lock status', async () => {
    // --- Interaction: Initiate Lock Sequence ---
    await roomPage.lockButton.click();
    
    // --- Verification: Assert destructive action confirmation ---
    await expect(roomPage.page.getByText(/Are you sure you want to LOCK/i)).toBeVisible();
    await roomPage.confirmButton.click();
    
    // --- Verification: Confirm Locked state indicators ---
    await expect(roomPage.page.getByTitle('Room Locked')).toBeVisible();
    await expect(roomPage.page.getByTitle('Room Active')).toBeHidden();

    // --- Interaction: Initiate Unlock Sequence ---
    await roomPage.lockButton.click();

    // --- Verification: Assert unlock confirmation ---
    await expect(roomPage.page.getByText(/Are you sure you want to Unlock/i)).toBeVisible();
    await roomPage.confirmButton.click();

    // --- Verification: Confirm Active state restoration ---
    await expect(roomPage.page.getByTitle('Room Locked')).toBeHidden();
    await expect(roomPage.page.getByTitle('Room Active')).toBeVisible();
  });

  test('should allow whitelisting (approving) addresses', async () => {
    // --- Interaction: Navigate to the Outputs tab ---
    await roomPage.switchTab('Outputs');

    // --- Setup: Identify target address and associated UI card ---
    const address = 'bc1q04e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196';
    const outputCard = roomPage.getCard(0, '0.00100913 BTC');
    const approveBtn = outputCard.getByRole('button', { name: /Approve Destination/i });

    // --- Interaction: Approve the destination ---
    await approveBtn.click();
    await expect(roomPage.page.getByText('Update Whitelist')).toBeVisible();
    await roomPage.confirmButton.click();

    // --- Verification: Confirm visual proof of verification and status persistence ---
    await expect(outputCard).toHaveClass(/border-emerald-500/, { timeout: 10000 });
    await expect(outputCard.getByText(/Verified Destination/i)).toBeVisible();
    await expect(outputCard.locator('lucide-icon').filter({ hasText: '' }).nth(1)).toBeVisible();
    await expect(outputCard.getByText(address)).toBeVisible();

    // Ensure the CTA button is replaced by the 'Revoke' action
    await expect(approveBtn).toBeHidden();
    await expect(outputCard.getByRole('button', { name: 'Revoke' })).toBeVisible();

    // --- Interaction: Revoke verification ---
    await outputCard.getByRole('button', { name: 'Revoke' }).click();
    await expect(roomPage.page.getByText('Update Whitelist')).toBeVisible();
    await roomPage.confirmButton.click();

    // --- Verification: Confirm state reversion ---
    await expect(approveBtn).toBeVisible();
    await expect(outputCard.getByText(/Verified Destination/i)).toBeHidden();
  });

  test('should record actions in the Audit Log and trigger download', async () => {
    // --- Interaction: Generate room activity for the log ---
    await roomPage.renameButton.click();
    await roomPage.renameInput.fill('Audited Room');
    await roomPage.saveNameButton.click();

    // --- Interaction: Open audit modal and prepare download listener ---
    await roomPage.auditLogButton.click();
    const downloadPromise = roomPage.page.waitForEvent('download');
    
    // Trigger PDF generation
    await roomPage.downloadPdfButton.click();
    const download = await downloadPromise;

    // --- Verification: Assert correct PDF generation and filename ---
    expect(download.suggestedFilename()).toContain('SigningRoom_Audit');
    expect(download.suggestedFilename()).toContain('.pdf');
  });

  test('should trigger the settlement data CSV download', async () => {
    // --- Interaction: Open CSV export options ---
    await roomPage.csvActionButton.click();
    
    // --- Verification: Assert data confidentiality warnings ---
    const csvModalHeader = roomPage.page.getByRole('heading', { name: /Download CSV Data/i });
    await expect(csvModalHeader).toBeVisible();
    await expect(roomPage.page.getByText(/Confidential Data/i)).toBeVisible();

    // --- Interaction: Trigger and capture the download ---
    const downloadPromise = roomPage.page.waitForEvent('download');
    await roomPage.csvDownloadButton.click();
    const download = await downloadPromise;

    // --- Verification: Assert correct CSV generation and filename ---
    expect(download.suggestedFilename()).toContain('settlement_');
    expect(download.suggestedFilename()).toContain('.csv');
  });
});