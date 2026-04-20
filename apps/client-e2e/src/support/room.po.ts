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

  constructor(page: Page) {
    this.page = page;
    this.activeIndicator = page.locator('span[title="Room Active"]');
    this.roomTitle = page.locator('h1');
    this.lockedIndicator = page.locator('span[title="Room Locked"]');
    
    // Scoped locators using the tooltips we identified earlier
    this.timer = page.locator('div.relative.group')
      .filter({ hasText: 'Room auto-expires' })
      .locator('span.font-mono.font-bold');
      
    this.sessionIdButton = page.locator('div.relative.group')
      .filter({ hasText: 'View Active Sessions' })
      .locator('button').first();

    this.shareLinkButton = page.getByRole('button', { name: /Share Link/i });
    this.closeButton = page.getByRole('button', { name: 'Close', exact: true });
    this.confirmButton = page.getByRole('button', { name: 'Confirm' });
    this.signatureFileInput = page.locator('label')
      .filter({ hasText: /Upload Signed PSBT/i })
      .locator('input[type="file"]');
    this.signedCountBadge = page.locator('div').filter({ hasText: /Signed$/i }).first();
    this.finalizeButton = page.getByRole('button', { name: /Finalize Transaction/i });
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
    this.signerList = page.locator('div.space-y-4.flex-grow');
    this.signedCountBadge = page.locator('h3').filter({ hasText: 'Signers' }).locator('span.text-white');
  }

  async getRoomId(): Promise<string> {
    const btn = this.page.locator('div.relative.group')
      .filter({ hasText: 'View Room ID' })
      .locator('button');
    return (await btn.innerText()).trim();
  }

  async switchTab(tab: 'Inputs' | 'Outputs') {
    await this.page.getByRole('button', { name: new RegExp(`${tab} \\(\\d+\\)`, 'i') }).click();
  }

  getCard(index: number, amount: string): Locator {
    return this.page.locator('div.p-3')
      .filter({ hasText: `#${index}` })
      .filter({ hasText: amount });
  }

  getSignerRow(fingerprint: string): Locator {
    return this.signerList.locator('div.p-4.rounded-xl')
      .filter({ hasText: fingerprint });
  }

  /**
   * Helper to verify a specific signer has successfully signed
   */
  async expectSignerStatus(fingerprint: string, status: 'Signed' | 'Waiting...') {
    const row = this.getSignerRow(fingerprint);
    if (status === 'Signed') {
      // Use the specific bg and border variants from your HTML
      await expect(row).toHaveClass(/bg-emerald-900_30/);
      await expect(row).toHaveClass(/border-emerald-500_30/);
      await expect(row.getByText('Signed')).toBeVisible();
      
      // Target only the lucide-icon to avoid strict mode violations
      await expect(row.locator('lucide-icon.animate-spin')).toBeHidden();
    } else {
      await expect(row).toHaveClass(/bg-slate-950/);
      await expect(row.getByText('Waiting...')).toBeVisible();
      
      await expect(row.locator('lucide-icon.animate-spin')).toBeVisible();
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
}