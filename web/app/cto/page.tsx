import type { Metadata } from "next";
import { CtoView } from "@/components/views/CtoView";

export const metadata: Metadata = { title: "CTO" };

export default function CtoPage() {
  return <CtoView />;
}
