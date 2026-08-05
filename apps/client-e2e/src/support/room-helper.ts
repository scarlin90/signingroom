import { Page, expect } from '@playwright/test';
import { CreatePage } from './create.po';
import { RoomPage } from './room.po';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolves the absolute path to a fixture file
 */
export function getFixturePath(fileName: string) {
  const fullPath = path.join(__dirname, '../fixtures', fileName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Fixture not found at: ${fullPath}`);
  }
  return fullPath;
}

/**
 * Reads the text content of a fixture file (useful for paste tests)
 */
export function getFixtureContent(fileName: string) {
  return fs.readFileSync(getFixturePath(fileName), 'utf-8');
}

export async function launchRoomFromFixture(
  page: Page,
  fileName: string,
  network: 'bitcoin' | 'testnet' | 'signet' = 'signet',
  autoReveal = true,
) {
  const createPage = new CreatePage(page);
  await createPage.navigate();
  await createPage.launchButton.click();
  await createPage.selectNetwork(network);

  // Use the internal path resolver
  await createPage.fileInput.setInputFiles(getFixturePath(fileName));
  await expect(createPage.startCeremonyButton).toBeEnabled({ timeout: 10000 });
  await createPage.startCeremonyButton.click();

  const roomPage = new RoomPage(page);

  if (autoReveal) {
    await expect(roomPage.headerHiddenBadge).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.lucide-lock').first()).toBeHidden({ timeout: 15000 });
    await roomPage.headerHiddenBadge.click();
    await expect(roomPage.privacyModalRevealAll).toBeVisible({ timeout: 15000 });
    await roomPage.privacyModalRevealAll.click();
    await expect(roomPage.headerHiddenBadge).toBeHidden({ timeout: 10000 });
  }

  await expect(roomPage.activeIndicator).toBeVisible();
  await expect(roomPage.connectionLostBanner).toBeHidden();
  return roomPage;
}

export async function joinRoomFromLink(page: Page, link: string, autoReveal = true) {
  const roomPage = new RoomPage(page);

  const [baseUrl, hash] = link.split('#');
  const decodedHash = hash ? decodeURIComponent(hash) : '';
  const finalUrl = decodedHash ? `${baseUrl}#${decodedHash}` : baseUrl;

  await page.waitForTimeout(3000);

  await page.goto(finalUrl, { waitUntil: 'domcontentloaded' });

  if (autoReveal) {
    await expect(roomPage.headerHiddenBadge).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.lucide-lock').first()).toBeHidden({ timeout: 15000 });
    await roomPage.headerHiddenBadge.click();
    await expect(roomPage.privacyModalRevealAll).toBeVisible({ timeout: 15000 });
    await roomPage.privacyModalRevealAll.click();
    await expect(roomPage.headerHiddenBadge).toBeHidden({ timeout: 10000 });
  }

  await expect(roomPage.activeIndicator).toBeVisible();
  await expect(roomPage.page.getByText('Transaction Proposal')).toBeVisible();
  await expect(roomPage.connectionLostBanner).toBeHidden();

  return roomPage;
}
