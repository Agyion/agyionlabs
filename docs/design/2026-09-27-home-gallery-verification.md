# Ana sayfa galerisi — yerel tarayıcı doğrulaması

27 Eylül 2026, Europe/Istanbul. Aşağıdaki kayıtlar `http://127.0.0.1:4192` üzerindeki derlenmiş adaylara aittir; canlı yayın veya gerçek telefon/GPU performansı kanıtı değildir. Chromium/SwiftShader kullanıldı. Cüzdan imzası ya da zincir işlemi yapılmadı.

## Kapsam ve sonuç

| Kayıt | Aday | Sonuç |
| --- | --- | --- |
| [Tam galeri matrisi](../../artifacts/verification/home-gallery/final-matrix-3/results.json) | `index-DHm-k-9u.js`, `index-Bn-8Whz_.css` | 1440/768/390/320 × normal/azaltılmış hareket; 96 çalıştırılan grubun 94'ü geçti. İki başarısız grup aynı gerçek geçmiş/kaydırma hatasıydı. |
| [Düzeltme sonrası gezinme matrisi](../../artifacts/verification/home-gallery/routes-final/results.json) | `index-BXY-e2VM.js`, aynı CSS | 57/57 geçti. Dört genişlik × iki hareket tercihi; 51 kapsam dışı grup ayrıca listelenir ve başarılı sayılmaz. |
| [Güncellenmiş genel landing matrisi](../../artifacts/verification/home-gallery/landing-matrix-final/results.json) | `index-BXY-e2VM.js`, aynı CSS | 54/54 geçti. Ana sayfa, altı ürün rotası, dizin, klavye/odak, azaltılmış hareket, uçuş ve WebGL-yok senaryosu. |

İlk iki kayıtta da sayfa istisnası, konsol hatası, başarısız istek, HTTP hatası ve CSP olayı sayısı sıfırdır. Başlangıç/bitiş kaynak karmaları raporlarda korunur. Son gezinme raporu `App.tsx`, bağlantı, geçiş, kaydırma ve ilgili CSS dosyalarının karmalarını da içerir. Genel landing matrisinde bilerek WebGL kapatılan fixture'ın beklenen context-creation tanısı korunur; normal sayfalarda çalışma/ağ hatası yoktur. Genel matris CSP olaylarını ayrı bir kanalda kaydetmez; bu kapsam ilk iki raporda ayrıca vardır.

Tam matriste dört ürünün seçilmesi ve tekrar oynatılması, sabit SVG çerçevesinde gerçekten değişen ara kareler, azaltılmış harekette sabit son durum, klavye seçimi, hızlı ürün değişimi ve görünüm dışındaki sahnenin durması doğrulandı. Envoy sayacı ilk örnekten sonra ve Replay sonrasında `01 / 50` kaldı. How it works kapanınca seçim, odak ve kaydırma korundu. Doğal Ctrl/Meta/Shift/Alt/orta tuş, yeni sekme ve download davranışları sınandı.

1440 normal harekette uçuş sırasında Back, aynı canvas'ı koruyarak ayrılışı iptal etti; eski uçuşun süresinden sonra (11.252 saniye) ana sayfa kaldı ve iki geçiş kaydı da boştu. Ardından yeni açık istek tamamlandı. Galeriden normal ayrılış 1440 ve 390'da aynı canvas'ı ilk kareden tam viewport boyutuna taşıdı; yönlendirme sırasıyla 10.407 ve 10.452 saniyede gerçekleşti. Bu iki hedef **izole aynı-origin uygulama fixture'ıdır**, gerçek uygulamanın açıldığını kanıtlamaz.

Genel matris ayrıca normal Pod uçuşunu 10.485 saniyede aynı tür fixture hedefine tamamladı; uçuş sırasında işletim sistemi hareket tercihinin değişmesiyle istenen hedefin korunmasını ve WebGL yokken içerik/bağlantıların kullanılabilir kalmasını doğruladı.

## Bulunan hatalar ve tekrar kontrol sınırı

- İlk [kesilen tur](../../artifacts/verification/home-gallery/final-matrix/RUN_INTERRUPTED.md): test probu belge kökü oluşmadan MutationObserver bağlamıştı. Bu harness hatası düzeltildi; ham çıktı silinmedi. Aynı turdaki doğal bağlantı sorunu ayrı tutuldu.
- [İkinci tur](../../artifacts/verification/home-gallery/final-matrix-2/RUN_INTERRUPTED.md): React Router'ın ikinci click işleyicisi, bağlantının doğal yeni sekme/download davranışını yakalayabiliyordu. Ürün bağlantısı gerçek `a` elementiyle düzeltildi. Kesinti kaynaklı son hatalar ayrıca işaretlidir.
- Tam üçüncü tur: 1440 ve 390 azaltılmış harekette Details → hemen Back, `/#instruments` adresini geri getirirken Y=0'a dönüyordu. Eski rota dinleyicisi detay sayfasının sıfır konumunu yanlış geçmiş girdisine yazıyordu. Temizliğin layout effect aşamasına taşınmasından sonra 57 grupluk gezinme tekrarı geçti; normal hareket dahil sekiz durumda **detay görünür olur olmaz, geçiş/renderer/ağ beklemeden Back** ayrıca sınandı ve önceki tam konum geri geldi.

Son tek satırlık rota düzeltmesinden sonra bütün animasyon matrisi tekrar çalıştırılmadı. Sonuç, korunmuş tam-matris kanıtı ile etkilenen gezinme alanının odaklı tekrarının birleşimidir; kesilen/eski turlar başarılı sayılmaz.

## Görsel kayıtlar

Tam sayfa çekimleri scroll=0'dan alınarak sabit başlığın yakalama konumu korunmuştur. 1440, 390 ve 320 görüntüleri ayrıca gözle incelendi; bunlarda başlık/galeri/CTA/footer çakışması veya yatay taşma görülmedi. Bu gözlem tasarımın kullanıcı tarafından onaylandığı anlamına gelmez.

- [1440 tam sayfa](../../artifacts/verification/home-gallery/final-matrix-3/1440-motion-gallery-full.png)
- [390 tam sayfa](../../artifacts/verification/home-gallery/final-matrix-3/390-motion-gallery-full.png)
- [320 tam sayfa](../../artifacts/verification/home-gallery/final-matrix-3/320-motion-gallery-full.png)
