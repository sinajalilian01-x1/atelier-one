import type { Metadata, Viewport } from "next";
import { Syne, Space_Mono, Baloo_2, Nunito } from "next/font/google";
import "@near-wallet-selector/modal-ui/styles.css";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--f-syne" });
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--f-mono" });
const baloo = Baloo_2({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--f-baloo" });
const nunito = Nunito({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--f-nunito" });

export const metadata: Metadata = {
  title: "Atelier One: an AI artist that runs her own studio on NEAR",
  description: "Press Start and watch an AI artist pay for her own inference, mint a NEP-171 artwork, sell it and split the money with her owner, on NEAR testnet.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#C8F169" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${mono.variable} ${baloo.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  );
}
