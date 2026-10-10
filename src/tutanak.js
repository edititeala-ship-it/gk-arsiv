// TBMM Genel Kurul tutanagi kaynagi.
// Son Tutanak sayfasi, o birlesimin ham tutanagina link verir:
//   https://cdn.tbmm.gov.tr/TbmmWeb/Tutanak/<donem>/<yil>/<birlesim>/Ham/<guid>.html
// Ham tutanak windows-1254 kodlu; UTF-8 varsayilirsa Turkce karakterler bozulur.
//
// Yapi (dogrulandi: 28/5 4. Birlesim, 8 Ekim 2026):
//   "<Parti> Grubunun Ic Tuzuk'un 19'uncu maddesine gore verilmis bir onerisi vardir"
//   "Oneri: ... amaciyla ... onerilmistir."
//   ... (gorusmeler) ...
//   "Oneriyi oylariniza sunuyorum: Kabul edenler... Kabul etmeyenler... Kabul edilmemistir."
// Oneri ve oylama belgede sirayla birbirini izler, ic ice gecmez.

import * as cheerio from "cheerio";

const BASE = "https://www.tbmm.gov.tr";
const SON_TUTANAK = process.env.TUTANAK_URL || `${BASE}/Tutanaklar/SonTutanak`;
const UA = "meclis-belge-bot/0.1 (+https://github.com/) resmi TBMM verisini aktarir";

async function getBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function metin(buf) {
  // Ham tutanaklar windows-1254; charset beyanini kontrol edip ona gore coz
  const head = buf.toString("latin1").slice(0, 2000);
  const cs = (head.match(/charset=([\w-]+)/i) || [])[1] || "windows-1254";
  let dec;
  try { dec = new TextDecoder(cs).decode(buf); }
  catch { dec = new TextDecoder("windows-1254").decode(buf); }
  const $ = cheerio.load(dec);
  $("script,style").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

// Son Tutanak sayfasindan ham tutanagin adresini ve birlesim kunyesini cikar
export async function sonTutanakAdresi() {
  const $ = cheerio.load(metin0(await getBuffer(SON_TUTANAK)));
  let url = null;
  $("a[href*='/Tutanak/'][href$='.html']").each((_, a) => { if (!url) url = $(a).attr("href"); });
  if (!url) throw new Error("Son Tutanak sayfasinda ham tutanak baglantisi bulunamadi");
  const m = url.match(/\/Tutanak\/(\d+)\/(\d+)\/(\d+)\//);
  if (!m) throw new Error(`Tutanak adresinden donem/yil/birlesim okunamadi: ${url}`);
  return { url, donem: Number(m[1]), yasamaYili: Number(m[2]), birlesim: Number(m[3]) };
}
function metin0(buf) { return buf.toString("utf8"); } // Son Tutanak sayfasi UTF-8

const OY_RE = /Öneriyi oylarınıza sunuyorum\s*:?\s*Kabul edenler\.*\s*Kabul etmeyenler\.*\s*(Kabul edilmemiştir|Kabul edilmiştir)/g;
const GRUP_RE = /([A-ZÇĞİÖŞÜ][^.!?]{0,70}?) Grubunun İç Tüzük/g;
const ONERI_RE = /Öneri\s*:/g;

function temizleGrup(s) {
  return s.replace(/^.*?(BAŞKAN\s*-\s*)/, "").replace(/^(Sayın|Şimdi|Ayrıca)\s+/i, "").trim() + " Grubu";
}

function temizleAmac(s) {
  return s
    .replace(/^verilen\s+/i, "")
    .replace(/^\d+\s*(grup numaralı|sıra no\.?lu)\s*/i, "")
    .replace(/^\(\s*\d+\s*sıra no\.?lu\s*\)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Bir birlesimin tutanagindaki onerge oylamalari
export async function oylamalariCikar(tutanak) {
  const t = metin(await getBuffer(tutanak.url));
  if (t.length < 2000) throw new Error("Ham tutanak beklenenden kisa; yapi degismis olabilir");

  // Olaylari belge sirasina gore topla
  const olaylar = [];
  for (const re of [GRUP_RE, ONERI_RE, OY_RE]) re.lastIndex = 0;
  let m;
  while ((m = GRUP_RE.exec(t)) !== null) olaylar.push({ tip: "grup", i: m.index, ad: temizleGrup(m[1]) });
  while ((m = ONERI_RE.exec(t)) !== null) olaylar.push({ tip: "oneri", i: m.index + m[0].length });
  while ((m = OY_RE.exec(t)) !== null) olaylar.push({ tip: "oy", i: m.index, sonuc: m[1] });
  olaylar.sort((a, b) => a.i - b.i);

  const out = [];
  let grup = null, oneri = null;
  for (const o of olaylar) {
    if (o.tip === "grup") grup = o.ad;
    else if (o.tip === "oneri") oneri = { i: o.i, grup };
    else if (o.tip === "oy" && oneri) {
      const son = t.indexOf("önerilmiştir.", oneri.i);
      const blok = (son > oneri.i ? t.slice(oneri.i, son + 13) : t.slice(oneri.i, oneri.i + 1200)).trim();
      oneri = null;

      // Kapsam: sadece Meclis arastirmasi/sorusturmasi onergelerinin one alinmasi.
      // Gundem ve calisma duzeni onerileri alinmaz.
      if (!/Meclis araştırma(sı)? önerge/i.test(blok)) continue;

      // Amac: "... tarafından <AMAC> amacıyla" kalibi
      const a = blok.lastIndexOf(" amacıyla");
      if (a < 0) continue;
      const once = blok.slice(0, a);
      const tf = once.lastIndexOf("tarafından ");
      const amac = temizleAmac(tf >= 0 ? once.slice(tf + 11) : once);
      if (amac.length < 20) continue;

      out.push({
        sonuc: o.sonuc === "Kabul edilmiştir" ? "KABUL EDİLDİ" : "REDDEDİLDİ",
        grup: grup || null,
        amac,
        donem: tutanak.donem,
        yasamaYili: tutanak.yasamaYili,
        birlesim: tutanak.birlesim,
        tarih: (t.match(/(\d{1,2}\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+20\d\d)/) || [])[1] || null,
        kimlik: `${tutanak.donem}/${tutanak.yasamaYili}/${tutanak.birlesim}#${amac.slice(0, 60)}`,
      });
    }
  }
  return out;
}
