import { ImageResponse } from "next/og";

// PNG app icons for the manifest, drawn at build time instead of shipping binaries.
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size: raw } = await ctx.params;
  const size = raw === "512" ? 512 : 192;
  const u = size / 64;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: "#12715b", display: "flex", position: "relative" }}>
        {[22, 32].map((y) => (
          <div key={y} style={{ position: "absolute", left: 14 * u, top: (y - 2.5) * u, width: 36 * u, height: 5 * u, borderRadius: 3 * u, background: "#fff" }} />
        ))}
        <div style={{ position: "absolute", left: 14 * u, top: 39.5 * u, width: 22 * u, height: 5 * u, borderRadius: 3 * u, background: "#fff" }} />
        <div style={{ position: "absolute", left: 39 * u, top: 37 * u, width: 14 * u, height: 14 * u, borderRadius: 7 * u, background: "#f2c14e" }} />
      </div>
    ),
    { width: size, height: size },
  );
}
