import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';

test.describe('Multi-User Signing Workflow', () => {
  
  test('Coordinator should see Guest signatures in real-time', async ({ browser }) => {
    const coordinatorContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await coordinatorContext.grantPermissions(['clipboard-read', 'clipboard-write']);

    const coordinatorPage = await coordinatorContext.newPage();
    const guestPage = await guestContext.newPage();

    // 1. Setup Coordinator
    const coordinatorRoom = await launchRoomFromFixture(coordinatorPage, '3_5_unsigned.psbt.txt');
    
    await coordinatorRoom.shareLinkButton.click();
    await coordinatorPage.getByRole('button', { name: /Copy Full Link/i }).click();
    const sharedLink = await coordinatorPage.evaluate(() => navigator.clipboard.readText());

    // 2. Setup Guest - The helper now waits for a stable connection
    const guestRoom = await joinRoomFromLink(guestPage, sharedLink);

    // 3. Sync Verification: Ensure the room sees both participants
    await expect(coordinatorRoom.sessionIdButton).toContainText('2');
    await expect(guestRoom.sessionIdButton).toContainText('2');

    // ==========================================
    // SIGNING ACTION
    // ==========================================
    const aliceFingerprint = 'fe0fa7b4';

    await coordinatorRoom.expectSignerStatus(aliceFingerprint, 'Waiting...');

    // Guest uploads signature
    await guestRoom.uploadSignature('3_5_signed_alice.psbt.txt');

    await guestRoom.expectSignerStatus(aliceFingerprint, 'Signed');

    // 3. Real-time Sync Verification (Coordinator side)
    // Verify the Coordinator received the update via WebSocket relay.
    // The filter in getSignerRow ensures we find Alice even if her card moved.
    await coordinatorRoom.expectSignerStatus(aliceFingerprint, 'Signed');
    
    // Verify global counts update for everyone
    await expect(coordinatorRoom.signedCountBadge).toContainText('1 Signed');
    await expect(guestRoom.signedCountBadge).toContainText('1 Signed');

    await coordinatorContext.close();
    await guestContext.close();
});
});