# Pontoon — Spesifikasi Fee, Smart Contract & Website

Oct 20, 2026 · @choky

## Ringkasan produk

Pontoon adalah launchpad di Robinhood Chain yang meluncurkan setiap token lewat Pons V2, lalu mengarahkan fee creator dari Pons ke smart contract Pontoon. Contract itu membagi fee sesuai pengaturan creator: bayaran creator, buyback-and-burn, dan reward ETH untuk holder.

Pons V2 sendiri menangani bonding curve berdenominasi ETH, graduasi ke pool Uniswap V4 yang dikunci, pasangan custom (ETH, USDG, saham ter-tokenisasi), dan fee 1% yang dibayarkan ke creator dalam ETH. Pontoon tidak menggantikan itu, tetapi menjadi lapisan di atasnya.

| No | Fitur | Inti |
| --- | --- | --- |
| 3 | Pilihan quote pair | Creator memilih ETH, USDG, atau saham ter-tokenisasi (NVDA, AAPL, HOOD) saat launch |
| 4 | Kategori memestock | Token bertema saham/perusahaan diberi tag dan halaman tersendiri |
| 5 | Treasury & transparansi | Dashboard publik: fee masuk, buyback, burn, reward, saldo treasury |
| 6 | Pengaturan buyback oleh creator | Creator membagi fee ke payout, buyback-burn, dan reward holder dalam batas aman |
| 7 | Status graduated | Progres bonding curve, notifikasi hampir lulus, label setelah lulus ke Uniswap V4 |
| 9 | Dukungan CTO | Alur community takeover yang mengikuti timelock 3 hari dari Pons V2 |

Semua persentase dan batas di dokumen ini adalah usulan awal, bukan fakta dari Pons; silakan disesuaikan.

## Alur fee

Setiap trade di Pons V2 menghasilkan fee creator dalam ETH, yang dikirim ke FeeVault milik token itu, bukan ke dompet creator. FeeVault memotong fee platform, lalu membagi sisanya sesuai pengaturan creator.

&#91;embedded content: alur fee Pontoon · 1 vault, 4 tujuan\]

Fee hanya masuk lewat FeeVault; creator tidak pernah menerima fee langsung dari Pons, sehingga porsi buyback dan reward tidak bisa ditarik.

### Urutan aliran

1. Trader membeli atau menjual token di Pons V2 (bonding curve sebelum lulus, Uniswap V4 setelah lulus).
2. Pons V2 mengirim bagian fee creator dalam ETH ke alamat FeeVault token tersebut.
3. Siapa pun boleh memanggil `distribute()` di FeeVault. Pemanggil mendapat insentif kecil agar distribusi berjalan otomatis tanpa server pusat.
4. FeeVault memotong fee platform ke PlatformTreasury.
5. Sisanya dibagi tiga sesuai konfigurasi creator: payout creator, buyback-and-burn, dan reward holder.
6. Porsi buyback dikirim ke BuybackExecutor, yang membeli token di pasar lalu membakarnya.
7. Porsi reward masuk ke HolderRewards, tempat holder yang men-stake token mengklaim ETH.

### Usulan parameter

| Parameter | Usulan | Alasan |
| --- | --- | --- |
| Fee platform | 20% dari fee yang masuk | Pendapatan Pontoon; ubah sesuai model bisnis |
| Insentif pemanggil `distribute()` | 0,5% dari jumlah yang didistribusikan, maks. 0,005 ETH | Cukup untuk menutup gas, tidak menguras fee |
| Buyback-and-burn | 0–80% dari sisa | Creator bebas memilih, tetapi tidak bisa 100% sehingga tetap ada insentif creator |
| Reward holder | 0–50% dari sisa | Mencegah creator menjanjikan reward berlebihan |
| Payout creator | Sisa setelah dua di atas | Otomatis, minimal 0% |
| Default jika creator tidak mengatur | 40% buyback, 20% reward, 40% creator | Aman untuk pemula |
| Timelock perubahan konfigurasi | 24 jam | Holder sempat melihat perubahan di dashboard sebelum berlaku |
| Batas buyback per eksekusi | Maks. 1% likuiditas pool atau 0,5 ETH | Mengurangi dampak harga dan risiko sandwich |

### Buyback dan quote pair

Jalur buyback mengikuti quote pair token (fitur 3). Untuk pasangan ETH, swap langsung ETH ke token. Untuk pasangan USDG atau saham, swap ETH ke quote asset dulu, lalu ke token. Karena itu, likuiditas pool ETH ke USDG, NVDA, AAPL, dan HOOD harus dicek sebelum pasangan itu dibuka untuk creator.

Sebelum lulus, buyback dieksekusi lewat router bonding curve Pons V2. Setelah lulus, lewat pool Uniswap V4. Token hasil buyback dikirim ke alamat burn (`0x…dEaD`) agar jejaknya mudah diverifikasi di dashboard.

### Reward holder lewat staking

Reward ETH dibagikan ke holder yang men-stake token di HolderRewards, bukan ke semua pemegang. Alasannya, membagi ETH ke semua alamat butuh snapshot off-chain dan rawan manipulasi, sedangkan staking bisa dihitung sepenuhnya on-chain dengan pola reward-per-share. Pool likuiditas dan alamat burn otomatis tidak ikut menerima reward.

