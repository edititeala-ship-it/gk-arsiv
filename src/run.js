// Akış:
//  1. state.json oku (hangi Gelen Kâğıt'lar bitti, hangi esas no'lar atıldı)
//  2. Mevcut yasama yılının listesini çek, bitmemiş kâğıtları eskiden yeniye sırala
//  3. Her birinden Meclis araştırması önergelerini çıkar
//  4. Daha önce atılmamış her önergeyi sırayla, aralıklı at (hepsi, seçim yok)
//  5. state.json güncelle (Actions bunu commit eder)
//
// Gelen Kâğıt numaraları her yasama yılında 1'den yeniden başlar. Bu yüzden
// "numarası şundan büyük olanlar" diye filtrelenmez — bitmiş kâğıtlar kendi
// URL'leriyle kaydedilir. Mükerrer gönderi kontrolü esas no (10/xxxx) ile yapılır.

import fs from "node:fs";
import { fetchGelenKagitList, fetchArastirmaOnergeleri } from "./tbmm.js";
import { formatOnerge } from "./format.js";
import { post } from "./x.js";

const STATE_FILE = process.env.STATE_FILE || "state.json";
const MAX_POSTS_PER_RUN = Number(process.env.MAX_POSTS_PER_RUN || 12);
const GAP_MS = Number(process.env.POST_GAP_SECONDS || 150) * 1000; // 2.5 dk
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadState() {
  const s = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
  s.posted ??= {};
  s.bitenKagitlar ??= {}; // url -> { no, date, at }
  return s;
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
}

async function main() {
  const state = loadState();
  const list = await fetchGelenKagitList();

  // Liste boş olabilir: yeni yasama yılı henüz başlamış, tatil arası, Meclis çalışmıyor.
  // Bu bir hata değil — hata sayılırsa her yasama yılı başında Actions kırmızı yanar
  // ve günde 3 mail gelir. Sayfa yapısının bozulması ayrıca tbmm.js'te yakalanıyor.
  if (!list.length) {
    console.log("Liste boş: mevcut yasama yılında henüz Gelen Kâğıt yayımlanmamış. Bir şey yapılmadı.");
    return;
  }
  console.log(`Listede ${list.length} Gelen Kâğıt, en yeni No. ${list[0].no} (${list[0].date}).`);

  // İlk kurulum: geçmişi doldurmamak için listedekilerin hepsi bitmiş sayılır (README'ye bak)
  const bos = !Object.keys(state.posted).length && !Object.keys(state.bitenKagitlar).length;
  if (bos && process.env.BACKFILL !== "1") {
    for (const k of list) state.bitenKagitlar[k.url] = { no: k.no, date: k.date, at: new Date().toISOString() };
    saveState(state);
    console.log(`İlk çalıştırma: ${list.length} kâğıt başlangıç noktası olarak işaretlendi, gönderi atılmadı.`);
    return;
  }

  const pending = list.filter((k) => !state.bitenKagitlar[k.url]).sort((a, b) => a.no - b.no);
  console.log(`İşlenecek Gelen Kâğıt: ${pending.map((k) => k.no).join(", ") || "yok"}`);

  let postedNow = 0;
  for (const kagit of pending) {
    const onergeler = await fetchArastirmaOnergeleri(kagit);
    const kalan = onergeler.filter((o) => !state.posted[o.esasNo]);
    console.log(`No. ${kagit.no} (${kagit.date}): ${onergeler.length} Meclis araştırması önergesi, ${kalan.length} atılmamış`);

    for (const o of kalan) {
      if (postedNow >= MAX_POSTS_PER_RUN) {
        console.log(`Bu koşuda sınır (${MAX_POSTS_PER_RUN}) doldu; kalanlar sonraki koşuda.`);
        saveState(state);
        return; // kâğıt bitmiş işaretlenmedi, kalan önergeler tekrar ele alınır
      }
      const text = formatOnerge(o);
      try {
        const id = await post(text);
        state.posted[o.esasNo] = { id, at: new Date().toISOString(), kagit: kagit.no };
        saveState(state);
        postedNow++;
        console.log(`Atıldı: ${o.esasNo} → ${id}`);
      } catch (err) {
        console.error(`HATA ${o.esasNo}:`, err?.data || err?.message || err);
        saveState(state);
        throw err; // Actions kırmızı olsun, log görülsün
      }
      await sleep(GAP_MS);
    }
    // Buraya gelindiyse bu kâğıdın bütün önergeleri atılmış (veya hiç önergesi yok)
    state.bitenKagitlar[kagit.url] = { no: kagit.no, date: kagit.date, at: new Date().toISOString() };
    saveState(state);
  }
  console.log(`Bitti. Bu koşuda ${postedNow} gönderi.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
