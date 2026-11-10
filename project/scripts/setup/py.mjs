// ---------------------------------------------------------------------------
// Cross-platform Python resolver.
//
// `python` on PATH is not always the interpreter that has the backend
// dependencies installed (a project venv usually does). This wrapper picks the
// first interpreter that actually runs, preferring, in order:
//   1. TD_PYTHON
//   2. backend/.venv  (Windows Scripts/python.exe, POSIX bin/python)
//   3. python3 / python on PATH
// and forwards every argument, inheriting stdio and the exit code.
//
//   node project/scripts/setup/py.mjs -m pytest -q
// ---------------------------------------------------------------------------
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const VENV = path.join(ROOT, "backend", ".venv");
const candidates = [
  process.env.TD_PYTHON,
  path.join(VENV, "Scripts", "python.exe"),
  path.join(VENV, "bin", "python"),
  "python3",
  "python",
].filter(Boolean);

function works(cmd) {
  if (path.isAbsolute(cmd) && !existsSync(cmd)) return false;
  const probe = spawnSync(cmd, ["-c", "import sys; print(sys.version_info[0])"], {
    stdio: "ignore",
  });
  return probe.status === 0;
}

const python = candidates.find(works);
if (!python) {
  console.error(
    "[py] No working Python found. Install Python 3.12+ or set TD_PYTHON.\n" +
    "[py] Backend deps: python -m pip install -r backend/requirements.txt"
  );
  process.exit(127);
}

// One-time self-heal for Windows policies that block SQLAlchemy's compiled
// extensions. The marker lives inside the venv, so recreating the venv
// re-runs the check; a healthy environment pays no cost after the first run.
const marker = path.join(VENV, ".td-deps-ok");
if (!existsSync(marker)) {
  const fixer = path.join(ROOT, "project", "scripts", "setup", "ensure_backend_deps.py");
  const check = spawnSync(python, [fixer], { encoding: "utf8" });
  if (check.status === 0) {
    try { writeFileSync(marker, "ok\n"); } catch { /* non-fatal */ }
  } else {
    process.stderr.write((check.stdout || "") + (check.stderr || ""));
  }
}

const result = spawnSync(python, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  console.error(`[py] failed to run ${python}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
