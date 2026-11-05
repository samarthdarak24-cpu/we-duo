import { chromium } from '../frontend/node_modules/@playwright/test/index.mjs';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      let body = '';
      try { body = await res.text(); } catch(e){}
      console.log('NETWORK:', res.status(), res.url(), body.slice(0, 150));
    }
  });

  try {
    console.log('Navigating to http://127.0.0.1:3000/login...');
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    console.log('Title:', await page.title());

    // Click 1-click Demo Seller button
    const sellerBtn = page.locator('button', { hasText: 'Seller' }).first();
    await sellerBtn.click();
    console.log('Clicked Seller demo button');
    await page.waitForTimeout(500);

    // Click submit
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    console.log('Clicked submit button');

    await page.waitForTimeout(4000);
    console.log('URL after login:', page.url());
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}
main();
