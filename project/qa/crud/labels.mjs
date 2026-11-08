/**
 * Targeted interactive-surface dump for the CRUD sweep: prints every button
 * (text + aria-label) and every labelled input on the given pages, so the
 * sweep can use exact selectors instead of guesses.
 *
 * Usage: node qa/crud/labels.mjs <baseUrl> <role> <path> [<path> ...]
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const pw = await import(pathToFileURL(path.join(ROOT, 'frontend', 'node_modules', 'playwright', 'index.js')).href);
const { chromium } = pw.chromium ? pw : pw.default;

const BASE = process.argv[2].replace(/\/$/, '');
const ROLE = process.argv[3];
const PATHS = process.argv.slice(4);
const CREDS = ROLE === 'buyer'
  ? { email: 'rohan@trustdrive.dev', password: 'demo1234' }
  : { email: 'samarth@trustdrive.dev', password: 'demo1234' };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('#login-email', CREDS.email);
await page.fill('#login-password', CREDS.password);
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(2500);

for (const p of PATHS) {
  const resp = await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const t = (el) => (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
    const lbl = (el) => {
      if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return t(l); }
      const w = el.closest('label'); if (w) return t(w);
      return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
    };
    return {
      url: location.href,
      h1: t(document.querySelector('h1')),
      buttons: [...document.querySelectorAll('button')].map((b) => ({
        text: t(b).slice(0, 60), aria: b.getAttribute('aria-label') || '', title: b.getAttribute('title') || '', disabled: b.disabled === true,
      })).filter((b) => b.text || b.aria || b.title),
      inputs: [...document.querySelectorAll('input,textarea,select')].map((i) => ({
        tag: i.tagName.toLowerCase(), type: i.type || '', label: lbl(i).slice(0, 60), value: (i.value || '').slice(0, 30),
      })),
      links: [...document.querySelectorAll('a[href]')].map((a) => `${t(a).slice(0, 40)} -> ${a.getAttribute('href')}`).filter((s) => !s.startsWith('->')).slice(0, 40),
    };
  });
  console.log(`\n##### ${p}  [status ${resp ? resp.status() : 'ERR'}]  ${info.url}`);
  console.log(`h1: ${info.h1}`);
  console.log('BUTTONS:');
  info.buttons.forEach((b) => console.log(`   [${b.text || '(none)'}]${b.aria ? ` aria="${b.aria}"` : ''}${b.title ? ` title="${b.title}"` : ''}${b.disabled ? ' DISABLED' : ''}`));
  console.log('INPUTS:');
  info.inputs.forEach((i) => console.log(`   <${i.tag} ${i.type}> "${i.label}" value="${i.value}"`));
  console.log('LINKS:');
  info.links.forEach((l) => console.log(`   ${l}`));
}

await browser.close();
