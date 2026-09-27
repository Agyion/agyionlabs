# anchor/: Self-Host Anchor Alternatifi (demo yolu değil)

> **Kaynak durumu: 26 Eylül 2026:** Uygulamanın varsayılan sağlayıcısı hackathon TR mock anchor'ıdır: `https://tr-mock-anchor.fly.dev`. İstemci SEP-6, SEP-10, SEP-12 ve SEP-38 akışlarını kullanır; güncel destek ve ücretler sağlayıcının yanıtlarından alınmalıdır. Bu incelemede sağlayıcıya bağlanılmadı. Kendi anchor'ımızı işlettiğimiz veya gerçek TRY aktardığımız iddiası yoktur. Bu klasör, kurulup doğrulanmış bir yedek servis değil, ayrı kurulum gerektiren tarihsel SEP-24 yapılandırma örneğidir.

Bu örnek, temsilî test varlıklarını ve simüle banka bacağını tarif eder. Issuer, dağıtım hesabı, varlık izinleri ve servis sürümü ayrı doğrulanmadan gerçek bir anchor kurulumu sayılmaz.

## Ne var?

| Dosya | Amaç |
|---|---|
| `assets.yaml` | Örnek public hesap adresleriyle **tTRY**, XLM ve `iso4217:TRY` tanımları. SEP-24 bayraklarının açık olması canlı servis veya varlık varlığı kanıtı değildir. |

## Quick-run (docker compose)

SDF Anchor Platform'ın `quick-run` profili tüm bağımlılıklarıyla gelir (SEP Server, Platform API, Observer, Reference Server, Kafka, PostgreSQL, SEP-24 demo UI):

```bash
git clone https://github.com/stellar/anchor-platform.git
cd anchor-platform

# Bizim varlık tanımımızı quick-run config'ine kopyala
cp /path/to/agyion/anchor/assets.yaml quick-run/config/assets.yaml
# (Not: quick-run içindeki config yolu sürüme göre değişebilir;
#  repo'daki varsayılan assets.yaml'ın konumunu referans alın.)

cd quick-run
docker compose up -d

# Sağlık kontrolü
curl http://localhost:8080/.well-known/stellar.toml
```

Açılan servisler (varsayılan portlar):

- **Platform (SEP Server + Platform API + Observer)**: 8080 / 8085
- **Reference Server**: 8091
- **SEP-24 UI**: 3000
- **Kafka**: 29092, **PostgreSQL**: 5432/5433

Durdurmak için: `docker compose down`

İnteraktif akışı **Stellar Demo Wallet** ile test edin: yeni hesap açın, varlık olarak `tTRY` / home domain `localhost:8080` / issuer = `assets.yaml`'daki adresi ekleyin.

## ⚠️ "Gerçek TRY" kriteri

Bu MVP'nin banka bacağı **simüle edilir**; gerçek FAST/EFT hareketi veya TRY teslimi kanıtlanmaz. Organizatörün demo kriterini kabul etmesi de gerçek banka transferi yapıldığı anlamına gelmez. Gösterimde "test varlıkları, banka bacağı simülasyon" ifadesini kullanın.

## Alternatifler

Kendi anchor'ınızı kaldırmak yerine hazır test ortamları:

- **tr-mock-anchor.fly.dev**: resmî hackathon TR mock anchor'ı; **birincil demo yolu budur** (SEP-6, TRY↔USDC). Uygulama bunu kutudan çıkar çıkmaz kullanır (`NEXT_PUBLIC_ANCHOR_URL`).
- **testanchor.stellar.org**: SDF'in referans test anchor'ı (home domain: `testanchor.stellar.org`). SEP-24 akışını hızlıca denemek için en kestirme yol; ancak **tTRY tanımlı değildir** ve banka bacağı yine simülasyondur.
- Kendi `tTRY`'nizi demo cüzdana elle trustline + `payment` ile dağıtmak (anchor'sız minimum yol): "anchor TRY" kriterinin zincir tarafını gösterir, SEP-24 etkileşimini göstermez.

## Bilinen tuzaklar

1. **CORS**: SEP Server'a tarayıcıdan (cüzdan/frontend) istek atacaksanız CORS açık olmalı. Anchor Platform'da `dev.env` içinde `SEP_SERVER_CORS_ALLOWED_ORIGINS` (veya eşdeğeri) boş/yanlışsa `POST /transactions/deposit/interactive` preflight'ta takılır. Demo Wallet'tan localhost anchor'a giderken origin'i beyaz listeye ekleyin.
2. **JWT `sub`**: SEP-10 JWT'sinin `sub` claim'i `G...` hesap (gerekiyorsa `:memo` sonekiyle) olmalı. Sonraki `/transaction` çağrılarında `sub` ile istenen kayıt eşleşmezse 403/404 alırsınız; "hesabımı göremiyorum" şikâyetinin ilk şüphelisi budur.
3. **`withdraw_memo`**: İnteraktif withdraw sonunda anchor `withdraw_anchor_account` + `withdraw_memo` (+`withdraw_memo_type`) döner. Cüzdan ödemeyi **bu memo ile** göndermezse anchor ödemeyi işlemle eşleştiremez, tx `pending_user_transfer_start`'ta asılı kalır. Memo'yu asla atlamayın.
4. **İnteraktif URL iframe'de açılmaz**: SEP-24 interactive URL'i çoğu kurulumda `X-Frame-Options`/`frame-ancestors` nedeniyle iframe içinde çalışmaz. Yeni sekme/popup ile açın; "beyaz ekran" görüyorsanız ilk şüpheli budur. Demo akışında frontend'inizden anchor UI'ını popup'ta başlatın.

## Referanslar

- Anchor Platform: https://developers.stellar.org/platforms/anchor-platform
- SEP-24 (Hosted Deposit & Withdrawal): https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md
- SEP-10 (Web Authentication), SEP-38 (RFQ): stellar-protocol repo'su `ecosystem/` altında.
