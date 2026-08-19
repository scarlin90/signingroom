import { Page, Locator } from '@playwright/test';

export class CreatePage {
  readonly page: Page;
  readonly launchButton: Locator;
  readonly fileInput: Locator;
  readonly hexTextArea: Locator;
  readonly startCeremonyButton: Locator;
  readonly networkMismatchWarning: Locator;

  constructor(page: Page) {
    this.page = page;
    this.launchButton = page.getByRole('button', { name: /Start a Signing Room®/i });
    this.fileInput = page.locator('input[type="file"]');
    this.hexTextArea = page.locator('textarea').first();
    this.startCeremonyButton = page.locator('#btn-launch-room');
    this.networkMismatchWarning = page.getByText('Network Mismatch');
  }

  async navigate() {
    await this.page.goto('/create');
  }

  async selectNetwork(network: 'bitcoin' | 'testnet' | 'signet') {
    await this.page.getByRole('button', { name: new RegExp(network, 'i') }).click();
  }
}
