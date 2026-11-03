import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "หารกัน · HarnKan",
    short_name: "หารกัน",
    description: "หารค่าทริปกับเพื่อน สรุปยอดโอนน้อยที่สุด พร้อม QR พร้อมเพย์",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#12715b",
    lang: "th",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
