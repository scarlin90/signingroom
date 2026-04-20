import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture } from '../support/room-helper';

test.describe('Room Interface Verification', () => {
  let roomPage: RoomPage;

  test('should create a room, verify core metadata, and safely close it', async ({ page }) => {
    roomPage = new RoomPage(page);

    // 1. Setup: Launch the room using our helper
    await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt', 'signet');

    // 2. Routing: Verify we landed in a room
    await expect(page).toHaveURL(/\/room\/.+/);

    // ==========================================
    // METADATA VERIFICATION (POM Version)
    // ==========================================
    
    // Verify Active status and default name
    await expect(roomPage.activeIndicator).toBeVisible();
    await expect(roomPage.roomTitle).toContainText('Untitled Room');

    // Verify Room ID is a valid UUID
    const roomId = await roomPage.getRoomId();
    expect(roomId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // Verify Timer is active (waiting for sync)
    await expect(roomPage.timer).not.toHaveText('Loading...');
    await expect(roomPage.timer).toContainText(/hrs/);

    // ==========================================
    // TEARDOWN
    // ==========================================
    
    // Close the room using semantic locators
    await roomPage.closeButton.click();
    await roomPage.confirmButton.click();

    // Verify redirect back to home
    await expect(page).toHaveURL('http://localhost:4200/');
  });
});

// test.describe('Signing Room Lifecycle and UI Verification', () => {
//   test('should create a room and verify all initial UI elements and data', async ({ page }) => {
//     // 1. Navigation and Creation
//     await page.goto('/');
//     await page.getByRole('link', { name: /Start Signing/i }).first().click();
//     await page.getByRole('button', { name: /Launch Signing Room/i }).click();
//     await page.getByRole('button', { name: /signet/i }).click();

//     const fileInput = page.locator('input[type="file"]');
//     const unsignedPsbtPath = path.join(__dirname, 'fixtures', '3_5_unsigned.psbt.txt');
//     await fileInput.setInputFiles(unsignedPsbtPath);

//     await page.getByRole('button', { name: /Start Signing Ceremony/i }).click();
//     await expect(page).toHaveURL(/\/room\/.+/);

//     // ==========================================
//     // ROOM HEADER VERIFICATION
//     // ==========================================

//     // 1. Verify the 'Room Active' green pulsing indicator
//     const activeIndicator = page.locator('span[title="Room Active"]');
//     await expect(activeIndicator).toBeVisible();
//     await expect(activeIndicator).toHaveClass(/bg-emerald-500/);

//     // 2. Verify the default Room Name
//     await expect(page.locator('h1')).toContainText('Untitled Room');

//     // 3. Verify the 'Rename Room' edit icon button exists
//     const renameBtn = page.getByRole('button', { name: 'Rename Room' });
//     await expect(renameBtn).toBeVisible();

//     // 4. Verify the Network is set to 'signet'
//     // We target the div containing the "Network:" label to ensure we aren't matching random text
//     const networkBadge = page.locator('div').filter({ hasText: /^Network:/i });
//     await expect(networkBadge).toContainText('signet');
    
//     // ==========================================
//     // ROOM METADATA VERIFICATION
//     // ==========================================
    
//     // 1. Verify Room ID with a specific locator
//     const roomIdButton = page.locator('div.relative.group')
//         .filter({ hasText: 'View Room ID' })
//         .locator('button');
//     await expect(roomIdButton).toBeVisible();
//     const roomIdText = await roomIdButton.innerText();
//     expect(roomIdText.trim()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

//     // 2. Verify Room Timer
//     const timerContainer = page.locator('div.relative.group')
//         .filter({ hasText: 'Room auto-expires' });
    
//     const timerElement = timerContainer.locator('span.font-mono.font-bold');

//     // WAIT for the text to change from "Loading..." to something containing "hrs"
//     // Playwright will retry this assertion for up to 5 seconds by default
//     await expect(timerElement).not.toHaveText('Loading...');
//     await expect(timerElement).toContainText(/hrs/);
    
//     const timerText = await timerElement.innerText();
    
//     // Parse: "23 hrs 58 m 57 s" -> [23, 58, 57]
//     const timeMatches = timerText.match(/\d+/g);
//     if (!timeMatches) throw new Error(`Could not parse timer text: ${timerText}`);
    
//     const [hrs, mins, secs] = timeMatches.map(Number);

//     // Assertions: Allow for delay during room creation
//     expect(hrs).toBe(23);
//     expect(mins).toBeGreaterThanOrEqual(58);
//     expect(secs).toBeGreaterThanOrEqual(40);

//     // Verify Coordinator Badge and initial Session Count (1)
//     await expect(page.getByText('Coordinator', { exact: true })).toBeVisible();
//     const sessionBtn = page.locator('div.relative.group').filter({ hasText: 'View Active Sessions' }).locator('button').first();
//     await expect(sessionBtn).toContainText('1');

//     // ==========================================
//     // TRANSACTION PROPOSAL VERIFICATION
//     // ==========================================
//     const proposalContainer = page.locator('div').filter({ hasText: 'Transaction Proposal' }).last();
//     await expect(proposalContainer).toContainText('0.00100913 BTC');
//     await expect(proposalContainer).toContainText('$95.87');
//     await expect(proposalContainer).toContainText('1.37 sats/vB');

//     // ==========================================
//     // TRANSACTION DETAILS (TABS) VERIFICATION
//     // ==========================================
    
//     // 1. Check Outputs (Default View)
//     await expect(page.getByRole('button', { name: 'Outputs (1)' })).toBeVisible();
    
//     // Target the specific Output Card using the container class 'p-3'
//     const outputCard = page.locator('div.p-3').filter({ hasText: '#0' }).filter({ hasText: '0.00100913 BTC' });
    
//     // Verify basic data
//     await expect(outputCard).toContainText('#0');
//     await expect(outputCard).toContainText('0.00100913 BTC');
//     await expect(outputCard).toContainText('bc1q04e2117f1b09f7c6a6ff92daecfb9a4de57bc4ca18e33933f28d1067d81b3196');

//     // NEW: Verify the "Approve Destination" action button exists in the output card
//     await expect(outputCard.getByRole('button', { name: /Approve Destination/i })).toBeVisible();

//     // 2. Switch to Inputs and Verify
//     await page.getByRole('button', { name: 'Inputs (1)' }).click();
    
//     // Target the specific Input Card
//     const inputCard = page.locator('div.p-3').filter({ hasText: '#0' }).filter({ hasText: '0.00101106 BTC' });
    
//     // Verify basic data
//     await expect(inputCard).toContainText('#0');
//     await expect(inputCard).toContainText('0.00101106 BTC');
//     await expect(inputCard).toContainText('bc1q739fe38612ee73e2a2efc24600a7485898615bc8c2607d159332c7cbcb4693e2');

//     // NEW: Verify the "Approve Source" action button exists in the input card
//     await expect(inputCard.getByRole('button', { name: /Approve Source/i })).toBeVisible();

//     // ==========================================
//     // SIGNERS VERIFICATION
//     // ==========================================
//     await expect(page.getByText('0 Signed')).toBeVisible();
//     const fingerprints = ['fe0fa7b4', '57308a20', '7fd7cacb', 'af4b013d', 'a423185b'];
//     for (const fp of fingerprints) {
//       await expect(page.getByText(`(${fp})`)).toBeVisible();
//     }
    
//     // Verify Bottom Status Button
//     const finalizeBtn = page.getByRole('button', { name: /Waiting for Signatures \(0 \/ 5\)/i });
//     await expect(finalizeBtn).toBeDisabled();

//     // ==========================================
//     // ROOM ACTIONS VERIFICATION
//     // ==========================================
//     const actions = ['Audit Log', 'CSV', 'Link Key', 'Backup Admin', 'Share Link', 'QR Code', 'Lock Room', 'Close'];
//     for (const actionName of actions) {
//       await expect(page.getByRole('button', { name: actionName, exact: false })).toBeVisible();
//     }
//   });
// });