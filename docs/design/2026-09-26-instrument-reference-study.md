# FA/DE · P/OD: geçmiş tasarım ve ürün sunumu incelemesi

26 Eylül 2026. Buradaki “bugünkü/mevcut” kaynak değerlendirmesi bu sayfa yenilemesinden önceki durumu anlatır; uygulanan değişiklikler ayrı doğrulama notunda izlenir. Bu çalışma tasarım araştırmasıdır; uygulama değişikliği, yeni dağıtım veya kullanıcı onayı değildir. Kaynak kodu ve mevcut görüntüler incelendi. Resmî sitelerin erişilebilir sayfa içeriği web üzerinden okundu; bu turda canlı tarayıcı animasyonları ölçülmedi. Aşağıdaki öneriler tasarım yargısıdır, rakiplerin dönüşüm başarısı hakkında iddia değildir.

## Eski kimlikten gerçekten geri alınabilecekler

İncelenen tarihsel sürüm: `08e0311550948114e1fc0f117ac217fc7a1433b6`, 20 Eylül 2026. Bu sürüm altı ürün rotasını getiriyor. Dört çekirdek başlık gerçekten **FA/DE, P/OD, TRIG/GER, EN/VOY** biçiminde. Kimliği oluşturan sadece yeşil değildir:

| Eski kaynak | Gözlenen yapı | Siyah/turuncu uyarlamada karar |
|---|---|---|
| `landing/src/components/LedgerHero.tsx`, `styles/chrome.css` | Üç hücreli ince bilgi şeridi; büyük iki satır başlık; ilk satır dolu, ikinci satır kontur; sağda iki satır vaat; çizilerek beliren yatay çizgi. | En güçlü geri alınacak unsur. Bricolage, dolu/kontur karşıtlığı ve asimetrik yerleşim korunmalı. |
| `pages/Instrument.tsx`, `styles/pages.css` | Hero → üç numaralı adım → büyük ürün görseli ve kural listesi → yaşam döngüsü/kanıt → büyük uygulama bağlantısı ve önceki/sonraki ürün. | Sayfanın farklı ölçeklerde ilerlemesi korunmalı; aynı bilgi dört defa anlatılmamalı. Üç anlamlı bölüm yeterli. |
| `pages/instruments-data.ts` | Her ürüne ayrı bölünmüş isim, vaat, kurallar ve yaşam döngüsü. | İçerik şeması yararlı; tarihsel sözleşme ve güvenlik iddiaları yeniden kullanılmamalı. |
| `components/DiveBand.tsx`, `config.ts` | Beş renk derinliği ve geçiş bandı; açık yüzeyden koyuya iniş. | Yeşil bantlar yerine siyah/grafit yüzey, metal ve turuncu mekanizma vurgusu. Dört dekoratif geçiş bölümü gerekmiyor. |
| `NavPill.tsx`, `lib/reveal.ts`, `App.tsx` | Açılan alt menü, gecikmeli perde geçişi, hover görselleri, bir defalık görünürlük animasyonu. | Açık ürün yönlendirmesi korunmalı; gecikmeli perde, gizlenen temel navigasyon ve dekoratif derinlik göstergesi geri gelmemeli. |

Eski hero ölçüleri somut bir başlangıç sağlar: `clamp(64px, 11.5vw, 168px)`, dolu ağırlık 800, kontur ağırlık 340, 1.5px kontur ve ikinci satırda değişken girinti. Mobilde 17vw başlık ve yeniden dizilen bilgi şeridi var. Bunlar referans ölçülerdir; yeni sahnenin üzerine körlemesine taşınacak sabitler değildir.

**Önemli ayrım:** Eski detay sayfasında sürekli çalışan anlamlı ürün simülasyonu yok. Ürün resmi statik; hareketin çoğu yazı girişi, kaydırma görünürlüğü, imleç ve menüden geliyor. İstenen yeni deneyim, eski kimlik ile yeni gerçek mekanizma sahnesinin birleşimi olmalı.

## Ne değişti; neden tekdüze hissediyor?

Bugünkü `DetailWorld.tsx` bütün rotaları aynı tam ekran karadelik, solda isim/cümle, üç adım ve alttaki ürün bağlantılarına yerleştiriyor. `detail-world.css` aynı sahne ve metin oranını tekrar ediyor. Bu, metni kısaltmış fakat ürünlerin kendilerine ait sayfa ritmini ve bölünmüş başlık kimliğini kaldırmış. Karadelik bütün ürünlerde baskın kaldığı için kapsül, fiyat ve yetki mekanizması ikinci konu oluyor. Bu bir tasarım teşhisidir.

