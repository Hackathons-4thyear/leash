import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

const title = "Leash — onchain firewall for AI agents";
const description =
  "A smart-contract wallet for AI agents on Base. Spending caps, owner approval, reputation checks and a kill switch are enforced onchain, so even a prompt-injected agent can't overspend or pay attackers.";

export const metadata: Metadata = {
  // Absolute URLs for the Open Graph image. On Vercel, Next falls back to the deployment URL when this is unset.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title,
  description,
  applicationName: "Leash",
  openGraph: { title, description, type: "website", siteName: "Leash" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = { themeColor: "#050807" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
