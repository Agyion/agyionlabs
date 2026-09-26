# Ürün sayfaları — tarayıcı doğrulama kaydı

26 Eylül 2026. Yerel, birleştirilmiş üretim çıktısı `http://127.0.0.1:4192` üzerinde bağımsız Chromium/SwiftShader ile kontrol edildi. Kullanıcının açık tarayıcı sekmeleri değiştirilmedi. Bu kayıt yayın, gerçek cihaz performansı veya kullanıcı tarafından tasarım onayı anlamına gelmez.

## Kapsam ve sonuç

| Kayıt | Kapsam | Sonuç |
| --- | --- | --- |
| [İlk tam tarama](../../artifacts/verification/product-pages/final/results.json) | Fade, Pod, Trigger, Envoy, Ramp, Ledger × 1440/768/390/320 px × normal/azaltılmış hareket: 48 kombinasyon | 189/191 kontrol grubu geçti. İki zamanlama başarısızlığı ve bir ön yükleme isteği iptali saklandı. |
| [Fade son sürüm tekrarı](../../artifacts/verification/product-pages/fade-final-recheck/results.json) | Dört genişlik, iki hareket tercihi; fiyat işaretçisi düzeltmesi ve renderer yaşam döngüsü | **34/34 geçti.** |
| [Ledger son sürüm tekrarı](../../artifacts/verification/product-pages/ledger-final-recheck/results.json) | 768 ve 320 px, azaltılmış hareket; klavye ile dizinden dönüş ve ön yükleme tamamlanması | **8/8 geçti.** |
| [Ana sayfa / yönlendirme matrisi](../../artifacts/verification/product-pages/landing-matrix-final/results.json) | 1440/768/360/320 px ana sayfa; altı ürün; odak, diyalog, geçmiş, uçuş, azaltılmış hareket, WebGL yokluğu | **54/54 geçti.** |

Son tekrarlar `index-CRYfHePk.js` ve `index-M_8SdEh6.css` dosyalarını kullandı. Fade/Ledger raporlarında test başı ve sonu kaynak SHA-256 değerleri aynı. Bu iki raporda JavaScript, konsol, istek, HTTP ve CSP hata dizileri boş. Ana sayfa matrisinde de beklenmeyen hata yok; kasıtlı WebGL-yokluğu senaryosunun tek context-creation hatası işaretli olarak saklandı.

## Korunan başarısızlıkların açıklaması

- **Fade 1440, hareket tercihi:** İlk test, azaltılmış hareketten normale dönüşte React'in yeni olay işleyicisi kurulmadan odak gönderiyordu. Aynı sıfır-canvas durumu her iki tercihte de geçerli olduğundan erken kontrol yarışı gizliyordu. İki gerçek animasyon karesi ve doğrulanan yeni odak geçişi eklendi. Son tekrar eski canvas'ın ayrılmasını, yeni niyet öncesi sıfır canvas'ı ve niyetten sonra tek, çizimi duran renderer'ı doğruladı.
- **Ledger 768, dizinden klavye dönüşü:** Route sonrası uygulamanın `requestAnimationFrame` ile ana alana odak vermesi testin erken odak çağrısını geçersiz kılabiliyordu. Dizin geçişi tamamlandıktan sonra iki kare ve gerçek `activeElement` doğrulaması eklendi; Enter ile Ledger'a dönüş geçti.
- **Ledger 320, `/app/` ön yüklemesi:** İlk çalışmada son gezinme/kapatma evresinde `net::ERR_ABORTED` kaydedildi. Test artık kendi sonraki gezinmesinden ve context kapatmasından önce gerçek ağ isteklerinin bitmesini bekliyor; hiçbir istek hatası filtrelenmiyor. Aynı genişlikte son tekrar hatasız tamamlandı. Bu sonuç tüm olası hızlı kullanıcı gezinmelerinde iptal olmayacağı iddiası değildir.

İlk rapor değiştirilmedi. O çalışmanın kaynak özetleri çalışmanın sonunda alınmıştı; test dosyasında devam eden düzeltmeler bulunduğundan bunlar başlangıçtaki testin birebir kaydı sayılmamalı. Yeni raporlar başlangıç/bitiş özetlerini ayrı tutar. İlk tam taramanın statik site çıktısı çalışırken değişmedi; sonraki son sürüm yalnızca etkilenen yollar için tekrarlandı, yeni bir 48-kombinasyon taraması yapılmış gibi sunulmadı.

