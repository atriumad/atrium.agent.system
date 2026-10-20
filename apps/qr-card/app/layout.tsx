import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { pickLocale } from "../lib/locale";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atrium card",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// No web manifest: its start_url would open a home-screen icon on a page without the token, and on
// iOS a home-screen app has its own storage, so the card would be lost. Without one the icon opens
// the /c/<token> URL it was added from.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbf8f1", // --cream-100 in packages/ui/src/tokens.css
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = pickLocale((await headers()).get("accept-language"));
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
