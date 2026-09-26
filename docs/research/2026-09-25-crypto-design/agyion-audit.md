# Agyion: ürün akışı ve arayüz denetimi

25 Eylül 2026. Yerel kaynak, HANDOFF ve son kaydedilmiş ekranlar üzerinden bağımsız, salt okunur inceleme. Bu incelemede tarayıcı/GPU çalıştırılmadı; cüzdan bağlanmadı, işlem gönderilmedi, uygulama kodu değiştirilmedi.

**Ana sonuç:** Görsel dünya ve tıklama davranışları üzerinde ilerleme var; fakat ürünü tekrar kullanmak, yarım işi sürdürmek, bir işlemi sonradan bulmak ve belirsiz sonuçtan güvenle çıkmak aynı düzeyde çözülmüş değil. Aşağıdaki maddeler yeni bir estetik onayı değildir.

**Sınıflandırma:** “Doğrulanmış kusur” kaynakta açık bir yürütme yolu veya mevcut görüntüyle gösterilen davranıştır; yeni canlı işlemle üretildiği anlamına gelmez. “Tasarım zayıflığı” davranışın mevcut olduğunu, önerilen alternatifin henüz kullanıcıyla doğrulanmadığını belirtir. “Test edilmemiş hipotez” cihazda üretilmeden kusur sayılmaz. P1 ana işlem/kurtarma akışını, P2 kullanılabilirlik ve anlaşılabilirliği etkileyen önceliktir; güvenlik CVSS puanı değildir. HANDOFF'ta testnet v2 yazma engeli kayıtlıdır; canlı dağıtım sürümü bu araştırmada yeniden sorgulanmadı ve zincir üzerinde işlem denenmedi.

## 1. Fade'in otomatik venue anahtarı geri dönüşte değişiyor

**P1 · Doğrulanmış kaynak kusuru.**

- **Tetikleyici / kanıt:** Soroban modunda Fade oluşturma formunu aç; başka araca geç; Fade'e dön. [SellerForm](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:118) her mount'ta yeni anahtar üretip tek `agyion.venueSecret` oturum kaydının üstüne yazar. [AppShell](/home/apo110/agyion/app/app/components/app/AppShell.tsx:180) araç değişiminde paneli unmount eder. Önceki Fade'in handoff alanı bu tek kaydı okur ([639](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:639)); eski Fade'in açık anahtarıyla eşleşmezse haklı olarak reddeder ([684](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:684)). Oluşturma formu sırrın yalnız ilk 12 karakterini gösterir ([227](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:227)).
- **Kullanıcı sonucu:** Kullanıcı aynı tarayıcı sekmesinde kaldığını düşünse de önceki demo venue kimliğini kaybeder. Eski Fade için imza üretmek, anahtar ayrıca saklanmadıysa mümkün olmaz. Bunun fon çalınması olduğunu söylemiyorum; doğru eşleşme kontrolü işlemi durduruyor. Canlı v2 işlem testi yapılmadı.
- **Önerilen davranış:** Venue kimliğini form ömründen ayır; anahtarları açık anahtar/ilgili kayıtla eşleştir. Mevcut kimliği otomatik değiştirme. Demo imzacı için açık yedekleme ve değiştirme akışı sağla; gizli anahtarı genel kalıcı taslak deposuna sessizce koyma.
- **Doğrulama:** A kimliğiyle Fade hazırla/fixture oluştur; Pod'a git, geri dön, eski kaydı yükle. A hâlâ doğru kayda karşılık gelsin. Açıkça B üretmek A'yı bozmasın. Depolama kapalı/yenileme durumunda dürüst kurtarma yönlendirmesi çıksın.
- **Sonradan çalıştırılan kanıt:** [Araştırma characterization testi](/home/apo110/agyion/artifacts/research/fade-characterization/README.md) değişmemiş gerçek FadePanel'i jsdom'da render → unmount → render etti. Anahtar üretme sınırındaki farklı fixture kimliği ikinci mount'ta üretildi; önceki oturum kimliği değişti ve koruma beklentisi başarısız oldu. Bu gerçek bileşenin yaşam döngüsü/depolama kanıtıdır; kriptografik imza veya canlı kayıt testi değildir.

