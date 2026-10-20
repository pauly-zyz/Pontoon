import { safeUrl } from "@/lib/format";
import { cn } from "./ui";

/** Deterministic hue (0-359) for a token address, used for avatars and glows. */
export function tokenHue(address: string): number {
  let seed = 0;
  for (const ch of address.toLowerCase()) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  // final mix so addresses that differ in one character still get very different hues
  seed ^= seed >>> 16;
  seed = Math.imul(seed, 0x85ebca6b);
  seed ^= seed >>> 13;
  seed = Math.imul(seed, 0xc2b2ae35);
  seed ^= seed >>> 16;
  return (seed >>> 0) % 360;
}

/** Token image, or a deterministic gradient with the ticker initials. */
export function TokenAvatar({ symbol, address, image, size = 44 }: { symbol: string; address: string; image?: string; size?: number }) {
  const src = safeUrl(image);
  const h1 = tokenHue(address);
  const h2 = (h1 + 70) % 360;
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-xl ring-1 ring-white/15")}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${h1} 75% 52%), hsl(${h2} 70% 28%))`,
        boxShadow: `0 6px 20px -8px hsl(${h1} 80% 50% / 0.7), inset 0 1px 0 rgb(255 255 255 / 0.25)`,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary creator-supplied hosts
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          className="absolute inset-0 grid place-items-center font-display font-bold text-white/90"
          style={{ fontSize: size * 0.32 }}
        >
          {symbol.slice(0, 2) || "?"}
        </span>
      )}
    </div>
  );
}
