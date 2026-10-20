import { CONTRACTS_READY, USE_MOCK } from "@/lib/config";

export function MockBanner() {
  if (!USE_MOCK && CONTRACTS_READY) return null;
  return (
    <div className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-200">
      {USE_MOCK
        ? "Mode data dummy: NEXT_PUBLIC_INDEXER_URL belum diisi. Transaksi dinonaktifkan."
        : "Alamat contract belum lengkap di env. Transaksi dinonaktifkan."}
    </div>
  );
}
