import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Shakibul Systems — Enterprise AI Automation & Secure Workflows",
  description:
    "We build production-ready n8n + GPT-4o pipelines that auto-screen candidates, sync multi-app tech stacks, and route high-value leads in seconds. Deploy in 24 hours.",
  keywords: [
    "AI automation",
    "n8n workflows",
    "candidate screening",
    "smart scheduling",
    "enterprise automation",
    "GPT-4o",
    "workflow automation",
    "secure AI systems",
  ],
  authors: [{ name: "Shakibul Bokhtiar", url: "https://shakibul.com" }],
  openGraph: {
    title: "Shakibul Systems — Enterprise AI Automation",
    description:
      "Eliminate 15+ hours of manual admin work per week with autonomous AI pipelines. Deploy in 24 hours.",
    type: "website",
    locale: "en_US",
    siteName: "Shakibul Systems",
  },
  twitter: {
    card: "summary_large_image",
    title: "Shakibul Systems — Enterprise AI Automation",
    description:
      "Production-ready AI pipelines that auto-screen candidates & sync your tech stack.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#030712" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-full w-full">{children}</body>
    </html>
  );
}