## Gerçekten kontrol edilen davranışlar

- Ürün sayfası ilk açılışında **sıfır WebGL canvas ve sıfır draw**; normal harekette uygulama bağlantısına niyet sonrası tek, görünmeyen ve duran ön hazırlanmış renderer. Azaltılmış harekette hazırlama yapılmaması.
- Tek SVG öğesi korunurken altı ardışık karede iç geometri değişimi; sabit viewBox ve çerçeve. Azaltılmış harekette aynı sonuçlara doğrudan geçiş. Sıfırlama, yarım animasyonu iptal etme ve mekanizmanın yeniden kurulmadan çalışması.
- Fade pozitif/negatif/sıfır fiyat yönleri, Pod iki eksik koşul ve fiziksel kapak açılması, Trigger geçerli/geçersiz/süresi dolmuş kanıt, Envoy grant/owner payout/revoke/limit/expiry/positive-price engelleri, Ramp iki yönlü mock açıklaması, Ledger değiştirilmiş içerik reddi. Bunlar resimli örneklerdir; fon taşımazlar.
- Fade animasyonu bittikten sonra slider 0'a alındığında işaretçinin SVG konumu `(120,130)`; Reset sonrası 75 için `(549,280)`. Konumlar gerçek dönüştürülmüş SVG koordinatlarından ölçüldü.
- Native bağlantılar, uygulama sekmesi hedefi, altı ürünün Instruments aktif işareti, klavye odağı, ayrıntı açılır alanları, sonraki ürün ve browser Back. Yatay taşma, ölçülen ana bölge çakışması ve yeşil renk taraması.
- Ana sayfada fiziksel sahneye klavye girdisi, diyalog odak sarımı/geri dönüşü, azaltılmış hareket, uçuş ortasında tercih değişimi ve renderer başarısızlığı. Tam Pod uçuşu **10.490 ms** sürdü; eşlenmiş settled handoff ve hedef sekme kontrol edildi. Varış sayfası izole aynı-origin fixture olduğundan bu test gerçek uygulamanın yüklenme süresini ölçmez.

## Görsel inceleme ve sınırlar

1440 px Fade ve 390 px Fade mekanizma kareleri; 390 px Pod sonuç ekranı; 320 px Fade başlık/sonuç ve son Ledger mekanizma karesi dosyadan ayrıca incelendi. Native anchor görüntüleri artık kaydırma tamamlandıktan sonra çekiliyor. Bu örneklerde ölçülen taşma veya kontrol çakışması görülmedi; SVG'nin ortalanmış boşlukları kasıtlı sabit sahne çerçevesidir. Tüm kaydedilmiş görüntülerin insan gözüyle tek tek incelendiği iddia edilmez.

Gerçek telefon/GPU performansı, cüzdan imzası, zincir işlemi ve yayın ortamı bu kaydın kapsamı dışındadır. Gerçek uygulamaya uçuş ve cüzdan akışını ana görev ayrıca doğrular. Tarihî `scripts/detail-pages-check.mjs` önceki kara delik detay tasarımının kaydı olarak korunur; yeni ürün sayfalarının kabul ölçütü değildir.

Araçlar: [yeni ürün matrisi](../../scripts/verify-product-pages.mjs), [güncellenen ana sayfa matrisi](../../landing/tests/e2e/matrix.mjs). Ürün/runtime kaynakları bu QA görevi tarafından değiştirilmedi.

## Ek: gerçek uygulama varışı ve son dizin düzeni

Aşağıdaki ana görev kayıtları ayrıca ham raporlardan okundu. Tamamı yine **yerel 4192 çıktısına** aittir; canlı yayının doğrulandığı anlamına gelmez.

