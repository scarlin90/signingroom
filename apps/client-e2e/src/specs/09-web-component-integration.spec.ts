import { test, expect } from '@playwright/test';
import { getFixturePath } from '../support/room-helper';

/**
 * Suite: Web Component / Embedded Integration
 * Focuses on the standalone widget's ability to be programmatically injected into 
 * host pages, handle cross-origin communication via PostMessage events, 
 * and support external guest entry flows.
 */
test.describe('Web Component / Embedded Integration', () => {

  /**
   * Helper function to inject event listeners into the test page.
   * This allows the test runner to capture PostMessage events emitted by the widget.
   */
  async function trapWidgetEvents(page) {
    const messages: any[] = [];
    await page.exposeFunction('capturePostMessage', (data: any) => messages.push(data));
    await page.evaluate(() => {
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SIGNING_ROOM_EVENT') {
          window['capturePostMessage'](event.data);
        }
      });
    });
    return messages;
  }

  test('Widget should mount via programmatic injection and allow external guest entry', async ({ browser }) => {
    // --- Setup: Multi-context browser environment ---
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    await hostCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // --- Interaction: Host Programmatic Injection ---
    await hostPage.goto('/webcomponent-demo.html');
    await hostPage.getByRole('button', { name: /Inject PSBT/i }).click();

    // --- Interaction: Room Initialization inside Iframe ---
    const hostFrame = hostPage.frameLocator('iframe');
    await hostFrame.getByRole('button', { name: /Start Signing Ceremony/i }).click({ force: true });
    
    // --- Verification: Host State ---
    await expect(hostFrame.locator('span[title="Room Active"]')).toBeVisible();

    // --- Interaction: Remove Privacy Blur ---
    const hostHeaderBadge = hostFrame.getByRole('button', { name: 'Hidden for Privacy' }).first();
    await hostHeaderBadge.click({ force: true });
    await hostFrame.getByRole('button', { name: 'Reveal All' }).click({ force: true });
    await expect(hostHeaderBadge).toBeHidden({ timeout: 10000 });

    // --- Interaction: Credential Extraction ---
    // Retrieve Room ID directly from the unblurred DOM (bypasses clipboard flakiness)
    const roomIdLocator = hostFrame.locator('div.relative.group').filter({ hasText: 'View Room ID' }).locator('span.font-mono');
    await expect(roomIdLocator).not.toBeEmpty();
    const roomId = (await roomIdLocator.innerText()).trim();

    // Retrieve Decryption Key via Clipboard with polling to prevent stale test data
    await hostPage.evaluate(() => navigator.clipboard.writeText('')); 
    await hostFrame.getByRole('button', { name: /Link Key/i }).click({ force: true });
    await hostFrame.getByRole('button', { name: 'Copy Decryption Key' }).click({ force: true });
    
    let roomKey = '';
    await expect(async () => {
        roomKey = await hostPage.evaluate(() => navigator.clipboard.readText());
        expect(roomKey.length).toBeGreaterThan(10);
    }).toPass({ timeout: 5000 });
    
    await hostPage.keyboard.press('Escape'); 
    
    // --- Interaction: Guest Entry via Widget Home Screen ---
    await guestPage.goto('/webcomponent-demo.html');
    const guestFrame = guestPage.frameLocator('iframe');

    // Fill the internal join form inside the guest's iframe
    await guestFrame.getByPlaceholder('Paste Room ID...').fill(roomId);
    await guestFrame.getByPlaceholder('Paste Key...').fill(roomKey);
    await guestFrame.getByRole('button', { name: /Enter Signing Room/i }).click();

    // --- Verification: Guest Access and Cross-Session Sync ---
    await expect(guestFrame.locator('span[title="Room Active"]')).toBeVisible();

    // Confirm that the session count updated in real-time for both embedded components
    await expect(hostFrame.locator('div.relative.group').filter({ hasText: 'View Active Sessions' }).locator('button').first()).toContainText('2');
    await expect(guestFrame.locator('div.relative.group').filter({ hasText: 'View Active Sessions' }).locator('button').first()).toContainText('2');

    // --- Interaction: Secure Cleanup ---
    await hostFrame.getByRole('button', { name: 'Close', exact: true }).click({ force: true }); 
    await hostFrame.getByRole('button', { name: 'Confirm' }).click({ force: true }); 

    await hostCtx.close();
    await guestCtx.close();
  });

  test('Should emit WIDGET_READY event when successfully mounted', async ({ page }) => {
    // --- Interaction: Component Mounting ---
    await page.goto('/webcomponent-demo.html');
    const messages = await trapWidgetEvents(page);
    await page.getByRole('button', { name: /Inject PSBT/i }).click();
    
    const frame = page.frameLocator('iframe');
    await frame.getByRole('button', { name: /Start Signing Ceremony/i }).click();
    
    // --- Verification: Event Propagation ---
    await expect(frame.locator('span[title="Room Active"]')).toBeVisible();

    // Confirm the widget emitted the handshake event to the host listener
    const readyEvent = messages.find(m => m.action === 'WIDGET_READY');
    expect(readyEvent).toBeDefined();
    expect(readyEvent.type).toBe('SIGNING_ROOM_EVENT');
  });

  test('Should emit signingError event (PSBT_INVALID) when injected with bad data', async ({ page }) => {
    // --- Interaction: Trigger Programmatic Failure ---
    await page.goto('/webcomponent-demo.html');
    const messages = await trapWidgetEvents(page);

    // Call the loadPsbt API with unparseable data
    await page.evaluate(() => {
      // @ts-ignore
      const widget = window.mountWidget(null, null, 'inject');
      setTimeout(() => widget.loadPsbt('not-a-valid-base64-or-hex-psbt'), 50);
    });

    const frame = page.frameLocator('iframe');
    
    // --- Verification: UI and Event Feedback ---
    await expect(frame.getByText('Processing Failed')).toBeVisible();

    // Confirm the error was reported back to the host page via the signingError action
    const errorEvent = messages.find(m => m.action === 'signingError');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.payload.code).toBe('PSBT_INVALID');
    expect(errorEvent.payload.message).toContain('invalid base64');
  });

  test('Should emit transactionFinalized event with full payload after threshold is reached', async ({ page }) => {
    // --- Interaction: Setup Full Ceremony ---
    await page.goto('/webcomponent-demo.html');
    const messages = await trapWidgetEvents(page);
    await page.getByRole('button', { name: /Inject PSBT/i }).click();
    
    const frame = page.frameLocator('iframe');
    await frame.getByRole('button', { name: /Start Signing Ceremony/i }).click();
    
    // --- Verification: Environment Readiness ---
    await expect(frame.locator('span[title="Room Active"]')).toBeVisible();
    await expect(frame.getByText('Connection lost... Reconnecting...')).toBeHidden();

    // --- Interaction: Threshold Progression ---
    const fileInput = frame.locator('input[type="file"]');
    
    // 1. Upload Charlie and verify progress button update
    await fileInput.setInputFiles(getFixturePath('3_5_signed_charlie.psbt.txt'));
    await expect(frame.getByRole('button', { name: /Waiting for Signatures \(1 \/ 5\)/i })).toBeVisible();

    // 2. Upload Alice and verify progress button update
    await fileInput.setInputFiles(getFixturePath('3_5_signed_alice.psbt.txt'));
    await expect(frame.getByRole('button', { name: /Waiting for Signatures \(2 \/ 5\)/i })).toBeVisible();

    // 3. Upload Bob to reach finalization threshold
    await fileInput.setInputFiles(getFixturePath('3_5_signed_bob.psbt.txt'));

    // --- Interaction: Finalize the Ceremony ---
    const finalizeButton = frame.getByRole('button', { name: /Finalize Transaction/i });
    await expect(finalizeButton).toBeVisible();
    await finalizeButton.click({ force: true });

    // --- Verification: Success State and Data Payloads ---
    await expect(frame.getByText('Transaction Signed')).toBeVisible();

    // Confirm the widget emitted the finalized event containing the full cryptographic results
    const finalizedEvent = messages.find(m => m.action === 'transactionFinalized');
    expect(finalizedEvent).toBeDefined();
    
    const payload = finalizedEvent.payload;
    expect(payload.txHex).toBeDefined();
    expect(payload.txHex.length).toBeGreaterThan(100);
    
    // Verify that the host receives both data and file URIs
    expect(payload.auditLogCsv).toBeDefined();
    expect(payload.settlementCsv).toBeDefined();
    expect(payload.auditPdfUri).toMatch(/^data:application\/pdf;.*base64,/);
  });

  test('Host page should successfully mount widget into Guest Mode via the Guest Flow form', async ({ browser }) => {
    // --- Setup: Multi-context browser environment ---
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    await hostCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // --- Interaction: Host Room Initialization ---
    await hostPage.goto('/webcomponent-demo.html');
    await hostPage.getByRole('button', { name: /Inject PSBT/i }).click();

    const hostFrame = hostPage.frameLocator('iframe');
    await hostFrame.getByRole('button', { name: /Start Signing Ceremony/i }).click({ force: true });
    
    // --- Verification: Host Ready State ---
    await expect(hostFrame.getByText('Connection lost... Reconnecting...')).toBeHidden();
    await expect(hostFrame.locator('span[title="Room Active"]')).toBeVisible();

    // --- Interaction: Remove Privacy Blur ---
    const hostHeaderBadge = hostFrame.getByRole('button', { name: 'Hidden for Privacy' }).first();
    await hostHeaderBadge.click({ force: true });
    await hostFrame.getByRole('button', { name: 'Reveal All' }).click({ force: true });
    await expect(hostHeaderBadge).toBeHidden({ timeout: 10000 });

    // --- Interaction: Credential Extraction ---
    // Retrieve Room ID directly from the unblurred DOM (bypasses clipboard flakiness)
    const roomIdLocator = hostFrame.locator('div.relative.group').filter({ hasText: 'View Room ID' }).locator('span.font-mono');
    await expect(roomIdLocator).not.toBeEmpty();
    const roomId = (await roomIdLocator.innerText()).trim();

    // Retrieve Decryption Key via Clipboard with polling to prevent stale test data
    await hostPage.evaluate(() => navigator.clipboard.writeText('')); 
    await hostFrame.getByRole('button', { name: /Link Key/i }).click({ force: true });
    await hostFrame.getByRole('button', { name: 'Copy Decryption Key' }).click({ force: true });
    
    let roomKey = '';
    await expect(async () => {
        roomKey = await hostPage.evaluate(() => navigator.clipboard.readText());
        expect(roomKey.length).toBeGreaterThan(10);
    }).toPass({ timeout: 5000 });
    
    await hostPage.keyboard.press('Escape');

    // --- Interaction: External Guest Flow (Host-side inputs) ---
    await guestPage.goto('/webcomponent-demo.html');
    
    // Target inputs located on the parent HOST page, not inside the iframe
    await guestPage.locator('#guest-room-id').fill(roomId);
    await guestPage.locator('#guest-key').fill(roomKey);
    await guestPage.locator('#load-guest-btn').click();

    // --- Verification: Guest Integration Success ---
    const guestFrame = guestPage.frameLocator('iframe');
    await expect(guestFrame.getByText('Connection lost... Reconnecting...')).toBeHidden();
    await expect(guestFrame.locator('span[title="Room Active"]')).toBeVisible();
    
    // Verify that both embedded widgets are synchronized in the same session
    await expect(hostFrame.locator('div.relative.group').filter({ hasText: 'View Active Sessions' }).locator('button').first()).toContainText('2');
    await expect(guestFrame.locator('div.relative.group').filter({ hasText: 'View Active Sessions' }).locator('button').first()).toContainText('2');

    // --- Interaction: Secure Cleanup ---
    await hostFrame.getByRole('button', { name: 'Close', exact: true }).click({ force: true }); 
    await hostFrame.getByRole('button', { name: 'Confirm' }).click({ force: true }); 

    await hostCtx.close();
    await guestCtx.close();
  });

});