// Local SMS gateway stub for integration tests.
// Usage: node qa/sms-sink.mjs <output-file> <port>
// POST /sms accepts {to,body,from}; a recipient containing "fail" returns 500
// so retry/error paths can be exercised without a real carrier.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const out = process.argv[2];
const port = Number(process.argv[3] || 2526);
fs.mkdirSync(path.dirname(out), { recursive: true });

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      /* keep empty */
    }
    if (String(body.to ?? "").includes("fail")) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "simulated carrier failure" }));
      return;
    }
    fs.appendFileSync(out, `${JSON.stringify(body)}\n`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: `sms-${Date.now()}` }));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[sms-sink] listening on 127.0.0.1:${port} -> ${out}`);
});
