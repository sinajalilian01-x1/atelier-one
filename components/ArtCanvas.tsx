"use client";
import { useMemo } from "react";
import { renderSvg, PALETTES } from "@/lib/art";
import type { ArtView, Phase } from "@/lib/useStudio";

export function idleSvg(pal = 0) {
  return renderSvg({ motif: "hills", palette: PALETTES[pal], seed: 20261112, title: pal ? "Mint Hills" : "Lime Sunday" });
}

export function ArtCanvas({ art, phase, brush = "#0E0E0E", tip = "#FF5A36", idlePalette = 0 }: { art: ArtView | null; phase: Phase; brush?: string; tip?: string; idlePalette?: number }) {
  const idle = useMemo(() => idleSvg(idlePalette), [idlePalette]);
  const sketching = phase === "painting" && !art;
  return (
    <div className="ao-canvas">
      {art ? (
        art.svg ? (
          <div key={art.title + art.media} className="ao-art painting" dangerouslySetInnerHTML={{ __html: art.svg }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={art.media} className="ao-art ao-reveal" src={art.dataUrl || art.media} alt={art.title} />
        )
      ) : (
        <div className={`ao-art ${sketching ? "ao-sketch" : ""}`} dangerouslySetInnerHTML={{ __html: idle }} />
      )}
      {(phase === "painting" || phase === "minting") && (
        <svg className="ao-brush" viewBox="-20 -140 40 160" width="60" height="200" aria-hidden>
          <rect x="-8" y="-130" width="16" height="110" rx="8" fill={brush} />
          <path d="M-9 -20 H9 L4 4 Q0 10 -4 4Z" fill={tip} />
        </svg>
      )}
    </div>
  );
}
