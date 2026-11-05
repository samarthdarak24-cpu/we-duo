import { chromium } from '../frontend/node_modules/@playwright/test/index.mjs';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    console.log('Login title:', await page.title());
    await page.fill('input[type="email"]', 'samarth@trustdrive.dev');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    console.log('After login URL:', page.url());
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}
main();
