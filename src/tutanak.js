// TBMM Genel Kurul tutanagi kaynagi.
// Her birlesimin sayfasi (/Tutanaklar/Tutanak?Id=<guid>) o birlesimin ham tutanagina link verir:
//   https://cdn.tbmm.gov.tr/TbmmWeb/Tutanak/<donem>/<yil>/<birlesim>/Ham/<guid>.html
// Birlesim listesi: /Tutanaklar/DoneminTutanakMetinleri?Donem=<d>&YasamaYili=<y>
// Ham tutanak windows-1254 kodlu; UTF-8 varsayilirsa Turkce karakterler bozulur.
//
// Yapi (dogrulandi: 28/5 4. Birlesim 8 Ekim 2026, 8. ve 9. Birlesim 20-21 Ekim 2026):
//   "<Parti> Grubunun İç Tüzük'ün 19'uncu maddesine göre verilmiş bir önerisi vardır"
//   (bazen "<Parti> Grubu adına İç Tüzük'ün ...")
//   "Öneri: ... amacıyla ... önerilmiştir."
//   ... (gorusmeler) ...
//   "Öneriyi oylarınıza sunuyorum: Kabul edenler... Kabul etmeyenler... Kabul edilmemiştir."
//   (bazen "Öneri kabul edilmemiştir.", bazen "<Parti> grup önerisini oylarınıza sunuyorum")
// Oylama sonucu her zaman hemen gelmez: araya itiraz girebilir, elektronik oylamaya
// gidilebilir, karar yeter sayisi bulunamayip ayni oneri sonraki oturumda yeniden
// oylanabilir. Bu yuzden "oylarınıza sunuyorum" ile sonuc ayri ayri aranir; sonucsuz
// oylama atlanir, oneri bekler, bir sonraki oylamayla eslesir.
// Oneri ve oylama belgede sirayla birbirini izler, ic ice gecmez.

import * as cheerio from "cheerio";

const BASE = "https://www.tbmm.gov.tr";
const SON_TUTANAK = `${BASE}/Tutanaklar/SonTutanak`;
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

