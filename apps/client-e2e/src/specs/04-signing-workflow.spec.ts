import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';

/**
 * Suite: Multi-User Signing Workflow
 * Focuses on the real-time collaboration aspect of the application, ensuring 
 * that actions performed by one participant (Guest) are immediately reflected 
 * across the WebSocket relay to other participants (Coordinator).
 */
test.describe('Multi-User Signing Workflow', () => {
  
  test('Coordinator should see Guest signatures in real-time', async ({ browser }) => {
    // --- Setup: Multi-context browser environment ---
    // Create isolated contexts to simulate two distinct users on different machines
    const coordinatorContext = await browser.newContext();
    const guestContext = await browser.newContext();
    
    // Grant clipboard permissions to the coordinator for link sharing functionality
    await coordinatorContext.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordinatorPage = await coordinatorContext.newPage();
    const guestPage = await guestContext.newPage();

    // --- Interaction: Coordinator Room Initialization ---
    // Establish the initial session from an unsigned PSBT fixture
    const coordinatorRoom = await launchRoomFromFixture(coordinatorPage, '3_5_unsigned.psbt.txt');
    
    // Open share options and capture the full invite link (Room ID + Decryption Key)
    await coordinatorRoom.shareLinkButton.click();
    await coordinatorPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const sharedLink = await coordinatorPage.evaluate(() => navigator.clipboard.readText());

    // --- Interaction: Guest Entry ---
    // Guest joins the session using the secure shared link
    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    // --- Verification: Real-time Session Sync ---
    // Verify that both participants are correctly registered in the active session list
    await expect(coordinatorRoom.sessionIdButton).toContainText('2');
    await expect(guestRoom.sessionIdButton).toContainText('2');

    // Setup: Identify a specific target signer for progress tracking
    const aliceFingerprint = 'fe0fa7b4';

    // --- Verification: Initial Signer State ---
    // Confirm the target signer is marked as 'Waiting' for all participants initially
    await coordinatorRoom.expectSignerStatus(aliceFingerprint, 'Waiting...');

    // --- Interaction: Guest Signing Action ---
    // Guest provides the required signature for Alice to the room
    await guestRoom.uploadSignature('3_5_signed_alice.psbt.txt');

    // --- Verification: Local and Remote State Update ---
    // Confirm the Guest UI updated locally to reflect the signature submission
    await guestRoom.expectSignerStatus(aliceFingerprint, 'Signed');

    // CRITICAL: Verify the Coordinator UI received the update in real-time via WebSocket relay
    await coordinatorRoom.expectSignerStatus(aliceFingerprint, 'Signed');
    
    // Confirm the global progress indicators and badges are synchronized for all participants
    await expect(coordinatorRoom.signedCountBadge).toContainText('1 Signed');
    await expect(guestRoom.signedCountBadge).toContainText('1 Signed');

    // Cleanup: Close contexts to release browser resources
    await coordinatorContext.close();
    await guestContext.close();
  });
});