## 2. Fade işlem hatasından sonra düğme meşgul kalabiliyor

**P1 · Doğrulanmış kaynak kusuru.**

- **Tetikleyici / kanıt:** Claim, handoff veya refund sırasında cüzdan reddi, RPC hatası veya işlemden sonraki kayıt okuma hatası. `setBusy(null)` yalnız başarılı `await` zincirinin sonunda: [claim](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:653), [handoff](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:696), [refund](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:715). Dış [run](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:51) hatayı yakalar ama bu alt bileşenin busy durumunu temizlemez; düğmeler `busy !== null` ile devre dışıdır ([744](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:744), [780](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:780), [798](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:798)). Bağımsız app incelemesi de aynı yolu doğruladı.
- **Kullanıcı sonucu:** Hata metni görünürken işlem hâlâ sürüyormuş gibi “Claiming…”/“Settling…”/“Refunding…” kalabilir. Yeniden deneme/kurtarma için paneli terk etmek gerekir; bu da bağlam kaybına yol açar.
- **Önerilen davranış:** Meşgul durumu her tamamlanma yolunda temizle. Kesin reddi yeniden denenebilir; yayınlandıktan sonraki belirsiz sonucu ise önce durum sorgulanabilir olarak ayır.
- **Doğrulama:** Üç eylem için imza reddi, yayın öncesi hata, yayın sonrası belirsizlik ve başarılı işlemden sonraki okuma hatası fixture'ları. Hiçbirinde sonsuz busy kalmasın; belirsiz işlem otomatik yeniden gönderilmesin.
- **Sonradan çalıştırılan kanıt:** [Gerçek React bileşeninin jsdom testi](/home/apo110/agyion/artifacts/research/fade-characterization/run.log) claim ve refund için çalıştırıldı: kayıt UI'dan yüklendi, client sınırı bir kez `User rejected` döndürdü, arayüz imzanın reddedildiğini gösterdi; aynı düğme `disabled=true` ve “Claiming…”/“Refunding…” kaldı. İki yeniden-denenebilirlik beklentisi gerçekten başarısız oldu. Handoff yalnız kaynak incelemesidir; bu çalışmada test edilmedi. İlk SDK/jsdom kurulum hatası ayrı saklandı, ürün kusuru diye sayılmadı. Toplam üç beklenen başarısız test anahtar yaşam döngüsü dahil 1.43 saniyede tamamlandı; uygulamanın normal test toplamına eklenmedi.

## 3. Taslak sürekliliği yalnız paneli kapatıp açma sınırında

**P2 · Doğrulanmış davranış; tasarım boşluğu.**

- **Tetikleyici / kanıt:** Fade/POD alanlarını düzenle, başka araç sekmesine geç, geri dön. [AppShell:180–187](/home/apo110/agyion/app/app/components/app/AppShell.tsx:180) değişen anahtarla yalnız seçili paneli mount eder; [Fade:106–116](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:106) ve [Pod:118–126](/home/apo110/agyion/app/app/components/app/PodPanel.tsx:118) değerleri bileşen yerel durumudur. Masaüstündeki [How it works](/home/apo110/agyion/app/app/components/app/AppShell.tsx:173) bağlantısı da belgeyi terk eder. Ayrıca kapatma/Escape yalnız `panelOpen` değiştirir; `?tab=pod` kalır ([87–107](/home/apo110/agyion/app/app/components/app/AppShell.tsx:87)); yenileme aynı URL'de paneli yeniden açar ([46–59](/home/apo110/agyion/app/app/components/app/AppShell.tsx:46)).
- **Kullanıcı sonucu:** Yardım aramak veya diğer aracı karşılaştırmak doldurulan işi sıfırlayabilir. URL görülen açık/kapalı durumu ve yüklenmiş kayıt kimliğini tam temsil etmez. Pod sırrının panel terkinde silineceği **zaten açıkça yazıyor** ve dışarı kaydetme onayı var ([203–221](/home/apo110/agyion/app/app/components/app/PodPanel.tsx:203)); bunu gizli veya korumasız kayıp diye sunmamak gerekir.
- **Önerilen davranış:** Gizli olmayan taslakları araç/ağ/hesap bazında koru; hassas sırların farklı ömür ve yedekleme kuralını koru. Yardımı yerinde aç. Açık panel, seçili kayıt ve Back davranışı için tutarlı URL sözleşmesi belirle.
- **Doğrulama:** Taslak → başka araç → geri; yardım → geri; Back/Forward; yenileme; hesap/ağ değişimi. Doğru taslak doğru hesapta gelsin, başka hesaba sır taşınmasın. Kapatıp açma testi bunun yerine geçmez.

