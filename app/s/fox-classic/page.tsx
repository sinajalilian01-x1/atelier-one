import { Fraunces } from "next/font/google";
import FoxStudio from "@/components/fox/FoxStudio";
import "../../fox.css";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--f-serif" });
export const metadata = { title: "Atelier One · Autumn Fox (classic)" };

export default function FoxClassic() {
  return <div className={fraunces.variable}><FoxStudio world="fox" /></div>;
}
