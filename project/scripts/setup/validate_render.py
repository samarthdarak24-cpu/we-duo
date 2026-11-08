"""Validate TrustDrive deployment configuration without deploying anything.

Checks:
  * render.yaml (the deployable combined blueprint) — structure, health check,
    persistent disk, required production secrets, Dockerfile path exists.
  * project/infra/render/services.yaml — the three-service scale-out blueprint.
  * project/infra/docker/Dockerfile.render — every COPY source really exists.
  * project/infra/docker/docker-compose.yml — build contexts exist and the two
    runtimes mount the shared volume at the SAME path.

Usage:  python project/scripts/setup/validate_render.py
Exit code 0 = all checks passed.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit("PyYAML is required: python -m pip install pyyaml")

ROOT = Path(__file__).resolve().parents[3]
FAILS: list[str] = []
PASSES: list[str] = []


def check(condition: bool, ok: str, bad: str) -> None:
    if condition:
        PASSES.append(ok)
    else:
        FAILS.append(bad)


def load_yaml(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


# --- 1. root render.yaml ---------------------------------------------------
render = ROOT / "render.yaml"
check(render.is_file(), "render.yaml exists", "render.yaml is missing")
if render.is_file():
    data = load_yaml(render)
    services = data.get("services") or []
    check(len(services) == 1, "render.yaml declares exactly one combined service",
          f"render.yaml should declare 1 service, found {len(services)}")
    svc = services[0] if services else {}
    check(svc.get("type") == "web", "render.yaml service type is web",
          "render.yaml service type must be 'web'")
    check(svc.get("healthCheckPath") == "/api/v1/health/ready",
          "render.yaml health check is /api/v1/health/ready",
          "render.yaml healthCheckPath must be /api/v1/health/ready")
    disk = svc.get("disk") or {}
    check(disk.get("mountPath") == "/data", "render.yaml mounts the disk at /data",
          "render.yaml disk.mountPath must be /data")
    dockerfile = svc.get("dockerfilePath")
    check(bool(dockerfile) and (ROOT / str(dockerfile).lstrip("./")).is_file(),
          f"render.yaml dockerfilePath resolves ({dockerfile})",
          f"render.yaml dockerfilePath does not exist: {dockerfile}")
    keys = {e.get("key") for e in (svc.get("envVars") or []) if isinstance(e, dict)}
    required = {"JWT_SECRET", "TD_SERVICE_TOKEN", "DOWNLOAD_SIGNING_SECRET",
                "QR_SIGNING_SECRET", "TD_SHARE_SECRET"}
    missing = required - keys
    check(not missing, "render.yaml declares every required production secret",
          f"render.yaml is missing required secrets: {sorted(missing)}")
    generated = {e.get("key") for e in (svc.get("envVars") or [])
                 if isinstance(e, dict) and e.get("generateValue")}
    check(required <= generated, "render.yaml generates all required secrets",
          f"these secrets must use generateValue: {sorted(required - generated)}")

# --- 2. three-service blueprint -------------------------------------------
multi = ROOT / "project" / "infra" / "render" / "services.yaml"
check(multi.is_file(), "services.yaml exists", "project/infra/render/services.yaml is missing")
if multi.is_file():
    data = load_yaml(multi)
    services = data.get("services") or []
    names = {s.get("name") for s in services}
    check(len(services) == 3, "services.yaml declares three services",
          f"services.yaml should declare 3 services, found {len(services)}")
    for expected in ("trustdrive-web", "trustdrive-api", "trustdrive-ai-worker"):
        check(expected in names, f"services.yaml declares {expected}",
              f"services.yaml is missing {expected}")
    for svc in services:
        name = svc.get("name", "<unnamed>")
        check(bool(svc.get("buildCommand")), f"{name} has a buildCommand",
              f"{name} is missing buildCommand")
        check(bool(svc.get("startCommand")), f"{name} has a startCommand",
              f"{name} is missing startCommand")
        if svc.get("type") == "web":
            check(bool(svc.get("healthCheckPath")), f"{name} has a healthCheckPath",
                  f"{name} is a web service without healthCheckPath")
        root_dir = svc.get("rootDir")
        if root_dir:
            check((ROOT / root_dir).is_dir(), f"{name} rootDir exists ({root_dir})",
                  f"{name} rootDir does not exist: {root_dir}")

# --- 3. Dockerfile COPY sources -------------------------------------------
dockerfile = ROOT / "project" / "infra" / "docker" / "Dockerfile.render"
check(dockerfile.is_file(), "Dockerfile.render exists", "Dockerfile.render is missing")
if dockerfile.is_file():
    text = dockerfile.read_text(encoding="utf-8")
    sources: list[str] = []
    for line in text.splitlines():
        if "--from=" in line.lower():
            continue  # multi-stage copy: source lives in the build stage, not the context
        m = re.match(r"\s*COPY\s+(.+)$", line, re.IGNORECASE)
        if not m:
            continue
        parts = m.group(1).split()
        parts = [p for p in parts if not p.startswith("--")]
        if len(parts) < 2:
            continue
        sources.extend(parts[:-1])
    for src in sources:
        # Dockerfile sources may be globs (e.g. package-lock.json*).
        if "*" in src or "?" in src:
            exists = bool(list(ROOT.glob(src)))
        else:
            exists = (ROOT / src).exists()
        check(exists, f"Dockerfile COPY source exists: {src}",
              f"Dockerfile COPY source is missing: {src}")

# --- 4. docker-compose ----------------------------------------------------
compose = ROOT / "project" / "infra" / "docker" / "docker-compose.yml"
check(compose.is_file(), "docker-compose.yml exists", "docker-compose.yml is missing")
if compose.is_file():
    data = load_yaml(compose)
    services = data.get("services") or {}
    for name, svc in services.items():
        build = (svc or {}).get("build")
        if not build:
            continue
        context = build.get("context") if isinstance(build, dict) else build
        resolved = (compose.parent / str(context)).resolve()
        check(resolved.is_dir(), f"compose build context exists for {name}",
              f"compose build context for {name} does not exist: {context}")
        if isinstance(build, dict) and build.get("dockerfile"):
            check((resolved / build["dockerfile"]).is_file(),
                  f"compose dockerfile exists for {name}",
                  f"compose dockerfile for {name} is missing: {build['dockerfile']}")
    web = services.get("web") or {}
    api = services.get("api") or {}
    web_mounts = [v.split(":")[1] for v in (web.get("volumes") or []) if ":" in v]
    api_mounts = [v.split(":")[1] for v in (api.get("volumes") or []) if ":" in v]
    shared = set(web_mounts) & set(api_mounts)
    check(bool(shared), "compose web and api mount the shared volume at the same path",
          f"compose web/api mount the shared database at different paths: {web_mounts} vs {api_mounts}")
    web_db = str((web.get("environment") or {}).get("TD_DB_FILE", ""))
    api_db = str((api.get("environment") or {}).get("TD_DB_URL", ""))
    check(bool(web_db) and web_db in api_db,
          "compose web and api point at the same SQLite file",
          f"compose web TD_DB_FILE ({web_db}) is not the file used by api TD_DB_URL ({api_db})")

# --- report ---------------------------------------------------------------
print(f"PASS {len(PASSES)}   FAIL {len(FAILS)}\n")
for item in PASSES:
    print(f"  [ok]   {item}")
for item in FAILS:
    print(f"  [FAIL] {item}")
if FAILS:
    sys.exit(1)
print("\ndeployment configuration is valid")