// Bir birlesim sayfasindan (Son Tutanak ya da Tutanak?Id=...) ham tutanagin adresini ve kunyesini cikar.
// Sayfa UTF-8.
export async function tutanakAdresi(sayfa = SON_TUTANAK) {
  const $ = cheerio.load((await getBuffer(sayfa)).toString("utf8"));
  let url = null;
  $("a[href*='/Tutanak/'][href$='.html']").each((_, a) => { if (!url) url = $(a).attr("href"); });
  if (!url) throw new Error(`Tutanak sayfasinda ham tutanak baglantisi bulunamadi: ${sayfa}`);
  const m = url.match(/\/Tutanak\/(\d+)\/(\d+)\/(\d+)\//);
  if (!m) throw new Error(`Tutanak adresinden donem/yil/birlesim okunamadi: ${url}`);
  return { url, donem: Number(m[1]), yasamaYili: Number(m[2]), birlesim: Number(m[3]) };
}
export const sonTutanakAdresi = () => tutanakAdresi(SON_TUTANAK);

// Son k birlesimin tutanak adresleri, eskiden yeniye.
// GitHub Actions kosulari seyrek ve duzensiz; Genel Kurul ardisik gunlerde toplaninca
// yalnizca "son tutanak"a bakmak aradaki birlesimi kacirir. Liste sayfasindan son k
// birlesim alinir. TUTANAK_URL verilmisse (test) yalnizca o sayfa kullanilir.
export async function sonBirlesimler(k = 4) {
  if (process.env.TUTANAK_URL) return [await tutanakAdresi(process.env.TUTANAK_URL)];
  const son = await sonTutanakAdresi();
  const sayfalar = [];
  try {
    const liste = `${BASE}/Tutanaklar/DoneminTutanakMetinleri?Donem=${son.donem}&YasamaYili=${son.yasamaYili}`;
    const $ = cheerio.load((await getBuffer(liste)).toString("utf8"));
    $("tr").each((_, tr) => {
      const no = ($(tr).text().match(/(\d+)\s*\.\s*Birleşim/) || [])[1];
      const href = $(tr).find("a[href*='Tutanaklar/Tutanak?Id=']").first().attr("href");
      if (no && href) sayfalar.push({ birlesim: Number(no), sayfa: href.startsWith("http") ? href : BASE + href });
    });
    if (!sayfalar.length) throw new Error("birlesim satiri yok");
  } catch (e) {
    console.warn(`Birleşim listesi okunamadı (${e.message}); yalnızca son tutanak kullanılacak.`);
    return [son];
  }
  sayfalar.sort((a, b) => a.birlesim - b.birlesim);
  const out = [];
  for (const s of sayfalar.slice(-k)) {
    if (s.birlesim === son.birlesim) { out.push(son); continue; }
    try { out.push(await tutanakAdresi(s.sayfa)); }
    catch (e) { console.warn(`${s.birlesim}. Birleşim atlandı: ${e.message}`); }
  }
  return out;
}

// Oylama basladi: "Öneriyi oylarınıza sunuyorum" ya da "<Parti> grup önerisini oylarınıza sunuyorum".
// "Önergeyi oylarınıza sunuyorum" (kanun teklifi degisiklik onergeleri) kapsam disi.
const OY_BASLA_RE = /(Öneriyi|grup önerisini) oylarınıza sunuyorum/g;
// Sonuc: "Kabul edilmemiştir" / "Öneri kabul edilmemiştir" / "öneri kabul edilmiştir"
const OY_SONUC_RE = /[Kk]abul edil(me)?miştir/;
// Sonuc arama penceresinin sinirlari: baska bir oylama, yeni bir oneri ya da 1200 karakter
const OY_SINIR_RE = /oylarınıza sun|Öneri\s*:/g;
const GRUP_RE = /((?:[A-ZÇĞİÖŞÜ][\p{L}'’]*|ve)(?:\s+(?:[A-ZÇĞİÖŞÜ][\p{L}'’]*|ve))*)\s+(?:Grubunun|Grubu adına)\s+İç Tüzük/gu;
const ONERI_RE = /Öneri\s*:/g;

function temizleGrup(s) {
  return s.replace(/^(Sayın|Şimdi|Ayrıca|Evet|Buyurun)[,]?\s+/i, "").trim() + " Grubu";
}

function temizleAmac(s) {
  let t = s.replace(/\s+/g, " ").trim();
  // Bastaki kayit numarasi kaliplari: "19972 grup numarali", "(20327) grup numarali",
  // "(20678 grup numarali)", "(1963 sira no.lu)", "1963 sira no.lu", "-219 sira no.lu-"
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/^verilen\s+/i, "")
      .replace(/^-?\(?\s*\d+\s*\)?\s*(grup numaralı|sıra no\.?\s*lu)\s*\)?\s*-?\s*/i, "")
      .replace(/^[,;]\s*/, "")
      .trim();
  }
  // Tutanak amaci tirnak icine almissa tirnaklari at; gonderi metni zaten tirnakliyor
  t = t.replace(/^["“”']+\s*/, "").replace(/\s*["“”']+$/, "").trim();
  return t;
}

// Amac metni: "<verenler> tarafından/Milletvekilinin, <AMAC> amacıyla" kalibi.
// Verenlerin adi metne sizmasin diye birden cok capa denenir, en sagdaki kullanilir.
// "tarafından, ..." (virgullu) da sik gorulur.
const CAPALAR = [
  /tarafından[,]?\s+/gi,
  /Milletvekilin(in|ce),\s+/gi,
  /Milletvekill?erinin,\s+/gi,
  /['’](n?in|nın|ın|un|ün)[,]?\s+/gi,
];
function amacCikar(blok) {
  const a = blok.lastIndexOf(" amacıyla");
  if (a < 0) return null;
  const once = blok.slice(0, a);
  let en = -1;
  for (const re of CAPALAR) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(once)) !== null) en = Math.max(en, m.index + m[0].length);
  }
  return temizleAmac(en > 0 ? once.slice(en) : once);
}

