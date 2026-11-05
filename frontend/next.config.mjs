import fs from 'node:fs';
import path from 'node:path';

// The repository root owns `.env` and `.data` so the Next.js app (cwd =
// frontend/) and the FastAPI service (cwd = backend/) use the SAME database,
// uploads and JWT secret. Load it once, before Next builds or starts.
const repoRoot = path.resolve(process.cwd(), '..');
const envFile = path.join(repoRoot, '.env');
if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    const value = rest.join('=').trim().replace(/^["']|["']$/g, '');
    if (key.trim() && process.env[key.trim()] === undefined) {
      process.env[key.trim()] = value;
    }
  }
}
// Relative data/model paths must be resolved against the repository root,
// not the frontend working directory.
for (const key of ['TD_DATA_DIR', 'TD_DB_FILE', 'TD_UPLOAD_DIR', 'TD_MODEL_DIR']) {
  const value = process.env[key];
  if (value && !path.isAbsolute(value) && !value.startsWith('sqlite')) {
    process.env[key] = path.resolve(repoRoot, value);
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolated verification builds (`NEXT_DIST_DIR=.next_verify npm run build`).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Docker/Render images build a self-contained server (`node server.js`).
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