## Arsitektur smart contract

Pontoon terdiri dari tujuh contract. Satu FeeVault dan satu pool HolderRewards dibuat per token sebagai minimal proxy (EIP-1167) agar biaya deploy murah; sisanya contract tunggal untuk seluruh platform.

| Contract | Jumlah | Tugas | Fungsi utama |
| --- | --- | --- | --- |
| PontoonLauncher | 1 | Pintu masuk launch; memanggil factory Pons V2 dengan quote pair pilihan dan penerima fee = FeeVault baru | `launch(meta, quotePair, isMemestock, feeConfig)` |
| TokenRegistry | 1 | Data token: creator, quote pair, tag memestock, status curve/graduated, alamat vault | `register()`, `markGraduated()`, `getToken()` |
| FeeVault | 1 per token | Menerima fee ETH, menyimpan konfigurasi creator, membagi fee | `distribute()`, `queueConfig()`, `applyConfig()`, `claimCreator()` |
| BuybackExecutor | 1 | Swap ETH ke token lewat curve Pons atau Uniswap V4, lalu burn | `buybackAndBurn(token, amount, minOut)` |
| HolderRewards | 1 per token | Staking token dan reward ETH dengan pola reward-per-share | `stake()`, `unstake()`, `claim()`, `notifyReward()` |
| PlatformTreasury | 1 | Menampung fee platform; dikendalikan multisig | `withdraw()` (multisig + timelock) |
| CTOManager | 1 | Memindahkan hak admin FeeVault ke tim takeover setelah timelock 3 hari | `requestCTO()`, `approveCTO()`, `executeCTO()`, `cancelCTO()` |

### Hak akses

| Peran | Boleh | Tidak boleh |
| --- | --- | --- |
| Creator (admin vault) | Mengantre perubahan konfigurasi, klaim payout | Menarik dana buyback/reward, mengubah konfigurasi tanpa timelock |
| Siapa pun | Memanggil `distribute()` dan buyback, stake, klaim | Mengubah parameter apa pun |
| Multisig Pontoon | Mengubah fee platform dalam batas maks., menyetujui CTO, pause darurat | Menyentuh dana di FeeVault atau HolderRewards |

### Event untuk indexer

Dashboard transparansi (fitur 5) dan pelacak graduated (fitur 7) dibangun dari event ini, ditambah event bonding curve dan graduasi milik Pons V2:

- `TokenLaunched(token, creator, quotePair, isMemestock, vault)`
- `FeeReceived(token, amount)` dan `FeeDistributed(token, platform, creator, buyback, rewards, caller)`
- `BuybackExecuted(token, ethIn, tokensBurned)`
- `ConfigQueued(token, newConfig, eta)` dan `ConfigApplied(token, newConfig)`
- `Staked`, `Unstaked`, `RewardClaimed`
- `CTORequested(token, newAdmin, eta)`, `CTOExecuted(token, oldAdmin, newAdmin)`, `CTOCancelled(token)`
- `Graduated(token)` dari Pons V2, disalin ke TokenRegistry

### Keamanan

- Reentrancy guard di semua fungsi yang mengirim ETH; pola pull untuk klaim creator dan holder.
- `minOut` wajib di setiap buyback dan batas jumlah per eksekusi untuk mengurangi sandwich.
- Tidak ada fungsi bagi admin mana pun untuk menarik dana vault atau reward.
- Contract inti tidak upgradeable; kalau perlu upgrade, pakai proxy dengan timelock minimal 48 jam.
- Pause darurat hanya menghentikan launch dan buyback baru, tidak pernah mengunci klaim.
- Audit eksternal dan uji fuzz (Foundry) sebelum mainnet.

## Susunan halaman website

Website Pontoon punya sembilan halaman, semuanya membaca data dari indexer dan menulis ke contract lewat dompet pengguna.

| Halaman | Route | Isi utama | Fitur |
| --- | --- | --- | --- |
| Beranda | `/` | Statistik platform (volume 24 jam, token diluncurkan, total buyback, total burn), tab Trending, Baru, Hampir Lulus, Memestock | 4, 5, 7 |
| Launch token | `/launch` | Form nama, ticker, gambar, deskripsi, sosial; pilihan quote pair; toggle memestock; slider pembagian fee dengan preview; tombol deploy | 3, 4, 6 |
| Detail token | `/token/[address]` | Chart harga, panel beli/jual lewat Pons V2, progres bonding curve, konfigurasi fee aktif dan yang mengantre, riwayat buyback-burn, holder, staking reward, status CTO | 3, 5, 6, 7, 9 |
| Memestock | `/memestocks` | Daftar token bertag memestock, filter per quote pair (NVDA, AAPL, HOOD, USDG, ETH) | 3, 4 |
| Treasury | `/treasury` | Dashboard publik: fee masuk, pembagian, buyback, burn, saldo PlatformTreasury, feed transaksi langsung dengan link explorer | 5 |
| Rewards | `/rewards` | Semua posisi staking pengguna, ETH yang bisa diklaim, tombol klaim semua | 6 |
| Dashboard creator | `/creator` | Token milik creator, fee yang diperoleh, klaim payout, ubah konfigurasi (dengan hitung mundur timelock 24 jam) | 6 |
| CTO | `/cto` | Daftar pengajuan takeover, status, hitung mundur 3 hari, form pengajuan | 9 |
| Docs | `/docs` | Cara kerja, alur fee, parameter, alamat contract, risiko | Semua |

