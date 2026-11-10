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
  //
  // `next dev` gets its own output directory by default. Sharing `.next` between
  // `next dev` and `next start` overwrites `BUILD_ID`, after which the production
  // server refuses to boot ("Could not find a production build"). Next sets
  // NODE_ENV=development for `dev` and production for `build`/`start`, so the two
  // runtimes can never collide unless NEXT_DIST_DIR is set explicitly.
  distDir:
    process.env.NEXT_DIST_DIR ||
    (process.env.NODE_ENV === 'development' ? '.next_dev' : '.next'),
  // Docker/Render images build a self-contained server (`node server.js`).
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Baseline security headers for every response (Phase 14 hardening).
  //
  // No Content-Security-Policy is set here on purpose: the 3D viewer and the
  // design system's inline styles would need a carefully scoped nonce policy,
  // and a wrong CSP breaks the product harder than it protects it. These
  // headers are the safe subset that never conflicts with the app.
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
    ];
    // HSTS only makes sense over TLS; it is meaningless (and misleading) on a
    // plain-HTTP development origin, so it is added in production only.
    if (process.env.NODE_ENV === 'production') {
      security.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains',
      });
    }
    return [
      { source: '/:path*', headers: security },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  webpack(config) {
    config.resolve.alias['@'] = process.cwd();
    return config;
  },
};

export default nextConfig;
