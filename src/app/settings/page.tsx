import type { Metadata } from "next";
import { Settings } from "./settings";

export const metadata: Metadata = { title: "ตั้งค่า" };

export default function SettingsPage() {
  return <Settings />;
}
