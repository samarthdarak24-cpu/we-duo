// Instant-boot entry point for the published single-port sandbox.
//
// The hosting platform declares a service "ready" only if port 3000 answers
// within ~30 seconds. A full `next build` takes longer than that, so the old
// start.sh (build, then `next start`) was killed with a 504 before a single
// page could be served.
//
// This process binds port 3000 immediately, always answers with a real page,
// builds in the background, then transparently proxies every request to the
// Next.js server on port 3001 once it is healthy. Nothing is fabricated: while
// starting, health endpoints return 503 and the HTML page says so.
import http from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_PORT = Number(process.env.TD_UPSTREAM_PORT || 3001);
const UPSTREAM = `http://127.0.0.1:${UPSTREAM_PORT}`;
const CHILDREN = [];
let ready = false;
let failure = null;

const LOADING_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="4">
<title>TrustDrive · starting</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d10;color:#f5f1e8;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
  .box{max-width:32rem;padding:2.5rem;text-align:center}
  h1{font-size:1.4rem;letter-spacing:.18em;text-transform:uppercase;color:#d8b26a}
  p{color:#a8adb6;margin:.7rem 0}
  .bar{height:3px;background:#22262c;border-radius:3px;overflow:hidden;margin:1.8rem 0}
  .bar i{display:block;height:100%;width:35%;background:#d8b26a;animation:s 1.4s ease-in-out infinite}
  @keyframes s{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
</style></head><body><div class="box">
<h1>TrustDrive</h1>
<p>Preparing the application on first launch.</p>
<div class="bar"><i></i></div>
<p>This page refreshes automatically. The first build usually takes under a minute.</p>
</div></body></html>`;

function log(...args) {
  console.log("[boot]", ...args);
}

function spawnTracked(command, args) {
  const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  CHILDREN.push(child);
  return child;
}

function proxy(req, res) {
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: UPSTREAM_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on("error", (err) => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "upstream unavailable", detail: err.message }));
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  if (ready) return proxy(req, res);

  // Honest startup state: never report a healthy backend before it exists.
  if ((req.url || "").startsWith("/api/v1/health/")) {
    res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ status: "starting", ready: false, error: failure }));
  }
  if (failure) {
    res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
    return res.end(`<h1>TrustDrive failed to start</h1><pre>${String(failure).replace(/</g, "&lt;")}</pre>`);
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(LOADING_PAGE);
});

server.listen(PORT, "0.0.0.0", () => {
  log(`port ${PORT} open; building in the background`);

  const alreadyBuilt = process.env.TD_SKIP_BUILD === "1";
  const begin = () => {
    log("starting Next.js on", UPSTREAM_PORT);
    spawnTracked("npx", ["next", "start", "-p", String(UPSTREAM_PORT), "-H", "127.0.0.1"]);
    waitForUpstream();
  };

  if (alreadyBuilt) return begin();

  const build = spawnTracked("npm", ["run", "build"]);
  build.on("exit", (code) => {
    if (code !== 0) {
      failure = `next build exited with code ${code}`;
      log(failure);
      return;
    }
    log("build finished");
    begin();
  });
});

function waitForUpstream() {
  const started = Date.now();
  const tick = () => {
    if (Date.now() - started > 180_000) {
      failure = "Next.js did not become healthy within 180s";
      log(failure);
      return;
    }
    const probe = http.get(`${UPSTREAM}/api/v1/health/ready`, (r) => {
      r.resume();
      if (r.statusCode && r.statusCode < 500) {
        ready = true;
        log("upstream healthy; proxying all requests");
      } else {
        setTimeout(tick, 1000);
      }
    });
    probe.on("error", () => setTimeout(tick, 1000));
    probe.setTimeout(2000, () => probe.destroy());
  };
  tick();
}

function shutdown() {
  for (const child of CHILDREN) {
    try { child.kill("SIGTERM"); } catch { /* already gone */ }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, shutdown);
