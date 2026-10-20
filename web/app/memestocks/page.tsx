import type { Metadata } from "next";
import { MemestocksView } from "@/components/views/MemestocksView";

export const metadata: Metadata = { title: "Memestock" };

export default function MemestocksPage() {
  return <MemestocksView />;
}