## 4. Belirsiz yayın sonucu kalıcı, takip edilebilir bir işe dönüşmüyor

**P1 · Doğrulanmış kurtarma boşluğu.**

- **Tetikleyici / kanıt:** İmzadan/yayından sonra RPC yanıtını kaybet. [submit](/home/apo110/agyion/app/app/lib/hakClient.ts:916) imzalı hash'i hata metnine koyuyor; bu iyi. Ancak yalnız SUCCESS sonrası receipt saklanıyor ([927–933](/home/apo110/agyion/app/app/lib/hakClient.ts:927)); [receipt deposu](/home/apo110/agyion/app/app/lib/transactionReceipts.ts:2) bellekte. Ledger durum tipinde pending/unknown yok ([ledgerLog:20](/home/apo110/agyion/app/app/lib/ledgerLog.ts:20)). [Pod](/home/apo110/agyion/app/app/components/app/PodPanel.tsx:156) aynı sırla sessiz tekrarı engelliyor; bunu korumak gerekli.
- **Kullanıcı sonucu:** Kullanıcıya hash'i kendi takip etmesi söyleniyor; panel değişince hata kayboluyor. “Başarısız” ile “yayınlandı, sonucu henüz bilinmiyor” ürün düzeyinde sürdürülebilir iki durum değil. İkinci işlem kesin olur demiyorum; güvenli uzlaştırma yolu eksik.
- **Önerilen davranış:** Gizli veri içermeyen hash+ağ+hesap+niyet kaydını yayın anından itibaren sakla; “sonuç bekleniyor” satırından yeniden sorgula/explorer'a git. Yeniden gönderme yerine aynı hash'i uzlaştır. Kesinleşince doğru işlem/kayıt sayfasına bağla.
- **Doğrulama:** Yayın sonrası ağ kesintisi, panel değişimi ve yenileme ardından aynı işlem bulunabilsin. SUCCESS/FAILED/not-found sonuçları farklı ele alınsın; sır veya ham imza yerel geçmişe sızmasın.

## 5. Ledger kayıt deposu, tamamlanmamış işlere dönüş kapısı değil

**P2 · Doğrulanmış IA/kurtarma zayıflığı.**

- **Tetikleyici / kanıt:** Daha önce yaratılmış Pod/Trigger/Envoy'u başka oturumda açmak. Gerçek modda liste yerine [manuel ID yükleme](/home/apo110/agyion/app/app/components/app/panelControls.tsx:14) var; Envoy kaynak açıklaması bunu özellikle belirtir ([68](/home/apo110/agyion/app/app/components/app/EnvoyPanel.tsx:68)). Fade yükleme alanı oluşturma formundan sonra gelir ([249](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:249)). [LedgerRow](/home/apo110/agyion/app/app/components/app/LedgerPanel.tsx:103) ayrıntı açar; hash/ID düz metindir, araca veya explorer'a giden işlem yok. Kayıt tipi hesap/ağ alanı içermez ([23–34](/home/apo110/agyion/app/app/lib/ledgerLog.ts:23)); en son 1000 yerel kayıt tutulur ve [Clear history](/home/apo110/agyion/app/app/components/app/LedgerPanel.tsx:66) tek adımda siler.
- **Kullanıcı sonucu:** “Yeni oluştur” anlaşılırken “benim mevcut işim”, “açılabilir Pod”, “imza bekleyen Fade”, “iade al” bulunması gereken ID'ye ve ayrı bellek/notlara bağlı. Hesap değişince yerel kayıtların kime ait olduğu satırdan anlaşılmaz. Clear history fonları silmez; ama yerel keşif yolunu kaldırır.
- **Önerilen davranış:** Yeni oluştur ile mevcut işi aç eylemlerini ayır. Yerel kayıtları ağ/hesap ve kaynak etiketiyle grupla; kayıttan ilgili aracı ID ile aç; kopyalanabilir paylaşım bağlantısı, explorer ve kurtarma eylemi ver. Geçmiş silmede kısa geri alma veya dışa aktarma yolu sağla. Zincir indeksleyici yoksa “bu tarayıcıdaki kayıtlar” sınırını koru.
- **Doğrulama:** Seed edilmiş create→claim→refund/settle kayıtlarından, ID'yi elle kopyalamadan doğru kayıt açılsın. İki hesap/ağ karışmasın. Boş, silinmiş ve depolaması kapalı geçmiş dürüst ayrı durumlar olsun.

