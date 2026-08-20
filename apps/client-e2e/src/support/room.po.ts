import { Page, Locator, expect } from '@playwright/test';
import { getFixturePath } from './room-helper';

export class RoomPage {
  readonly page: Page;
  readonly activeIndicator: Locator;
  readonly lockedIndicator: Locator;
  readonly roomTitle: Locator;
  readonly timer: Locator;
  readonly sessionIdButton: Locator;
  readonly shareLinkButton: Locator;
  readonly closeButton: Locator;
  readonly confirmButton: Locator;
  readonly signatureFileInput: Locator;
  readonly signedCountBadge: Locator;
  readonly finalizeButton: Locator;
  readonly broadcastLink: Locator;
  readonly successMessage: Locator;
  readonly lockButton: Locator;
  readonly renameButton: Locator;
  readonly auditLogButton: Locator;
  readonly renameInput: Locator;
  readonly saveNameButton: Locator;
  readonly downloadPdfButton: Locator;
  readonly csvDownloadButton: Locator;
  readonly csvActionButton: Locator;
  readonly connectionLostBanner: Locator;
  readonly signerList: Locator;
  readonly roomIdButton: Locator;
  readonly roomIdModalCopyButton: Locator;
  readonly sessionsModal: Locator;
  readonly sessionNameInput: Locator;
  readonly sessionSaveButton: Locator;
  readonly decryptionKeyInput: Locator;
  readonly decryptRoomButton: Locator;
  readonly keyActionButton: Locator;
  readonly copyKeyButton: Locator;
  readonly closeSessionsModalButton: Locator;
  readonly sessionList: Locator;
  readonly broadcastButton: Locator;
  readonly copyHexButton: Locator;

  // File Downloads
  readonly psbtDownloadAction: Locator;
  readonly psbtModalDownloadButton: Locator;

  // Search Filters
  readonly inputSearchInput: Locator;
  readonly outputSearchInput: Locator;

  // QR Code
  readonly qrCodeActionButton: Locator;
  readonly qrLinkOnlyButton: Locator;
  readonly qrFullLinkButton: Locator;
  readonly qrRevealButton: Locator;
  readonly qrDownloadButton: Locator;

  // Admin Claiming
  readonly backupAdminActionButton: Locator;
  readonly copyAdminTokenButton: Locator;
  readonly claimCoordinatorLink: Locator;
  readonly claimPasswordInput: Locator;
  readonly claimRoleButton: Locator;

  // Batch Verification
  readonly verifyAllOutputsButton: Locator;

  // Signer Labeling
  readonly labelNameInput: Locator;
  readonly saveLabelButton: Locator;

  readonly okButton: Locator;

  // Privacy & OpSec Controls
  readonly privacyModalRevealSection: Locator;
  readonly privacyModalRevealAll: Locator;

  readonly headerHiddenBadge: Locator;
  readonly headerEyeToggle: Locator;
  readonly proposalHiddenBadge: Locator;
  readonly proposalEyeToggle: Locator;
  readonly proposalContainer: Locator;
  readonly detailsHiddenBadge: Locator;
  readonly detailsEyeToggle: Locator;
  readonly signersHiddenBadge: Locator;
  readonly signersEyeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.activeIndicator = page.locator('span[title="Room Active"]');
    this.roomTitle = page.locator('h1');
    this.lockedIndicator = page.locator('span[title="Room Locked"]');

    // Scoped locators using the tooltips we identified earlier
    this.timer = page
      .locator('div.relative.group')
      .filter({ hasText: 'Room auto-expires' })
      .locator('span.font-mono.font-bold');

    this.sessionIdButton = page
      .locator('div.relative.group')
      .filter({ hasText: 'View Active Sessions' })
      .locator('button')
      .first();

