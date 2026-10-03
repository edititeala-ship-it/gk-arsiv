// Test aracı: bir Gelen Kâğıt'tan ne çıkardığımızı gösterir, hiçbir şey atmaz.
// Kullanım: npm run peek            (en yeni)
//           node src/peek.js 190    (belirli numara)
import { fetchGelenKagitList, fetchOnergeler } from "./tbmm.js";
import { formatOnerge } from "./format.js";

const wanted = process.argv[2] ? Number(process.argv[2]) : null;
const list = await fetchGelenKagitList();
if (!list.length) {
  console.log("Liste boş: mevcut yasama yılında henüz Gelen Kâğıt yayımlanmamış.");
  process.exit(0);
}
const kagit = wanted ? list.find((k) => k.no === wanted) : list[0];
if (!kagit) throw new Error("Gelen Kâğıt bulunamadı");
console.log(`Gelen Kâğıt No. ${kagit.no} · ${kagit.date} · ${kagit.url}\n`);

const onergeler = await fetchOnergeler(kagit);
const dagilim = onergeler.reduce((a, o) => ((a[o.tip] = (a[o.tip] || 0) + 1), a), {});
const ozet = Object.entries(dagilim).map(([k, v]) => `${k} x${v}`).join(", ") || "-";
console.log(`${onergeler.length} önerge bulundu: ${ozet}\n`);

for (const o of onergeler) {
  const t = formatOnerge(o);
  console.log(t + `\n[${t.length} karakter]\n` + "-".repeat(60));
}
