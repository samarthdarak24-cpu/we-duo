import { chromium } from '../frontend/node_modules/@playwright/test/index.mjs';

const BASE_URL = 'http://127.0.0.1:3000';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, timeout: 60000 });
  const ctx = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  page.on('console', m => console.log('  [console]', m.type(), m.text().slice(0, 200)));
  page.on('response', r => { if (r.url().includes('/api/v1/auth/login')) console.log('  [login resp]', r.status()); });

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const demoBtn = page.locator('button:has-text("Seller")').first();
  console.log('demo Seller button count:', await demoBtn.count());
  await demoBtn.click();
  await page.waitForTimeout(500);
  const emailVal = await page.locator('#login-email').inputValue().catch(() => '<no #login-email>');
  const pwVal = await page.locator('#login-password').inputValue().catch(() => '<no #login-password>');
  console.log('after demo click -> email=', JSON.stringify(emailVal), 'pw len=', pwVal.length);

  const signIn = page.locator('button[type="submit"]').first();
  console.log('SIGN IN submit button count:', await signIn.count());
  await signIn.click();
  await page.waitForTimeout(3500);

  console.log('url after submit:', page.url());
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('body snippet:', bodyText.slice(0, 300).replace(/\n/g, ' | '));
  const cookies = await ctx.cookies();
  console.log('cookies:', cookies.map(c => c.name + '=' + (c.value ? 'SET' : 'EMPTY')).join(', '));
  await page.screenshot({ path: 'C:/Users/darak/Downloads/finall caranimation/qa/evidence/qa22/debug_login.png' });

  await browser.close();
})().catch(e => { console.error('DEBUG FATAL', e); process.exit(1); });
