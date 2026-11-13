import type { Metadata, Viewport } from "next";
import { Syne, Space_Mono, Baloo_2, Nunito } from "next/font/google";
import "@near-wallet-selector/modal-ui/styles.css";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--f-syne" });
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--f-mono" });
const baloo = Baloo_2({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--f-baloo" });
const nunito = Nunito({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--f-nunito" });

const DESC = "Press Start and watch an AI fox pay her own AI bill, paint, mint an NEP-171 artwork, sell it and split the money with her owner, in real NEAR testnet transactions.";
export const metadata: Metadata = {
  metadataBase: new URL("https://atelier-one-near.vercel.app"),
  title: "Atelier One · an AI fox that runs her own art studio on NEAR",
  description: DESC,
  openGraph: { type: "website", siteName: "Atelier One", title: "Atelier One · an AI fox that runs her own art studio on NEAR", description: DESC, images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "A low-poly fox painting at an easel in an autumn forest, next to a gramophone and a log cabin" }] },
  twitter: { card: "summary_large_image", title: "Atelier One · an AI fox that runs her own art studio on NEAR", description: DESC, images: ["/og.jpg"] },
  icons: { icon: "/fox/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2A180D" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${mono.variable} ${baloo.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  );
}
