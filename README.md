# Meclis Belge Bot

TBMM'ye verilen **Meclis araştırması önergelerini**, TBMM'nin kendi özetiyle, geldiği gün X'te paylaşan bot.

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

## Geçmişi doldurmak istersen

Varsayılan: ilk koşu bugünden başlar. Son birkaç Gelen Kâğıt'ı da atmak istersen `state.json`'da
`lastGelenKagitNo` değerini istediğin numaraya düşür (örn. 195 yazarsan 196 ve sonrası atılır).
Bir seferde 4.000 önerge atmak için tasarlanmadı; hesap 1-2 gün içinde spam sayılır.

## Ayarlar (workflow'daki env)

- `MAX_POSTS_PER_RUN` (12): bir saatlik koşuda en fazla gönderi. Kalanlar sonraki saate sarkar, hiçbiri atlanmaz.
- `POST_GAP_SECONDS` (150): gönderiler arası bekleme.

## Maliyet

Günde 2-3 önerge, tatil dönüşü 30-40'lık yığınlar. Aylık ~100-150 gönderi ≈ $2. Actions public repo'da ücretsiz.

## Yol haritası

- [ ] **Oylama sonuçları** — Genel Kurul 1 Ekim'de açılınca tutanaklardan `(10/xxxx) ... kabul edilmemiştir/edilmiştir` çekilip
      ilgili gönderi alıntılanacak. Tutanak sayfa yapısı için canlı örnek gerekiyor; ekimin ilk haftası eklenecek.
- [ ] Aylık şeffaflık gönderisi (kaç önerge, hangi partiler, kaç oylama).
- [ ] Önerge gerekçesi (tam metin) — tutanağa girdiğinde.