## 6. Dağıtımın yazılabilir olmadığı bilgisi işlem düğmesinden sonra geliyor

**P1 · Doğrulanmış geç önkoşul kontrolü; dağıtım sürümü önceki HANDOFF kaydına dayanıyor.**

- **Tetikleyici / kanıt:** Mevcut gerçek-config yerel build'de bir çekirdek araç doldurup cüzdanla ilerle. [HANDOFF:184–187](/home/apo110/agyion/HANDOFF.md:184) canlı kernel'in v2 olmadığını, yeni akışların yazamayacağını açıkça bildiriyor. [writable](/home/apo110/agyion/app/app/lib/hakClient.ts:903) protokolü ancak eylem sırasında kontrol ediyor; hatada işlemi doğru şekilde engelliyor. Görünür giriş notu yalnız [“Connect a wallet to submit.”](/home/apo110/agyion/app/app/components/app/panelControls.tsx:8). [Güncel Fade ekranı](/home/apo110/agyion/artifacts/verification/instrument-app-final/mobile-04-app-fade.png) bu önkoşulu gösteriyor, dağıtım engelini göstermiyor.
- **Kullanıcı sonucu:** Kullanıcı eksik tek şartın cüzdan olduğunu düşünebilir; taslağı hazırladıktan sonra bu dağıtımda çalışamayacağını öğrenir. Ayrıca `protocol_version` sorgusundaki geçici ağ hatası da aynı “v2 upgrade gerekli” mesajına dönüyor; yanlış teşhis olasılığı kaynakta açık.
- **Önerilen davranış:** Yazılabilirlik için checking/ready/incompatible/unavailable durumlarını erken göster. Uyumsuzlukta okuyabilen özellikleri koru, işlemleri nedenleriyle kapat. Ağ hatasını protokol uyumsuzluğuna dönüştürme. V2 deploy ayrı, açık operatör işi olarak kalsın.
- **Doğrulama:** Gerçek ağ çağrısı gerektirmeyen v1/v2/timeout/bozuk yanıt fixture'larında doğru önkoşul gösterilsin; yalnız v2 durumda yazma hazırlığı açılsın. Sonuç eski hesabın/ağın durumunu taşımamalı.

## 7. Ledger bağlantısı kesilince iş bağlamı fazla sert sıfırlanıyor

**P2 · Doğrulanmış kaynak davranışı; kurtarma zayıflığı.**

