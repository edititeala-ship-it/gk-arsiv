// TBMM "Gelen Kâğıtlar" kaynağı.
// Liste:  https://www.tbmm.gov.tr/Gundem/GelenKagitlarListe   (mevcut yasama yılı, GET)
// Detay:  https://www.tbmm.gov.tr/Gundem/GelenKagitDetay/<guid>
// Detay sayfasında "Meclis Araştırması Önergeleri" başlığı altında numaralı maddeler var:
//   "15.- Ordu Milletvekili Mustafa Adıgüzel ve 19 Milletvekilinin, fındık ... amacıyla bir
//    Meclis araştırması açılmasına ilişkin önergesi (10/4478) (Başkanlığa geliş tarihi:5.08.2026)"

import * as cheerio from "cheerio";

const BASE = "https://www.tbmm.gov.tr";
const LIST_URL = `${BASE}/Gundem/GelenKagitlarListe`;
const UA = "meclis-belge-bot/0.1 (+https://github.com/) resmi TBMM verisini aktarir";

async function getHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.text();
}

// Liste: [{ no: 196, date: "10.08.2026", url }] — en yeni önce
export async function fetchGelenKagitList() {
  const html = await getHtml(LIST_URL);
  const $ = cheerio.load(html);
  const items = [];
  $("a[href*='GelenKagitDetay']").each((_, a) => {
    const text = $(a).text().trim(); // "196. GELEN KAĞIT"
    const m = text.match(/^(\d+)\./);
    if (!m) return;
    const href = $(a).attr("href");
    const url = href.startsWith("http") ? href : BASE + href;
    // Tarih aynı satırda (tr) — en yakın satır metninden çek
    const rowText = $(a).closest("tr").text() || $(a).parent().text();
    const d = rowText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const date = d ? `${d[1]}.${d[2]}.${d[3]}` : null;
    items.push({ no: Number(m[1]), date, url });
  });
  items.sort((a, b) => b.no - a.no);
  return items;
}

// HTML → satır satır düz metin (blok etiketler satır sonu olur)
function htmlToLines(html) {
  const $ = cheerio.load(html);
  $("script,style,nav,header,footer").remove();
  let body = $("body").html() || "";
  body = body.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-6]|td)>/gi, "\n");
  const text = cheerio.load(`<div>${body}</div>`)("div").text();
  return text.split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

const ENTRY_RE = /^(\d+)\.-\s*(.+?)\s*\((10\/\d+)\)\s*\(Başkanlığa geliş tarihi:\s*([\d.]+)\)/i;

// Detay: bir Gelen Kâğıt içindeki Meclis araştırması önergeleri
export async function fetchArastirmaOnergeleri(kagit) {
  const html = await getHtml(kagit.url);
  const lines = htmlToLines(html);

  const start = lines.findIndex((l) => /^Meclis Araştırması Önergeleri$/i.test(l));
  if (start === -1) return [];

  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(ENTRY_RE);
    if (m) {
      out.push({
        esasNo: m[3],                       // "10/4478"
        ozet: m[2].trim(),                  // TBMM'nin kendi özeti, aynen
        gelisTarihi: normDate(m[4]),        // "05.08.2026"
        gelenKagitNo: kagit.no,
        gelenKagitTarihi: kagit.date,
        gelenKagitUrl: kagit.url,
      });
      continue;
    }
    // Numarasız bir satır geldiyse bölüm bitti (bir sonraki başlık)
    if (out.length && !/^\d+\.-/.test(line)) break;
  }
  return out;
}

function normDate(s) {
  const [d, m, y] = s.split(".");
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`;
}
