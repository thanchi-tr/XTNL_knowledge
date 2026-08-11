"use client";

import { useId } from "react";

/**
 * XTNL brand mark. The geometry (crossing-X over a diamond vessel, twin
 * glowing signature nodes, one accent vertex) is the shared XTNL family
 * mark, on the same 0-80 coordinate system as XTNL_thesis.
 *
 * Colours now match the parent app exactly — green sheen gradient, blue
 * accent vertex. The previous violet-and-gold recolouring made this app
 * read as a different product from the rest of the ecosystem.
 */
interface XtnlMarkProps {
  size?: number;
  glow?: boolean;
}

export function XtnlMark({ size = 20, glow = false }: XtnlMarkProps) {
  const uid = useId();
  const gradId = `xtnl-srs-g-${uid}`;
  const fillId = `xtnl-srs-f-${uid}`;

  const primaryW = glow ? 3.8 : 3.4;
  const secondaryW = glow ? 3.0 : 2.6;

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="24" y1="6" x2="58" y2="74" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3dffb0" />
          <stop offset="55%" stopColor="#00cc7a" />
          <stop offset="100%" stopColor="#009e60" />
        </linearGradient>
        {glow && (
          <radialGradient id={fillId} cx="40" cy="42" r="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00cc7a" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#00cc7a" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>

      {glow && <polygon points="40,29 63,52 17,52" fill={`url(#${fillId})`} />}

      {/* diamond structure — present but secondary */}
      <path d="M40 29 L63 52 M40 29 L17 52" stroke={`url(#${gradId})`} strokeWidth="2" strokeOpacity="0.5" strokeLinecap="round" />
      <path d="M63 52 L40 74 M17 52 L40 74" stroke="#00cc7a" strokeWidth="1.8" strokeOpacity="0.24" strokeLinecap="round" />
      <line x1="18" y1="52" x2="62" y2="52" stroke="#00cc7a" strokeOpacity="0.34" strokeWidth="1.2" strokeDasharray="4 3" />

      {/* crossing X — the hero of the mark */}
      <line x1="27" y1="8" x2="63" y2="52" stroke={`url(#${gradId})`} strokeWidth={primaryW} strokeLinecap="round" />
      <line x1="51" y1="13" x2="17" y2="52" stroke={`url(#${gradId})`} strokeWidth={secondaryW} strokeOpacity="0.75" strokeLinecap="round" />

      {/* vertices */}
      <circle cx="40" cy="74" r="3.2" fill="none" stroke="#00cc7a" strokeOpacity="0.45" strokeWidth="1.2" />
      <circle cx="17" cy="52" r="2.2" fill="#00cc7a" fillOpacity="0.55" />
      {/* right vertex — blue accent (secondary brand colour) */}
      <circle cx="63" cy="52" r="3.4" fill="none" stroke="#2fd0ff" strokeOpacity="0.55" strokeWidth="1.2" />
      <circle cx="63" cy="52" r="1.9" fill="#2fd0ff" />

      {/* signature nodes — bright, glowing */}
      <g style={{ filter: glow ? "drop-shadow(0 0 3px rgba(0,240,144,0.9))" : undefined }}>
        <circle cx="27" cy="8" r="6" fill="#00cc7a" fillOpacity="0.28" />
        <circle cx="27" cy="8" r="4.1" fill="#00f090" />
        <circle cx="27" cy="8" r="2.2" fill="#e6fff4" />
        <circle cx="51" cy="13" r="5" fill="#00cc7a" fillOpacity="0.24" />
        <circle cx="51" cy="13" r="3.4" fill="#00e688" />
        <circle cx="51" cy="13" r="1.8" fill="#e6fff4" />
      </g>
    </svg>
  );
}

interface XtnlLogoProps {
  size?: number;
  glow?: boolean;
  className?: string;
}

/** Dark signature chip + mark — the reusable brand badge for nav/headers. */
export function XtnlLogo({ size = 32, glow = false, className }: XtnlLogoProps) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: "radial-gradient(120% 120% at 30% 22%, #0f1e2e 0%, #07101c 45%, #04080f 100%)",
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.25), 0 6px 16px -4px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -3px 6px rgba(0,0,0,0.55)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-[15%] -top-[20%] h-[70%] w-[70%] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)" }}
      />
      <div className="flex h-full w-full items-center justify-center">
        <XtnlMark size={Math.round(size * 0.62)} glow={glow} />
      </div>
    </div>
  );
}
