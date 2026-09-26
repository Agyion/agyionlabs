# Cüzdan ve anchor güvenlik doğrulaması — 24 Eylül 2026

Kontrol anı: **2026-09-24 13:05–13:07 UTC / 16:05–16:07 Europe/Istanbul**. Bu not yerel kod, saldırı regresyon testleri ve bağımlılık incelemesini kapsar. Canlı cüzdan hesabıyla imza, SEP-10 POST, transfer, friendbot fonlama, sözleşme gönderimi veya dağıtım yapılmadı.

## Kapsam ve düzeltilen bulgular

İncelenen dosyalar: `app/app/lib/wallet.ts`, `walletsKit.ts`, `useWallet.ts`, `anchor.ts`, `accountOps.ts`, `config.ts`. Sözleşme, panel ve Soroban istemci değişiklikleri diğer doğrulama çalışmalarının kapsamındadır.

| Bulgu | Önceki davranış ve yerel kanıt | Uygulanan sınır |
| --- | --- | --- |
| SEP-10 üzerinden istenmeyen işlem imzalatma | Ağ bilgisi eşleşen, ödeme içeren çalıştırılabilir bir XDR kimlik doğrulama isteği gibi imzalanıyordu. Saldırı testi düzeltmeden önce başarısız oldu. | HTTPS `stellar.toml` keşfi; `SIGNING_KEY`, beklenen `/auth` adresi ve ağ kontrolü; SDK `WebAuth.readChallengeTx` ile sunucu imzası, sıfır sıra numarası, işlem türleri, alan adı, nonce ve süre kontrolü. İstemci hesabı ayrıca eşleştiriliyor; istenmeyen memo ve client-domain kapsamı reddediliyor. |
| Kalıcı test anahtarı ve sessiz geri yükleme | Test sırrı `localStorage` içine yazılıyor; varsayılan imzalayıcı çözümlemesi eski sırrı geri yükleyebiliyordu. | Test anahtarı yalnızca sayfa belleğinde. Eski `agyion.testSecret.v1` kaydı okunmadan kaldırılıyor; geçiş ve bağlantı kesilmesi önceki anahtar nesnesini iptal ediyor. |
| Yanlış ağda imza | Test anahtarı public-network passphrase ile imzalayabiliyor; kit ağ uyumsuzluğunda sadece uyarı gösterip imzalayıcıyı etkinleştiriyordu. | Test anahtarı ve kit işlemleri testnet ile sınırlı. Okunamayan veya farklı cüzdan ağı bağlantıyı engelliyor. Hesap ve ağ her imzadan önce ve sonra yeniden okunuyor. |
| Cüzdan yanıtında işlem değiştirme | Cüzdanın döndürdüğü XDR, istenen işlemle karşılaştırılmadan gönderilebiliyordu. | İmzalanan içerik hash'i istenen işlemle karşılaştırılıyor. Beklenen hesabın belirtilen ağdaki imzası doğrulanıyor. Değişmiş tutar, alıcı, kaynak, memo veya başka içerik reddediliyor. |
| Oturumlar arasında yetki taşınması | Token yalnızca hesap adresiyle süresiz önbelleğe alınıyor; cüzdan ayrılması temizlemiyordu. Geç bağlantı yanıtı eski hesabı geri getirebiliyordu. | İmzalayıcı nesnesi, hesap, sona erme ve cüzdan oturum sürümü birlikte kontrol ediliyor. Cüzdan geçişinde tokenlar temizleniyor. Eski bearer token ile SEP-6 çağrısı, hesap uyuşmazlığı ve geç async sonuçlar reddediliyor. |
| Yanlış başarılı friendbot sonucu | Her HTTP 400 yanıtı “zaten fonlanmış” sayılıyordu. | Yalnızca tanınan `createAccountAlreadyExist` yanıtı bu şekilde ele alınıyor; diğer hatalar kullanıcıya dönüyor. |

Standart kaynağı: [Stellar SEP-10](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md). `NEXT_PUBLIC_ANCHOR_SIGNING_KEY` isteğe bağlı bir ek anahtar sabitlemesidir; belirtilirse HTTPS TOML anahtarıyla aynı olmak zorundadır. Belirtilmezse güven kökü yapılandırılmış HTTPS anchor alan adıdır.

## Çalıştırılan doğrulamalar

Testlerde yalnızca yerel olarak oluşturulmuş geçici anahtarlar ve fixture XDR'leri kullanıldı. Anchor/Horizon HTTP sınırları ve cüzdan eklentisi arayüzleri taklit edildi; Stellar XDR ayrıştırma ve imza doğrulama gerçek SDK üzerinde çalıştı.

