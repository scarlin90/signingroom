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
    await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt', 'signet', false);

    // ==========================================
    // PHASE 1: ROOM HEADER VERIFICATION
    // ==========================================

    // --- Verification: UnBlur, Active Status & Branding ---
    await roomPage.headerHiddenBadge.click({ force: true });
    await roomPage.privacyModalRevealSection.click();
    
    // CRITICAL: Force Playwright to wait for the CSS animation to complete
    await expect(roomPage.headerHiddenBadge).toBeHidden(); 

    await expect(roomPage.activeIndicator).toBeVisible();
    await expect(roomPage.roomTitle).toContainText('Untitled Room');

    // --- Verification: Network Context ---
    await expect(page.getByText(/signet/i)).toBeVisible();
    await expect(page.getByText('Coordinator', { exact: true })).toBeVisible();

    // Re-blur
    await roomPage.headerEyeToggle.click({ force: true });
    await expect(roomPage.headerHiddenBadge).toBeVisible();

    // ==========================================
    // PHASE 2: ROOM METADATA VERIFICATION
    // ==========================================

    // --- Verification: Room Identity ---
    const roomId = await roomPage.getRoomId();
    expect(roomId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // --- Verification: Countdown Timer Logic ---
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

    // --- Interaction: Reveal Proposal ---
    await roomPage.proposalHiddenBadge.click({ force: true });
    await roomPage.privacyModalRevealSection.click();
    await expect(roomPage.proposalHiddenBadge).toBeHidden();

    // --- Verification: Proposal Financials ---
    await expect(roomPage.proposalContainer).toContainText('0.00100913 BTC');
    await expect(roomPage.proposalContainer).toContainText('$95.87');
    await expect(roomPage.proposalContainer).toContainText('1.37 sats/vB');

    // --- Interaction: Re-blur Proposal ---
    await roomPage.proposalEyeToggle.click({ force: true });
    await expect(roomPage.proposalHiddenBadge).toBeVisible();

    // ==========================================
    // PHASE 4: TRANSACTION DETAILS (TABS) VERIFICATION
    // ==========================================
    
    // --- Interaction: Reveal Details ---
    await roomPage.detailsHiddenBadge.click({ force: true });
    await roomPage.privacyModalRevealSection.click();
    await expect(roomPage.detailsHiddenBadge).toBeHidden(); // Prevents the intercept error

    // --- Verification: Outputs (Default View) ---
    const outputCard = roomPage.getCard(0, '0.00100913 BTC');
    await expect(outputCard).toContainText('bc1q04e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196');
    await expect(outputCard.getByRole('button', { name: /Approve Destination/i })).toBeVisible();

    // --- Interaction: Switch to Inputs Tab ---
    // Note: Bypassing roomPage.switchTab() to explicitly apply { force: true } 
    // This prevents the sticky z-50 navbar from intercepting the click on scroll
    await page.getByRole('button', { name: /Inputs \(\d+\)/i }).click({ force: true });
    
    // --- Verification: Inputs Details ---
    const inputCard = roomPage.getCard(0, '0.00101106 BTC');
    await expect(inputCard).toContainText('bc1q739fe38612ee73e2a2efc24600a7485898615bc8c2607d159332c7cbcb4693e2');
    await expect(inputCard.getByRole('button', { name: /Approve Source/i })).toBeVisible();

    // --- Interaction: Re-blur Details ---
    await roomPage.detailsEyeToggle.click({ force: true });
    await expect(roomPage.detailsHiddenBadge).toBeVisible();

    // ==========================================
    // PHASE 5: SIGNERS VERIFICATION
    // ==========================================

    // --- Interaction: Reveal Signers ---
    await roomPage.signersHiddenBadge.click({ force: true });
    await roomPage.privacyModalRevealSection.click();
    await expect(roomPage.signersHiddenBadge).toBeHidden();

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

    // --- Interaction: Re-blur Signers ---
    await roomPage.signersEyeToggle.click({ force: true });
    await expect(roomPage.signersHiddenBadge).toBeVisible();

    // ==========================================
    // PHASE 6: ACTION BAR VERIFICATION
    // ==========================================

    // --- Verification: Utility Button Presence ---
    const actions = ['Audit Log', 'CSV', 'Link Key', 'Backup Admin', 'Share Link', 'QR Code', 'Lock Room', 'Close'];
    for (const actionName of actions) {
      await expect(page.getByRole('button', { name: actionName, exact: false })).toBeVisible();
    }

    // --- Interaction: Secure Cleanup ---
    await roomPage.closeButton.click({ force: true });
    await roomPage.confirmButton.click();

    // Verification: Redirection
    await expect(page).toHaveURL('http://localhost:4200/');
  });
});