Görsel kanıtlar birbirine karıştırılmamalı:

- [Tarihsel yeşil ana sayfa](../../artifacts/verification/live-motion-reference/01-home.png): büyük dolu/kontur marka, akışkan zemin ve alt ürün örnekleri görülüyor. Bu, `08e0311` detay sayfasının ekran görüntüsü değildir.
- [Ara sürüm Fade](../../artifacts/verification/instrument-details-baseline/desktop-fade.png): siyah/turuncu editoryal metin ve statik fiyat grafiği. Orijinal yeşil sürüm değildir.
- [Önceki karadelikli Pod detayı](../../artifacts/verification/detail-world-final-verified/pod-1440-full.png): aynı arka planda büyük kapsül ve solda ortak adım şablonu. Daha sonraki Pod denemesi ve bugünkü kaynak değişikliklerinden önceki kayıttır.

## Resmî ürünlerden alınabilecek somut ilkeler

Her kaynak 26 Eylül 2026'da kontrol edildi. Görünüşten kullanılan teknoloji veya animasyon tekniği çıkarılmadı.

**Aave Pro — ürün anlatımı gerçek işe bağlanıyor.** Sayfa önce ürün ve başlangıç bağlantısını, ardından kullanım amacına göre pazarları veriyor. Nasıl çalışır bölümünde yatırma, borçlanma ve pozisyon takibi; karşılık gelen arayüz öğeleriyle birlikte sunuluyor. Mimari ve sık sorulan sorular daha sonra geliyor. Henüz sunulmayan bazı işlemler “Coming soon” olarak ayrılmış. Agyion'a uyarlama: her sahnede kullanıcının yaptığı bir eylem ve bunun sonucu görünmeli; mimari açıklama ana gösterimi kesmemeli. Aave'nin oranları veya protokol vaatleri kopyalanmamalı. [Resmî ürün sayfası](https://aave.com/pro)

**Uniswap — araştırma ile eylem aynı bağlamda.** 27 Şubat 2024 tarihli resmî ürün yazısı, token/havuz detaylarındaki fiyat, işlem ve likidite bilgisini aynı sayfadaki işlem araçlarıyla birleştiriyor. Bu tarihsel ürün beyanıdır; bugünkü uygulamanın tamamı bu araştırma aracında JavaScript nedeniyle görüntülenemedi. Agyion'a uyarlama: kullanıcı bir mekanizmayı incelerken ilgili uygulama bağlantısını aramamalı; bağlantı seçili ürünü taşımalı. Yerel örnek ile gerçek işlem ayrı kalmalı; sahne kendi başına işlem yapmış gibi davranmamalı. [Resmî Explore duyurusu](https://blog.uniswap.org/data-and-insights)

**Jupiter — navigasyon amaç, araç ise işlem etrafında kuruluyor.** Erişilen içerikte Trade/Earn/Manage grupları, arama ve bağlantı eylemi mevcut. Swap alanı Market/Limit/DCA seçimi, Sell/Buy ve Connect ile başlıyor; grafik/geçmiş isteğe bağlı. Agyion'a uyarlama: sabit Fade/Pod/Trigger/Envoy bağlantıları ve görünür birincil eylem, hareketli nesnelerin yanında da bulunmalı. İkincil teknik bilgiler açılabilir. Jupiter'in kalabalık ürün evrenini veya finansal pazarlama iddialarını taşımak gerekmiyor. Kaynak JavaScript uyarısı da içeriyor; burada gerçek render veya hover doğrulaması yapılmadı. [Resmî swap sayfası](https://jup.ag/swap)

**Rainbow — menü başlıkları sayfa bölümleriyle aynı dili kullanıyor.** Crypto, Predictions, Perps, Live Data ve Rewards hem navigasyonda hem içerik başlıklarında bulunuyor. Bölümler kısa bir yetenek anlatıyor; Download ve cihaz seçimi açık, indirme eylemi sonda tekrarlanıyor. Agyion'a uyarlama: kullanıcının tıkladığı bölüm adı, ulaştığı sahnenin anlamıyla eşleşmeli. Başta ve sonda aynı ürün uygulamasına geçiş sunulmalı. Rainbow'un renkleri, işlem vaatleri ve çok ürünlü kapsamı bu tasarıma taşınmamalı. [Resmî ana sayfa](https://rainbow.me/)

## Önerilen yön: her detay sayfası tek bir çalışan mekanizma

**Kompozisyon:** İlk ekranda FA/DE veya P/OD, tek kısa vaat, büyük ürün mekanizması ve görünür uygulama bağlantısı. Ardından normal kaydırmayla iki bölüm: mekanizmayı değiştir; koşul ve sonucu anla. Aynı nesne bölümler arasında devam etsin; yeniden başlayan bağımsız videolar veya kart dizisi kullanılmasın. Karadelik detayların zemini olmaktan çıksın; Agyion'un ana sayfa/Endurance geçiş kimliği olarak korunsun.

**Yüzey:** karbon `#050608`, grafit `#111419`, kâğıt `#f4eee4`, etkin mekanizma için turuncu `#ff7b32`, destekleyici metal `#9ba9b8`. Turuncu hareket eden parçayı, seçili koşulu ve eylemi anlatsın; her öğe parlamasın. Bricolage bölünmüş başlık, Instrument Sans kısa açıklama ve mevcut mono teknik etiketler yeterli.

| Ürün | Sürekli görsel karakter | Kullanıcının anlamlı müdahalesi |
|---|---|---|
| **Fade** | Ray üzerinde ilerleyen fiyat işareti, sıfır eşiği ve iki yönlü ödeme yolu. | Örnek ledger/koşul değişikliği fiyatı etkiler; Claim fiyatı sabitler. İmzalı teslim/settlement ayrı durumdur, kendiliğinden tamamlanmaz. |
| **Pod** | Birbirine bağlı kapak, kilit bileziği ve iç çekirdek; kapalıyken de okunabilir mekanik ayrıntı. | Zaman ve doğru yetki birlikte sağlanmadan kapak açılmaz. Açma açık kullanıcı eylemidir. Eski açık preimage anlatısı yerine seçilen güncel Pod yoluna sadık kalır. |
| **Trigger** | Gelen kanıtın kontrol noktasından geçtiği iki dallı optik yol. | Geçerli kanıt + uygun zaman, ödeme dalını açar; geçersiz kanıt bloklanır. Süre sonu, ayrıca istenebilen refund dalıdır; aynı doğrusal sıranın son kutusu değildir. |
| **Envoy** | Sınırları görünen bir yetki bölgesinde hareket eden araç; hedef, kalan hak ve son kullanım koşulu okunur. | İzin verilen/alınmayan örnek eylem, süre sonu ve iptal ayrı etkiler üretir. Mevcut legacy Fade yetkisi ile ayrı private grant modeli tek sınırsız ajan yetkisi gibi anlatılmaz. |

Otomatik hareket durum değiştirmemeli: parçaların yavaş dolaşımı veya ışık akışı sürebilir, fakat “ödendi/açıldı/onaylandı” ancak anlamlı yerel etkileşimle görünmeli. Örnek olduğu kısa ve sabit biçimde belirtilmeli. Pause düğmesi ve dekoratif zaman çubuğu eklenmemeli; gerçek fiyat/deadline göstergeleri işlevliyse korunmalı. Azaltılmış hareket tercihinde ortam hareketi durur, aynı kontroller sonucu anında gösterebilir.

**Korunacak mevcut işlevler:** `/app/?tab=...` ürün hedefi, normal tıklamada ortak Endurance uçuşu, yeni sekme davranışı, klavye erişimi, mobil sabit dokunma hedefleri ve açık gerçek/simülasyon ayrımı. Ürün sahnesi tek navigasyon yöntemi olmamalı.

## İçerik düzeltmesi tasarımla birlikte yapılmalı

Tarihsel Pod açık preimage/2035, Envoy genel harcama, anlık refund ve imzalı ProofPack ifadeleri bugünkü davranışın kanıtı değildir. Mevcut `Instrument.tsx` de hâlâ Pod için commit/public-reveal metni içeriyor; `DetailWorld.tsx` v2 uyumluluğu diyor. Oysa bugünkü `contracts/hak/src/pod.rs` claim public key ve imzayı doğruluyor. Yenilemede hangi aktif/gated sözleşme ve hangi ayrı privacy yolu anlatıldığı açık olmalı; tamamlanmamış dağıtım “live private” olarak sunulmamalı.

Tasarımın kabul ölçüsü test sayısı değildir: başlık kapatıldığında dört mekanizma ayırt edilmeli; her kontrol görünür ve anlamlı sonuç üretmeli; 320px'de metin/model/eylem çakışmamalı; klavye ve dokunma aynı yolu tamamlamalı; uygulamaya geçiş seçili ürünü ve uçuş sürekliliğini korumalı. Bunlar sonraki gerçek tarayıcı incelemesinde ayrıca doğrulanmalıdır.
