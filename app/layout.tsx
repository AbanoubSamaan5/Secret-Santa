import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Secret Santa",
  description: "A private Secret Santa exchange",
  robots: { index: false, follow: false, noarchive: true }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