- **Tetikleyici / kanıt:** Açılmış Fade varken ledger sorgusu bir kez hata versin. [useLedger](/home/apo110/agyion/app/app/lib/useLedger.ts:7) hata ve ilk yüklemeyi aynı `null` sonucuna indirger, 5 saniyelik tekrar yapar; son başarılı an/hata/retry arayüzü vermez. [FadePanel:76–87](/home/apo110/agyion/app/app/components/app/FadePanel.tsx:76) mevcut FadeStage'i unmount edip bekleme satırına döner; iç imza/etkileşim durumu da yeniden yaratılır. [Kaydedilmiş RPC hatası](/home/apo110/agyion/artifacts/verification/instrument-journeys-final/verification.json) `https://soroban-testnet.stellar.org/` için `ERR_NETWORK_CHANGED` içerir; bu kayıt açık Fade üzerindeki aynı etkiyi üretmiş sayılmaz.
- **Kullanıcı sonucu:** Kısa bağlantı kaybı, üzerinde çalışılan bilgi ve kontrol alanının yok olması gibi görünür. Kullanıcı ilk yükleme mi, yeniden deneme mi, servis sorunu mu olduğunu ayıramaz.
- **Önerilen davranış:** Son doğrulanmış veriyi “güncel değil” etiketi ve doğrulanma anıyla tut; zincir şartına bağlı eylemleri güncel veri gelene kadar engelle; imza/taslak alanını gereksiz unmount etme. Sınırlı geri çekilme ve açık yeniden deneme durumu ekle. **Duvar saatinden ledger uydurma:** mevcut kodun bunu yapmaması doğru.
- **Doğrulama:** Yüklü kayıtta tek hata → art arda hata → iyileşme. Kayıt kimliği ve yerel hazırlık korunmalı, güncel olmayan fiyatla eylem etkinleşmemeli; aynı sorgu üst üste sınırsız başlatılmamalı.

## 8. Envoy'da en baskın izin görseli etkin risk sınırını temsil etmiyor

**P2 · Doğrulanmış anlam/hiyerarşi zayıflığı.**

- **Tetikleyici / kanıt:** Envoy'u ilk kez aç. [Güncel masaüstü ekranı](/home/apo110/agyion/artifacts/verification/instrument-app-final/desktop-04-app-envoy.png) büyük parasal limit grafiği gösteriyor. [Panel](/home/apo110/agyion/app/app/components/app/EnvoyPanel.tsx:239) bu grafiği öne çıkarırken yalnız sıfır/negatif Fade fiyatlarında çalışma şartını kapalı açıklamaya koyuyor ([244](/home/apo110/agyion/app/app/components/app/EnvoyPanel.tsx:244)). Oysa [kontratın kendi açıklaması](/home/apo110/agyion/contracts/hak/src/envoy.rs:32) bu kısıtta parasal limitlerin tükenmediğini; etkin sınırın claim sayısı olduğunu söylüyor. İşleyen yerel döngü ayrıca panel unmount'unda durur ([294](/home/apo110/agyion/app/app/components/app/EnvoyPanel.tsx:294)); “bu tab” ifadesi tarayıcı sekmesiyle araç sekmesini ayırmıyor.
- **Kullanıcı sonucu:** Kullanıcı temel güvenceyi bir harcama bütçesi, aracı da çalışmaya devam eden genel otomasyon sanabilir. Gerçekte izin verilen eylem, 50 claim sınırı, süre, alıcı ve sayfada çalışan döngü belirleyici.
- **Önerilen davranış:** Önce “hangi eylemi, kimin için, kaç kez, ne zamana kadar” göster; parasal sözleşme alanları gerekiyorsa ikincil tut. Yerel çalışan/durmuş durumu araçlar arası gezinmede görünür olsun; sunucu otomasyonu izlenimi verme.
- **Doğrulama:** İlk görünümde kullanıcı izin verilen fiyat aralığını, alıcıyı, claim sınırını ve panel değiştirince ne olacağını açıklayabilsin. UI fixture'ı yanlış “bütçe harcandı” göstermesin; araç değişimiyle durma davranışı açıkça doğrulansın.

## 9. Tekrar gelen kullanıcıya da her normal Open'da tam yolculuk zorunlu

**P2 · Doğrulanmış davranış; ürün tercihi henüz doğrulanmamış.**

