import { test, expect } from '@playwright/test';
import { CreatePage } from '../support/create.po';
import { getFixturePath, getFixtureContent } from '../support/room-helper';

test.describe('Create Room Validation', () => {
  let createPage: CreatePage;

  test.beforeEach(async ({ page }) => {
    createPage = new CreatePage(page);
    await createPage.navigate();
    await createPage.launchButton.click();
  });

  test('should display a Network Mismatch error when uploading a Testnet PSBT to Bitcoin network', async () => {
    await createPage.selectNetwork('bitcoin');
    
    // Path resolution is now abstracted
    await createPage.fileInput.setInputFiles(getFixturePath('3_5_unsigned.psbt.txt'));

    await expect(createPage.networkMismatchWarning).toBeVisible();
    await expect(createPage.page.getByText(/Selected:\s*Bitcoin/i)).toBeVisible();
    await expect(createPage.startCeremonyButton).toBeDisabled();
  });

  test('should correctly parse PSBT details from pasted text', async () => {
    await createPage.selectNetwork('signet');

    // Fixture reading is now abstracted
    const psbtString = getFixtureContent('3_5_unsigned.psbt.txt');
    await createPage.hexTextArea.fill(psbtString);

    await expect(createPage.page.getByText('1 Outputs', { exact: false })).toBeVisible();
    await expect(createPage.page.getByText('193 sats')).toBeVisible();
    await expect(createPage.startCeremonyButton).toBeEnabled();
  });
});