# Agyion: tasarım araştırması ve revizyon brief'i

25 Eylül 2026 · **Araştırma ve teşhis; uygulanmış tasarım veya düzeltilmiş hata raporu değil.**

[Görsel karşılaştırmayı aç](index.html) · [Landing kaynakları](landing-research.md) · [App kaynakları](apps-research.md) · [Agyion bulguları](agyion-audit.md) · [Teslim ölçütleri](QUALITY_GATE.md)

## Ana karar

**Kara delik ve Endurance dünyası korunacak. Bu dünyanın etkileşimleri, koşullu paranın nasıl çalıştığını görünür kılacak.** Landing merak uyandıracak; detay bir mekanizmayı deneyerek anlamayı sağlayacak; app aynı mekanizmayla gerçek işlemi hazırlatacak. Üç ekranın aynı arka planı kullanması bu bağı kendiliğinden kurmuyor.

Önceki yaklaşım bağlantı, kelime sayısı, taşma ve animasyonun tetiklenmesine fazla ağırlık verdi. Bunlar gerekli kontroller; kullanıcının ne yapacağını anlamasını, işlemden sonra geri dönmesini veya başarısızlıktan kurtulmasını ölçmüyor. Yeni bir kullanıcı talimatına ihtiyaç yoktu. Ürün araştırması ve bu durumların incelenmesi işin parçası olmalıydı.

## Araştırma nasıl yapıldı?

Sekiz proje seçildi: **Stellar, Solana, Celestia, Monad, Uniswap, Aave, Morpho, CoW**. Seçim; marka dili, anlatım, işlem modeli ve uygulama hiyerarşisindeki farklılıkları karşılaştırmak için yapıldı. Bir kalite/finans sıralaması değil.

- Güncel resmi siteler, marka rehberleri, belgelenmiş işlem akışları ve çalışmayı yapan tasarımcıların birinci taraf proje anlatıları okundu.
- Resmi sitelerin masaüstü ve telefon ekranları tarayıcıda kaydedildi. Aave, Morpho ve CoW için marka sitesi ile işlem uygulaması ayrı incelendi. Görüntülerdeki tarihsel veri, oran ve bakiyeler yatırım değerlendirmesine dönüştürülmedi.
- Güncel Celestia/Monad sayfaları eski arama görsellerinden farklı. Celestia'nın 2025 yaratıcı çalışması ve ilk ajans çalışması **tarihsel** olarak etiketlendi.
- Uniswap'ın ilk masaüstü yüklemesi boş, telefon yanıtı ağ/istemci hatalı çıktı. Bu kareler tasarım örneği sayılmadı. Sonraki normal erişim denemelerinin sonucu app raporunda ayrı tutulur.
- Canlı uygulamalarda yalnızca bağlantı öncesi, salt okunur etkileşimler incelendi. Cüzdan, imza ve işlem sonrası durumların bir bölümü resmi belgelerden öğrenildi; gerçekleştirilmiş işlem gibi sunulmadı.
- Agyion için mevcut kaynak kodu, HANDOFF ve önceki ekran/video kanıtları incelendi. Yazılım ile çizilen tarayıcı görüntülerinden gerçek cihaz akıcılığı sonucu çıkarılmadı.

Ham tarayıcı kaydı: [capture-report.json](../../../artifacts/research/2026-09-25-crypto-design/capture-report.json). Ayrıntılı kaynak/kanıt ayrımı iki araştırma dosyasında bulunur.

Uygulama etkileşimlerinin [ayrı kaydı](../../../artifacts/research/2026-09-25-crypto-design/interactions/interactions.json) menü, arama, filtre, yükleme ve erişim sınırlarını içerir. Uniswap'ın ikinci normal denemesi de HTTP 409 verdi. Aave'de boş sonuç görünümü kaydedildi; sonraki Borrow isteği 503 aldığı için o gezinme başarılı sayılmadı. CoW varlık seçici çalıştı; fiyat teklifindeki insan doğrulaması aşılmadı. Morpho'nun boş aramasından alınan kare hâlâ yüklenme iskeletidir; son boş sonuç diye etiketlenmedi.

