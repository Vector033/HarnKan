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