    this.shareLinkButton = page.getByRole('button', { name: /Share Link/i });
    this.closeButton = page.getByRole('button', { name: 'Close', exact: true });
    this.confirmButton = page.getByRole('button', { name: 'Confirm' });
    this.signatureFileInput = page.locator('input[type="file"]').first();
    this.broadcastLink = page.getByRole('link', { name: /Broadcast/i });
    this.successMessage = page.getByText(/Transaction Finalized Successfully/i);
    this.lockButton = page.getByRole('button', { name: /Lock Room|Locked/i });
    this.renameButton = page.getByRole('button', { name: 'Rename Room' });
    this.auditLogButton = page.getByRole('button', { name: 'Audit Log' });
    this.renameInput = page.getByPlaceholder(/e.g. Q1 Treasury Board Vote/i);
    this.saveNameButton = page.getByRole('button', { name: 'Save Name' });
    this.downloadPdfButton = page.getByRole('button', { name: /Download PDF/i });
    this.csvActionButton = page.getByRole('button', { name: 'CSV', exact: true });
    this.csvDownloadButton = page.getByRole('button', { name: 'Download CSV', exact: true });
    this.connectionLostBanner = page.getByText(/Connection lost... Reconnecting/i);
    this.signerList = page.locator('div.space-y-4');
    this.signedCountBadge = page
      .locator('h2')
      .filter({ hasText: 'Signers' })
      .locator('span.text-brand-text-muted');
    this.roomIdButton = page
      .locator('div.relative.group')
      .filter({ hasText: 'View Room ID' })
      .locator('button');
    this.roomIdModalCopyButton = page.getByRole('button', { name: /Copy Room ID/i });
    this.sessionsModal = page
      .locator('div.max-w-md')
      .filter({ has: page.getByRole('heading', { name: 'Active Sessions' }) });
    this.sessionNameInput = page.getByPlaceholder(/e.g. Auditor Bob/i);
    this.sessionSaveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.decryptionKeyInput = page.getByPlaceholder('Enter decryption key...');
    this.decryptRoomButton = page.getByRole('button', { name: 'Decrypt Room' });
    this.keyActionButton = page.getByRole('button', { name: /Link Key/i });
    this.copyKeyButton = page.getByRole('button', { name: 'Copy Decryption Key' });
    this.closeSessionsModalButton = this.sessionsModal.locator('button').first();
    this.sessionList = this.sessionsModal.locator('div.overflow-y-auto');
    this.finalizeButton = page.getByRole('button', { name: /Finalize Transaction/i });
    this.broadcastButton = page.getByRole('button', { name: 'Broadcast' });
    this.copyHexButton = page.getByRole('button', { name: 'Copy Hex' });

    // PSBT Locators
    this.psbtDownloadAction = page.getByRole('button', { name: 'Download File' });
    this.psbtModalDownloadButton = page.getByRole('button', { name: 'Download PSBT', exact: true });

    // Search Locators
    this.inputSearchInput = page.getByPlaceholder('Search input address...');
    this.outputSearchInput = page.getByPlaceholder('Search output address...');

    // QR Code Locators
    this.qrCodeActionButton = page.getByRole('button', { name: 'QR Code' });
    this.qrLinkOnlyButton = page.getByRole('button', { name: 'Link Only' });
    this.qrFullLinkButton = page.getByRole('button', { name: 'Full (Link + Key)' });
    this.qrRevealButton = page.getByText('Click to Reveal');
    this.qrDownloadButton = page.getByRole('button', { name: 'Download Image' });

    // Admin Locators
    this.backupAdminActionButton = page.getByRole('button', { name: 'Backup Admin' });
    this.copyAdminTokenButton = page.getByRole('button', { name: 'Copy Admin Token' });
    this.claimCoordinatorLink = page.getByRole('button', {
      name: 'Have the Admin Key? Claim Coordinator Role',
    });
    this.claimPasswordInput = page.getByPlaceholder('Paste Admin Key here...');
    this.claimRoleButton = page.getByRole('button', { name: 'Claim' });

    this.verifyAllOutputsButton = page.getByRole('button', { name: /Verify All Outputs/i });

    // Signer Labeling
    this.labelNameInput = page.getByPlaceholder('e.g. Alice (Ledger)');
    this.saveLabelButton = page.getByRole('button', { name: 'Save Label' });

    this.okButton = page.getByRole('button', { name: 'OK', exact: true });

    // Modal Buttons
    this.privacyModalRevealSection = this.page.getByRole('button', { name: 'Reveal Section' });
    this.privacyModalRevealAll = this.page.getByRole('button', { name: 'Reveal All' });

    // Header: Scoped to the first rounded card that contains the Room Overview
    const headerContainer = page.locator('#card-room-overview').first();
    this.headerHiddenBadge = headerContainer.getByRole('button', { name: 'Hidden for Privacy' });

