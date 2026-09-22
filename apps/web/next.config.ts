import type { NextConfig } from 'next';

// GitHub Pages serves a project repo at username.github.io/<repo-name>/, not
// at the domain root, so every asset/link needs that prefix baked in at
// build time. Set by the deploy workflow (.github/workflows/deploy.yml) to
// "/<repo-name>"; left empty for local dev, where the app is served from "/".
const basePath = process.env.NEXT_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  // Static HTML export — GitHub Pages can only serve static files, and this
  // app has no server components/route handlers/server actions that would
  // need a Node server at runtime (it's a pure client-rendered SPA calling
  // a separately-hosted API).
  output: 'export',
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  // Next's built-in image optimization needs a running server to resize
  // images on request; static export has none, so this serves originals
  // as-is (fine at this app's scale — no user-uploaded images rendered
  // via next/image today).
  images: { unoptimized: true },
  // Static hosts serve "/foo/index.html" for a request to "/foo/", not
  // "/foo" — trailing slashes on every route keep links working without a
  // server-side rewrite rule GitHub Pages doesn't offer.
  trailingSlash: true,
};

export default nextConfig;
