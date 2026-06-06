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

  test('Should emit transactionFinalized event with full payload after threshold is reached', async ({ page, context }) => {
    // --- Interaction: Setup Full Ceremony ---
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

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
    
    // Upload Charlie and verify progress button update
    await fileInput.setInputFiles(getFixturePath('3_5_signed_charlie.psbt.txt'));
    await expect(frame.getByRole('button', { name: /Waiting for Signatures \(1 \/ 5\)/i })).toBeVisible();

    await expect(async () => {
        const importEvent = messages.find(m => m.action === 'psbtImported');
        expect(importEvent).toBeDefined();
        expect(importEvent.payload.method).toBe('upload');
    }).toPass({ timeout: 5000 });

    // Upload Alice and verify progress button update
    await fileInput.setInputFiles(getFixturePath('3_5_signed_alice.psbt.txt'));
    await expect(frame.getByRole('button', { name: /Waiting for Signatures \(2 \/ 5\)/i })).toBeVisible();

    // Upload Bob to reach finalization threshold
    await fileInput.setInputFiles(getFixturePath('3_5_signed_bob.psbt.txt'));

    // --- Interaction: Finalize the Ceremony ---
    const finalizeButton = frame.getByRole('button', { name: /Finalize Transaction/i });
    await expect(finalizeButton).toBeVisible();
    await finalizeButton.click({ force: true });

    // --- Verification: Success State and Data Payloads ---
    await expect(frame.getByText('Transaction Signed')).toBeVisible();

    // Confirm the widget emitted the finalized event containing the full cryptographic results
    await expect(async () => {
        const finalizedEvent = messages.find(m => m.action === 'transactionFinalized');
        expect(finalizedEvent).toBeDefined();
        
        const payload = finalizedEvent.payload;
        expect(payload.txHex).toBeDefined();
        expect(payload.txHex.length).toBeGreaterThan(100);
        
        // Verify that the host receives both data and file URIs
        expect(payload.auditLogCsv).toBeDefined();
        expect(payload.settlementCsv).toBeDefined();
        expect(payload.auditPdfUri).toMatch(/^data:application\/pdf;.*base64,/);
    }).toPass({ timeout: 5000 });

    await page.evaluate(() => navigator.clipboard.writeText('')); 
    const copyHexButton = frame.getByRole('button', { name: 'Copy Hex' });
    await expect(copyHexButton).toBeVisible();
    await copyHexButton.click({ force: true });

    await expect(async () => {
        const copyEvent = messages.find(m => m.action === 'dataCopied' && m.payload.dataType === 'final-hex');
        expect(copyEvent).toBeDefined();
    }).toPass({ timeout: 5000 });

    // Click the main Close button
    await frame.getByRole('button', { name: 'Close', exact: true }).click();
    
    // Wait for the confirmation modal to animate in, then click Confirm
    await expect(frame.getByRole('heading', { name: 'Close Room' })).toBeVisible();
    await frame.getByRole('button', { name: 'Confirm' }).click();

    // NOW Verify State Change Event fired upon finalization and closure
    await expect(async () => {
        const stateEvent = messages.find(m => m.action === 'roomStateChanged');
        expect(stateEvent).toBeDefined();
        expect(stateEvent.payload.state).toBe('closed');
    }).toPass({ timeout: 5000 });
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

test('Should emit complete UI and Privacy telemetry events to the host', async ({ page, context }) => {
    // Grant clipboard permissions to the default browser context
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    await page.goto('/webcomponent-demo.html');
    const messages = await trapWidgetEvents(page);
    
    // Inject and Start
    await page.getByRole('button', { name: /Inject PSBT/i }).click();
    const frame = page.frameLocator('iframe');
    await frame.getByRole('button', { name: /Start Signing Ceremony/i }).click();
    await expect(frame.locator('span[title="Room Active"]')).toBeVisible();

    // Verify `roomCreated` Event via polling
    await expect(async () => {
      const createdEvent = messages.find(m => m.action === 'roomCreated');
      expect(createdEvent).toBeDefined();
      expect(createdEvent.payload.network).toBeDefined();
    }).toPass({ timeout: 5000 });

    // Interact with Privacy Toggles & Modals
    const hostHeaderBadge = frame.getByRole('button', { name: 'Hidden for Privacy' }).first();
    await hostHeaderBadge.click({ force: true });
    
    await expect(async () => {
      expect(messages.find(m => m.action === 'modalViewed' && m.payload.modalName.includes('Privacy'))).toBeDefined();
    }).toPass({ timeout: 5000 });

    await frame.getByRole('button', { name: 'Reveal All' }).click({ force: true });
    await expect(hostHeaderBadge).toBeHidden({ timeout: 10000 });
    
    await expect(async () => {
      const privacyEvent = messages.find(m => m.action === 'privacyToggled');
      expect(privacyEvent).toBeDefined();
      expect(privacyEvent.payload.state).toBe('reveal-all');
    }).toPass({ timeout: 5000 });

    // Interact with Clipboard Data
    await page.evaluate(() => navigator.clipboard.writeText('')); 
    await frame.locator('div.relative.group').filter({ hasText: 'View Room ID' }).locator('button').first().click();
    
    // Ensure the modal rendered before trying to click the copy button
    const copyBtn = frame.getByRole('button', { name: 'Copy Room ID' });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click({ force: true });

    await expect(async () => {
      const copyEvent = messages.find(m => m.action === 'dataCopied');
      expect(copyEvent).toBeDefined();
      expect(copyEvent.payload.dataType).toBe('room-id');
    }).toPass({ timeout: 5000 });

    // Interact with Transaction Views
    await frame.getByRole('button', { name: /Outputs/i }).click();
    
    await expect(async () => {
      const viewEvent = messages.find(m => m.action === 'transactionViewChanged');
      expect(viewEvent).toBeDefined();
      expect(viewEvent.payload.view).toBe('outputs');
    }).toPass({ timeout: 5000 });
  });

  test('Should detect brute force attempts and emit securityAlert (access_denied) to the host', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    await hostCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Setup Host
    await hostPage.goto('/webcomponent-demo.html');
    await hostPage.getByRole('button', { name: /Inject PSBT/i }).click();
    const hostFrame = hostPage.frameLocator('iframe');
    await hostFrame.getByRole('button', { name: /Start Signing Ceremony/i }).click({ force: true });
    await expect(hostFrame.locator('span[title="Room Active"]')).toBeVisible();

    // Reveal Privacy & Extract Room ID
    await hostFrame.getByRole('button', { name: 'Hidden for Privacy' }).first().click({ force: true });
    await hostFrame.getByRole('button', { name: 'Reveal All' }).click({ force: true });
    const roomId = (await hostFrame.locator('div.relative.group').filter({ hasText: 'View Room ID' }).locator('span.font-mono').innerText()).trim();

    // Setup Malicious Guest
    await guestPage.goto('/webcomponent-demo.html');
    const guestMessages = await trapWidgetEvents(guestPage);
    
    // Provide correct Room ID, but completely WRONG key to trigger 1006 disconnect
    await guestPage.locator('#guest-room-id').fill(roomId);
    await guestPage.locator('#guest-key').fill('malicious-wrong-key-1234');
    await guestPage.locator('#load-guest-btn').click();

    const guestFrame = guestPage.frameLocator('iframe');
    
    // Verify UI accurately reflects the denial by kicking them back to the key prompt
    await expect(guestFrame.getByText(/Decryption Key Required/i)).toBeVisible({ timeout: 8000 });
    await expect(guestFrame.getByPlaceholder(/Enter decryption key/i)).toBeVisible();

    // Verify the widget fired the SIEM/Security webhook
    await expect(async () => {
        const securityAlert = guestMessages.find(m => m.action === 'securityAlert');
        expect(securityAlert).toBeDefined();
        expect(securityAlert.payload.alertType).toBe('access_denied');
        expect(securityAlert.payload.roomId).toBe(roomId);
    }).toPass({ timeout: 5000 });
    
    await hostCtx.close();
    await guestCtx.close();
  });

  test('Should emit participantPresence and cross-reference signatureReceived events between users', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    await hostCtx.grantPermissions(['clipboard-read', 'clipboard-write']);

    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    // Setup Host & Create Room
    await hostPage.goto('/webcomponent-demo.html');
    const hostMessages = await trapWidgetEvents(hostPage);
    await hostPage.getByRole('button', { name: /Inject PSBT/i }).click();

    const hostFrame = hostPage.frameLocator('iframe');
    await hostFrame.getByRole('button', { name: /Start Signing Ceremony/i }).click({ force: true });
    await expect(hostFrame.locator('span[title="Room Active"]')).toBeVisible();

    // Extract Credentials
    await hostFrame.getByRole('button', { name: 'Hidden for Privacy' }).first().click({ force: true });
    await hostFrame.getByRole('button', { name: 'Reveal All' }).click({ force: true });
    
    const roomId = (await hostFrame.locator('div.relative.group').filter({ hasText: 'View Room ID' }).locator('span.font-mono').innerText()).trim();
    await hostPage.evaluate(() => navigator.clipboard.writeText('')); 
    await hostFrame.getByRole('button', { name: /Link Key/i }).click({ force: true });
    await hostFrame.getByRole('button', { name: 'Copy Decryption Key' }).click({ force: true });
    
    let roomKey = '';
    await expect(async () => {
        roomKey = await hostPage.evaluate(() => navigator.clipboard.readText());
        expect(roomKey.length).toBeGreaterThan(10);
    }).toPass({ timeout: 5000 });
    await hostPage.keyboard.press('Escape');

    // Clear message array so we strictly capture events occurring AFTER setup
    hostMessages.length = 0;

    // Setup Guest & Join
    await guestPage.goto('/webcomponent-demo.html');
    
    await guestPage.locator('#guest-room-id').fill(roomId);
    await guestPage.locator('#guest-key').fill(roomKey);
    await guestPage.locator('#load-guest-btn').click();

    const guestFrame = guestPage.frameLocator('iframe');
    
    // Pause to allow Angular to render the loading skeleton
    await guestPage.waitForTimeout(1000);
    
    await expect(guestFrame.getByText('Connection lost... Reconnecting...')).toBeHidden({ timeout: 15000 });
    await expect(guestFrame.locator('span[title="Room Active"]')).toBeVisible();

    const guestHeaderBadge = guestFrame.getByRole('button', { name: 'Hidden for Privacy' }).first();
    await expect(guestHeaderBadge).toBeVisible();
    await guestHeaderBadge.click();

    const revealAllBtn = guestFrame.getByRole('button', { name: 'Reveal All' });
    await expect(revealAllBtn).toBeVisible();
    await revealAllBtn.click();
    
    await expect(guestHeaderBadge).toBeHidden({ timeout: 10000 });

    // Verify Presence Event
    let participantId = '';
    await expect(async () => {
        const guestJoins = hostMessages.filter(m => 
            m.action === 'participantPresence' && 
            m.payload.action === 'joined' && 
            m.payload.participantRole === 'guest'
        );
        expect(guestJoins.length).toBeGreaterThan(0);
        
        const latestJoin = guestJoins[guestJoins.length - 1];
        participantId = latestJoin.payload.participantId;
    }).toPass({ timeout: 5000 });

    // Guest Uploads Signature
    const guestFileInput = guestFrame.locator('input[type="file"]');
    await guestFileInput.setInputFiles(getFixturePath('3_5_signed_charlie.psbt.txt'));

    // Verify Correlated Signature Event on Host
    await expect(async () => {
        const networkSigEvent = hostMessages.find(m => m.action === 'signatureReceived');
        expect(networkSigEvent).toBeDefined();
        expect(networkSigEvent.payload.fingerprint).toBeDefined();
        
        // The signature event must trace back to the EXACT session ID of the guest who uploaded it
        expect(networkSigEvent.payload.signerSessionId).toBe(participantId); 
    }).toPass({ timeout: 15000 });

    await hostCtx.close();
    await guestCtx.close();
  });

  test('Extended UI Interactions & Auditing Telemetry', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    await page.goto('/webcomponent-demo.html');
    const messages = await trapWidgetEvents(page);
    
    // Inject and Start
    await page.getByRole('button', { name: /Inject PSBT/i }).click();
    const frame = page.frameLocator('iframe');
    await frame.getByRole('button', { name: /Start Signing Ceremony/i }).click();
    await expect(frame.locator('span[title="Room Active"]')).toBeVisible();

    // Unblur Privacy to access all UI elements
    const hostHeaderBadge = frame.getByRole('button', { name: 'Hidden for Privacy' }).first();
    await hostHeaderBadge.click({ force: true });
    await expect(frame.getByRole('button', { name: 'Reveal All' })).toBeVisible();
    await frame.getByRole('button', { name: 'Reveal All' }).click();
    await expect(hostHeaderBadge).toBeHidden({ timeout: 10000 });

    // Verify `roomRenamed`
    // Click the Edit icon/button next to the room name using its exact title
    await frame.getByRole('button', { name: 'Rename Room' }).click();
    
    // Wait for modal animation to finish
    await expect(frame.getByRole('heading', { name: 'Rename Room' })).toBeVisible();
    
    // Target the specific input by placeholder to avoid hitting the search boxes
    await frame.getByPlaceholder('e.g. Q1 Treasury Board Vote').fill('Audit Room Alpha');
    await frame.getByRole('button', { name: 'Save Name' }).click();
    
    await expect(async () => {
        const renameEvent = messages.find(m => m.action === 'roomRenamed');
        expect(renameEvent).toBeDefined();
        expect(renameEvent.payload.newName).toBe('Audit Room Alpha');
    }).toPass({ timeout: 5000 });

    // Verify `participantLabelled`
    // Open Active Sessions modal and set a display name
    await frame.locator('div.relative.group').filter({ hasText: 'View Active Sessions' }).locator('button').first().click();
    
    await expect(frame.getByRole('heading', { name: 'Active Sessions' })).toBeVisible();
    
    // Target the specific input by placeholder here too!
    await frame.getByPlaceholder('e.g. Auditor Bob').fill('Test Coordinator');
    await frame.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(async () => {
        const labelEvent = messages.find(m => m.action === 'participantLabelled');
        expect(labelEvent).toBeDefined();
        expect(labelEvent.payload.label).toBe('Test Coordinator');
    }).toPass({ timeout: 5000 });
    
    // Close the sessions modal
    await page.keyboard.press('Escape');

    // Verify `destinationVerified`
    // Click the approval button on the transaction card
    await frame.getByRole('button', { name: /Approve|Verify/i }).first().click();
    
    // Wait for the confirmation modal and click the actual "Approve Address" button
    await expect(frame.getByRole('heading', { name: 'Update Whitelist' })).toBeVisible();
    await frame.getByRole('button', { name: 'Confirm' }).click();
    
    await expect(async () => {
        const verifyEvent = messages.find(m => m.action === 'destinationVerified');
        expect(verifyEvent).toBeDefined();
        // type will be 'inputs' or 'outputs'
        expect(verifyEvent.payload.type).toBeDefined(); 
        expect(verifyEvent.payload.isVerified).toBeDefined();
    }).toPass({ timeout: 5000 });

    // ==========================================
    // Verify `downloadTriggered` (Audit Log)
    // ==========================================
    await frame.getByRole('button', { name: 'Audit Log' }).first().click();
    await expect(frame.getByRole('heading', { name: 'Download Audit Log' })).toBeVisible();
    
    // Catch the native file download
    const pdfDownloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => console.log('No native download caught'));
    await frame.getByRole('button', { name: 'Download PDF' }).first().click();
    await pdfDownloadPromise;

    await expect(async () => {
        const downloadEvents = messages.filter(m => m.action === 'downloadTriggered');
        expect(downloadEvents.length).toBeGreaterThan(0);
        const latestDownload = downloadEvents[downloadEvents.length - 1];
        
        expect(latestDownload).toBeDefined();
        expect(latestDownload.payload.fileType).toContain('audit-log'); 
    }).toPass({ timeout: 5000 });

    await page.keyboard.press('Escape');

    // ==========================================
    // Verify `downloadTriggered` (PSBT File)
    // ==========================================
    await frame.getByRole('button', { name: /Download|Export/i }).first().click();
    
    const psbtDownloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => console.log('No native download caught'));
    await frame.getByText(/Download PSBT/i).first().click();
    await psbtDownloadPromise;

    await expect(async () => {
        const downloadEvents = messages.filter(m => m.action === 'downloadTriggered');
        const latestDownload = downloadEvents[downloadEvents.length - 1];
        
        expect(latestDownload).toBeDefined();
        // FIX: Assert the correct file type for PSBT
        expect(latestDownload.payload.fileType).toContain('psbt'); 
    }).toPass({ timeout: 5000 });

    await page.keyboard.press('Escape');

    // ==========================================
    // Verify `qrStateChanged` (Room Entry)
    // ==========================================
    await frame.getByRole('button', { name: /QR Code/i }).first().click();

    // Verify "Link Only" Reveal
    await frame.getByText('Click to Reveal').click();
    await expect(async () => {
        const qrEvents = messages.filter(m => m.action === 'qrStateChanged');
        const latestQrEvent = qrEvents[qrEvents.length - 1];
        expect(latestQrEvent).toBeDefined();
        expect(latestQrEvent.payload.isRevealed).toBe(true);
        expect(latestQrEvent.payload.includesKey).toBe(false); 
    }).toPass({ timeout: 5000 });

    // Verify "Full Key" Reveal
    await frame.getByRole('button', { name: 'Full (Link + Key)' }).click();
    await frame.getByText('Click to Reveal').click(); 
    
    await expect(async () => {
        const qrEvents = messages.filter(m => m.action === 'qrStateChanged');
        const latestQrEvent = qrEvents[qrEvents.length - 1];
        expect(latestQrEvent).toBeDefined();
        expect(latestQrEvent.payload.isRevealed).toBe(true);
        expect(latestQrEvent.payload.includesKey).toBe(true); 
    }).toPass({ timeout: 5000 });

    // Close the entry QR modal
    await frame.getByRole('button', { name: 'Close' }).first().click();

    // ==========================================
    // Verify `fountainStateChanged` & `fountainFormatChanged`
    // ==========================================
    await frame.getByRole('button', { name: 'Show QR' }).first().click();
    
    const bbqrBtn = frame.getByRole('button', { name: 'Coldcard (BBQr)' });
    await expect(bbqrBtn).toBeVisible();

    // Verify Fountain Reveal (Should default to 'ur')
    await frame.getByText('Click to Reveal').click();
    await expect(async () => {
        const fountainRevealEvent = messages.filter(m => m.action === 'fountainStateChanged');
        const latestReveal = fountainRevealEvent[fountainRevealEvent.length - 1];
        
        expect(latestReveal).toBeDefined();
        expect(latestReveal.payload.isRevealed).toBe(true);
        expect(latestReveal.payload.format).toBe('ur');
    }).toPass({ timeout: 5000 });

    // This brings the BBQR button safely back into the viewport.
    await frame.locator('canvas#fountain-psbt-canvas').click();
    await expect(frame.getByText('Click to Reveal')).toBeVisible();

    await bbqrBtn.click();
    
    await expect(async () => {
        const fountainFormatEvent = messages.find(m => m.action === 'fountainFormatChanged');
        expect(fountainFormatEvent).toBeDefined();
        expect(fountainFormatEvent.payload.format).toBe('bbqr');
    }).toPass({ timeout: 5000 });

  });

});