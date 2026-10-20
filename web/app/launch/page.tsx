import type { Metadata } from "next";
import { LaunchView } from "@/components/views/LaunchView";

export const metadata: Metadata = { title: "Launch token" };

export default function LaunchPage() {
  return <LaunchView />;
}
