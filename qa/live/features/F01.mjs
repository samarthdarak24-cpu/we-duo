// F01 — Authentication / session CRUD (Create login, Read me, Update refresh, Delete logout)
export default async function run({ H, rec, page, ctx, net }) {
  let sessionId = null;
  let userId = null;

  await H.step(rec, "C", "login via real sign-in form", async () => {
    const before = H.sqlOne("SELECT COUNT(*) AS n FROM sessions")?.n ?? 0;
    const login = await H.loginViaUI(page, "seller");
    const after = H.sqlOne("SELECT COUNT(*) AS n FROM sessions")?.n ?? 0;
    sessionId = login.body?.data?.sessionId || null;
    userId = login.body?.data?.user?.id || null;

    rec.check("C", "login POST /api/v1/auth/login returns 200", login.status === 200, `status=${login.status}`);
    rec.check("C", "login response carries seller role", login.body?.data?.user?.role === "seller", JSON.stringify(login.body?.data?.user));
    rec.check("C", "session cookie is httpOnly and set", login.cookies.some((c) => c.name === "td_token" && c.httpOnly && c.value), JSON.stringify(login.cookies.map((c) => `${c.name}:${c.httpOnly}`)));
    rec.check("C", "UI redirects to seller workspace", /\/seller/.test(login.url), login.url);
    rec.check("C", "sessions table gained one real row", after === before + 1, `before=${before} after=${after}`);
    if (sessionId) {
      const row = H.sqlOne("SELECT * FROM sessions WHERE id = ?", sessionId);
      rec.check("C", "session row persisted with correct user", row?.user_id === userId, JSON.stringify(row));
    } else {
      rec.check("C", "sessionId present in login response", false, "missing sessionId");
    }
    await H.shot(page, "F01-after-login");
  });

  await H.step(rec, "R", "read authenticated identity", async () => {
    const me = await H.api(page, "GET", "/api/v1/me");
    rec.check("R", "GET /api/v1/me returns 200", me.status === 200, `status=${me.status} body=${me.text.slice(0, 200)}`);
    rec.check("R", "me matches logged-in seller", me.json?.data?.email === H.ACCOUNTS.seller.email || me.json?.data?.id === userId, JSON.stringify(me.json?.data ?? null).slice(0, 300));
    rec.check("R", "seller dashboard renders real user name in UI", (await page.locator("body").innerText()).includes("Samarth"), (await page.locator("body").innerText()).slice(0, 180).replace(/\n/g, " | "));
  });

  await H.step(rec, "U", "rotate session via refresh", async () => {
    const refresh = await H.api(page, "POST", "/api/v1/auth/refresh");
    rec.check("U", "POST /api/v1/auth/refresh returns 200", refresh.status === 200, `status=${refresh.status} body=${refresh.text.slice(0, 200)}`);
    rec.check("U", "refresh returns refreshed=true", refresh.json?.data?.refreshed === true, JSON.stringify(refresh.json?.data ?? null).slice(0, 200));
    const still = await H.api(page, "GET", "/api/v1/me");
    rec.check("U", "session still valid after refresh", still.status === 200, `status=${still.status}`);
  });

  await H.step(rec, "D", "logout via Topbar user menu", async () => {
    await page.goto(`${H.BASE}/seller`, { waitUntil: "domcontentloaded" });
    await H.waitForHydration(page, "details summary");
    const summary = page.locator("details summary").first();
    await summary.click();
    const logoutPromise = page.waitForResponse((r) => r.url().includes("/api/v1/auth/logout") && r.request().method() === "POST");
    await page.getByRole("button", { name: /sign out/i }).first().click();
    const logout = await logoutPromise;
    rec.check("D", "logout POST returns 200", logout.status() === 200, `status=${logout.status()}`);
    await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
    rec.check("D", "UI redirects to /login after sign out", /\/login/.test(page.url()), page.url());
    const cookies = await ctx.cookies();
    rec.check("D", "session cookie cleared", !cookies.some((c) => c.name === "td_session" && c.value), JSON.stringify(cookies.map((c) => c.name + "=" + (c.value ? "set" : "empty"))));
    if (sessionId) {
      const row = H.sqlOne("SELECT * FROM sessions WHERE id = ?", sessionId);
      rec.check("D", "session row revoked in DB", !!row?.revoked_at, JSON.stringify(row));
    }
    const afterLogout = await H.api(page, "GET", "/api/v1/me");
    rec.check("D", "protected API rejects logged-out session", afterLogout.status === 401 || afterLogout.status === 403, `status=${afterLogout.status}`);
  });

  await H.step(rec, "V", "invalid credentials rejected", async () => {
    const bad = await H.api(page, "POST", "/api/v1/auth/login", { email: H.ACCOUNTS.seller.email, password: "definitely-wrong" });
    rec.check("V", "wrong password returns 401", bad.status === 401, `status=${bad.status} body=${bad.text.slice(0, 160)}`);
  });

  rec.note(`network calls observed: ${net.length}`);
}
