import { test, expect } from '@playwright/test';
import { CreatePage } from '../support/create.po';
import { getFixturePath, getFixtureContent } from '../support/room-helper';

/**
 * Suite: Create Room Validation
 * Focuses on the initial transaction entry phase, ensuring the application 
 * correctly parses PSBT data and enforces network-level security rules.
 */
test.describe('Create Room Validation', () => {
  let createPage: CreatePage;

  // Initialize the Page Object and navigate to the creation interface before each test
  test.beforeEach(async ({ page }) => {
    createPage = new CreatePage(page);
    await createPage.navigate();
    await createPage.launchButton.click();
  });

  test('should display a Network Mismatch error when uploading a Testnet PSBT to Bitcoin network', async () => {
    // --- Interaction: Prepare state for mismatch ---
    // Manually select Mainnet while planning to upload a Testnet-encoded file
    await createPage.selectNetwork('bitcoin');
    
    // Upload the Testnet fixture
    await createPage.fileInput.setInputFiles(getFixturePath('3_5_unsigned.psbt.txt'));

    // --- Verification: Assert security constraints ---
    // The application should detect the network encoding within the PSBT and show a warning
    await expect(createPage.networkMismatchWarning).toBeVisible();
    await expect(createPage.page.getByText(/Selected:\s*Bitcoin/i)).toBeVisible();
    
    // Crucial: The creation flow must be blocked until the network matches
    await expect(createPage.startCeremonyButton).toBeDisabled();
  });

  test('should correctly parse PSBT details from pasted text', async () => {
    // --- Interaction: Provide raw hex/base64 data ---
    await createPage.selectNetwork('signet');

    // Extract the raw string from the fixture to simulate a user pasting data
    const psbtString = getFixtureContent('3_5_unsigned.psbt.txt');
    await createPage.hexTextArea.fill(psbtString);

    // --- Verification: Confirm parser accuracy ---
    // Ensure the internal btc-signer logic correctly identified the transaction structure
    await expect(createPage.page.getByText('1 Outputs', { exact: false })).toBeVisible();
    await expect(createPage.page.getByText('193 sats', { exact: false })).toBeVisible();
    
    // Verify that a valid parse enables the next stage of the workflow
    await expect(createPage.startCeremonyButton).toBeEnabled();
  });

  test('should parse v0 P2WPKH PSBT and display High Fee warning without blocking creation', async () => {
    // --- Interaction: Upload single-sig v0 PSBT with a high fee ---
    await createPage.selectNetwork('bitcoin');
    await createPage.fileInput.setInputFiles(getFixturePath('v0_P2WPKH_high_fee.txt'));

    // --- Verification: Warnings and non-blocking behavior ---
    await expect(createPage.page.getByText(/High Fee Detected/i)).toBeVisible();
    
    // Ensure the parser handled the P2WPKH non-multisig format and allows continuation
    await expect(createPage.startCeremonyButton).toBeEnabled();
  });

  test('should parse v2 P2WPKH PSBT and display High Fee warning without blocking creation', async () => {
    // --- Interaction: Upload single-sig v2 PSBT with a high fee ---
    await createPage.selectNetwork('bitcoin');
    await createPage.fileInput.setInputFiles(getFixturePath('v2_P2WPKH_high_fee.txt'));

    // --- Verification: Warnings and non-blocking behavior ---
    await expect(createPage.page.getByText(/High Fee Detected/i)).toBeVisible();
    
    // Ensure the parser handled the v2 P2WPKH non-multisig format and allows continuation
    await expect(createPage.startCeremonyButton).toBeEnabled();
  });
});