| Kayıt | Sonuç ve sınır |
| --- | --- |
| [Gerçek uygulamaya dört uçuş](../../artifacts/verification/product-pages/journeys-real/verification.json) | Ana sayfa → Pod, Fade detayı → Fade, Pod detayı → Pod ve ürün dizini → genel uygulama **4/4 geçti**. Animasyon hızı değiştirilmedi (`speed: 1`); uygulama betiklerine kasıtlı **1.500 ms gecikme** uygulandı. Varışlar gerçek yerel uygulamaya gerçekleşti, köprü görüntüsü gözlendi ve uçuş sırasında yeni shader linki kaydedilmedi. Görünür uçuşlar 10.273–10.360 ms; tüm hata dizileri boş. Bunlar yavaş yüklenme senaryosu kayıtlarıdır, gecikmesiz başlangıç veya gerçek cihaz akıcılığı ölçümü değildir. |
| [Ek hedef yönlendirmeleri](../../artifacts/verification/product-pages/journeys-routing/verification.json) | Trigger, Envoy, Ramp, Ledger ve genel uygulama hedefinin **beş işlevsel akışı geçti**, ancak toplam rapor **başarısız** kaldı: Trigger varışında `https://soroban-testnet.stellar.org/` isteği `net::ERR_NETWORK_CHANGED` verdi; istek ve konsol kayıtları korundu. Bu akışlarda animasyon 12 kat hızlandırıldı ve vaka başına uygulama betiği gecikmesi sıfırdı; gerçek uçuş süresi kanıtı olarak kullanılmaz. |
| [Trigger hedefli tekrar](../../artifacts/verification/product-pages/journey-trigger-recheck/verification.json) | Aynı hızlandırılmış Trigger yönlendirmesi **1/1 geçti**; konsol, sayfa, istek ve CSP hata dizileri boş. Temiz tekrar ilk başarısız raporu silmez veya RPC'nin her zaman erişilebilir olduğunu kanıtlamaz. |
| [Kompakt ürün dizini](../../artifacts/verification/product-pages/directory-final/results.json) | 1440/768/390/320 px genişliklerin dördünde altı ürün bağlantısı, yatay taşma olmaması ve sıfır WebGL canvas kaydedildi; hata dizisi boş. WebGL devre dışı bırakılarak yapılan sınırlı yerleşim kontrolüdür. Ana görev [1440 px](../../artifacts/verification/product-pages/directory-final/1440.png) ve [320 px](../../artifacts/verification/product-pages/directory-final/320.png) görüntülerini ayrıca inceledi. |

Yukarıdaki ana 54-kontrol matrisi `index-CRYfHePk.js` / `index-M_8SdEh6.css` sürümünü kapsar. Sonraki **yalnızca dizin düzeni** değişikliğiyle oluşturulan yerel çıktı `index-Ck77pRzQ.js` / `index-CPHf37dG.css` kullanır; bu son çıktıda yapılan ek yerel kontrol dört genişlikteki dizin kontrolüdür. Yeni bir tam 48-kombinasyon taraması veya 54-kontrol matrisi tekrarı yapıldığı iddia edilmez. Cüzdan imzası ve zincir işlemi bu ekin kapsamında değildir.

## Canlı yayın kontrolü — yerel kayıtlardan ayrı

26 Eylül 2026, 19:36:29–19:37:21 UTC arasında `https://agyionlabs.dev` üzerinde altı ürün sayfası 1440 ve 390 px, **yalnızca azaltılmış hareket** ile kontrol edildi: **12 sayfa/genişlik kombinasyonu, 48 işlevsel kontrol grubu**. [Ham canlı rapor](../../artifacts/verification/product-pages/live-products/results.json) 48/48 işlevsel kontrolü geçmiş olarak kaydeder; buna rağmen **toplam sonuç başarısızdır**.

Kayıtlar: **24 konsol hatası, 12 başarısız istek, 24 CSP olayı**. CSP olaylarının 12'si satır içi betik, 12'si `static.cloudflareinsights.com/beacon.min.js` engellemesidir; başarısız isteklerin tamamı bu Cloudflare ölçüm betiğinin CSP tarafından engellenmesidir. Bunlar aynı olayların farklı tanı kanallarındaki kayıtlarıdır; toplam 60 ayrı arıza gibi sayılmaz. **Sayfa JavaScript exception sayısı 0, HTTP hata yanıtı sayısı 0.** Hiçbir tanı filtrelenmedi veya başarılı kabul edilmedi.

Canlı sayfalarda `/assets/index-Ck77pRzQ.js` ve `/assets/index-CPHf37dG.css` görüldü. Bu kontrol, ana görev tarafından yayınlanan `ff3d5bf7-a79a-49f3-bed9-cbfe9ce8ee47` sürümü sonrasında yapıldı; testin kendi kanıtı yüklenen dosya adlarıdır. Ürün hedefleri, koşul/ret/sıfırlama davranışları, klavye ile gezinme ve taşma kontrolü kapsandı. Normal hareket, canlı uçuş performansı, cüzdan imzası veya zincir işlemi bu sınırlı canlı çalışmada test edilmedi; önceki tam yerel taramanın canlı tekrarı olarak sunulmaz. Tarayıcı çalışma sonunda kapatıldı.
