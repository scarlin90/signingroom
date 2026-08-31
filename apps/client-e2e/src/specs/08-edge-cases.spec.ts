import { test, expect } from '@playwright/test';
import { RoomPage } from '../support/room.po';
import { CreatePage } from '../support/create.po';
import { launchRoomFromFixture, joinRoomFromLink } from '../support/room-helper';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Suite: Edge Cases, Errors, and UX Features
 * Focuses on error resilience, participant management tools (labeling/nudging),
 * batch operations, and the immediate enforcement of room destruction across active sessions.
 * Also covers parsing and rendering of various Bitcoin address types from PSBT fixtures, including legacy P2PKH, nested SegWit P2SH, and
 * Taproot P2TR formats.
 * These should be revisited once the corresponding functionality is developed.
 */
test.describe('Edge Cases, Errors, and UX Features', () => {
  test('Should handle invalid file uploads gracefully on Create Page', async ({ page }) => {
    // --- Interaction: Setup failure state ---
    const createPage = new CreatePage(page);
    await createPage.navigate();
    await createPage.launchButton.click();

    // Generate a non-PSBT file to trigger a parsing exception
    const invalidFilePath = path.join(__dirname, '../fixtures', 'dummy.jpg');
    fs.writeFileSync(invalidFilePath, 'fake image data');

    // --- Interaction: Upload incompatible data ---
    await createPage.fileInput.setInputFiles(invalidFilePath);

    // --- Verification: Assert error handling UI ---
    // Ensure the application provides clear feedback instead of crashing
    await expect(page.getByText('Processing Failed')).toBeVisible();
    await expect(page.getByText(/Invalid PSBT format/i)).toBeVisible();

    // Cleanup generated fixture
    fs.unlinkSync(invalidFilePath);
  });

  test('Coordinator should be able to label and nudge signers', async ({ page }) => {
    // --- Interaction: Setup coordinator session ---
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const roomPage = await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt');

    const aliceFingerprint = 'fe0fa7b4';

    // --- Interaction: Apply custom identity label ---
    await roomPage.getEditLabelButton(aliceFingerprint).click();
    await expect(roomPage.page.getByText('Label Signer')).toBeVisible();

    await roomPage.labelNameInput.fill('Vault Key A');
    await roomPage.saveLabelButton.click();

    // --- Verification: Assert label persistence ---
    await expect(roomPage.getSignerRow(aliceFingerprint)).toContainText('Vault Key A');

    // --- Interaction: Trigger participant nudge ---
    await roomPage.getNudgeButton(aliceFingerprint).click();

    // --- Verification: Assert feedback and clipboard content ---
    await expect(page.getByText('Nudge Message Copied')).toBeVisible();

    await roomPage.okButton.click();

    // Confirm the clipboard contains the personalized nudge message
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('Signature needed from: Vault Key A');
  });

  test.skip('Should allow Batch Whitelisting of outputs', async ({ page }) => {
    // --- Interaction: Load complex transaction ---
    const roomPage = await launchRoomFromFixture(page, 'many_outputs_fixture.psbt.txt');

    await roomPage.switchTab('Outputs');

    // --- Interaction: Trigger batch verification ---
    await expect(roomPage.verifyAllOutputsButton).toBeVisible();
    await roomPage.verifyAllOutputsButton.click();

    // --- Verification: Assert confirmation modal ---
    await expect(page.getByText(/Are you sure you want to verify all/i)).toBeVisible();
    await roomPage.confirmButton.click();

    // --- Verification: Assert state change for all items ---
    const outputCards = roomPage.page.locator('div.p-3').filter({ hasText: 'BTC' });
    const count = await outputCards.count();

    for (let i = 0; i < count; i++) {
      await expect(outputCards.nth(i)).toHaveClass(/border-emerald-500/);
    }
  });

  test('should correctly parse and render Legacy P2PKH (m/n...) addresses from a PSBT fixture', async ({
    page,
  }) => {
    // --- Interaction: Setup room via helper ---
    const roomPage = await launchRoomFromFixture(page, '2_2_unsigned_legacy_p2pkh.psbt.txt');

    await roomPage.switchTab('Inputs');

    // --- Verification: Assert the Input (Native SegWit) ---
    await expect(
      page.getByText('tb1qad0sjnzrj3puap2l5acl8gsmwuzytp5rz4scdxc4wgcrgzt9u7nsv0xrs2'),
    ).toBeVisible();
    await expect(page.getByText('Verify', { exact: true })).toBeVisible();

    await roomPage.switchTab('Outputs');

    // --- Verification: Assert the Change Output (Native SegWit) ---
    await expect(page.getByText('Change')).toBeVisible();
    await expect(
      page.getByText('tb1quz570pv4e0g2p0qlz4h9m7wcxzzz0566w0d5z4mmtxzsahdmpnksjv3j3e'),
    ).toBeVisible();

    // --- Verification: Assert the Destination Output (Legacy P2PKH Base58) ---
    await expect(page.getByText('mzE856cXjeyBt8HY9eNXxW5JYDJp2vmMuU')).toBeVisible();

    // Legacy tests check for multiple output rows
    await expect(page.getByText('Verify', { exact: true })).toHaveCount(2);
  });

  test('should correctly parse and render Nested SegWit P2SH (2/3...) addresses from a PSBT fixture', async ({
    page,
  }) => {
    // --- Interaction: Setup room via helper ---
    const roomPage = await launchRoomFromFixture(page, '2_2_unsigned_nested_segwit_p2sh.psbt.txt');

    await roomPage.switchTab('Inputs');

    // --- Verification: Assert the Input (Native SegWit) ---
    await expect(
      page.getByText('tb1qad0sjnzrj3puap2l5acl8gsmwuzytp5rz4scdxc4wgcrgzt9u7nsv0xrs2'),
    ).toBeVisible();
    await expect(page.getByText('Verify', { exact: true })).toBeVisible();

    await roomPage.switchTab('Outputs');

    // --- Verification: Assert the Change Output (Native SegWit) ---
    await expect(page.getByText('Change')).toBeVisible();
    await expect(
      page.getByText('tb1quz570pv4e0g2p0qlz4h9m7wcxzzz0566w0d5z4mmtxzsahdmpnksjv3j3e'),
    ).toBeVisible();

    // --- Verification: Assert the Destination Output (Nested SegWit Base58) ---
    // This mathematically confirms the 'a914...87' parser block is working end-to-end
    await expect(page.getByText('2MxBzpMZpJuL1oNmRsMPvmq4x2T557PHFFG')).toBeVisible();
  });

  test('should correctly parse and render Taproot P2TR (tb1p...) addresses using bech32m', async ({
    page,
  }) => {
    // --- Interaction: Setup room via helper ---
    const roomPage = await launchRoomFromFixture(page, '2_2_unsigned_taproot_p2tr.psbt.txt');

    await roomPage.switchTab('Inputs');

    // --- Verification: Assert the Input (Native SegWit) ---
    await expect(
      page.getByText('tb1qad0sjnzrj3puap2l5acl8gsmwuzytp5rz4scdxc4wgcrgzt9u7nsv0xrs2'),
    ).toBeVisible();
    await expect(page.getByText('Verify', { exact: true })).toBeVisible();

    await roomPage.switchTab('Outputs');

    // --- Verification: Assert the Change Output (Native SegWit) ---
    await expect(
      page.getByText('tb1quz570pv4e0g2p0qlz4h9m7wcxzzz0566w0d5z4mmtxzsahdmpnksjv3j3e'),
    ).toBeVisible();

    // --- Verification: Assert the Destination Output (Taproot bech32m) ---
    // This confirms the version >= 0x51 logic block is working
    await expect(
      page.getByText('tb1p6239qc5cmrl9zd9lzjc5p59lxznayp258nyxqhfx7zullqstn3hsg789xh'),
    ).toBeVisible();
  });

  test('should completely clear SPA state between sequential room creations (No State Bleed)', async ({
    page,
  }) => {
    // --- Interaction: Launch First Room (2-of-2) ---
    await launchRoomFromFixture(page, '2_2_unsigned_taproot_p2tr.psbt.txt');

    // --- Verification: First Room State ---
    // Verify the threshold evaluated to 2
    await expect(
      page.getByRole('button', { name: /Waiting for Signatures\s*\(\s*0\s*\/\s*2\s*\)/i }),
    ).toBeVisible();

    // Count the physical hardware cards rendered (Expect exactly 2)
    await expect(
      page.locator('#card-signers-list').locator('span.italic', { hasText: 'Add Label' }),
    ).toHaveCount(2);

    // --- Interaction: Launch Second Room (3-of-5) in the SAME tab ---
    await launchRoomFromFixture(page, '3_5_unsigned.psbt.txt');

    // --- Verification: Second Room State (Assert Memory Cleanup) ---
    // Verify the new threshold is 3
    await expect(
      page.getByRole('button', { name: /Waiting for Signatures\s*\(\s*0\s*\/\s*3\s*\)/i }),
    ).toBeVisible();

    // Count the physical hardware cards rendered (Expect exactly 5)
    await expect(
      page.locator('#card-signers-list').locator('span.italic', { hasText: 'Add Label' }),
    ).toHaveCount(5);
  });
});
