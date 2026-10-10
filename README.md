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
npm run dry           # tam akış, ama gönderi atmaz (DRY_RUN=1)
```

`peek` çıktısı boşsa veya özetler bozuksa TBMM sayfa yapısı değişmiştir; `src/tbmm.js` içindeki
`ENTRY_RE` ve başlık eşleşmesi düzeltilir, başka yer değişmez.

## İkinci akış: Genel Kurul oylamaları

`src/oylama.js`, Genel Kurul tutanağından **önerge oylamalarını** çeker ve sonucu paylaşır.

Kaynak: TBMM "Son Tutanak" sayfası → `cdn.tbmm.gov.tr/.../Tutanak/<dönem>/<yıl>/<birleşim>/Ham/<guid>.html`
Düz HTML, AJAX yok. **Kodlama windows-1254** — UTF-8 varsayılırsa Türkçe karakterler bozulur.

Tutanaktaki yapı (28/5 4. Birleşim'de doğrulandı):

```
<Parti> Grubunun İç Tüzük'ün 19'uncu maddesine göre verilmiş bir önerisi vardır
Öneri: ... <amaç> amacıyla ... önerilmiştir.
... (görüşmeler) ...
Öneriyi oylarınıza sunuyorum: Kabul edenler... Kabul etmeyenler... Kabul edilmemiştir.
```

Öneri ve oylama belgede sırayla birbirini izler, iç içe geçmez; eşleştirme buna dayanır.

**Kapsam:** yalnızca Meclis araştırması/soruşturması önergelerinin öne alınmasına dair
öneriler. Gündem ve çalışma düzeni önerileri (ör. AKP'nin birleşim saatleri önerisi)
alınmaz — blokta `Meclis araştırma(sı) önerge` geçmiyorsa atlanır.

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

- `MAX_POSTS_PER_RUN` (workflow'da 2): bir koşuda en fazla gönderi. Kalanlar sonraki saate sarkar, hiçbiri atlanmaz.
- `LIST_URL`: liste adresini geçersiz kılar. Sadece test için (geçmiş bir yasama yılına bakmak).
- `STATE_FILE`: state dosyasının yolu. Sadece test için.
- `POST_GAP_SECONDS` (150): gönderiler arası bekleme.

## Maliyet

X API kullandıkça ödeme modelinde: **gönderi başına $0.015**. Ayda ~100-150 gönderi ≈ $2,
yılda ~$25. Actions public repo'da ücretsiz. X Premium ayrı abonelik (280 karakter sınırı için).

**Dikkat: içinde link olan gönderi $0.20.** On üç katı. Bu yüzden gönderilere kaynak linki
eklenmiyor; künyede sadece "Kaynak: TBMM" yazıyor. Link eklemek aylık maliyeti $2'den $20'ye
çıkarır.

Gönderi hız sınırı: kullanıcı başına 15 dakikada 100, uygulama başına günde 10.000. Bot bu
sınırların yakınına bile gelmiyor.

## Yol haritası

- [ ] **Oylama sonuçları** — Genel Kurul 1 Ekim'de açılınca tutanaklardan `(10/xxxx) ... kabul edilmemiştir/edilmiştir` çekilip
      ilgili gönderi alıntılanacak. Tutanak sayfa yapısı için canlı örnek gerekiyor; ekimin ilk haftası eklenecek.
- [ ] Aylık şeffaflık gönderisi (kaç önerge, hangi partiler, kaç oylama).
- [ ] Önerge gerekçesi (tam metin) — tutanağa girdiğinde.
