import { chromium } from '../frontend/node_modules/@playwright/test/index.mjs';
const NEXT = 'http://127.0.0.1:3000';
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('response', r => { if (r.url().includes('/api/v1/seller/vehicles')) console.log('  [draft resp]', r.status()); });
  await p.goto(`${NEXT}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  await p.locator('button:has-text("Seller")').first().click();
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL(u => String(u).includes('/seller'), { timeout: 20000 });
  await p.goto(`${NEXT}/seller/add-vehicle`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);

  const fills = [
    ['MH01AB1234', `MH09WZ${Math.floor(1000 + Math.random() * 9000)}`],
    ['WBA5R1C50KAK12345', `WBA5R1C50KAK${Math.floor(100000 + Math.random() * 900000)}`],
    ['BMW', 'Tata'],
    ['3 Series', 'Nexon EV'],
  ];
  for (const [ph, val] of fills) {
    const l = p.getByPlaceholder(ph);
    console.log('placeholder', ph, 'count=', await l.count());
    if (await l.count()) await l.fill(val);
  }
  const nums = p.locator('input[type="number"]');
  console.log('number inputs=', await nums.count());
  if (await nums.count()) await nums.first().fill('2024');

  console.log('values:', await p.locator('input').evaluateAll(els => els.slice(0, 8).map(e => `${e.placeholder}=${e.value}`)));
  const btn = p.locator('button:has-text("Save draft & continue")').first();
  console.log('button count=', await btn.count(), 'disabled=', await btn.isDisabled().catch(() => '?'));
  await btn.click();
  await p.waitForTimeout(3500);
  const body = await p.locator('body').innerText();
  console.log('--- step chip matches ---', (body.match(/Step \d of \d/g) || []));
  console.log('--- error/info lines ---', body.split('\n').filter(x => /required|draft|error|could not|network|duplicate/i.test(x)).slice(0, 8));
  console.log('--- has Photos panel? ---', /Choose at least one photo|Vehicle photos|Photos/i.test(body));
  await p.screenshot({ path: 'C:/Users/darak/Downloads/finall caranimation/qa/evidence/qa22/debug_wizard.png' });
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
