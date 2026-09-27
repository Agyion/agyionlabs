# Cüzdan Bağlantısı: Kim, Nereden, Nasıl?
(19 Eylül 2026)

> 27 Eylül 2026 güncel durum: Aşağıdaki senaryo haritası ilk tasarım planıdır.
> Uygulama şu anda yalnızca Freighter adaptörünü sunar ve bağlantı ile imzalama
> sırasında Stellar testnet ağını doğrular. Mevcut xBull, LOBSTR ve WalletConnect
> adaptörleri etkin ağı doğrulayamadığı için uygulamada kullanıma açık değildir;
> WalletConnect proje kimliği girmek bu desteği etkinleştirmez. Mobil QR/deep-link
> ve cüzdan içi tarayıcı akışları için çalışıyor iddiasında bulunulmamalıdır.
> Test anahtarı yalnızca testnet içindir ve mevcut sayfanın belleğinde tutulur.
> [Güncel istemci incelemesi](security/2026-09-27/PUBLIC_CLIENT_FULL_REVIEW.md)
> bu sınırı ve doğrulama kanıtlarını açıklar.

## Senaryo haritası

| Kullanıcı nereden açıyor | Ne olur |
|---|---|
| **Masaüstü web + Freighter kurulu** | "Cüzdan Bağla" → Wallets Kit modal → Freighter popup → imza. En akıcı yol. |
| **Masaüstü web + cüzdan yok** | Modal yükleme linki gösterir (Freighter/xBull). Demo için test-secret modu yedekte (belirgin "demo modu" uyarısıyla). |
| **Mobil tarayıcı** | WalletConnect modülü: QR/deep-link ile LOBSTR/xBull'a atlar, imza orada döner. |
| **Wallet uygulamasının iç tarayıcısı** (LOBSTR in-app browser) | Kit otomatik algılar, direkt imza akışı: en sorunsuz mobil yol. |
| **Hiç cüzdan istemeyen (jüri)** | Passkey/smart wallet roadmap'te (handbook'ta bonus feature); demo günü test-secret modu. |

## Teknik yapı
- `@creit-tech/stellar-wallets-kit` (hackathon eligible partner: Ecosystem Fit puanı).
- Tüm imzalama `TransactionSigner` soyutlamasından akar; kit bunu besler.
- Ağ kontrolü: pubnet'te bağlanırsa testnet uyarısı.
- Güvenlik kuralları korunur: kullanıcı seed'i asla bizde durmaz; test modu sadece demo.

## Neden bu kurgu
CANON kural 1 (fon Agyion'a uğramaz) + SDF'in RFP dili ("users do not need XLM") + jüri UX kriteri. Mobil in-app tarayıcı senaryosu Türkiye'de kritik: kripto-native kullanıcı çoğunlukla mobilden gelir.
