import type { Metadata } from "next";
import { FeeSplitBar, splitFromConfig } from "@/components/FeeSplitBar";
import { Card, PageTitle } from "@/components/ui";
import { contracts, PARAMS } from "@/lib/config";

export const metadata: Metadata = { title: "Docs" };

const PARAM_ROWS: [string, string, string][] = [
  ["Fee platform", "20% dari fee yang masuk (maks. 30%)", "Pendapatan Pontoon, diubah multisig dalam batas maks."],
  ["Insentif pemanggil distribute()", "0,5%, maks. 0,005 ETH", "Menutup gas tanpa menguras fee"],
  ["Buyback-and-burn", "0–80% dari sisa", "Tidak bisa 100%, creator tetap punya insentif"],
  ["Reward holder", "0–50% dari sisa", "Mencegah janji reward berlebihan"],
  ["Payout creator", "Sisa setelah dua di atas", "Otomatis"],
  ["Default", "40% buyback, 20% reward, 40% creator", "Aman untuk pemula"],
  ["Timelock perubahan konfigurasi", "24 jam", "Holder sempat melihat perubahan"],
  ["Batas buyback per eksekusi", "min(0,5 ETH, 1% likuiditas pool)", "Mengurangi dampak harga dan sandwich"],
  ["Timelock CTO", "3 hari + persetujuan multisig", "Mengikuti alur Pons V2"],
  ["Timelock penarikan treasury", "48 jam", "Penarikan dana platform terlihat lebih dulu"],
];

const RISKS = [
  "Contract belum diaudit. Gunakan dana seperlunya selama masa uji coba.",
  "Integrasi Pons V2 masih memakai interface placeholder sampai ABI resmi tersedia.",
  "Buyback bisa terkena slippage atau sandwich. minOut wajib dan jumlah per eksekusi dibatasi, tetapi risikonya tidak hilang.",
  "Reward hanya untuk staker. Token yang tidak di-stake (termasuk di pool likuiditas) tidak menerima ETH.",
  "Pasangan saham ter-tokenisasi bergantung pada likuiditas ETH ke NVDA/AAPL/HOOD/USDG dan aturan hukum di wilayah Anda.",
  "Pause darurat hanya menghentikan launch dan buyback baru; klaim tidak pernah dikunci.",
];

export default function DocsPage() {
  const addresses = [
    ["PontoonLauncher", contracts.launcher],
    ["TokenRegistry", contracts.registry],
    ["BuybackExecutor", contracts.buybackExecutor],
    ["PlatformTreasury", contracts.treasury],
    ["CTOManager", contracts.ctoManager],
    ["Pons V2 factory (placeholder)", contracts.ponsFactory],
    ["Pons V2 router (placeholder)", contracts.ponsRouter],
    ["Uniswap V4 adapter (placeholder)", contracts.v4Adapter],
  ] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageTitle
        title="Cara kerja Pontoon"
        subtitle="Pontoon adalah lapisan di atas Pons V2: token diluncurkan di Pons, tetapi fee creator diarahkan ke contract Pontoon yang membaginya sesuai pengaturan creator."
      />

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Alur fee</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Trader membeli atau menjual di Pons V2 (bonding curve sebelum lulus, Uniswap V4 setelah lulus).</li>
          <li>Pons V2 mengirim fee creator dalam ETH ke FeeVault token itu, bukan ke dompet creator.</li>
          <li>Siapa pun memanggil distribute() dan mendapat insentif kecil.</li>
          <li>FeeVault memotong fee platform ke PlatformTreasury.</li>
          <li>Sisanya dibagi ke payout creator, buyback-and-burn, dan reward holder.</li>
          <li>BuybackExecutor membeli token di pasar lalu mengirimnya ke 0x…dEaD.</li>
          <li>HolderRewards membagikan ETH ke staker dengan pola reward-per-share.</li>
        </ol>
        <div className="mt-6">
          <div className="mb-2 text-xs font-medium tracking-wider text-muted uppercase">Pembagian default dari total fee</div>
          <FeeSplitBar parts={splitFromConfig(PARAMS.defaultBuybackBps, PARAMS.defaultRewardBps, PARAMS.defaultPlatformFeeBps)} />
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Parameter</h2>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[520px] text-sm">
            <tbody className="divide-y divide-line">
              {PARAM_ROWS.map(([k, v, why]) => (
                <tr key={k}>
                  <td className="py-2 pr-3 font-medium">{k}</td>
                  <td className="py-2 pr-3">{v}</td>
                  <td className="py-2 text-muted">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Quote pair & buyback</h2>
        <p className="text-sm text-muted">
          Creator memilih ETH, USDG, atau saham ter-tokenisasi (NVDA, AAPL, HOOD). Untuk pasangan ETH, buyback swap ETH langsung ke token.
          Untuk pasangan lain, ETH ditukar ke quote asset dulu, lalu ke token. Sebelum lulus, buyback lewat router bonding curve Pons V2;
          setelah lulus, lewat pool Uniswap V4.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Hak akses</h2>
        <ul className="space-y-2 text-sm text-muted">
          <li>
            <span className="font-medium text-ink">Creator:</span> mengantrekan perubahan konfigurasi dan klaim payout. Tidak bisa menarik
            dana buyback atau reward.
          </li>
          <li>
            <span className="font-medium text-ink">Siapa pun:</span> memanggil distribute() dan buyback, stake, dan klaim.
          </li>
          <li>
            <span className="font-medium text-ink">Multisig Pontoon:</span> mengubah fee platform dalam batas, menyetujui CTO, pause darurat.
            Tidak bisa menyentuh dana di FeeVault atau HolderRewards.
          </li>
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Alamat contract</h2>
        <ul className="space-y-1.5 text-sm">
          {addresses.map(([name, a]) => (
            <li key={name} className="flex flex-wrap justify-between gap-2">
              <span className="text-muted">{name}</span>
              <span className="font-mono text-xs break-all">{a ?? "belum diset"}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Risiko</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          {RISKS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
