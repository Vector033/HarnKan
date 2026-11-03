import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const thai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "หารกัน", template: "%s · หารกัน" },
  description: "หารค่าทริปกับเพื่อนแบบเห็นพร้อมกัน สรุปยอดโอนน้อยที่สุด พร้อม QR พร้อมเพย์",
  applicationName: "หารกัน",
  appleWebApp: { capable: true, title: "หารกัน", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#12715b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${thai.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
