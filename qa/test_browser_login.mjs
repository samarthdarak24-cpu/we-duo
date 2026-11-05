import { chromium } from '../frontend/node_modules/@playwright/test/index.mjs';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('request', req => console.log('REQUEST:', req.method(), req.url()));
  page.on('response', async res => {
    console.log('RESPONSE:', res.status(), res.url());
  });

  try {
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    
    // Check input values
    console.log('Initial email input value:', await page.inputValue('#login-email'));
    
    // Click demo seller
    await page.click('button:has-text("Seller")');
    await page.waitForTimeout(500);

    const emailVal = await page.inputValue('#login-email');
    const passVal = await page.inputValue('#login-password');
    console.log('After demo click -> Email:', emailVal, 'Password:', passVal ? '***' : '(empty)');

    // Submit form directly via dispatchEvent or click
    console.log('Clicking submit button...');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(3000);
    console.log('Final URL:', page.url());
    console.log('Cookies in context:', await context.cookies());
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}
main();
