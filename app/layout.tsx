import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "HEN — Human Experience Network", description: "AI connects you to humanity’s experience — with World ID consent and Monid capabilities." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
