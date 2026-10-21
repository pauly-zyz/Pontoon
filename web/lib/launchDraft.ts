// A creator's unfinished launch, kept in their own browser so they can prepare before launches open.
import type { FeeConfigState } from "@/components/FeeSliders";

export type LaunchDraft = {
  form: {
    name: string;
    symbol: string;
    image: string;
    description: string;
    twitter: string;
    telegram: string;
    website: string;
    initialBuy: string;
  };
  quoteKey: string;
  memestock: boolean;
  fee: FeeConfigState;
  savedAt: number; // unix ms
};

const KEY = "pontoon:launch-draft:v1";

export function loadDraft(): LaunchDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as LaunchDraft;
    return d && typeof d.form?.name === "string" && typeof d.fee?.buybackBps === "number" ? d : null;
  } catch {
    return null;
  }
}

export function saveDraft(d: LaunchDraft): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}