### Komponen yang dipakai ulang

- **TokenCard**: gambar, ticker, market cap, progres curve, badge quote pair, badge memestock, badge Graduated.
- **CurveProgress**: bar progres menuju graduasi, berubah jadi badge setelah lulus.
- **FeeSplitBar**: bar warna yang menunjukkan porsi platform, creator, buyback, dan reward.
- **TxFeed**: daftar event terbaru dari indexer.
- **ConnectButton**: koneksi dompet dan pengecekan jaringan Robinhood Chain.

### Stack

| Lapisan | Pilihan | Catatan |
| --- | --- | --- |
| Smart contract | Solidity + Foundry | Uji fuzz dan fork test terhadap contract Pons V2 |
| Frontend | Next.js (App Router), TypeScript, Tailwind | Cocok dibangun bertahap dengan Claude Code |
| Web3 | wagmi + viem + RainbowKit | Tambahkan Robinhood Chain sebagai custom chain (chain ID dan RPC resmi) |
| Indexer | Ponder atau Envio | Pastikan mendukung Robinhood Chain sebelum memilih |
| Database | PostgreSQL (bawaan indexer) | Untuk statistik dan riwayat |
| Hosting | Vercel (web) + Railway/Render (indexer) |  |

### Struktur repo

```
pontoon/
  CLAUDE.md          # ringkasan proyek + aturan untuk Claude Code
  contracts/         # Foundry: src/, test/, script/
  indexer/           # Ponder/Envio: schema + handler event
  web/               # Next.js: app/, components/, lib/
  docs/              # salinan spesifikasi ini
```

### Prompt awal untuk Claude Code

Simpan dokumen ini sebagai `docs/spec.md`, lalu jalankan prompt bertahap berikut.

1. *Tahap 1, contract:* "Baca docs/spec.md. Buat proyek Foundry di contracts/ dengan tujuh contract sesuai bagian Arsitektur. Gunakan interface placeholder untuk factory dan router Pons V2. Tulis test untuk distribute(), batas konfigurasi, timelock, dan CTO."
2. *Tahap 2, indexer:* "Buat indexer di indexer/ yang menangkap semua event di bagian Event untuk indexer, plus event Graduated dari Pons V2. Sediakan API untuk statistik beranda, treasury, dan detail token."
3. *Tahap 3, frontend:* "Buat Next.js di web/ dengan halaman sesuai tabel Susunan halaman. Mulai dari beranda, launch, dan detail token dengan data dummy, lalu sambungkan ke indexer dan contract."
4. *Tahap 4, integrasi:* "Ganti interface placeholder Pons V2 dengan ABI dan alamat asli, jalankan fork test di Robinhood Chain, lalu deploy ke testnet."

## Verifikasi dan urutan pengerjaan

Seluruh rancangan bergantung pada satu hal: Pons V2 harus mengizinkan penerima fee creator berupa smart contract. Pastikan ini ke tim Pons sebelum menulis kode.

### Pertanyaan untuk tim Pons

- [ ] Apakah penerima fee creator boleh berupa alamat contract, dan bisakah diubah setelah launch?
- [ ] Berapa porsi fee creator dari total fee 1%, dan seberapa sering dikirim (per trade atau harus diklaim)?
- [ ] Apakah ada factory/router publik dan ABI untuk launch dari pihak ketiga, serta apakah perlu whitelist?
- [ ] Quote pair apa saja yang diizinkan, dan apakah daftarnya bisa bertambah?
- [ ] Event apa yang dipancarkan saat graduasi ke Uniswap V4?
- [ ] Bagaimana proses CTO di Pons V2 bisa diikuti contract pihak ketiga, dan siapa yang menyetujui?

### Pertanyaan teknis lain

- [ ] Likuiditas pool ETH ke USDG, NVDA, AAPL, dan HOOD cukup untuk buyback tanpa slippage besar?
- [ ] Indexer (Ponder/Envio) mendukung Robinhood Chain?
- [ ] Chain ID, RPC, dan explorer resmi untuk mainnet dan testnet.
- [ ] Aspek hukum memakai saham ter-tokenisasi sebagai quote pair, terutama untuk pengguna di wilayah tertentu.

### Urutan pengerjaan

1. Konfirmasi ke tim Pons (daftar di atas).
2. Contract + test di Foundry, termasuk fork test ke Pons V2.
3. Indexer untuk semua event.
4. Frontend: beranda, launch, detail token.
5. Frontend: treasury, rewards, creator, memestock, CTO, docs.
6. Testnet dan uji coba terbatas dengan beberapa creator.
7. Audit, perbaikan, lalu mainnet.
