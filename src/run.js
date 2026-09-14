// Akış:
//  1. state.json oku (hangi Gelen Kâğıt'a kadar işlendi, hangi esas no'lar atıldı)
//  2. Listeyi çek, işlenmemiş Gelen Kâğıt'ları eskiden yeniye sırala
//  3. Her birinden Meclis araştırması önergelerini çıkar
//  4. Daha önce atılmamış her önergeyi sırayla, aralıklı at (hepsi, seçim yok)
//  5. state.json güncelle (Actions bunu commit eder)

import fs from "node:fs";
import { fetchGelenKagitList, fetchArastirmaOnergeleri } from "./tbmm.js";
import { formatOnerge } from "./format.js";
import { post } from "./x.js";

const STATE_FILE = "state.json";
const MAX_POSTS_PER_RUN = Number(process.env.MAX_POSTS_PER_RUN || 12);
const GAP_MS = Number(process.env.POST_GAP_SECONDS || 150) * 1000; // 2.5 dk
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { lastGelenKagitNo: 0, posted: {} };
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
}

async function main() {
  const state = loadState();
  const list = await fetchGelenKagitList();
  if (!list.length) throw new Error("Gelen Kâğıtlar listesi boş döndü — sayfa yapısı değişmiş olabilir");
  console.log(`Listede ${list.length} Gelen Kâğıt, en yeni No. ${list[0].no}. Son işlenen: ${state.lastGelenKagitNo}`);

  // İlk çalıştırma: geçmişi doldurmamak için işaretle ve çık (README'ye bak)
  if (state.lastGelenKagitNo === 0 && process.env.BACKFILL !== "1") {
    state.lastGelenKagitNo = list[0].no;
    saveState(state);
    console.log(`İlk çalıştırma: No. ${list[0].no} başlangıç noktası olarak kaydedildi, gönderi atılmadı.`);
    return;
  }

  const pending = list.filter((k) => k.no > state.lastGelenKagitNo).sort((a, b) => a.no - b.no);
  console.log(`İşlenecek Gelen Kâğıt: ${pending.map((k) => k.no).join(", ") || "yok"}`);

  let postedNow = 0;
  for (const kagit of pending) {
    const onergeler = await fetchArastirmaOnergeleri(kagit);
    console.log(`No. ${kagit.no} (${kagit.date}): ${onergeler.length} Meclis araştırması önergesi`);

    for (const o of onergeler) {
      if (state.posted[o.esasNo]) continue;
      if (postedNow >= MAX_POSTS_PER_RUN) {
        console.log(`Bu koşuda sınır (${MAX_POSTS_PER_RUN}) doldu; kalanlar sonraki koşuda.`);
        saveState(state);
        return; // lastGelenKagitNo ilerletilmedi, kalanlar tekrar ele alınır
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
    state.lastGelenKagitNo = kagit.no;
    saveState(state);
  }
  console.log(`Bitti. Bu koşuda ${postedNow} gönderi.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
