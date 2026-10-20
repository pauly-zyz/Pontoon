import { safeUrl } from "@/lib/format";
import { cn } from "./ui";

/** Token image, or a deterministic gradient with the ticker initials. */
export function TokenAvatar({ symbol, address, image, size = 44 }: { symbol: string; address: string; image?: string; size?: number }) {
  const src = safeUrl(image);
  let seed = 0;
  for (const ch of address.toLowerCase()) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const h1 = seed % 360;
  const h2 = (h1 + 70) % 360;
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-xl border border-white/10")}
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h1} 70% 45%), hsl(${h2} 70% 30%))` }}
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
