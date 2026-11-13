import { Fraunces } from "next/font/google";
import FoxStudio from "@/components/fox/FoxStudio";
import "./fox.css";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--f-serif" });

// "/?theme=clay" and "/?theme=receipt" are redirected in next.config.ts, so this page can be fully static.
export default function Home() {
  return <div className={fraunces.variable}><FoxStudio /></div>;
}
