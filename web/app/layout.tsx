import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Header } from "@/components/Header";
import { MockBanner } from "@/components/MockBanner";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Space_Grotesk({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Pontoon", template: "%s · Pontoon" },
  description:
    "Launchpad di Robinhood Chain di atas Pons V2. Fee creator dibagi ke payout, buyback-and-burn, dan reward ETH untuk holder.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <MockBanner />
          <Header />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
          <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted sm:px-6">
            Pontoon · dibangun di atas Pons V2 di Robinhood Chain · bukan nasihat keuangan
          </footer>
        </Providers>
      </body>
    </html>
  );
}
