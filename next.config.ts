import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The badge sits on top of the bottom tab bar on phones.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The slip reader ships TypeScript source from the workspace.
  transpilePackages: ["@harnkan/slip-reader"],
  // Local OCR fallback (used when there is no GEMINI_API_KEY) runs in Node only.
  serverExternalPackages: ["tesseract.js", "sharp"],
  // tesseract.js starts its OCR worker from a file path, which file tracing
  // cannot follow, so ship the worker and everything it requires explicitly.
  outputFileTracingIncludes: {
    "/api/slips": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/{bmp-js,idb-keyval,is-url,node-fetch,regenerator-runtime,wasm-feature-detect,zlibjs}/**/*",
      "./node_modules/{whatwg-url,tr46,webidl-conversions}/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
