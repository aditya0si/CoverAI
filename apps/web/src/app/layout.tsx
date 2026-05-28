import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "@/components/providers";
import PrivacyBanner from "@/components/PrivacyBanner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "CoverAI - Smart Vehicle Insurance",
  description: "Next-generation intelligent copilot for auto claims and policy management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <head>
        <meta 
          httpEquiv="Content-Security-Policy" 
          content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://* https://lh3.googleusercontent.com; connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 https://oauth2.googleapis.com https://accounts.google.com ws: wss:; frame-src https://accounts.google.com; frame-ancestors 'none';" 
        />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased bg-slate-950 text-slate-100 min-h-screen`}
      >
        <Providers>
          <PrivacyBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