Agyion'da iki kaynak bulgusu ayrıca **gerçek React bileşeniyle** yeniden üretildi: reddedilen Claim/Refund ardından kilitli düğmeler ve form yeniden açılınca venue kimliğinin değiştirilmesi. [Üç başarısız doğrulamanın kanıtı](../../../artifacts/research/fade-characterization/README.md) korunuyor. Cüzdan/anahtar üretim sınırları test verisiyle temsil edildi; zincire işlem gönderilmedi. Bu başarısızlıklar düzeltilmiş test sonucu değildir.

## Örneklerden çıkan uygulanabilir dersler

| Örnek | Alınacak ilke | Agyion'daki karşılığı |
| --- | --- | --- |
| [Stellar](https://stellar.org/) ve [marka gerekçesi](https://stellar.org/blog/foundation-news/down-to-earth-brand-to-match-our-mission) | Görseller ve gezinme, gerçek kullanım amacını açıklıyor. | Fade/Pod adlarının yanında amaç anlaşılmalı; sahne seçilen koşulu göstermeli. Stellar'ın uzaydan uzaklaşma kararı Agyion'un brief'ini değiştirmez. |
| [Solana](https://solana.com/) | Hareketli görsel alanın karşısında okunur, yerini koruyan mesaj ve eylem. | Kamera hareket ederken Launch, ürün seçimi ve form kontrolleri aranmayacak. Yeşil/mor palet kopyalanmayacak. |
| [Celestia](https://celestia.org/) ve [marka sistemi](https://celestia.org/brand/) | Tek bir görsel aileyi farklı anlatımlara taşıma. | Landing, fiziksel enstrüman ve işlem geri bildirimi için ortak materyal/hareket kuralları. Her sayfaya yeni bir süs efekti eklemek süreklilik sağlamaz. |
| [Monad](https://monad.xyz/) | Uygulama kullanmak ve derin bilgi edinmek ayrı, isimli yollar. | Open Pod, Pod'u açmalı; Details aynı koşulu açıklamalı. Yardım, hazırlanmış taslağı kaybettirmemeli. |
| [Uniswap ekran kılavuzu](https://support.uniswap.org/hc/en-us/articles/39862756339341-Uniswap-Web-App-The-Swap-Screen) | Asıl girdiler önde; maliyet ve en kötü sonuç erişilebilir. **Belge kanıtı.** | Daha az metin adına tutar, alıcı, zaman ve risk gizlenmeyecek. Tek bir kısa işlem özetiyle görünür olacak. |
| [Aave Pro](https://pro.aave.com/) | Keşif, pozisyon yönetimi ve aktivite ayrı görevler; telefon düzeni yeniden kuruluyor. | Yeni işlem, mevcut kayıt ve işlem sonucu aynı uzun formda üst üste yığılmayacak. |
| [Morpho](https://app.morpho.org/vaults) | Cüzdan bağlamadan karşılaştırma; masaüstü satırının telefonda alan adları olan karta dönüşmesi. | Kayıtların bulunması ve koşullarının anlaşılması cüzdan düğmesinin arkasına saklanmayacak. Kayıt kartı gerçek yerel/zincir kaynağını belirtecek. |
| [CoW işlem kılavuzu](https://docs.cow.fi/cow-protocol/tutorials/cow-swap/swap) | İmza, bekleyen emir ve gerçekleşmiş sonuç ayrılıyor. **Belge kanıtı.** | Işık paketinin kara deliğe düşmesi yalnız doğrulanmış sonucu temsil edecek; imza isteği başarı gibi canlandırılmayacak. |

Bu örneklerin her davranışı iyi değil. Solana ve Monad ilk ziyaret çerez katmanları içeriği örtüyor; CoW uygulamasında ilk açılış duyurusu işlem formunun önüne geliyor. Bunlar da kaydedildi. Büyük ağların logo duvarı, hacim sayacı veya kurumsal menü kalabalığı Agyion'a taşınmayacak.

## Agyion neden hâlâ zayıf görünüyor?

Bu bölüm **tasarım değerlendirmesidir**, ölçülmüş kullanıcı araştırması değildir.

1. **Görsel anlam yetersiz.** Kara delik ve etrafındaki nesneler bir atmosfer kuruyor; dört finansal mekanizmayı tek başına açıklamıyor. Bir nesnenin dönmesi veya küçük ışığının yer değiştirmesi, kullanıcının kararının sonucunu anlatmıyor.
2. **Ölçek ve odak kararsız.** Landing'de büyük wordmark ve birkaç küçük mekanizma var; app'te gemi birden formun tamamıyla yarışıyor. Endurance'ın detayını görebileceğimiz serbest dünya ile para gireceğimiz çalışma yüzeyi ayrı kompozisyon gerektiriyor.
3. **Hologramın okunabilir alanı eksik.** [Mevcut Pod ekranında](../../../artifacts/verification/instrument-app-final/desktop-04-app-pod.png) geminin kenarları alanların ve açıklamaların arkasından geçiyor. Derinlik; kontrollü kenar ışığı, açılış ve katmanlarla verilebilir. Metnin arkasındaki yüzeyin daha tutarlı olması gerekiyor.
4. **Detay sayfaları ortak şablona fazla bağlı.** Üç adım sekmesi ve kısa cümle her araçta tekrar ediyor. Fade fiyat, Pod iki koşul, Trigger iki olası sonuç, Envoy yetki sınırı üzerinden anlaşılmalı. Ayrım yalnız başlık, renk ve modelde kalmamalı.
5. **Metin azaltmanın hedefi yanlıştı.** Kelime sayısının düşmesi, karar yükünün düşmesi demek değil. Kullanıcının şu an yapacağı iş ve bir sonraki sonucu açık olmalı; uzun açıklamalar gerektiği yerde açılmalı.
6. **Tamamlanmış işlemden sonraki hayat eksik.** Kayıt bulma, taslağa dönme, imzayı reddetme, RPC kesilmesi ve sonucu belirsiz gönderimi izleme görsel tasarımın kapsamına girmeli.

## Yeni ekran ve hareket yönü

### Landing: tek bir dünyada keşif

Uzak kara delik ve Endurance ana kompozisyon olacak. Başlangıçta tek kısa ürün vaadi ve Launch görünür kalacak. Dört enstrüman, amaç etiketleriyle ulaşılabilir olacak. Seçildiğinde diğerleri görsel olarak geri çekilecek; seçilen mekanizma kullanıcının değiştirebildiği küçük bir örnek sunacak. Örneğin Pod'da zaman koşulu sağlansa da sır olmadan kapsül açılmayacak. Açıklama metninin yerini anlaşılır bir neden–sonuç alacak.

How it works, o anda seçili aracı açıklayacak. Aynı kısa hikâye detay sayfasında derinleşecek; Help uygulama taslağını yok etmeyecek. Dört farklı tanıtım sloganı veya otomatik üç ikon döngüsü eklenmeyecek.

### Geçiş: seçilmiş niyeti taşıyan uçuş

Launch, uzak bakıştan Endurance'a ulaşan tek sürekli kamera hareketi olarak kalacak. Gemi, seçimi göstermek için yapay olarak çevrilmeyecek. Varışta hedef araç ve gerekli arayüz hazırlanmış olacak. Şimdiki 9.8 saniyelik uçuşun ardından 1.1–1.5 saniye aynı karenin tutulması açık performans/algı sorunu olarak kalıyor.

**Öneri:** ilk keşifte sinematik yol; aynı oturumda tekrar kullanımda aynı güzergâhın kısa, kesintisiz devamı. Böylece kullanıcının her işte yeniden uzun uçuş izlemesi gerekmez. Bu süre kararı henüz uygulanmadı; kullanıcının yavaş/smooth isteğini koruyan bir prototipte değerlendirilmeli. Yeni bir Pause/Skip kontrolü varsayılmıyor. Doğrudan bağlantı ve azaltılmış hareket erişimi korunacak.

### App: ortamın içinde okunabilir bir çalışma alanı

Form açılınca kendi yerel yüzeyi ve sabit ana eylemi olacak. Gemi çevrede görünür kalacak; formun ortasından geçen yüksek kontrastlı ayrıntılar kompozisyondan çıkarılacak. Panel açılışı camın kenarından taranıp içeriğin sırayla yerleştiği kısa bir hareket olabilir. Kullanıcı yazarken miktar veya düğme hareket etmeyecek.

| Araç | İşe yarayan görsel | Asıl karar ve korunacak koşul |
| --- | --- | --- |
| Fade | Fiyat yolu; claim noktasında duran fiyat; ayrı handoff durumu. | Kimin ödediği, fiyatın ne zaman sabitlendiği, handoff ve iade koşulları. Claim ödeme sonu değildir. |
| Pod | Ayrı zaman ve sır kilitleri; gerçek hazır olma durumu. | Sır yedeği, alıcının önceki doğrulanmış ledger'daki commitment'ı ve açılma yüksekliği. Sürenin dolması tek başına yeterli değildir. |
| Trigger | Ödeme ve iade için iki sonuç kolu. | Lehtar, doğrulayıcı, süre ve imza. Kanıt doğrulama ile ödeme aynı işlemdedir; imza dış dünyadaki olayı bağımsız doğrulamaz. |
| Envoy | Sınırı olan bir yetki alanı; kullanılan/kalan claim sayısı. | Yalnız izin verilen nonpositive Fade claim'leri; sahip, süre, en fazla 50 claim ve iptal durumu. Harcama limiti grafiği yanlış yetki izlenimi vermemeli. |
| Ramp | Giriş–çıkış yönü, alınmış teklif ve istek sonrası sabit ödeme özeti. | Teklifin hangi miktara ait olduğu; ücretin kaynağı; kayıtlı tutar ve memo. Sandbox açık kalır. |
| Ledger | Bulunabilir, filtrelenebilir işlem kayıtları ve ilgili araca dönüş. | Yerel kayıt, işlem hash'i, zincir sonucu ve imzasız dışa aktarımın farkı. |

Telefonda öncelik: görev → gereken girdiler → kısa sonuç özeti → ana eylem → mevcut kayıtlar. Model ve açıklama kullanıcının tutara erişmesini engellemeyecek. Açılmış klavye ve cüzdan uygulamasından dönüş ayrıca denenmeli; 390px ekran görüntüsü tek başına bunu doğrulamaz.

## Uygulama sırası ve durma ölçütü

1. **Durum ve kurtarma temeli.** Önce [kod denetimindeki](agyion-audit.md) kilitli buton, yeniden üretilen venue anahtarı, taslak kaybı ve belirsiz gönderim durumları. Tasarım bu durumlara dayanmalı.
2. **Tek bir tam dikey örnek.** Pod için landing seçimi → anlamlı mekanizma → uçuş → hazırlanmış form → mevcut kayda dönüş. Sır yedeği ve yanlış koşullar da dahil. Bu akış incelenmeden altı şablona yayılmayacak.
3. **Diğer mekanizmalar.** Fade, Trigger ve Envoy kendi karar yapılarına göre; ardından Ramp ve Ledger yardımcı görevleri.
4. **Görsel/performance bitişi.** Işık, malzeme, model ayrıntısı, kamera ve mobil kompozisyon aynı akışta değerlendirilecek. Yakın Endurance ayrıntısı görünür bölgeler için işlenecek; uzaktaki görünmez detay çizim yükü üretmeyecek.
5. **Tüm durumların kontrolü.** [QUALITY_GATE](QUALITY_GATE.md) kanıtlarıyla. Derleme veya test sayısı estetik kabul, gerçek cihaz akıcılığı ya da güvenlik garantisi sayılmayacak.

Bu araştırmada üretim kodu, canlı site, sözleşme veya hesap değiştirilmedi. Bulgular açık iş olarak kaydedildi. Gerçek kullanıcı anlama testi, gerçek cihaz performansı ve cüzdanla uçtan uca işlem doğrulaması yapılmış gibi sunulmuyor.

Görsel panonun 1440px/390px tarayıcı kontrolünde filtreler, ekran değiştirme, öneri seçimi, görseller ve yerel bağlantılar doğrulandı. İlk font yolu hatası giderildi; ilk başarısız kayıt da saklandı. [Son pano kontrolü](../../../artifacts/research/2026-09-25-crypto-design/board-qa/report.json). Bu kontrol, araştırma panosuna aittir; Agyion ürünündeki açık kusurları kapatmaz.
