// Test aracı: en son Gelen Kâğıt'tan ne çıkardığımızı gösterir, hiçbir şey atmaz.
// Kullanım: npm run peek            (en yeni)
//           node src/peek.js 190    (belirli numara)
import { fetchGelenKagitList, fetchArastirmaOnergeleri } from "./tbmm.js";
import { formatOnerge } from "./format.js";

const wanted = process.argv[2] ? Number(process.argv[2]) : null;
const list = await fetchGelenKagitList();
const kagit = wanted ? list.find((k) => k.no === wanted) : list[0];
if (!kagit) throw new Error("Gelen Kâğıt bulunamadı");
console.log(`Gelen Kâğıt No. ${kagit.no} · ${kagit.date} · ${kagit.url}\n`);

const onergeler = await fetchArastirmaOnergeleri(kagit);
console.log(`${onergeler.length} Meclis araştırması önergesi bulundu.\n`);
for (const o of onergeler) {
  const t = formatOnerge(o);
  console.log(t + `\n[${t.length} karakter]\n` + "-".repeat(60));
}