    // Proposal: Scoped to the specific Proposal container card
    this.proposalContainer = page.locator('#card-tx-proposal').first();
    this.proposalHiddenBadge = this.proposalContainer.getByRole('button', {
      name: 'Hidden for Privacy',
    });

    // Details: Scoped to the Details container card
    const detailsContainer = page.locator('#card-tx-details').first();
    this.detailsHiddenBadge = detailsContainer.getByRole('button', { name: 'Hidden for Privacy' });

    // Signers: Scoped to the Signers container card
    const signersContainer = page.locator('#card-signers-list').first();
    this.signersHiddenBadge = signersContainer.getByRole('button', { name: 'Hidden for Privacy' });

    // The Eye Toggles (Also scoped to their specific containers for maximum resilience)
    this.headerEyeToggle = headerContainer.locator(
      'button[title="Reveal Header"], button[title="Hide Header"]',
    );
    this.proposalEyeToggle = this.proposalContainer.locator(
      'button[title="Reveal Proposal"], button[title="Hide Proposal"]',
    );
    this.detailsEyeToggle = detailsContainer.locator(
      'button[title="Reveal Details"], button[title="Hide Details"]',
    );
    this.signersEyeToggle = signersContainer.locator(
      'button[title="Reveal Signers"], button[title="Hide Signers"]',
    );
  }

  async getRoomId(): Promise<string> {
    const btn = this.page
      .locator('div.relative.group')
      .filter({ hasText: 'View Room ID' })
      .locator('button');
    return (await btn.innerText()).trim();
  }

  async switchTab(tab: 'Inputs' | 'Outputs') {
    await this.page.getByRole('button', { name: new RegExp(`${tab} \\(\\d+\\)`, 'i') }).click();
  }

  getOutputCard(index: number) {
    return this.page.locator('.address-card');
  }

  getVerificationBadgeCard(index: number) {
    return this.page.locator('.verification-badge');
  }

  getSignerRow(fingerprint: string): Locator {
    return this.signerList.locator('div.p-4.rounded-xl').filter({ hasText: fingerprint });
  }

  /**
   * Helper to verify a specific signer has successfully signed
   */
  async expectSignerStatus(fingerprint: string, status: 'Signed' | 'Waiting...') {
    const row = this.getSignerRow(fingerprint);
    if (status === 'Signed') {
      await expect(row).toHaveClass(/bg-emerald-500\/10/);
      await expect(row).toHaveClass(/border-emerald-500\/30/);
      await expect(row.getByText('Signed')).toBeVisible();

      await expect(row.locator('svg.animate-spin')).toBeHidden();
    } else {
      await expect(row).toHaveClass(/bg-brand-bg/);
      await expect(row.getByText('Waiting...')).toBeVisible();

      await expect(row.locator('svg.animate-spin')).toBeVisible();
    }
  }

  /**
   * Helper to verify if an address card is 'Approved' (Emerald border)
   */
  async expectCardApproved(card: Locator) {
    await expect(card).toHaveClass(/border-emerald-500/);
  }

  /**
   * Helper to upload a signature from the fixture folder
   */
  async uploadSignature(fileName: string) {
    await this.signatureFileInput.setInputFiles(getFixturePath(fileName));
  }

  /**
   * Targets the "Copy Link Only" button in the Share modal
   */
  get copySecureLinkButton() {
    return this.page.getByRole('button', { name: 'Copy Link Only (No Key)' });
  }

  /**
   * Targets a specific session row in the scrollable list.
   * Scoping to 'this.sessionList' prevents accidental matches with the input field.
   */
  getSessionRow(displayName: string) {
    return this.sessionList
      .locator('div.flex.items-center.justify-between.p-3')
      .filter({ has: this.page.locator('span', { hasText: displayName }) });
  }

  /**
   * Helper for the Nudge Bell
   */
  getNudgeButton(fingerprint: string): Locator {
    return this.getSignerRow(fingerprint).locator('button[title="Copy Nudge Message"]');
  }

  /**
   * Helper for the Add/Edit Label button on a signer row
   */
  getEditLabelButton(fingerprint: string): Locator {
    return this.getSignerRow(fingerprint).locator('button').first();
  }
}
