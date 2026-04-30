import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TraceBridge AI — Regulatory Gap Detection",
  description:
    "AI-powered gap detection for FDA 510(k) and medical device regulatory compliance. Powered by Gemini File Search.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body className={`${inter.className} antialiased text-[var(--foreground)] bg-[var(--background)]`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
