import { chromium } from '../frontend/node_modules/@playwright/test/index.mjs';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = 'C:/Users/darak/Downloads/finall caranimation';
const BASE_URL = 'http://127.0.0.1:3000';
const EVIDENCE_DIR = path.join(PROJECT_ROOT, 'qa/evidence/qa22');
if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

async function launchBrowser() {
  try {
    console.log('[smoke] launching with channel=chrome ...');
    return await chromium.launch({ channel: 'chrome', headless: true, timeout: 60000 });
  } catch (e) {
    console.log('[smoke] chrome channel failed, falling back to bundled chromium:', e.message);
    return await chromium.launch({ headless: true, timeout: 60000 });
  }
}

async function tryUiLogin(page, role) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // Use the built-in 1-Click Demo Login buttons (fillDemo sets email+password state)
  const demoBtn = page.locator(`button:has-text("${role === 'seller' ? 'Seller' : 'Buyer'}")`).first();
  if ((await demoBtn.count()) === 0) {
    return { ok: false, reason: 'demo login button not found' };
  }
  await demoBtn.click();
  await page.waitForTimeout(400);
  const submit = page.getByRole('button', { name: /SIGN IN/i }).first();
  if ((await submit.count()) === 0) return { ok: false, reason: 'SIGN IN button not found' };
  await submit.click();
  try {
    await page.waitForURL(url => url.includes('/seller') || url.includes('/buyer') || url.includes('/admin'), { timeout: 10000 });
    return { ok: true, url: page.url(), reason: 'ui login landed on workspace' };
  } catch {
    const url = page.url();
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const m = bodyText.match(/(Invalid[^.\n]*|Please[^.\n]*|Network[^.\n]*|auth[^.\n]*)/i);
    return { ok: false, url, reason: m ? m[1].trim() : 'no redirect / no error text' };
  }
}

async function apiLogin(context, email, password) {
  const res = await context.request.post(`${BASE_URL}/api/v1/auth/login`, { data: { email, password } });
  return res.ok();
}

(async () => {
  console.log('=== TRUSTDRIVE QA SMOKE TEST ===');
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160)); });

    // 1. Home reachable
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const homeOk = page.url().includes('localhost') && (await page.content()).length > 500;
    console.log('[smoke] home reachable:', homeOk, '| url=', page.url());
    await page.screenshot({ path: `${EVIDENCE_DIR}/smoke_home.png`, fullPage: false });

    // 2. Login page renders
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${EVIDENCE_DIR}/smoke_login.png` });
    console.log('[smoke] login page rendered, screenshot saved');

    // 3. Seller UI login
    const sellerUi = await tryUiLogin(page, 'seller');
    console.log('[smoke] seller UI login:', JSON.stringify(sellerUi));
    if (sellerUi.ok) {
      await page.screenshot({ path: `${EVIDENCE_DIR}/smoke_seller_dashboard.png` });
    } else {
      // fallback: API login then goto dashboard
      const ok = await apiLogin(ctx, 'samarth@trustdrive.dev', 'demo123456');
      console.log('[smoke] seller API login ok:', ok);
      await page.goto(`${BASE_URL}/seller`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${EVIDENCE_DIR}/smoke_seller_dashboard.png` });
    }

    // 4. Buyer UI login (new context to avoid role bleed)
    const bctx = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
    const bpage = await bctx.newPage();
    const buyerUi = await tryUiLogin(bpage, 'buyer');
    console.log('[smoke] buyer UI login:', JSON.stringify(buyerUi));
    if (buyerUi.ok) {
      await bpage.screenshot({ path: `${EVIDENCE_DIR}/smoke_buyer_dashboard.png` });
    } else {
      const ok = await apiLogin(bctx, 'aditya@trustdrive.dev', 'demo123456');
      console.log('[smoke] buyer API login ok:', ok);
      await bpage.goto(`${BASE_URL}/buyer`, { waitUntil: 'domcontentloaded' });
      await bpage.waitForTimeout(1500);
      await bpage.screenshot({ path: `${EVIDENCE_DIR}/smoke_buyer_dashboard.png` });
    }

    console.log('\n=== SMOKE TEST COMPLETE ===');
    await ctx.close();
    await bctx.close();
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('SMOKE FATAL:', e); process.exit(1); });
