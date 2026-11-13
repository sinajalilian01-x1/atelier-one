import Link from "next/link";
export function ThemeToggle({ current }: { current: "receipt" | "clay" }) {
  return (
    <div className="ao-theme" role="navigation" aria-label="Homepage style">
      <span>skin</span>
      <Link href="/receipt" className={current === "receipt" ? "on" : ""}>Receipt</Link>
      <Link href="/clay" className={current === "clay" ? "on" : ""}>Clay</Link>
    </div>
  );
}
