import { formatEther, formatUnits } from "viem";
import { EXPLORER_URL } from "./config";
import type { TokenMetadata } from "./types";

const toBig = (v: string | bigint | null | undefined) => (typeof v === "bigint" ? v : BigInt(v ?? 0));

/** Format a wei amount as ETH with a sensible number of decimals. */
export function formatEth(wei: string | bigint | null | undefined, maxDecimals = 4): string {
  const n = Number(formatEther(toBig(wei)));
  if (n === 0) return "0";
  if (Math.abs(n) < 10 ** -maxDecimals) return `<${10 ** -maxDecimals}`;
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : maxDecimals });
}

/** Compact number for token amounts (18 decimals). */
export function formatTokens(wei: string | bigint | null | undefined, decimals = 18): string {
  const n = Number(formatUnits(toBig(wei), decimals));
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export const pct = (bps: number, digits = 0) => `${(bps / 100).toFixed(digits)}%`;

export function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, now - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** "08:59:58" or "2d 05:14" until `eta`, or null once passed. */
export function countdown(eta: number, now: number): string | null {
  const s = eta - now;
  if (s <= 0) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x: number) => String(x).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export const txUrl = (hash: string) => (EXPLORER_URL ? `${EXPLORER_URL}/tx/${hash}` : null);
export const addressUrl = (a: string) => (EXPLORER_URL ? `${EXPLORER_URL}/address/${a}` : null);

function utf8ToBase64(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function base64ToUtf8(b64: string) {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Metadata is stored on-chain as a data: URI so launches need no upload service. */
export function encodeMetadata(meta: TokenMetadata): string {
  return `data:application/json;base64,${utf8ToBase64(JSON.stringify(meta))}`;
}

export function parseMetadata(uri: string): TokenMetadata {
  try {
    if (uri.startsWith("data:application/json;base64,")) return JSON.parse(base64ToUtf8(uri.split(",")[1] ?? ""));
    if (uri.startsWith("data:application/json,")) return JSON.parse(decodeURIComponent(uri.slice(22)));
  } catch {
    // fall through
  }
  return {};
}

/** Only allow http(s) links from user-supplied metadata. */
export function safeUrl(u?: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
