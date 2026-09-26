# Agyion: atlanmayacak teslim ölçütleri

25 Eylül 2026. Bu dosya bir **doğrulama çalışma listesi**; kullanıcı onayı, güvenlik sertifikası veya geçmişte bu kontrollerin tamamlandığı iddiası değildir. Araştırmada bulunan işler henüz uygulanmadı.

## 1. Ürün anlamı ve görsel inceleme

- Her ekran için tek ana görev yazılmış olmalı. Ekranda bu görev ve eylem ilk bakışta bulunabilmeli.
- Her enstrümanın bir görsel fiili ve farklı karar yapısı olmalı. Aynı üç sekmenin metin değiştirmesi yeterli sayılmamalı.
- Landing → detay → app aynı şartı ve enstrümanı taşımalı. Yardım açıp geri dönünce seçim ve taslak korunmalı.
- Hologram üzerinde tutar, alıcı, süre ve ana eylem; sahnenin en parlak, en koyu ve en kalabalık anında da okunmalı. Yalnız ortalama bir ekran görüntüsü kullanılmamalı.
- Endurance ve kara delik; kullanıcı referansları, yakın/uzak kadraj ve hareket kaydıyla yan yana incelenmeli. Modelin dönmesi, kamera yolculuğu diye raporlanmamalı.
- Önce/sonra görüntüleri aynı genişlik, rota, veri, odak ve kamera durumunda alınmalı. Farklı kadrajla iyileşme iddia edilmemeli.
- İç tasarım incelemesi ve gerçek kullanıcı değerlendirmesi ayrı tutulmalı. Kullanıcıya verilmemiş onay atfedilmemeli.

## 2. Gezinme ve hareket matrisi

| Durum | Beklenen kanıt |
| --- | --- |
| Home ve her detaydan ilgili Open | İlk tıklamadan form hazır olana kadar kesintisiz kayıt; doğru hedef. |
| İlk ziyaret / tekrarlı ziyaret | Her ikisinde niyet ve taslak korunur; seçilen süre politikası ayrıca açıklanır. |
| Doğrudan app URL'si / yenileme / Back / Forward | Doğru araç ve doğru açık-kapalı panel; boşa tekrarlanan uçuş yok. |
| Erken tıklama / geç yüklenen modül / yüklenmeyen sahne | Kullanıcı kilitlenmez; hedef korunur ve işlevsel alternatif yüklenir. |
| Fare / sürükleme / zoom / dokunma / klavye | Hepsi gerçek kontrole ulaşır; yanlışlıkla başka ürüne geçmez. |
| Azaltılmış hareket / WebGL kaybı / görünür sekmeye dönüş | Gerekli işlev devam eder; bekleyen işlem ve taslak kaybolmaz. |

Geçişin başladığını veya canvas'ın varlığını doğrulamak, yavaş ve kesintisiz görünmesini doğrulamaz. Hareket kontrolü başlangıcı, ortası, belge değişimi ve son yerleşimi içermeli.

## 3. Form ve işlem durumları

Her araç için: bağlantısız, taslak, geçersiz alan, hazır, cüzdan isteği, reddedilen imza, gönderiliyor, hash alınmış/bekliyor, doğrulanmış sonuç, kesin başarısızlık, sonucu belirsiz, veri yenilenemedi, yeniden deneme.

- Hata sonrasında düğmeler tekrar kullanılabilir olmalı; tekrar gönderim gerekiyorsa ilk işlemin durumu önce kontrol edilmeli.
- Görünen başarının dayanağı doğrulanmış işlem sonucu olmalı. Cüzdan imzası tek başına başarı değildir.
- Gönderilmiş hash ve enstrüman/kayıt ilişkisi hata mesajı kapanınca kaybolmamalı. Gizli anahtarlar veya Pod sırrı genel kayıt sistemine yazılmamalı.
- Enstrüman değiştirme, yardım, panel kapatma ve cüzdan dönüşü için taslak davranışı açık ve denenmiş olmalı.
- Ağ erişilemiyor, kayıt bulunamadı, hiç kayıt yok ve sözleşme sürümü desteklenmiyor ayrı durumlar olmalı. Veri yokluğu sıfıra dönüştürülmemeli.
- Teklifin yönü/miktarı değişince önceki teklif güncel gibi gösterilmemeli. Kaynak ve geçerlilik bilgisi gerçek yanıta dayanmalı.
- Mevcut kayıt, ilgili araca gerçek kimliğiyle açılmalı; görünen geçmiş sadece dekor olmamalı.
- Sır, anahtar, proof ve süre sınırlarına ilişkin uyarılar; metin azaltma çalışmasında kaldırılmamalı.

## 4. Telefon ve erişilebilirlik

- 360px ve 390px; kısa ekran, açık klavye ve odaklanan son alan dahil denenmeli.
- Kaydırılan alan ve ana eylem görünür/ulaşılabilir olmalı. Cüzdandan dönüşte kullanıcı aynı işte kalmalı.
- Dokunmada hover gerekmemeli. Klavye odağı görünmeli; kapanan yüzey odağı doğru yere bırakmalı.
- Hareketli arka planla gerçek kontrast, 200% yakınlaştırma, uzun hata/kimlik metni ve kırılan satırlar incelenmeli.
- Ekran görüntüsü emülasyonu, gerçek telefon klavyesi veya cüzdan uygulaması testinin yerine geçmez.

Ölçüm dayanağı: normal metin için en az 4.5:1, büyük metin için 3:1 kontrast; CSS metin rengi ve gerçek bileşik arka planla değerlendirme. Bu araştırmada mevcut UI için uygunluk ölçümü tamamlanmadı. [W3C kontrast açıklaması](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Sekme/odak davranışında [W3C Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/); bekleyen işlem ve geri bildirim ayrımında [NN/g: Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) referans alınır. Bunlar Agyion'un mevcut uygunluğuna ilişkin sertifika değildir.

## 5. Performans ve teknik kontroller

- Derleme, ilgili birim/etkileşim testleri, konsol ve CSP kontrolü değişikliğe uygun olarak tamamlanmalı.
- Render bütçesi hedef cihazda ölçülmeli: 60Hz için hedef yaklaşık 16.7ms/kare; frame-time dağılımı ve sıçramalar kaydedilmeli. **Bu bir hedef; mevcut sonuç değil.**
- Açılışta sonradan shader derleme, ayrı canvas geçişi ve uzun ana iş parçacığı görevleri incelenmeli. DPR/LOD uyarlaması kaliteyi aniden sıçratmamalı.
- Yazılım renderer ölçümleri ayrı raporlanmalı. Gerçek GPU ölçülmediyse “smooth” ya da “60 FPS” denmemeli.
- Güvenlik incelemesi; gerçek protokol kuralları, sınır değerleri, yetki ve tekrar gönderim üzerinden yapılmalı. UI test sayısından “hiç exploit yok” sonucu çıkarılmamalı.

## Teslim notunun formatı

**Değişen davranış → kanıt → kalan sorun.** Başarısız test, eksik cihaz veya denenmemiş işlem açıkça yazılır. Yerel değişiklik, preview ve canlı deploy ayrı durumlardır. “Tamamlandı” yalnızca tarif edilen kapsamın karşılığı olmalıdır.
