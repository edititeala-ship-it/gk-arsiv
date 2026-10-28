// Test aracı: son birleşimlerin tutanaklarından ne çıkardığımızı gösterir, hiçbir şey atmaz,
// state'e dokunmaz.
// Kullanım: npm run peek-oylama          (son 4 birleşim)
//           node src/peek-oylama.js 2    (son 2 birleşim)
//           TUTANAK_URL=https://www.tbmm.gov.tr/Tutanaklar/Tutanak?Id=<guid> node src/peek-oylama.js
import fs from "node:fs";
import { oylamalariTopla, enYeniAtilan } from "./oylama.js";
import { formatOylama } from "./format.js";

const STATE_FILE = process.env.OYLAMA_STATE_FILE || "state-oylama.json";
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : { posted: {} };
const k = process.argv[2] ? Number(process.argv[2]) : 4;

const oylamalar = await oylamalariTopla(k);
const sinir = enYeniAtilan(state);
console.log(`\n${oylamalar.length} oylama bulundu.\n`);
for (const o of oylamalar) {
  const eski = o.donem * 1e6 + o.yasamaYili * 1e4 + o.birlesim < sinir;
  const durum = state.posted[o.kimlik] ? "ATILMIŞ" : eski ? "ESKİ (atılmaz)" : "ATILACAK";
  const t = formatOylama(o);
  console.log(`[${durum}] ${o.kimlik}\n` + t + `\n[${t.length} karakter]\n` + "-".repeat(60));
}