| Test dosyası | Geçen test |
| --- | ---: |
| `app/tests/wallet.security.test.ts` | 5 |
| `app/tests/anchor.security.test.ts` | 20 |
| `app/tests/walletsKit.security.test.ts` | 9 |
| `app/tests/wallet.accountOps.test.ts` | 5 |
| `app/tests/wallet.useWallet.test.tsx` | 5 |
| **Bu kapsamdaki toplam** | **44** |

Son tam uygulama çalıştırması: **10 dosyada 89/89 test geçti**, Vitest **4.1.11**. `npm run typecheck` geçti. Altı kapsam dosyasının ESLint kontrolü uyarısız geçti. Bu dosyalar için `git diff --check` geçti.

Tekrar çalıştırma (`app/` klasöründen):

```sh
npm test
npm run typecheck
npx eslint app/lib/wallet.ts app/lib/walletsKit.ts app/lib/useWallet.ts app/lib/anchor.ts app/lib/accountOps.ts app/lib/config.ts
npm audit --json
npm audit --omit=dev --json
```

Audit komutlarının çıkış kodu **1**: aşağıdaki kalan uyarılar nedeniyle. Test ve tip denetiminin başarılı olması sıfır bağımlılık uyarısı anlamına gelmez.

## Kalan npm audit bulguları

Tam audit ve `--omit=dev` sonucu aynı: **9 etkilenen paket kaydı — 4 low, 5 moderate, 0 high, 0 critical**. Bunlar dokuz bağımsız güvenlik açığı değildir; üç advisory'nin bağımlılık zincirindeki üst paketlere taşınmış kayıtlarını da içerir.

