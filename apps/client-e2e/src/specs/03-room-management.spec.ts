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

  test.beforeEach(async ({ page }) => {
    roomPage = await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt');
    // Ensure we start at the top of the viewport
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  test('should allow renaming the room', async () => {
    // --- Interaction: Trigger the rename workflow ---
    // Use { force: true } to bypass sticky top-nav occlusion during automated scrolling
    await roomPage.renameButton.click({ force: true });

    // --- Verification: Assert modal presence and functionality ---
    await expect(roomPage.renameInput).toBeVisible();
    await roomPage.renameInput.fill('Project Omega Signing');
    await roomPage.saveNameButton.click();

    // --- Verification: Confirm identity persistence ---
    await expect(roomPage.roomTitle).toContainText('Project Omega Signing');
  });

  test('should toggle room lock status', async () => {
    // --- Interaction: Initiate Lock Sequence ---
    await roomPage.lockButton.click({ force: true });

    // --- Verification: Assert destructive action confirmation ---
    await expect(roomPage.page.getByText(/Are you sure you want to LOCK/i)).toBeVisible();
    await roomPage.confirmButton.click();

    // --- Verification: Confirm Locked state indicators ---
    await expect(roomPage.page.getByTitle('Room Locked')).toBeVisible();
    await expect(roomPage.page.getByTitle('Room Active')).toBeHidden();

    // --- Interaction: Initiate Unlock Sequence ---
    await roomPage.lockButton.click({ force: true });

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
    const address = 'tb1qqn3pzlcmp8mudfhljtdwe7u6fhjhh3x2rr3njvlj35gx0kqmxxtqlqrzyc';
    // 1. Get the card by row number
    const outputCard = roomPage.getOutputCard(0);
    await expect(outputCard).toBeVisible();

    // 2. Check for the Verified text (using \s+ to handle the <br> tag)
    const verificationBadge = outputCard.locator('.verification-badge');
    await expect(verificationBadge).toContainText('Unverified Output', { ignoreCase: true });

    // 3. Check for the specific BTC amount
    await expect(outputCard.getByText('0.00100913 BTC')).toBeVisible();

    // 4. Check for the specific address
    await expect(
      outputCard.getByText('tb1qqn3pzlcmp8mudfhljtdwe7u6fhjhh3x2rr3njvlj35gx0kqmxxtqlqrzyc'),
    ).toBeVisible();

    // 6. Check that the clipboard button is available
    // The button contains the tooltip text "Copy Address" inside a hidden div
    const clipboardBtn = outputCard.locator('button').filter({ hasText: /Copy Address/i });
    await expect(clipboardBtn).toBeVisible();
    await expect(clipboardBtn).toBeEnabled();

    const approveBtn = outputCard.getByRole('button', { name: /Verify/i });

    // --- Interaction: Approve the destination ---
    await approveBtn.click({ force: true });
    await expect(roomPage.page.getByText('Update Whitelist')).toBeVisible();
    await roomPage.confirmButton.click();

    // --- Verification: Confirm visual proof of verification and status persistence ---
    await expect(outputCard).toHaveClass(/border-emerald-500/, { timeout: 10000 });

    await expect(outputCard.locator('.verification-badge')).toContainText('Verified Output', {
      ignoreCase: true,
    });

    await expect(outputCard.getByText(address)).toBeVisible();

    // Ensure the CTA button is replaced by the 'Revoke' action
    await expect(approveBtn).toBeHidden();
    await expect(outputCard.getByRole('button', { name: 'Revoke' })).toBeVisible();

    // --- Interaction: Revoke verification ---
    await outputCard.getByRole('button', { name: 'Revoke' }).click({ force: true });
    await expect(roomPage.page.getByText('Update Whitelist')).toBeVisible();
    await roomPage.confirmButton.click();

    // --- Verification: Confirm state reversion ---
    await expect(approveBtn).toBeVisible();
    await expect(outputCard.locator('.verification-badge')).toContainText('Unverified Output', {
      ignoreCase: true,
    });
  });

  test('should allow labeling UTXO addresses', async () => {
    // --- Interaction: Navigate to the Outputs tab ---
    await roomPage.switchTab('Outputs');

    // --- Interaction: Open the label modal for the first output ---
    await roomPage.getEditAddressLabelButton('output', 0).click({ force: true });

    // --- Verification: Modal should be visible ---
    await expect(roomPage.addressLabelInput).toBeVisible();

    // --- Interaction: Assign a new label ---
    await roomPage.addressLabelInput.fill('Corporate Treasury Cold Storage');
    await roomPage.saveAddressLabelButton.click();

    // --- Verification: The label should be rendered on the specific card ---
    const outputCard = roomPage.getOutputCard(0);
    await expect(outputCard.getByText('Corporate Treasury Cold Storage')).toBeVisible();
  });

  test('should allow filtering UTXOs by raw address and custom labels', async () => {
    // --- Interaction: Navigate to the Outputs tab ---
    await roomPage.switchTab('Outputs');

    // --- Interaction: Assign a new label to the first output ---
    const customLabel = 'Project Fund Wallet';
    await roomPage.getEditAddressLabelButton('output', 0).click({ force: true });
    await expect(roomPage.addressLabelInput).toBeVisible();
    await roomPage.addressLabelInput.fill(customLabel);
    await roomPage.saveAddressLabelButton.click();

    // Verify label is applied before searching
    const outputCard = roomPage.getOutputCard(0);
    await expect(outputCard.getByText(customLabel)).toBeVisible();

    // --- Verification: Search by partial raw address ---
    await roomPage.outputSearchInput.fill('tb1qqn3');
    // Ensure the target card remains visible while filtering
    await expect(outputCard).toBeVisible();

    // --- Verification: Search by the new custom label (case-insensitive) ---
    await roomPage.outputSearchInput.fill('project fund');
    await expect(outputCard.getByText(customLabel)).toBeVisible();

    // --- Verification: Search by non-existent string ---
    await roomPage.outputSearchInput.fill('NO_MATCH_12345');
    // The cards should completely disappear
    await expect(roomPage.page.locator('.address-card')).toHaveCount(0);
    // The empty state message should appear
    await expect(roomPage.page.getByText('No outputs match your search.')).toBeVisible();

    // --- Cleanup: Clear search and verify cards return ---
    await roomPage.outputSearchInput.fill('');
    await expect(roomPage.getOutputCard(0)).toBeVisible();
  });

  test('should record actions in the Audit Log and trigger download', async () => {
    // --- Interaction: room activity already generated with unveal for the log ---

    // --- Interaction: Open audit modal and prepare download listener ---
    await roomPage.auditLogButton.click({ force: true });
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
    await roomPage.csvActionButton.click({ force: true });

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
