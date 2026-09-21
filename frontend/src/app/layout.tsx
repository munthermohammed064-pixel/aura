import type { Metadata } from "next";
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
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
