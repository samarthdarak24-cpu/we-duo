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

  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'load' });
  // Wait for React hydration
  await page.waitForTimeout(1000);

  console.log('Clicking demo seller button...');
  await page.click('button:has-text("Seller")');
  await page.waitForTimeout(500);

  const email = await page.inputValue('#login-email');
  const pass = await page.inputValue('#login-password');
  console.log('Inputs after demo click -> email:', email, 'pass:', pass ? '***' : '(empty)');

  console.log('Clicking submit...');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);
  console.log('Current URL after submit:', page.url());
  await browser.close();
}
main();
