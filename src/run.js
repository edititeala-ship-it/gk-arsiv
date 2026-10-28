// Akış:
//  1. state.json oku (hangi Gelen Kâğıt'lar bitti, hangi esas no'lar atıldı)
//  2. Mevcut yasama yılının listesini çek, bitmemiş kâğıtları eskiden yeniye sırala
//  3. Her birinden izlenen önergeleri çıkar, atılmamışları tek kuyruğa koy
//  4. Günlük hedefe göre sırayla, aralıklı at (hepsi, seçim yok; sadece hız ayarı)
//  5. state.json güncelle (Actions bunu commit eder)
//
// Gelen Kâğıt numaraları her yasama yılında 1'den yeniden başlar. Bu yüzden
// "numarası şundan büyük olanlar" diye filtrelenmez — bitmiş kâğıtlar kendi
// URL'leriyle kaydedilir. Mükerrer gönderi kontrolü esas no (10/xxxx) ile yapılır.
//
// Hız (günlük yayma):
// Önergeler Gelen Kâğıt'a haftada bir, pazartesi, yığın hâlinde düşüyor (12 Ekim 2026:
// 105, 19 Ekim: 77). Koşu başına sabit sınırla yığın 3 günde bitiyor, haftanın kalan
// günlerinde hesap susuyordu. Şimdi: bekleyen önerge sayısı, bir sonraki pazartesiye
// kalan gün sayısına bölünür → günlük hedef. Gün içinde de hedef saate orantılı
// açılır (07:00-23:00 TRT), böylece gönderiler sabah tek seferde değil güne yayılır.
// Koşular düzensiz olduğu için (GitHub cron'u seyrek çalıştırıyor) geç saatteki bir
// koşu günün kalan payını tek başına atabilir; o yüzden koşu başına sınır gevşek.

import fs from "node:fs";
import { fetchGelenKagitList, fetchOnergeler } from "./tbmm.js";
import { formatOnerge } from "./format.js";
import { post } from "./x.js";

const STATE_FILE = process.env.STATE_FILE || "state.json";
const DRY = process.env.DRY_RUN === "1";
const MAX_POSTS_PER_RUN = Number(process.env.MAX_POSTS_PER_RUN || 20); // güvenlik sınırı
const MAX_POSTS_PER_DAY = Number(process.env.MAX_POSTS_PER_DAY || 40); // spam görünümüne karşı tavan
const GAP_MS = Number(process.env.POST_GAP_SECONDS || 120) * 1000;
const GUN_BASI = Number(process.env.GUN_BASI_SAAT || 7);   // TRT, gönderi penceresi başı
// Pencere sonu 20:00: günün son koşusu çoğu gün 20:17 TRT'de düşüyor (cron 19:17 UTC
// + gecikme). Hedefin tamamı o koşuya kadar açılmış olmalı ki gün sonunda pay artmasın.
const GUN_SONU = Number(process.env.GUN_SONU_SAAT || 20);  // TRT, hedefin %100 açıldığı saat
const TZ = "Europe/Istanbul";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadState() {
  const s = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
  s.posted ??= {};
  s.bitenKagitlar ??= {}; // url -> { no, date, at }
  s.gunluk ??= { tarih: null, sayi: 0 }; // o günkü (TRT) gönderi sayacı
  return s;
}
function saveState(s) {
  if (DRY) return; // deneme koşusu state'e dokunmaz
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
}

// Türkiye saatiyle tarih, saat (ondalık) ve haftanın günü (0 = Pazar)
export function trtSimdi(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  const gunler = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    tarih: `${p.year}-${p.month}-${p.day}`,
    saat: (Number(p.hour) % 24) + Number(p.minute) / 60,
    gun: gunler[p.weekday],
  };
}

// Bugün dâhil, bir sonraki pazartesiye kadar kaç gün var (Pzt: 7 ... Paz: 1)
export const pazartesiyeGun = (gun) => ((8 - gun) % 7) || 7;

