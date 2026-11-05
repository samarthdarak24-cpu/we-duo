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
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'samarth@trustdrive.dev');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log('Final URL:', page.url());
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}
main();
