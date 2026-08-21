import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import Providers from "@/components/providers";
import PrivacyBanner from "@/components/PrivacyBanner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: false,
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "CoverAI — Intelligent Vehicle Insurance Copilot",
  description: "Next-generation intelligent copilot for auto claims, policy analytics, and transparent DPDP-compliant coverage management.",
};

function getCspConnectSrc(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const origins = ["'self'"];
  if (apiUrl) {
    origins.push(apiUrl);
  } else {
    origins.push("http://localhost:8000", "http://127.0.0.1:8000");
  }
  origins.push(
    "https://oauth2.googleapis.com",
    "https://accounts.google.com",
    "ws:",
    "wss:"
  );
  return origins.join(" ");
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const connectSrc = getCspConnectSrc();
  return (
    <html lang="en" className="h-full">
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content={`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://* https://lh3.googleusercontent.com; connect-src ${connectSrc}; frame-src https://accounts.google.com; frame-ancestors 'none';`}
        />
      </head>
      <body
        className={`${inter.variable} ${playfair.variable} font-sans antialiased bg-[#FAF8F5] text-[#191919] min-h-screen`}
      >
        <Providers>
          <PrivacyBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}

