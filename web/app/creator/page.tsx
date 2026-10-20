import type { Metadata } from "next";
import { CreatorView } from "@/components/views/CreatorView";

export const metadata: Metadata = { title: "Creator" };

export default function CreatorPage() {
  return <CreatorView />;
}