- **Tetikleyici / kanıt:** Bir detaydan app'e git; tekrar detaya dön; yeniden Open. [OrbitalScene:156–178](/home/apo110/agyion/landing/src/components/OrbitalScene.tsx:156) normal linkleri ilk/tekrar ayrımı olmadan yakalar; [süre 9800 ms](/home/apo110/agyion/shared/flight-handoff.ts:2). Son [doğrulama kaydı](/home/apo110/agyion/docs/verification/2026-09-25-instrument-journeys.md:103) gerçek mobilde ~10 saniye uçuş ve sonrasında ~1.1–1.5 saniye renderer bekleme karesi bildirir. Doğrudan app, değiştirici tuşlar ve reduced motion zaten hızlı/native yollardır.
- **Kullanıcı sonucu:** Aynı dünyaya bağlılık duygusu kuruluyor, ancak yardım/kontrol için tekrar girişte bekleme işin önüne geçebilir. Bu son kullanıcı talebine aykırı yapılmış bir bypass hatası değil: tüm Open bağlantılarına uçuş özellikle istendi. Buradaki eksik, tekrar kullanım politikasının hiç değerlendirilmemiş olması.
- **Önerilen davranış:** İlk keşif, kullanıcının açıkça yeniden izlemek istediği yolculuk ve devam eden işe dönüşü ayrı ele al. Tekrar gelişte daha kısa aynı-dünya yaklaşımı veya doğrudan işe dönme niyeti sunulabilir; yeni bir Pause motion düğmesi önermiyorum.
- **Doğrulama:** İlk ziyaret ve üçüncü işe dönüş ayrı görev testleri olsun. Hedefe ulaşma süresi, terk etme ve ne beklendiği gözlensin; sadece “uçuş 3 saniyeden uzun sürdü” başarı ölçütü olmasın.

## 10. Şeffaflık arttı; bilgi ile dünyanın görsel önceliği hâlâ çatışıyor

**P2 · Görüntüyle doğrulanmış tasarım zayıflığı; sayısal kontrast ihlali henüz ölçülmedi.**

- **Tetikleyici / kanıt:** [Masaüstü Envoy](/home/apo110/agyion/artifacts/verification/instrument-app-final/desktop-04-app-envoy.png) özet metinlerinin arkasından büyük, yüksek kontrastlı Endurance modülleri geçiyor. [Mobil Fade](/home/apo110/agyion/artifacts/verification/instrument-app-final/mobile-04-app-fade.png) alan ipuçlarıyla parlak disk/istasyon aynı görsel bölgede. Kaynakta çerçeve alfa `.035`, ana yüzey `.76`, aside `.52` ([CSS:63](/home/apo110/agyion/app/app/orbital.css:63), [94–95](/home/apo110/agyion/app/app/orbital.css:94)). Bu görüntüleri artık opak siyah panel diye tarif etmek doğru değil; mevcut sorun fazla rekabet.
- **Kullanıcı sonucu:** Kullanıcı miktar, hak sahibi ve son tarihi okurken dekor hareketi ve yapısal kenarlar aynı kuvvette dikkat çekiyor. İnce çizgiler, küçük açıklama metni ve gerçek işlem bilgisi aynı optik katmana düşüyor.
- **Önerilen davranış:** Dünya açık kalsın; kritik alanların arkasında daha sakin yerel yüzey/kompozisyon, daha az kesişen istasyon geometrisi ve miktar→eylem→koşul sıralaması olsun. Form etkileşimi sırasında dekorun hareket yoğunluğunu azalt. Her paneli yeniden siyah kutuya çevirmek gerekmez.
- **Doğrulama:** Diskin en parlak ve en karanlık konumlarında, seçili/odaklı/hatalı alanlarda bileşik piksel kontrastını ölç. Okuma görevini hareket açıkken ve düşük görmeyle değerlendir. Sayfa piksel farkının büyük olması okunabilirlik kanıtı değil.

## 11. Mobilde yardım kaldırılmış; gerçek klavye görünümü test edilmemiş

**P2 · Yardım kaybı doğrulanmış; klavye örtüşmesi test edilmemiş hipotez.**

