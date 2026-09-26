> **Historical specification — superseded as of 2026-09-26:** this is build provenance, not the current API or a security guarantee. The executable contract and [V3 security protocol](contracts/hak/SECURITY_PROTOCOL.md) supersede the layouts and front-running claims below. Current Pod uses a fresh Ed25519 claim key and recipient/domain-bound signatures; the intermediate V2 commit/reveal design was also superseded because delayed submission exposed the secret. Refunds require transactions, and Pod has no refund. Current release boundary: [README.md](README.md) and [HANDOFF.md](HANDOFF.md).

# SPEC.md — HAK (çalışma adı) | Tek Doğruluk Kaynağı (Build)
**Genesis Track MVP | CANON.md kapsam kilidi: Must = çekirdek + Son Saat + anchor TRY + tek ana ekran + testnet**
Dil: kontratlar Rust (soroban-sdk), frontend Next.js+TS, anchor config YAML. Tüm UI metinleri TÜRKÇE.

## 1. Repo yapısı
```
project/
├── contracts/hak/          # Soroban kontratı (tek kontrat, modüler iç yapı)
│   ├── Cargo.toml
│   └── src/lib.rs          # kernel + şablon modülleri
│   └── src/son_saat.rs     # Son Saat şablonu
│   └── src/kapsul.rs       # Kapsül şablonu (stub → should)
│   └── src/test.rs         # unit testler
├── app/                    # Next.js frontend (tek ana ekran)
├── anchor/                 # Anchor Platform yapılandırması + notlar
├── scripts/                # deploy/test script'leri
└── docs/                   # README taslağı, LIMITATIONS
```

## 2. Varlık stratejisi (final review F1 kararı)
Kontrat varlık-adresi parametrik. Testlerde soroban_sdk `StellarAssetContract` test token kullanılır. Demo/testnet'te: kendi ihraç ettiğimiz temsili token (issuer = bizim testnet hesabı) — clawback kapalı. USDC'ye bağımlılık YOK.

## 3. Kontrat: `hak` (tek kontrat, template_id dispatch)

### 3.1 Tipler
```rust
#[contracttype] pub enum Template { SonSaat, Kapsul }  // generic: T1=1, T2=2 (zincirde anlam generik — CANON kural 7)
#[contracttype] pub struct Listing {
  seller: Address, asset: Address, pot: i128,
  start_price: i128,      // stroop-benzeri minor unit
  floor_price: i128,      // negatif olabilir (alt sınır)
  start_ledger: u32, deadline_ledger: u32, pickup_window: u32,
  slope_num: i128, slope_den: i128,  // ledger başına düşüş (rasyonel)
  venue_pubkey: BytesN<32>,
  state: u32,             // 0=açık 1=claim edildi 2=teslim tamam 3=iade edildi
  claimant: Option<Address>, claimed_at: Option<u32>,
}
#[contracttype] pub struct Capsule {
  funder: Address, asset: Address, amount: i128,
  unlock_ledger: u32, key_hash: BytesN<32>, // sha256(preimage)
  state: u32,               // 0=gömülü 1=açıldı
}
```

### 3.2 Fonksiyonlar (imzalar KUTSAL — ajanlar değiştirmez)
```rust
// Son Saat
pub fn create_listing(env, seller: Address, asset: Address, pot: i128, start_price: i128, floor_price: i128, slope_num: i128, slope_den: i128, duration_ledgers: u32, pickup_window: u32, venue_pubkey: BytesN<32>) -> u64
pub fn price_at(env, listing_id: u64) -> i128   // view; lineer geriye akan, floor'da durur
pub fn claim(env, listing_id: u64, claimant: Address)           // açık→claim edildi; claimant yetkilendirmesi
pub fn confirm_pickup(env, listing_id: u64, ts: u64, sig: BytesN<64>) // venue ed25519 imzası (payload: listing_id||claimant||ts) doğrular; fiyat price_at(claimed_at) üzerinden settle: fiyat>0 claimant→seller, fiyat<0 pot→claimant, kalan pot seller'a
pub fn iade(env, listing_id: u64)   // kurallı geri dönüş: deadline geçtiyse (claim yoksa) veya pickup_window dolduysa (teslim yoksa) → pot seller'a. Takdir yok.
// Kapsül
pub fn create_capsule(env, funder: Address, asset: Address, amount: i128, unlock_ledger: u32, key_hash: BytesN<32>) -> u64
pub fn claim_capsule(env, capsule_id: u64, preimage: Bytes, recipient: Address)  // sha256(preimage)==key_hash && ledger>=unlock_ledger; recipient tx gönderene bağlı (front-running koruması — final review F2)
```

### 3.3 Kurallar
- Tüm transferler `token::Client` (SAC) üzerinden; kontrat fonları kendi adresinde tutar (non-custodial: funder/seller fonu kontrata yatırır, kurallar dışında kimse çekemez).
- `claim`/`confirm_pickup`/`iade` yarışları: state machine geçişleri tek yönlü; aynı ledger'da ilk geçerli geçiş kazanır.
- `iade` hiçbir imza/takdir gerektirmez — herkes çağırabilir, kural herkes için aynı.
- Hata durumları: panic yerine tanımlı hata kodları.
- Testler (testutils): mutlu yol (pozitif fiyat settle), negatif fiyat settle (pot→claimant), iade (deadline), no-show iade (pickup_window dolunca), kapsül (erken claim reddi + zamanında açılış + yanlış preimage reddi), aynı-ledger çift claim (ikincisi reddedilir).

## 4. Frontend (app/) — tek ana ekran
- Next.js 14 (app router) + TypeScript + Tailwind. Türkçe UI. Düşük doyumlu, sıcak palet, bol whitespace (musepool estetiği; gradient yok).
- Tek sayfa akış: (a) Satıcı formu (pot, başlangıç fiyatı, taban, süre) → create_listing; (b) canlı fiyat saati (ledger polling, geriye akan sayaç, sıfırı geçince "kampanya havuzu ödüyor" rozeti); (c) alıcı "Claim" butonu; (d) teslim ekranı (imza yapıştır) → confirm_pickup; (e) iade butonu (deadline sonrası).
- Cüzdan: Stellar Wallets Kit; yoksa test modunda secret-key alanı (demo notuyla).
- RPC: soroban-testnet; kontrat ID config'den.

## 5. Anchor (anchor/)
- `assets.yaml`: TRY temsili token girişi (SEP-24 deposit/withdraw açık), `docker-compose quick-run` notları, README: "gerçek TRY kriteri organizatör teyidi" notu + alternatifler (testanchor.stellar.org).

## 6. İş bölümü (Mode A)
- **Ajan K (kontrat)**: contracts/hak — §2-3 birebir. cargo test yeşil şart.
- **Ajan F (frontend)**: app/ — §4 birebir; kontrat API'si §3.2'ye göre (spec'te sabit, kontrat bitmeden mock client ile başlar, sonra gerçek binding).
- **Ajan A (anchor+docs)**: anchor/ + scripts/ + docs/README taslak + LIMITATIONS.md iskeleti.

## 7. Kabul kriterleri
- `cargo build --target wasm32v1-none --release` yeşil; `cargo test` tüm testler geçer
- `npm run build` yeşil
- Anchor config validate edilebilir (yaml lint)
- Her şey spec'e sadık; değişiklik yok
