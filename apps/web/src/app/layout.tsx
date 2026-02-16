import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0e14",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"),
  title: {
    default: "TradeSynapse — Spot Exchange on BSC",
    template: "%s | TradeSynapse",
  },
  description:
    "Next-gen spot exchange on BNB Smart Chain. Trade with real-time order books, cross-exchange arbitrage scanning, and copy trading.",
  keywords: ["crypto exchange", "BSC", "spot trading", "order book", "USDT", "BNB", "arbitrage", "copy trading"],
  openGraph: {
    type: "website",
    siteName: "TradeSynapse",
    title: "TradeSynapse — Spot Exchange on BSC",
    description: "Trade with real-time order books, arbitrage scanning, and copy trading on BNB Smart Chain.",
  },
  twitter: {
    card: "summary_large_image",
    title: "TradeSynapse — Spot Exchange on BSC",
    description: "Next-gen spot exchange on BNB Smart Chain.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("ts-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.setAttribute("data-theme","dark");else if(t==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