- **Tetikleyici / kanıt:** 390 px app formunu aç. [Mobil CSS:311](/home/apo110/agyion/app/app/orbital.css:311) workspace içindeki How it works bağlantısını tamamen gizler. [Mobil Fade ekranında](/home/apo110/agyion/artifacts/verification/instrument-app-final/mobile-04-app-fade.png) başlıkta yalnız kapatma var. Uygulama `height:100svh;overflow:hidden`, sabit üst/alt sınırlar ve iç scroll kullanır ([9](/home/apo110/agyion/app/app/orbital.css:9), [304](/home/apo110/agyion/app/app/orbital.css:304)); kısa ekran için ayrıca scroll kuralı mevcut ([358](/home/apo110/agyion/app/app/orbital.css:358)). Bunlar tek başına sanal klavye hatası kanıtı değildir. Son UI testi alan genişliği/yazı boyutu ölçer, klavye açık `visualViewport` davranışı ölçmez ([221–229](/home/apo110/agyion/scripts/verify-holographic-ui.mjs:221)).
- **Kullanıcı sonucu:** Telefonda kavramı anlamak için taslağı terk etmek gerekir. Klavyenin son alanı/eylemi örtmesi, çift scroll veya yakınlaştırma sonrası erişim problemi hâlâ açık bir cihaz riski; mevcut ekranlar klavye kapalıdır.
- **Önerilen davranış:** Bağlama ait yardım telefonda da yerinde erişilebilir kalsın. Odaklanan alan, ilgili hata ve birincil eylem klavye görünürken ulaşılabilir olsun; dock gerektiğinde görsel önceliğini kaybetsin.
- **Doğrulama:** Gerçek iOS/Android veya eşdeğer klavye/visualViewport düzeneğinde uzun IBAN, açık anahtar, son sayısal alan ve hata akışı. 200% metin büyütme, klavye aç/kapa ve geri dönme. Her şeyin ilk viewport'a sığması şart değil; eyleme kaydırarak güvenle erişim şart.

## 12. Ramp teklifi, yanında doldurulan işlemle ayrışabiliyor

**P2 · Doğrulanmış anlam/kurtarma kusuru.**

- **Tetikleyici / kanıt:** 1000 TRY için teklif al, deposit miktarını değiştir veya Withdraw seç. [Ramp:70–78](/home/apo110/agyion/app/app/components/app/RampPanel.tsx:70) teklif tutarı, deposit tutarı ve withdrawal tutarı ayrı durumlar; [doQuote](/home/apo110/agyion/app/app/components/app/RampPanel.tsx:167) yalnız teklif durumunu günceller. [Yön değişimi](/home/apo110/agyion/app/app/components/app/RampPanel.tsx:249) teklifi temizlemez. Sağda eski teklif “You send … TRY” olarak görünür ([287–288](/home/apo110/agyion/app/app/components/app/RampPanel.tsx:287)); zaman/uygun taslak/son geçerlilik etiketi yok.
- **Kullanıcı sonucu:** Doğru bir eski teklif, yanlış güncel işlemin özeti gibi okunabilir. Ücret de bu ayrı teklifin parçasıdır. Ödeme handler'ının yanlış tutar gönderdiğini söylemiyorum: kayıtlı withdrawal tutarı ve memo korunuyor ([272–275](/home/apo110/agyion/app/app/components/app/RampPanel.tsx:272)).
- **Önerilen davranış:** İşlemle bağlı teklif göster veya bunu açıkça bağımsız hesaplayıcı diye adlandır. Miktar/yön değişince eski teklif güncelmiş gibi durmasın; doğru kaynak miktarı, yön, alınma anı ve sağlayıcı geçerlilik bilgisi gösterilsin. Ağ/resource ücretinin anchor ücretinden ayrı olduğu gerekli anda açıklansın.
- **Doğrulama:** Teklif al → tutarı değiştir → yönü değiştir → eski response geç gelsin. Her durumda görülen fiyat/ücretin hangi niyete ait olduğu belli olsun. Kayıtlı withdrawal ödemesi hâlâ kendi değişmez tutar/memo'sunu kullansın.

## Ayrı incelemeyle tamamlanan konu

İmza öncesi tam miktar/alıcı/ağ, ağ-resource ücreti, test imzacısı ile harici cüzdan incelemesi ve kesinleşmiş sonuç kanıtı [app araştırmasında](/home/apo110/agyion/docs/research/2026-09-25-crypto-design/apps-research.md) ayrıca ele alınıyor. Burada yeni bir 13. bulgu olarak tekrarlamadım. Core DraftSummary'nin gerçek tutarları göstermesi olumlu; bunun imzalanacak işlemin tamamı ve maliyeti olduğunu varsaymak doğru değil. Hiçbir referans sitenin sahip olmadığı bir davranış bu raporda varmış gibi yazılmadı.

