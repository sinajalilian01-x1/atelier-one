"use client";
import { txUrl } from "@/lib/config";
export function Toast({ toast, onClose }: { toast: { text: string; hash?: string } | null; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div className="ao-toast" role="status">
      <span>{toast.text}</span>
      {toast.hash && <a href={txUrl(toast.hash)} target="_blank" rel="noreferrer">tx ↗</a>}
      <button onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  );
}
