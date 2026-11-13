import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const outDir = path.join(repo, "qa", "live-browser", "qa-2026-11-06");
const shotDir = path.join(outDir, "buyer", "discovery");
const base = "http://localhost:3000";
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

await mkdir(shotDir, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  executablePath: chrome,
  args: ["--no-proxy-server", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

let responses = [];
let consoleErrors = [];
let pageErrors = [];

page.on("response", (res) => {
  const url = res.url();
  if (url.includes("/api/") || url.includes("/_next/static/css/")) {
    const req = res.request();
    responses.push({
      method: req.method(),
      url,
      status: res.status(),
      contentType: res.headers()["content-type"] || "",
    });
  }
});
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(String(err)));

function resetCapture() {
  responses = [];
  consoleErrors = [];
  pageErrors = [];
}

async function controls() {
  return page.evaluate(() => {
    const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const all = (selector, map) => Array.from(document.querySelectorAll(selector)).map(map);
    return {
      title: document.title,
      h1: clean(document.querySelector("h1")?.innerText),
      bodyText: clean(document.body.innerText).slice(0, 18000),
      styleSheets: document.styleSheets.length,
      bodyFont: getComputedStyle(document.body).fontFamily,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      canvases: document.querySelectorAll("canvas").length,
      webgl2: (() => {
        try {
          return !!document.createElement("canvas").getContext("webgl2");
        } catch {
          return false;
        }
      })(),
      inputs: all("input", (el) => ({
        id: el.id,
        name: el.name,
        type: el.type,
        placeholder: el.placeholder,
        value: el.type === "password" ? "[hidden]" : el.value,
        checked: el.type === "checkbox" ? el.checked : undefined,
        required: el.required,
        disabled: el.disabled,
      })),
      textareas: all("textarea", (el) => ({
        id: el.id,
        name: el.name,
        placeholder: el.placeholder,
        value: el.value,
        required: el.required,
        disabled: el.disabled,
      })),
      selects: all("select", (el) => ({
        id: el.id,
        name: el.name,
        value: el.value,
        options: Array.from(el.options).map((o) => ({ value: o.value, text: clean(o.text) })),
      })),
      buttons: all("button", (el) => ({
        text: clean(el.innerText),
        ariaLabel: el.getAttribute("aria-label"),
        title: el.getAttribute("title"),
        type: el.type,
        disabled: el.disabled,
      })),
      links: all("a", (el) => ({ text: clean(el.innerText), href: el.getAttribute("href") })),
    };
  });
}

async function visit(label, url, fullPage = true) {
  resetCapture();
  const res = await page.goto(`${base}${url}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1600);
  // Three.js chunks can take >1.6s to compile in dev; wait for the canvas before
  // declaring a 3D page blank (previously produced a false-negative on /vehicle/*).
  if (/\/vehicle\/|\/inspection/.test(url)) {
    try {
      await page.waitForFunction(() => document.querySelectorAll("canvas").length > 0, null, { timeout: 20000 });
    } catch { /* record honestly as 0 canvases */ }
  }
  const data = await controls();
  const file = `${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  await page.screenshot({ path: path.join(shotDir, file), fullPage });
  return {
    label,
    url,
    status: res?.status() ?? null,
    finalUrl: page.url(),
    screenshot: path.relative(repo, path.join(shotDir, file)).replace(/\\/g, "/"),
    title: data.title,
    h1: data.h1,
    styleSheets: data.styleSheets,
    bodyFont: data.bodyFont,
    bodyBackground: data.bodyBackground,
    canvases: data.canvases,
    webgl2: data.webgl2,
    bodyTextLength: data.bodyText.length,
    bodyTextPreview: data.bodyText.slice(0, 1200),
    inputs: data.inputs,
    textareas: data.textareas,
    selects: data.selects,
    buttons: data.buttons,
    links: data.links,
    apiResponses: responses,
    consoleErrors,
    pageErrors,
  };
}

const report = { startedAt: new Date().toISOString(), base, login: null, pages: [] };

try {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.locator("#login-email").fill("aditya@trustdrive.dev");
  await page.locator("#login-password").fill("demo123456");
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/buyer$/, { timeout: 15000 });
  report.login = { ok: true, finalUrl: page.url() };

  const routes = [
    ["01-overview", "/buyer"],
    ["02-explore", "/buyer/explore"],
    ["03-search", "/buyer/search"],
    ["04-verification", "/buyer/verification"],
    ["05-history", "/buyer/history"],
    ["06-risk", "/buyer/risk"],
    ["07-compare", "/buyer/compare"],
    ["08-saved", "/buyer/saved"],
    ["09-inquiries", "/buyer/inquiries"],
    ["10-reports", "/buyer/reports"],
    ["11-notifications", "/buyer/notifications"],
    ["12-settings", "/buyer/settings"],
    ["13-vehicle-report", "/vehicle/v-bmw"],
    ["14-inspection", "/inspection?vehicle=v-bmw"],
  ];

  for (const [label, url] of routes) {
    report.pages.push(await visit(label, url));
  }

  const inquiries = report.pages.find((p) => p.label === "09-inquiries");
  const inquiryHref = inquiries?.links.find((l) => /\/buyer\/inquiries\//.test(l.href || ""))?.href;
  if (inquiryHref) report.pages.push(await visit("15-inquiry-detail", inquiryHref.replace(base, "")));

  const vehicleHref = report.pages
    .find((p) => p.label === "02-explore")
    ?.links.find((l) => /\/vehicle\//.test(l.href || ""))?.href;
  if (vehicleHref && !report.pages.some((p) => p.url === vehicleHref.replace(base, ""))) {
    report.pages.push(await visit("16-explore-vehicle-detail", vehicleHref.replace(base, "")));
  }
} catch (err) {
  report.error = String(err);
  report.login = report.login || { ok: false };
  await page.screenshot({ path: path.join(shotDir, "error.png"), fullPage: true }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outDir, "buyer-discovery.json"), JSON.stringify(report, null, 2), "utf8");
  await browser.close();
}

console.log(JSON.stringify({
  login: report.login,
  error: report.error || null,
  pages: report.pages.map((p) => ({
    label: p.label,
    status: p.status,
    h1: p.h1,
    canvases: p.canvases,
    apiCount: p.apiResponses?.length || 0,
    errors: (p.consoleErrors?.length || 0) + (p.pageErrors?.length || 0),
  })),
}, null, 2));
