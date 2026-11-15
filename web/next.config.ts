import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This app lives in web/ inside a repo that also has other lockfiles; pin the root explicitly.
  outputFileTracingRoot: path.join(__dirname),
  // A second dev server (e.g. the e2e server on PW_PORT) needs its own build folder, or the two overwrite each other.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
