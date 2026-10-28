# Meclis Belge Bot

TBMM'ye verilen **denetim önergelerini**, TBMM'nin kendi özetiyle, geldiği gün X'te paylaşan bot.

İzlenen türler (Gelen Kâğıt'taki bölüm başlıklarına göre):

- Meclis araştırması önergeleri (`10/xxxx`) — en sık, yılda ~1.400
- Genel görüşme önergeleri (`8/xxx`) — ayda 3-4, çoğu parti grubu adına
- Meclis soruşturması önergeleri (`9/xxx`) — çok nadir, yılda birkaç

Türler `src/tbmm.js` içindeki `TURLER` dizisinden yönetilir; yeni tür eklemek bir satır.

## Kural

- Her gelen önerge paylaşılır. Seçim yapılmaz.
- Metin TBMM'nin Gelen Kâğıtlar özetidir; bot tek kelime eklemez.
- Kaynak: https://www.tbmm.gov.tr/Gundem/GelenKagitlarListe

## Hız: haftalık yığını 7 güne yayma

Önergeler Gelen Kâğıt'a günlük değil, **haftada bir pazartesi yığın hâlinde** düşüyor
(2026: 1 Ekim açılış 73, 12 Ekim 105, 19 Ekim 77; aradaki günlerde 0-2). Koşu başına sabit
sınırla yığın 3 günde bitiyor, haftanın kalan 4 günü hesap susuyordu.

`run.js` şimdi her koşuda şunu hesaplar:

```
günlük hedef = (bekleyen önerge + bugün atılan) / bir sonraki pazartesiye kalan gün   (yukarı yuvarla)
izin         = günlük hedef × (saat − 07:00) / (20:00 − 07:00)                       (0..1 arası, yukarı yuvarla)
bu koşu      = izin − bugün atılan                                                    (en çok MAX_POSTS_PER_RUN)
```

- 105 önergelik yığın → günde 15; 77 → günde 11; 2 → günde 1. Pazar günü kalan ne varsa bitirilir.
- Gün içinde hedef saate orantılı açılır: 07:17 koşusu 1 tane, 11:17 koşusu 4-5, 16:17 koşusu 5-6,
  20:17 koşusu günün kalanını atar. Böylece sabah tek seferde değil güne yayılıyor.
- Koşular düzensiz (GitHub cron'u atlıyor); geç saatteki koşu günün kalan payını tek başına
  atabildiği için `MAX_POSTS_PER_RUN` gevşek (20), sadece güvenlik sınırı. `MAX_POSTS_PER_DAY` (40)
  iki yığın üst üste gelirse spam görünümüne karşı tavan.
- Günlük sayaç `state.json` içinde `gunluk` altında (TRT tarihi + sayı).
- Hafta ortası gelen küçük kâğıtlar kuyruğa eklenir, hedef kendiliğinden yeniden hesaplanır.
- Oylama akışı bu hıza dâhil değil; oylamalar haber değeri taşıdığı için geldiği koşuda atılır.

## Kurulum (bir kez, ~15 dk)

1. **X Premium** aç (280 karakter sınırı için şart; özetler 300-500 karakter).
2. https://developer.x.com → proje + app oluştur → **User authentication settings**: *Read and Write* →
   Keys and tokens'tan 4 değeri al: API Key, API Key Secret, Access Token, Access Token Secret.
   Access Token'ı yetki değişikliğinden **sonra** üret, yoksa "Read only" kalır.
3. Kredi yükle (gönderi başına ~$0.015).
4. Bu klasörü **public** GitHub repo'suna yükle.
5. Repo → Settings → Secrets and variables → Actions → New repository secret:
   `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`
6. Actions sekmesinde workflow'u **Run workflow** ile bir kez elle çalıştır.
   İlk koşu hiçbir şey atmaz, sadece başlangıç noktasını `state.json`'a yazar.
   Bundan sonra her saat kendi kendine çalışır; PC'nin açık olması gerekmez.

## Yerelde test

```bash
npm install
npm run peek          # en son Gelen Kâğıt'tan ne çıkarıyor, göster (X'e dokunmaz)
node src/peek.js 196  # belirli numara
npm run dry           # tam akış, ama gönderi atmaz, state'e yazmaz (DRY_RUN=1)
npm run peek-oylama   # son 4 birleşimden hangi oylamalar çıkıyor, hangileri atılacak
npm run dry-oylama    # oylama akışı, gönderi atmaz
```

`peek` çıktısı boşsa veya özetler bozuksa TBMM sayfa yapısı değişmiştir; `src/tbmm.js` içindeki
`ENTRY_RE` ve başlık eşleşmesi düzeltilir, başka yer değişmez.

## İkinci akış: Genel Kurul oylamaları

`src/oylama.js`, Genel Kurul tutanağından **önerge oylamalarını** çeker ve sonucu paylaşır.

Kaynak: birleşim listesi `tbmm.gov.tr/Tutanaklar/DoneminTutanakMetinleri?Donem=28&YasamaYili=5`
→ her birleşimin sayfası `/Tutanaklar/Tutanak?Id=<guid>`
→ ham tutanak `cdn.tbmm.gov.tr/.../Tutanak/<dönem>/<yıl>/<birleşim>/Ham/<guid>.html`
Düz HTML, AJAX yok. **Kodlama windows-1254** — UTF-8 varsayılırsa Türkçe karakterler bozulur.

Her koşuda **son 4 birleşim** okunur (`OYLAMA_LOOKBACK`), eskiden yeniye. Yalnızca "Son Tutanak"a
bakmak yetmiyordu: Genel Kurul salı-çarşamba-perşembe üst üste toplanınca ve Actions seyrek koşunca
aradaki gün kaçıyordu (Ekim 2026'da 8. Birleşim böyle kaçtı). Geriye dönüş sınırı: atılmış en yeni
birleşimden eskisine bakılmaz; amaç metni çıkarımı değişse bile eski oylamalar yeniden atılmaz.

Tutanaktaki yapı (28/5 4., 8. ve 9. Birleşim'de doğrulandı):

```
<Parti> Grubunun İç Tüzük'ün 19'uncu maddesine göre verilmiş bir önerisi vardır   (ya da "Grubu adına")
Öneri: ... <amaç> amacıyla ... önerilmiştir.
... (görüşmeler) ...
Öneriyi oylarınıza sunuyorum: Kabul edenler... Kabul etmeyenler... Kabul edilmemiştir.
```

Sonuç ifadesi değişken: `Kabul edilmemiştir`, `Öneri kabul edilmemiştir`, `öneri kabul edilmiştir`.
Oylama ile sonuç arasına itiraz girebilir, elektronik oylamaya gidilebilir, karar yeter sayısı
bulunamayıp aynı öneri sonraki oturumda yeniden oylanabilir. Bu yüzden "oylarınıza sunuyorum" ile
sonuç ayrı aranır (pencere: bir sonraki oylama/öneriye ya da 1200 karaktere kadar); sonuçsuz
oylama atlanır, öneri bekler, bir sonraki oylamayla eşleşir. Ekim 2026'da ifade
`Kabul edilmemiştir` → `Öneri kabul edilmemiştir` olunca eski kalıp 8. Birleşim'den itibaren hiçbir
oylama bulamadı; oylama gönderileri 15 Ekim'de kesildi, 28 Ekim'de fark edildi.

Öneri ve oylama belgede sırayla birbirini izler, iç içe geçmez; eşleştirme buna dayanır.

**Kapsam:** denetim önergelerinin (Meclis araştırması, genel görüşme, Meclis soruşturması) öne
alınmasına dair grup önerileri — önerge akışıyla aynı türler. Gündem ve çalışma düzeni önerileri
(ör. AKP'nin kanun teklifi sıralaması/çalışma saatleri önerisi) alınmaz. Toplanamayıp bir dakikada
kapanan birleşimler (11. Birleşim, 27 Ekim 2026: Divan teşekkül etmedi) hata değil, 0 oylama.

Gönderi metni tutanaktan aynen alınır. Başlıktaki `REDDEDİLDİ` / `KABUL EDİLDİ`,
tutanaktaki "Kabul edilmemiştir" / "Kabul edilmiştir" ifadesinin karşılığıdır.

Durum `state-oylama.json` içinde tutulur; mükerrer kontrolü birleşim + amaç metni ile.
Her iki akış da aynı workflow'da çalışır; önerge adımı patlasa bile oylama adımı
`if: always()` ile çalışır.

Hacim: Genel Kurul haftada ~3 gün toplanıyor, birleşim başına birkaç oylama.

## Yasama yılı ve numaralandırma

Gelen Kâğıt numaraları **her yasama yılında 1'den yeniden başlar** (yasama yılı 1 Ekim'de
açılır). Bu yüzden bot "numarası şundan büyük olanlar" diye filtrelemez; bitirdiği kâğıtları
`state.json` içindeki `bitenKagitlar` altında kendi URL'leriyle (GUID) tutar. Mükerrer gönderi
kontrolü esas no (`10/xxxx`) ile yapılır; o numaralar yasama yılında sıfırlanmaz.

Yasama yılının **ilk** Gelen Kâğıdı tatil boyunca verilen önergelerin tamamını taşır:
1 Ekim 2023'te 133, 2024'te 72, 2025'te 58 önerge. Yani her 1 Ekim'de bir yığın bekleniyor.

Mevcut yasama yılında henüz kâğıt yayımlanmamışsa liste boş döner; bot bunu **hata saymaz**,
log'a yazıp sakin çıkar. Sayfa yapısının gerçekten bozulması ayrıca yakalanıyor: liste
sayfasındaki "Önceki Dönem ve Yasama Yılları" bağlantıları kaybolursa `tbmm.js` hata verir.

## Geçmişi doldurmak istersen

Varsayılan: hiç gönderi atılmamış boş bir `state.json` ile ilk koşu, listedeki bütün kâğıtları
"bitti" işaretleyip çıkar — yani bugünden başlar. Geçmişi de atmak istersen `state.json`'daki
`bitenKagitlar` içinden ilgili kâğıtları sil, ya da boş state ile `BACKFILL=1` vererek çalıştır.
Bir seferde binlerce önerge atmak için tasarlanmadı; hesap 1-2 gün içinde spam sayılır.

## Ayarlar (workflow'daki env)

- `MAX_POSTS_PER_RUN` (önerge 20, oylama 7): bir koşuda en fazla gönderi; güvenlik sınırı. Asıl hız günlük hedefle ("Hız" bölümü).
- `MAX_POSTS_PER_DAY` (40): günlük tavan.
- `GUN_BASI_SAAT` / `GUN_SONU_SAAT` (7 / 20, TRT): günlük hedefin saate orantılı açıldığı pencere.
- `POST_GAP_SECONDS` (120): gönderiler arası bekleme.
- `OYLAMA_LOOKBACK` (4): oylama akışının her koşuda okuduğu birleşim sayısı.
- `LIST_URL`: liste adresini geçersiz kılar. Sadece test için (geçmiş bir yasama yılına bakmak).
- `TUTANAK_URL`: tek bir birleşim sayfasını (`/Tutanaklar/Tutanak?Id=<guid>`) okutur. Sadece test için.
- `STATE_FILE` / `OYLAMA_STATE_FILE`: state dosyalarının yolu. Sadece test için.

## Maliyet

X API kullandıkça ödeme modelinde: **gönderi başına $0.015**. Yasama yılı içinde haftada ~75-105
önerge + ~10 oylama → ayda ~350-450 gönderi ≈ $5-7; tatilde çok az. Actions public repo'da ücretsiz.
X Premium ayrı abonelik (280 karakter sınırı için).

**Dikkat: içinde link olan gönderi $0.20.** On üç katı. Bu yüzden gönderilere kaynak linki
eklenmiyor; künyede sadece "Kaynak: TBMM" yazıyor. Link eklemek aylık maliyeti $2'den $20'ye
çıkarır.

Gönderi hız sınırı: kullanıcı başına 15 dakikada 100, uygulama başına günde 10.000. Bot bu
sınırların yakınına bile gelmiyor.

## Yol haritası

- [x] **Oylama sonuçları** — `src/oylama.js`, Ekim 2026'dan beri çalışıyor.
- [ ] Oylama gönderisinin ilgili önerge gönderisini alıntılaması (esas no tutanakta geçmiyor; eşleştirme amaç metniyle yapılmalı).
- [ ] Aylık şeffaflık gönderisi (kaç önerge, hangi partiler, kaç oylama).
- [ ] Önerge gerekçesi (tam metin) — tutanağa girdiğinde.