| Paket | Kurulu sürüm | npm şiddeti | Uyarının kaynağı |
| --- | --- | --- | --- |
| `@creit.tech/stellar-wallets-kit` | 2.7.0 | low | `@hot-wallet/sdk` bağımlılığı |
| `@hot-wallet/sdk` | 1.0.11 | moderate | `@near-js/crypto`, `@solana/web3.js` |
| `@near-js/crypto` | 1.4.2 | low | `secp256k1` |
| `secp256k1` | 5.0.1 | low | `elliptic` |
| `elliptic` | 6.6.1 | low | [GHSA-848j-6mx2-7j84 / CVE-2025-14505](https://github.com/advisories/GHSA-848j-6mx2-7j84) |
| `@solana/web3.js` | 1.99.0 | moderate | `jayson` |
| `jayson` | 4.3.0 | moderate | `stream-json`, `uuid` |
| `stream-json` | 1.9.1 | moderate | [GHSA-528h-pc64-c93x / CVE-2026-71429](https://github.com/advisories/GHSA-528h-pc64-c93x) |
| `uuid` | 8.3.2 | moderate | [GHSA-w5hq-g745-h8pq / CVE-2026-41907](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |

İkinci kurulu `uuid` kopyası **14.0.2**, `rpc-websockets` altındadır; bu audit kaydı ona ait değildir.

### Kullanılan import zinciri

Uygulama paket kökünü veya bütün cüzdan modüllerini topluca import etmiyor. `walletsKit.ts` şu altı runtime girişini kullanıyor:

- `@creit.tech/stellar-wallets-kit/sdk`
- `@creit.tech/stellar-wallets-kit/types`
- `@creit.tech/stellar-wallets-kit/modules/freighter`
- `@creit.tech/stellar-wallets-kit/modules/xbull`
- `@creit.tech/stellar-wallets-kit/modules/lobstr`
- `@creit.tech/stellar-wallets-kit/modules/wallet-connect`

Bu girişlerden başlayan TypeScript AST incelemesi, paket içindeki göreli static import/export ve literal dynamic import bağlantılarını **42 ESM dosyası** boyunca izledi. Sonuç: `hotwallet.module.js` erişilebilir değil; `@hot-wallet/sdk` importu yok; bu grafikte çözümlenemeyen hesaplanmış dynamic import yok. HOT SDK'yi import eden kit dosyası ayrı `sdk/modules/hotwallet.module.js` dosyasıdır.

Mevcut `.next/react-loadable-manifest.json` da yukarıdaki altı girişi kaydediyor. `.next/static` ve `.next/server` altındaki **187 JS/JSON dosyasında** `@hot-wallet`, `hot-wallet`, `hotwallet`, `HotWallet`, `Hotwallet`, `hotdao`, `HOT Wallet` işaretleri bulunmadı. Manifest ve metin kontrolü, AST grafiğini destekleyen statik kanıttır; tek başına çalışma zamanında hiçbir bağımlılık riski bulunmadığının ispatı değildir. HOT modülünün ileride eklenmesi bu değerlendirmeyi geçersiz kılar.

Kontrol edilen son build kimliği: `sLAKJJGOZ1kn3Gi_skWqW`.

- `app/package-lock.json` SHA-256: `e25a4224c426be8ee86ebd8e93184a823a218f4f8fae47cf58130e7a6e0ef469`
- `.next/react-loadable-manifest.json` SHA-256: `699d44a14737b1e691689fe8ec1e7e682444f8e8ff6de7152cc86b329324a8dc`

### Sürüm seçenekleri

24 Eylül 2026 tarihli npm registry sorgularında `stellar-wallets-kit` **2.7.0**, `@hot-wallet/sdk` **1.0.11** ve `elliptic` **6.6.1** en yeni yayımlanmış sürümlerdi. Elliptic advisory'sinde düzeltilmiş sürüm bulunmuyor.

- `stream-json` düzeltmesi **3.5.0** ile geliyor; en yeni sürüm **3.7.0**. Kurulu **1.9.1**, 1.x serisinin son sürümü. Bu değişim major yükseltmedir; `jayson` eski CommonJS alt yollarını kullanıyor ve kör override güvenli kabul edilemez.
- `uuid` advisory'sinde düzeltilmiş seri sürümleri **11.1.1**, **12.0.1**, **13.0.1**. Kurulu **8.3.2**, 8.x serisinin son sürümü. Yeni major sürümün override edilmesi ayrı uyumluluk doğrulaması gerektirir. Mevcut `jayson` kodu `v4()` kullanıyor; advisory'nin konusu `v3/v5/v6` çıktı buffer sınırlarıdır.
- `jayson` en yeni sürüm **5.0.0**; bağımlılık listesinde `stream-json` ve `uuid` kaldırılmış. Kurulu **4.3.0**, 4.x serisinin son sürümü. `@solana/web3.js` zincirinde 5.x'e zorlamak ayrı major uyumluluk çalışmasıdır.
- npm audit'in otomatik önerisi kit'i **1.5.0** sürümüne düşürmek. Bu uygulamanın 2.x `/sdk` ve modül API'lerini kullandığı göz önüne alındığında güvenli bir otomatik düzeltme değildir.

**Bu kalan zincir için doğrulanmış, aynı major sürümde güvenli bir patch yükseltmesi bulunmadı.** Paket dosyaları bu ek incelemede değiştirilmedi. Uygun sonraki adım, kit'in kullanılmayan HOT bağımlılığını isteğe bağlı/ayrı paket haline getiren upstream sürümünü izlemek veya doğrudan kullanılan cüzdan adaptörleriyle bağımlılık kapsamını azaltan ayrı bir değişiklik hazırlamaktır.

## Canlı doğrulama sınırları ve artık riskler

1. **Gerçek cüzdan ve anchor round trip yapılmadı.** Eklenti izinleri, donanım cüzdanı, mobil WalletConnect, CORS ve canlı token biçimi için uçtan uca kanıt yok. Varsayılan anchor'ın HTTPS `stellar.toml` dosyası yalnızca okunarak doğrulandı.
2. **LOBSTR bağlantısı ağ doğrulanamadığında durur.** Kurulu LOBSTR adaptörünün `getNetwork()` metodu desteklenmiyor. Bu, sessizce devam etmenin yerine bilinçli fail-closed davranıştır.
3. **Doğrudan hesap anahtarı imzaları desteklenir.** Master key dışında bir delege anahtar, çoklu imza veya başka yetkili imzacı kümesi için ayrıca zincirden doğrulanan imzacı/threshold akışı gerekir; mevcut kontrol böyle bir desteği iddia etmez.
4. **HTTPS anchor alan adı ve wallet sağlayıcısı güven sınırıdır.** İsteğe bağlı signing-key pin kullanılmazsa TOML keşfi HTTPS alan adına güvenir. JWT claim kontrolü oturum süresi ve hesap eşleştirmesi içindir; anchor'ın HMAC JWT imzasının tarayıcıda kriptografik doğrulandığı iddia edilmez.
5. **Test sırrının bellekte bulunması XSS'e karşı koruma değildir.** Kalıcı depolama kaldırıldı ve eski nesneler iptal edildi; JavaScript belleğinde sıfırlama/garantili fiziksel silme iddiası yoktur. Gerçek varlık tutan sırlar bu demo alanına girilmemelidir.
6. **Dokuz audit kaydı kurulu bağımlılık ağacında kalır.** Statik incelemede kullanılan cüzdan akışından HOT koluna ulaşılmadı; bu paketlerin kurulu olması ve ileride yeniden import edilme riski devam eder. Audit sonucu sıfır değildir.
