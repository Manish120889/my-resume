"use client";

import { useEffect, useRef, useState } from "react";

const TOPS = [4.5, 10.8, 17.1, 23.4, 29.7, 36, 42.3, 49.5, 56.2, 62.5, 68.8, 75.1, 81.4, 87.7];

export const LOKA_SLUGS = [
  "satyaloka",
  "tapoloka",
  "janaloka",
  "maharloka",
  "svarloka",
  "bhuvarloka",
  "bhurloka",
  "atala",
  "vitala",
  "sutala",
  "talatala",
  "mahatala",
  "rasatala",
  "patala",
] as const;

interface LokaStackProps {
  activeSlug: string | null;
  onSelect: (slug: string) => void;
}

export default function LokaStack({ activeSlug, onSelect }: LokaStackProps) {
  const stackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const video = videoRef.current;
    if (video) video.play().catch(() => {});
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const stack = stackRef.current;
    if (!stack) return;
    let frame = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const x = (event.clientX / window.innerWidth - 0.5) * -12;
        const y = (event.clientY / window.innerHeight - 0.5) * -8;
        stack.style.setProperty("--parallax-x", `${x}px`);
        stack.style.setProperty("--parallax-y", `${y}px`);
      });
    };
    const onScroll = () => {
      stack.style.setProperty(
        "--parallax-y",
        `${Math.max(-10, Math.min(10, window.scrollY * 0.012))}px`
      );
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  return (
    <div className="cosmic-backdrop" aria-hidden={false}>
      {reducedMotion ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="ambient-poster" src="/media/cosmic-map.png" alt="" aria-hidden="true" />
      ) : (
        <video
          ref={videoRef}
          className="ambient-video"
          src="/media/oblivion-journey.mp4"
          poster="/media/cosmic-map.png"
          muted
          loop
          playsInline
          autoPlay
          aria-hidden="true"
        />
      )}
      <div
        ref={stackRef}
        className="live-loka-stack"
        data-active={activeSlug ?? undefined}
      >
        {LOKA_SLUGS.map((slug, index) => (
          <button
            key={slug}
            type="button"
            className={`live-loka-layer${activeSlug === slug ? " is-selected" : ""}`}
            style={
              {
                top: `${TOPS[index]}%`,
                "--delay": `${-index * 0.31}s`,
                "--float-dur": `${5.2 + ((index * 1.7) % 4.6)}s`,
                "--glow-dur": `${6 + ((index * 2.3) % 5.4)}s`,
                "--breathe-dur": `${4.6 + ((index * 1.3) % 3.8)}s`,
                "--drift-x": `${index % 2 === 0 ? 5 : -5}px`,
                "--tilt": `${(0.25 + ((index * 0.17) % 0.5)) * (index % 3 === 0 ? -1 : 1)}deg`,
              } as React.CSSProperties
            }
            data-realm={slug}
            onClick={() => onSelect(slug)}
            aria-label={`Open ${slug}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/media/${slug}.png`} alt="" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
