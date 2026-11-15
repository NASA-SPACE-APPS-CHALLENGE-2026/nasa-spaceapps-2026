import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This app lives in web/ inside a repo that also has other lockfiles; pin the root explicitly.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