// Oylama basladiktan sonra sonucu bul; pencere bir sonraki oylama/oneriye ya da 1200 karaktere kadar
function sonucBul(t, bas) {
  OY_SINIR_RE.lastIndex = bas;
  const sinir = OY_SINIR_RE.exec(t);
  const son = Math.min(sinir ? sinir.index : t.length, bas + 1200);
  const m = t.slice(bas, son).match(OY_SONUC_RE);
  if (!m) return null;
  return m[1] ? "Kabul edilmemiştir" : "Kabul edilmiştir";
}

// Bir birlesimin tutanagindaki onerge oylamalari
export async function oylamalariCikar(tutanak) {
  const t = metin(await getBuffer(tutanak.url));
  if (t.length < 2000) {
    // Toplanamayip bir dakikada kapanan birlesimler (Divan tesekkul etmedi vb.) kisa ama gercek.
    if (!/BAŞKAN/.test(t)) throw new Error("Ham tutanak beklenenden kisa ve tanınmıyor; yapi degismis olabilir");
    console.log(`${tutanak.birlesim}. Birleşim kısa (${t.length} karakter); oylama yok.`);
    return [];
  }

  // Olaylari belge sirasina gore topla
  const olaylar = [];
  for (const re of [GRUP_RE, ONERI_RE, OY_BASLA_RE]) re.lastIndex = 0;
  let m;
  while ((m = GRUP_RE.exec(t)) !== null) olaylar.push({ tip: "grup", i: m.index, ad: temizleGrup(m[1]) });
  while ((m = ONERI_RE.exec(t)) !== null) olaylar.push({ tip: "oneri", i: m.index + m[0].length });
  while ((m = OY_BASLA_RE.exec(t)) !== null) olaylar.push({ tip: "oy", i: m.index, sonuc: sonucBul(t, m.index + m[0].length) });
  olaylar.sort((a, b) => a.i - b.i);

  const out = [];
  let grup = null, oneri = null;
  for (const o of olaylar) {
    if (o.tip === "grup") grup = o.ad;
    else if (o.tip === "oneri") oneri = { i: o.i, grup };
    else if (o.tip === "oy" && oneri) {
      if (!o.sonuc) continue; // sonuc yok (karar yeter sayisi bulunamadi vb.); oneri bekler
      const son = t.indexOf("önerilmiştir.", oneri.i);
      const blok = (son > oneri.i ? t.slice(oneri.i, son + 13) : t.slice(oneri.i, oneri.i + 1200)).trim();
      oneri = null;

      // Kapsam: denetim onergelerinin (Meclis arastirmasi, genel gorusme, Meclis
      // sorusturmasi) one alinmasi — onerge botuyla ayni turler. Gundem ve calisma
      // duzeni onerileri (kanun teklifi siralamasi vb.) alinmaz.
      const tur = /Meclis soruşturma(sı)? önerge/i.test(blok) ? "Meclis soruşturması önergesi"
        : /genel görüşme önerge/i.test(blok) ? "genel görüşme önergesi"
        : /Meclis araştırma(sı)? önerge/i.test(blok) ? "Meclis araştırması önergesi"
        : null;
      if (!tur) continue;

      const amac = amacCikar(blok);
      if (!amac || amac.length < 20) continue;

      out.push({
        sonuc: o.sonuc === "Kabul edilmiştir" ? "KABUL EDİLDİ" : "REDDEDİLDİ",
        isaret: o.sonuc === "Kabul edilmiştir" ? "✅" : "❌",
        grup: grup || null,
        tur,
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