## Önceki incelemelerin kör noktaları

1. **Durum değişikliğini işin tamamlanmasıyla karıştırma riski:** [Son doğrulama](/home/apo110/agyion/docs/verification/2026-09-25-instrument-journeys.md:90) tıklama, renderer sayısı, shader bağlama, rota ve boş/taslak formları ölçtü. Bunlar gerekli; kullanıcının kayıt oluşturup ayrıldıktan sonra bulup tamamlamasını ölçmüyor. Dokümanın işlem imzalanmadığı sınırı doğru; raporun ağırlığı yine test sayılarına kaymış.
2. **Taslak korumayı çok dar doğruladık:** [Gerçek test](/home/apo110/agyion/scripts/verify-holographic-ui.mjs:236) yalnız Pod kapat/aç yapıyor. “Taslak korunuyor” ifadesi tab değişimi, yardım, Back ve yeniden yükleme için genellenemez. Venue anahtarı kaybı bu kör noktanın somut sonucu.
3. **Şeffaflık için ölçüt, okunabilirlik için ölçüt değildi:** [Test](/home/apo110/agyion/scripts/verify-holographic-ui.mjs:217) dünya açık/kapalı piksel farkını yüzde1'den büyük istiyor. Bu, holografik hedefi doğrular; metin kontrastını, rakamın seçilebilirliğini veya hareket altında okuma süresini doğrulamaz. Alan etiketleri ve font boyutu ölçümleri de bu boşluğu kapatmaz.
4. **Metin kısaltmayı anlama testi yerine koyma riski:** [Doküman](/home/apo110/agyion/docs/verification/2026-09-25-instrument-journeys.md:119) yüzde72–78 daha az görünür kelimeyi ölçüyor. Daha az metin tek başına doğru öncelik demek değil; Envoy'un etkin kısıtını kapalı açıklamaya taşımak önemli bilgiyi ikincilleştirebilir. Kullanıcıya ne kadar metin gerektiği görevle belirlenmeli.
5. **Düzgün uçuş saati, sürekli akıcılık değil:** Aynı kayıt [10 saniyelik uçuşu](/home/apo110/agyion/docs/verification/2026-09-25-instrument-journeys.md:103), [son kare beklemesini](/home/apo110/agyion/docs/verification/2026-09-25-instrument-journeys.md:110) ve [~24 FPS yazılım sınırını](/home/apo110/agyion/docs/verification/2026-09-25-instrument-journeys.md:124) ayırıyor. Bu sınırlar dürüstçe yazılmış; yine de süre/son poz eşitliği kullanıcıdaki “durdu” veya “yorucu” hissini ölçmez. Tekrar giriş ayrıca hiç görev kriteri olmadı.
6. **Hata kaydetmek, hatadan kurtarmak değil:** RPC hatasını saklamak doğruydu; uygulamanın bu hata sırasında aktif formu, pending hash'i ve yeniden deneme yolunu nasıl sunduğu aynı testte ölçülmedi. Cüzdansız ekran incelemesi finansal yaşam döngüsünün yerine geçemez.
7. **Mobil ekran görüntüsü, mobil kullanım değil:** 320/360/390 genişlik ve kısa yükseklik kontrolü yapıldı; fiziksel klavye, metin büyütme, uzun gerçek kayıtlar ve çok adımlı imza/geri dönme akışı yapılmadı. Bunu bugün üretilmiş kusur gibi değil, açık kanıt boşluğu olarak tutuyoruz.

Bu inceleme önceki çalışmaların niyetine dair varsayım yapmıyor. Kaydedilmiş test kapsamıyla gerçekten çıkarılabilecek sonuçları ayırıyor. Bir sonraki revizyonda önce anahtar/işlem durumu/kurtarma kusurları; ardından tekrar kullanım, görev odaklı bilgi düzeni ve optik okunabilirlik ele alınmalı. Yeni estetik veya canlı dağıtım onayı verilmiş değil.
