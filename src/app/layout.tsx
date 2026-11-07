import type { Metadata, Viewport } from "next";
import { Anuphan, Kanit } from "next/font/google";
import { connection } from "next/server";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

// Coupon numerals: amounts, serials and totals.
const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: { default: "หารกัน", template: "%s · หารกัน" },
  description: "หารค่าทริปกับเพื่อนแบบเห็นพร้อมกัน สรุปยอดโอนน้อยที่สุด พร้อม QR พร้อมเพย์",
  applicationName: "หารกัน",
  appleWebApp: { capable: true, title: "หารกัน", statusBarStyle: "default" },
  referrer: "same-origin",
};

export const viewport: Viewport = {
  themeColor: "#14302b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page renders per request so Next can attach the CSP nonce from proxy.ts.
  await connection();
  return (
    <html lang="th" className={`${anuphan.variable} ${kanit.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
