# Onramp / Offramp: Agyion'ta TRY Rayı Nasıl Çalışır?
(Düz anlatım + teknik akış | 19 Eylül 2026)

## Düz anlatım

**Onramp = bankadan zincire giriş kapısı. Offramp = zincirden bankaya çıkış kapısı.** İkisi de "anchor" denen lisanslı kuruluşun verdiği hizmet; bizim demoda bu, **resmî hackathon TR mock anchor'ıdır** (`tr-mock-anchor.fly.dev`, SEP-6: kendi kurduğumuz bir anchor **değil**). Kullanıcının gördüğü: banka transferi yapar (FAST/EFT, sandbox'ta simüle), bakiyesi uygulamada belirir; çıkarken uygulamadan çeker, bankasına TRY gelir. Kripto hiç görünmez: CANON kural 4: esnaf/kullanıcı sadece TRY görür.

## Agyion akışında nerede durur?

```
[Banka/FAST] --onramp (SEP-6 deposit)--> [USDC bakiye] --> [Agyion kontratı: kilitle → koşul → claim/iade]
[Banka/FAST] <--offramp (SEP-6 withdraw)-- [USDC bakiye] <-- [claim/iade'den dönen fon]
```

1. **Onramp (TRY yatırma):** Kullanıcı On/Off-ramp sekmesinde "Get deposit instructions"a basar → SEP-10 auth → anchor banka talimatı döndürür (IBAN + açıklama referansı, FAST/EFT simülasyonu) → transfer sonrası USDC kullanıcının Stellar hesabında.
2. **Kilit:** Kullanıcı Son Saat potu kurar ya da claim eder: Agyion kontratı fonu kurallarla tutar (biz tutmayız).
3. **Offramp (TRY çekme):** Claim/iade sonrası kullanıcı "Register withdrawal" → SEP-6 withdraw → USDC'yi anchor'ın verdiği hesap+memo ile gönderir → anchor bankaya EFT yapar (simüle).

## Demo günü gerçekliği (dürüst)
- Testnet'te gerçek banka yok: resmî TR mock anchor (`tr-mock-anchor.fly.dev`) ile **simüle edilmiş** deposit/withdraw gösterilir; banka bacağı sandbox'tır. LIMITATIONS.md'de yazıyor; SDF FAQ bunu kabul eder ("document gaps; judges understand").
- Mock anchor erişilemezse çevrimdışı fallback: kendi Anchor Platform quick-run'ımız (`anchor/README.md`, SEP-24): o da simülasyondur.

## Teknik parçalar
- `app/app/lib/anchor.ts`: SEP-10 (challenge imzala → JWT) + SEP-6 (deposit/withdraw, GET-query) + SEP-38 (TRY/USDC kur gösterimi) istemcisi; UI'da On/Off-ramp sekmesi.
- `anchor/assets.yaml`: self-host alternatifi için tTRY tanımı (SEP-24 açık): demo yolu değildir.
- Reflector oracle (should katmanı): TRY kuru gösterimi.

## Jüri cümlesi
"Anchor/local payments en yüksek ağırlıklı kriter: biz resmî TR mock anchor'ı uçtan uca entegre ettik: SEP-10 auth, SEP-6 programmatic ramp, SEP-38 quote, hepsi canlı ekranda. Banka bacağının simülasyon olduğunu da açıkça söylüyoruz."
