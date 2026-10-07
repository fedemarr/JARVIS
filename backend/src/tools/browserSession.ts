import fs from 'fs';
import path from 'path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { projectRoot } from '../config';

let context: BrowserContext | null = null;
let page: Page | null = null;
let forceHeadful = false;
let lastHeadless: boolean | null = null;

export function setHeadful(): void {
  forceHeadful = true;
}

function profileDir(): string {
  const dir = path.join(projectRoot(), 'data', 'browser', 'profile');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function headless(): boolean {
  if (forceHeadful) return false;
  return process.env.BROWSER_HEADLESS !== 'false';
}

function channel(): string | undefined {
  if (process.env.BROWSER_CHANNEL) return process.env.BROWSER_CHANNEL;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
  ];
  return candidates.some((c) => c && fs.existsSync(c)) ? 'chrome' : undefined;
}

export function screenshotDir(): string {
  const dir = path.join(projectRoot(), 'data', 'browser');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function getPage(): Promise<Page> {
  const wantHeadless = headless();
  if (forceHeadful && lastHeadless === true && context && context.browser()?.isConnected()) {
    await closeBrowser();
  }
  if (page && !page.isClosed()) return page;
  if (!context || !context.browser()?.isConnected()) {
    lastHeadless = wantHeadless;
    context = await chromium.launchPersistentContext(profileDir(), {
      headless: wantHeadless,
      channel: channel(),
      viewport: { width: 1280, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
  const pages = context.pages();
  page = pages.length > 0 ? pages[0] : await context.newPage();
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (page) {
    await page.close().catch(() => {});
    page = null;
  }
  if (context) {
    await context.close().catch(() => {});
    context = null;
  }
}

export async function pageText(): Promise<string> {
  const p = await getPage();
  const text = await p.evaluate(() => ((globalThis as any).document?.body?.innerText ?? '').replace(/\n{3,}/g, '\n\n'));
  return text.trim().slice(0, 12000);
}
