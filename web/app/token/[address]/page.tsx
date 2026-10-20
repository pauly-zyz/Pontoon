import { Suspense } from "react";
import { TokenSkeleton, TokenView } from "@/components/views/TokenView";

export default function TokenPage({ params }: PageProps<"/token/[address]">) {
  return <Suspense fallback={<TokenSkeleton />}>{params.then(({ address }) => <TokenView address={address} />)}</Suspense>;
}
