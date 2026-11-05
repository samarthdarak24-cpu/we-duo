import { chromium } from '../frontend/node_modules/@playwright/test/index.mjs';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  page.on('response', res => {
    if (res.url().includes('/api/v1/auth/login')) {
      console.log('LOGIN API RES:', res.status());
    }
  });

  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#login-email', 'samarth@trustdrive.dev');
  await page.fill('#login-password', 'demo1234');
  console.log('Filled email & password');

  await page.click('button[type="submit"]');
  console.log('Clicked submit');

  await page.waitForTimeout(3000);
  console.log('Current URL after 3s:', page.url());
  await browser.close();
}
main();
