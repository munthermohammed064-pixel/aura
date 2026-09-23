import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/i18n";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { ToastProvider } from "@/components/Toast";

const DESC = "Private investment packages, structured with care in Los Angeles.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://neexora.space"),
  title: process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "Platform",
  description: DESC,
  openGraph: {
    title: process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "Platform",
    description: DESC,
    images: ["/la-hero.jpg"],
    type: "website",
  },
  // Home-screen install: standalone chrome + the flag/NEXORA apple-icon.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "Nexora",
  },
  // The app has its own 7-language dictionary — browser auto-translate
  // only mangles it ("packages" → مكياجات, "Nexora" → نيكصورة). Block it.
  other: { google: "notranslate" },
};

// Edge-to-edge on notched phones + webviews; safe-area insets become usable.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" translate="no" className="notranslate">
      <body className="min-h-screen bg-bg antialiased">
        <LangProvider>
          <ToastProvider>
            <MaintenanceGate>{children}</MaintenanceGate>
          </ToastProvider>
        </LangProvider>
      </body>
    </html>
  );
}
