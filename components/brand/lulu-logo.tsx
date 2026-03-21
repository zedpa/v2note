import { cn } from "@/lib/utils";

interface LuluLogoProps {
  size?: number;
  variant?: "light" | "dark" | "color";
  className?: string;
}

/**
 * 路路 Logo — the v2note deer mascot.
 * Extracted from docs/brand-identity.html (deer-logo SVG).
 */
export function LuluLogo({
  size = 48,
  variant = "light",
  className,
}: LuluLogoProps) {
  // Original palette from brand-identity.html
  const palette = {
    light: {
      antler: "#A06B42",
      earOuter: "#D4A07A",
      earInner: "#E8BFA0",
      head: "#C8845C",
      face: "#E8C9A8",
      eye: "#3D3228",
      eyeHighlight: "white",
      nose: "#8B5E3C",
      mouth: "#8B5E3C",
      blush: "#E8A87C",
      spot: "#D4A07A",
      neck: "#C8845C",
      neckInner: "#E8C9A8",
      trail: "#C8845C",
    },
    dark: {
      antler: "#E8D5C4",
      earOuter: "#D4C4B4",
      earInner: "#EDE4DB",
      head: "#E8D5C4",
      face: "#F5EDE5",
      eye: "#FFFFFF",
      eyeHighlight: "white",
      nose: "#E8D5C4",
      mouth: "#E8D5C4",
      blush: "#E8D5C4",
      spot: "#D4C4B4",
      neck: "#E8D5C4",
      neckInner: "#F5EDE5",
      trail: "#E8D5C4",
    },
    color: {
      antler: "#A06B42",
      earOuter: "#D4A07A",
      earInner: "#E8BFA0",
      head: "#C8845C",
      face: "#E8C9A8",
      eye: "#3D3228",
      eyeHighlight: "white",
      nose: "#8B5E3C",
      mouth: "#8B5E3C",
      blush: "#E8A87C",
      spot: "#D4A07A",
      neck: "#C8845C",
      neckInner: "#E8C9A8",
      trail: "#C8845C",
    },
  };

  const c = palette[variant];

  return (
    <svg
      className={cn("animate-breathe", className)}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="路路 Logo"
      role="img"
    >
      {/* Antlers */}
      <path d="M72 68 C72 52, 58 38, 52 26" stroke={c.antler} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M52 26 C48 18, 42 16, 38 12" stroke={c.antler} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M52 26 C56 20, 62 18, 66 14" stroke={c.antler} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M52 38 C46 32, 40 32, 36 28" stroke={c.antler} strokeWidth="2.5" strokeLinecap="round" fill="none" />

      <path d="M128 68 C128 52, 142 38, 148 26" stroke={c.antler} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M148 26 C152 18, 158 16, 162 12" stroke={c.antler} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M148 26 C144 20, 138 18, 134 14" stroke={c.antler} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M148 38 C154 32, 160 32, 164 28" stroke={c.antler} strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* Ears */}
      <ellipse cx="66" cy="72" rx="14" ry="9" transform="rotate(-25 66 72)" fill={c.earOuter} />
      <ellipse cx="66" cy="72" rx="9" ry="5.5" transform="rotate(-25 66 72)" fill={c.earInner} />
      <ellipse cx="134" cy="72" rx="14" ry="9" transform="rotate(25 134 72)" fill={c.earOuter} />
      <ellipse cx="134" cy="72" rx="9" ry="5.5" transform="rotate(25 134 72)" fill={c.earInner} />

      {/* Head */}
      <ellipse cx="100" cy="100" rx="40" ry="44" fill={c.head} />

      {/* Face patch */}
      <ellipse cx="100" cy="108" rx="26" ry="30" fill={c.face} />

      {/* Eyes */}
      <circle cx="84" cy="92" r="5.5" fill={c.eye} />
      <circle cx="116" cy="92" r="5.5" fill={c.eye} />
      <circle cx="85.5" cy="90.5" r="2" fill={c.eyeHighlight} opacity="0.9" />
      <circle cx="117.5" cy="90.5" r="2" fill={c.eyeHighlight} opacity="0.9" />

      {/* Nose */}
      <ellipse cx="100" cy="108" rx="6" ry="4.5" fill={c.nose} opacity="0.8" />

      {/* Mouth */}
      <path d="M94 114 C96 117, 104 117, 106 114" stroke={c.mouth} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.6" />

      {/* Cheek blush */}
      <circle cx="76" cy="104" r="7" fill={c.blush} opacity="0.25" />
      <circle cx="124" cy="104" r="7" fill={c.blush} opacity="0.25" />

      {/* Forehead spots */}
      <circle cx="92" cy="78" r="2.5" fill={c.spot} opacity="0.5" />
      <circle cx="108" cy="80" r="2" fill={c.spot} opacity="0.4" />

      {/* Neck / body hint */}
      <path d="M82 140 C82 145, 90 155, 100 158 C110 155, 118 145, 118 140" fill={c.neck} />
      <path d="M88 142 C88 147, 94 154, 100 156 C106 154, 112 147, 112 142" fill={c.neckInner} />

      {/* Trail below (路/path motif) */}
      <path d="M85 168 C90 165, 95 167, 100 165 C105 163, 110 166, 115 164" stroke={c.trail} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.3" />
      <path d="M80 174 C88 171, 95 173, 100 171 C105 169, 112 172, 120 170" stroke={c.trail} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.2" />
    </svg>
  );
}
