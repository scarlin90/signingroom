import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture } from '../support/room-helper';

/**
 * Suite: Room Interface Verification
 * Comprehensive validation of the post-creation environment. 
 * Ensures all headers, metadata, transaction proposal data, 
 * tabbed details, and signer tracking are rendered correctly.
 */
test.describe('Room Interface Verification', () => {
  let roomPage: RoomPage;

  test('should create a room and verify all initial UI elements and data', async ({ page }) => {
    roomPage = new RoomPage(page);

    // --- Interaction: Launch the Room ---
    // Establish a live session using the standard 3-of-5 multisig fixture on Signet
    await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt', 'signet');

    // ==========================================
    // PHASE 1: ROOM HEADER VERIFICATION
    // ==========================================

    // --- Verification: Active Status & Branding ---
    await expect(roomPage.activeIndicator).toBeVisible();
    await expect(roomPage.activeIndicator).toHaveClass(/bg-emerald-500/);
    await expect(roomPage.roomTitle).toContainText('Untitled Room');
    await expect(roomPage.renameButton).toBeVisible();

    // --- Verification: Network Context ---
    const networkBadge = page.locator('div').filter({ hasText: /^Network:/i });
    await expect(networkBadge).toContainText('signet');

    // ==========================================
    // PHASE 2: ROOM METADATA VERIFICATION
    // ==========================================

    // --- Verification: Room Identity ---
    // Confirm the Room ID exists and follows UUID v4 formatting
    const roomId = await roomPage.getRoomId();
    expect(roomId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // --- Verification: Countdown Timer Logic ---
    // Wait for timer initialization and verify the countdown is active
    await expect(roomPage.timer).not.toHaveText('Loading...');
    await expect(roomPage.timer).toContainText(/hrs/);
    
    const timerText = await roomPage.timer.innerText();
    const timeMatches = timerText.match(/\d+/g);
    if (!timeMatches) throw new Error(`Could not parse timer text: ${timerText}`);
    
    const [hrs, mins, secs] = timeMatches.map(Number);
    expect(hrs).toBe(23);
    expect(mins).toBeGreaterThanOrEqual(58);
    expect(secs).toBeGreaterThanOrEqual(40);

    // --- Verification: Session Tracking ---
    await expect(page.getByText('Coordinator', { exact: true })).toBeVisible();
    await expect(roomPage.sessionIdButton).toContainText('1');

    // ==========================================
    // PHASE 3: TRANSACTION PROPOSAL VERIFICATION
    // ==========================================

    // --- Verification: Proposal Financials ---
    const proposalContainer = page.locator('div').filter({ hasText: 'Transaction Proposal' }).last();
    await expect(proposalContainer).toContainText('0.00100913 BTC');
    await expect(proposalContainer).toContainText('$95.87');
    await expect(proposalContainer).toContainText('1.37 sats/vB');

    // ==========================================
    // PHASE 4: TRANSACTION DETAILS (TABS) VERIFICATION
    // ==========================================
    
    // --- Verification: Outputs (Default View) ---
    const outputCard = roomPage.getCard(0, '0.00100913 BTC');
    await expect(outputCard).toContainText('bc1q04e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196');
    await expect(outputCard.getByRole('button', { name: /Approve Destination/i })).toBeVisible();

    // --- Interaction: Switch to Inputs Tab ---
    await roomPage.switchTab('Inputs');
    
    // --- Verification: Inputs Details ---
    const inputCard = roomPage.getCard(0, '0.00101106 BTC');
    await expect(inputCard).toContainText('bc1q739fe38612ee73e2a2efc24600a7485898615bc8c2607d159332c7cbcb4693e2');
    await expect(inputCard.getByRole('button', { name: /Approve Source/i })).toBeVisible();

    // ==========================================
    // PHASE 5: SIGNERS VERIFICATION
    // ==========================================

    // --- Verification: Progress Tracking ---
    await expect(page.getByText('0 Signed')).toBeVisible();
    
    // Verify each fingerprint from the 3-of-5 multisig is rendered
    const fingerprints = ['fe0fa7b4', '57308a20', '7fd7cacb', 'af4b013d', 'a423185b'];
    for (const fp of fingerprints) {
      await expect(roomPage.getSignerRow(fp)).toBeVisible();
    }
    
    // Ensure the finalization button reflects 0/5 signatures and is disabled
    const finalizeBtn = page.getByRole('button', { name: /Waiting for Signatures \(0 \/ 5\)/i });
    await expect(finalizeBtn).toBeDisabled();

    // ==========================================
    // PHASE 6: ACTION BAR VERIFICATION
    // ==========================================

    // --- Verification: Utility Button Presence ---
    const actions = ['Audit Log', 'CSV', 'Link Key', 'Backup Admin', 'Share Link', 'QR Code', 'Lock Room', 'Close'];
    for (const actionName of actions) {
      await expect(page.getByRole('button', { name: actionName, exact: false })).toBeVisible();
    }

    // --- Interaction: Secure Cleanup ---
    await roomPage.closeButton.click();
    await roomPage.confirmButton.click();

    // Verification: Redirection
    await expect(page).toHaveURL('http://localhost:4200/');
  });
});