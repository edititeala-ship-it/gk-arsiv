// Genel Kurul oylamalarini paylasan akis.
// Onerge botundan ayridir: kendi state dosyasi, kendi kaynagi (tutanak).
//  1. Son birkac birlesimin tutanak adreslerini al (eskiden yeniye)
//  2. Her birinin onerge oylamalarini cikar
//  3. Daha once atilmamis olanlari sirayla, arali at
//  4. state dosyasini guncelle (Actions commit eder)
//
// Neden birkac birlesim: Actions kosulari seyrek; Genel Kurul sali-carsamba-persembe
// ust uste toplaninca yalnizca "son tutanak"a bakmak aradaki gunu kaciriyordu.
// Geriye donus siniri: atilmis en yeni birlesimden eskisine bakilmaz (kimlik metni
// degisse bile eski oylamalar yeniden atilmaz).

import fs from "node:fs";
import { sonBirlesimler, oylamalariCikar } from "./tutanak.js";
import { formatOylama } from "./format.js";
import { post } from "./x.js";

const STATE_FILE = process.env.OYLAMA_STATE_FILE || "state-oylama.json";
const DRY = process.env.DRY_RUN === "1";
const MAX = Number(process.env.MAX_POSTS_PER_RUN || 7);
const GAP_MS = Number(process.env.POST_GAP_SECONDS || 120) * 1000;
const LOOKBACK = Number(process.env.OYLAMA_LOOKBACK || 4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadState() {
  const s = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
  s.posted ??= {};
  return s;
}
const saveState = (s) => { if (!DRY) fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n"); };

// Birlesim siralama anahtari (donem, yasama yili, birlesim)
const sira = (d, y, b) => d * 1e6 + y * 1e4 + b;

// Pencere icindeki butun oylamalar, eskiden yeniye; okunamayan birlesim atlanir
export async function oylamalariTopla(k = LOOKBACK) {
  const birlesimler = await sonBirlesimler(k);
  console.log(`Bakılan birleşimler: ${birlesimler.map((b) => `${b.donem}/${b.yasamaYili} ${b.birlesim}.`).join(", ")}`);
  const out = [];
  let hata = 0;
  for (const b of birlesimler) {
    try {
      const o = await oylamalariCikar(b);
      console.log(`${b.birlesim}. Birleşim: ${o.length} önerge oylaması`);
      out.push(...o);
    } catch (e) {
      hata++;
      console.error(`${b.birlesim}. Birleşim okunamadı: ${e.message}`);
    }
  }
  if (birlesimler.length && hata === birlesimler.length) throw new Error("Hiçbir tutanak okunamadı");
  return out;
}

// Atilmis en yeni birlesim; ondan eskiye donulmez
export function enYeniAtilan(state) {
  let en = 0;
  for (const k of Object.keys(state.posted)) {
    const m = k.match(/^(\d+)\/(\d+)\/(\d+)#/);
    if (m) en = Math.max(en, sira(+m[1], +m[2], +m[3]));
  }
  return en;
}

async function main() {
  const state = loadState();
  const oylamalar = await oylamalariTopla();

  // Ilk kurulum: gecmisi doldurmamak icin mevcut birlesimleri isaretle ve cik
  if (!Object.keys(state.posted).length && process.env.BACKFILL !== "1") {
    for (const o of oylamalar) state.posted[o.kimlik] = { at: new Date().toISOString(), not: "ilk çalıştırma" };
    saveState(state);
    console.log(`İlk çalıştırma: ${oylamalar.length} oylama başlangıç noktası olarak işaretlendi, gönderi atılmadı.`);
    return;
  }

  const sinir = enYeniAtilan(state);
  const kalan = oylamalar.filter((o) => sira(o.donem, o.yasamaYili, o.birlesim) >= sinir && !state.posted[o.kimlik]);
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
      console.log(`Atıldı: ${o.sonuc} · ${o.birlesim}. Birleşim · ${o.amac.slice(0, 50)}… → ${id}`);
    } catch (err) {
      console.error("HATA:", err?.data || err?.message || err);
      saveState(state);
      throw err;
    }
    await sleep(GAP_MS);
  }
  console.log(`Bitti. Bu koşuda ${n} gönderi.`);
}

// Dogrudan calistirilinca main; peek-oylama.js import edince calismaz
if (process.argv[1] && /[\\/]oylama\.js$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
