import type { Metadata } from "next";
import { RewardsView } from "@/components/views/RewardsView";

export const metadata: Metadata = { title: "Rewards" };

export default function RewardsPage() {
  return <RewardsView />;
}
