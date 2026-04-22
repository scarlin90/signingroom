import { Page, expect } from '@playwright/test';
import { CreatePage } from './create.po';
import { RoomPage } from './room.po';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolves the absolute path to a fixture file
 */
export function getFixturePath(fileName: string) {
  return path.join(__dirname, '../fixtures', fileName);
}

/**
 * Reads the text content of a fixture file (useful for paste tests)
 */
export function getFixtureContent(fileName: string) {
  return fs.readFileSync(getFixturePath(fileName), 'utf-8');
}

export async function launchRoomFromFixture(page: Page, fileName: string, network: 'bitcoin' | 'testnet' | 'signet' = 'signet') {
  const createPage = new CreatePage(page);
  await createPage.navigate();
  await createPage.launchButton.click();
  await createPage.selectNetwork(network);

  // Use the internal path resolver
  await createPage.fileInput.setInputFiles(getFixturePath(fileName));
  await createPage.startCeremonyButton.click();
  
  const roomPage = new RoomPage(page);
  await expect(roomPage.activeIndicator).toBeVisible();
  await expect(roomPage.connectionLostBanner).toBeHidden();
  return roomPage;
}

export async function joinRoomFromLink(page: Page, link: string) {
  const roomPage = new RoomPage(page);
  await page.goto(link);
  await expect(roomPage.activeIndicator).toBeVisible();
  await expect(roomPage.page.getByText('Transaction Proposal')).toBeVisible();

  await expect(roomPage.connectionLostBanner).toBeHidden();

  return roomPage;
}