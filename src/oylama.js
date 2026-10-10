// Genel Kurul oylamalarini paylasan akis.
// Onerge botundan ayridir: kendi state dosyasi, kendi kaynagi (tutanak).
//  1. Son Tutanak adresini al
//  2. O birlesimin onerge oylamalarini cikar
//  3. Daha once atilmamis olanlari sirayla, arali at
//  4. state dosyasini guncelle (Actions commit eder)

import fs from "node:fs";
import { sonTutanakAdresi, oylamalariCikar } from "./tutanak.js";
import { formatOylama } from "./format.js";
import { post } from "./x.js";

const STATE_FILE = process.env.OYLAMA_STATE_FILE || "state-oylama.json";
const MAX = Number(process.env.MAX_POSTS_PER_RUN || 7);
const GAP_MS = Number(process.env.POST_GAP_SECONDS || 150) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadState() {
  const s = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
  s.posted ??= {};
  return s;
}
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");

async function main() {
  const state = loadState();
  const tutanak = await sonTutanakAdresi();
  console.log(`Son tutanak: ${tutanak.donem}/${tutanak.yasamaYili} ${tutanak.birlesim}. Birleşim`);

  const oylamalar = await oylamalariCikar(tutanak);
  console.log(`${oylamalar.length} önerge oylaması bulundu.`);

  // Ilk kurulum: gecmisi doldurmamak icin mevcut birlesimi isaretle ve cik
  if (!Object.keys(state.posted).length && process.env.BACKFILL !== "1") {
    for (const o of oylamalar) state.posted[o.kimlik] = { at: new Date().toISOString(), not: "ilk çalıştırma" };
    saveState(state);
    console.log(`İlk çalıştırma: ${oylamalar.length} oylama başlangıç noktası olarak işaretlendi, gönderi atılmadı.`);
    return;
  }

  const kalan = oylamalar.filter((o) => !state.posted[o.kimlik]);
  console.log(`Atılmamış: ${kalan.length}`);

  let n = 0;
  for (const o of kalan) {
    if (n >= MAX) { console.log(`Bu koşuda sınır (${MAX}) doldu; kalanlar sonraki koşuda.`); break; }
    const text = formatOylama(o);
    try {
      const id = await post(text);
      state.posted[o.kimlik] = { id, at: new Date().toISOString(), sonuc: o.sonuc, birlesim: o.birlesim };
      saveState(state);
      n++;
      console.log(`Atıldı: ${o.sonuc} · ${o.amac.slice(0, 50)}… → ${id}`);
    } catch (err) {
      console.error("HATA:", err?.data || err?.message || err);
      saveState(state);
      throw err;
    }
    await sleep(GAP_MS);
  }
  console.log(`Bitti. Bu koşuda ${n} gönderi.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