// Bu koşuda kaç gönderi atılabilir.
// Günlük hedef gün başındaki yığına göre hesaplanır (bekleyen + bugün atılan); yalnızca
// kalana bakılsaydı hedef gün içinde küçülür, günün sonunda pay artardı.
export function kosuPayi(bekleyen, bugunAtilan, simdi) {
  const gunSayisi = pazartesiyeGun(simdi.gun);
  const gunlukHedef = Math.min(MAX_POSTS_PER_DAY, Math.ceil((bekleyen + bugunAtilan) / gunSayisi));
  const oran = Math.min(1, Math.max(0, (simdi.saat - GUN_BASI) / (GUN_SONU - GUN_BASI)));
  const izin = Math.ceil(gunlukHedef * oran);
  const pay = Math.max(0, Math.min(MAX_POSTS_PER_RUN, izin - bugunAtilan, bekleyen));
  return { gunSayisi, gunlukHedef, izin, pay };
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

  const bitti = (kagit) => {
    state.bitenKagitlar[kagit.url] = { no: kagit.no, date: kagit.date, at: new Date().toISOString() };
  };

  // Kuyruk: bütün bekleyen kâğıtların atılmamış önergeleri, kâğıt ve sayfa sırasıyla
  const kuyruk = [];
  const kalanSayisi = new Map(); // kagit.url -> o kâğıttan daha kaç önerge bekliyor
  for (const kagit of pending) {
    const onergeler = await fetchOnergeler(kagit);
    const kalan = onergeler.filter((o) => !state.posted[o.esasNo]);
    const dagilim = onergeler.reduce((a, o) => ((a[o.tip] = (a[o.tip] || 0) + 1), a), {});
    console.log(`No. ${kagit.no} (${kagit.date}): ${onergeler.length} önerge (${Object.entries(dagilim).map(([k, v]) => k + ": " + v).join(", ") || "-"}), ${kalan.length} atılmamış`);
    if (!kalan.length) { bitti(kagit); continue; }
    kalanSayisi.set(kagit.url, kalan.length);
    for (const o of kalan) kuyruk.push({ kagit, o });
  }
  saveState(state);

  const simdi = trtSimdi();
  if (state.gunluk.tarih !== simdi.tarih) state.gunluk = { tarih: simdi.tarih, sayi: 0 };
  const { gunSayisi, gunlukHedef, izin, pay } = kosuPayi(kuyruk.length, state.gunluk.sayi, simdi);
  console.log(
    `Bekleyen ${kuyruk.length} önerge, pazartesiye ${gunSayisi} gün → günlük hedef ${gunlukHedef}. ` +
    `TRT ${simdi.saat.toFixed(1)} itibarıyla izin ${izin}, bugün atılan ${state.gunluk.sayi}, bu koşu ${pay}.`
  );

  let postedNow = 0;
  for (const { kagit, o } of kuyruk) {
    if (postedNow >= pay) break;
    const text = formatOnerge(o);
    try {
      const id = await post(text);
      state.posted[o.esasNo] = { id, at: new Date().toISOString(), kagit: kagit.no };
      state.gunluk.sayi++;
      postedNow++;
      kalanSayisi.set(kagit.url, kalanSayisi.get(kagit.url) - 1);
      if (kalanSayisi.get(kagit.url) === 0) bitti(kagit); // kâğıdın tamamı atıldı
      saveState(state);
      console.log(`Atıldı: ${o.esasNo} → ${id}`);
    } catch (err) {
      console.error(`HATA ${o.esasNo}:`, err?.data || err?.message || err);
      saveState(state);
      throw err; // Actions kırmızı olsun, log görülsün
    }
    if (postedNow < pay) await sleep(GAP_MS);
  }
  const kalanToplam = kuyruk.length - postedNow;
  console.log(`Bitti. Bu koşuda ${postedNow} gönderi, bugün toplam ${state.gunluk.sayi}, kuyrukta ${kalanToplam}.`);
}

// Dogrudan calistirilinca main; test icin import edilince calismaz
if (process.argv[1] && /[\\/]run\.js$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
