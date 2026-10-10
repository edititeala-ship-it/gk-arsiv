// Kural: tek kelime bile bizim değil. TBMM özeti aynen, altına künye.
// Sıfat, yorum, etiket yok. Tür adı Gelen Kâğıt'taki bölüm başlığından gelir.
//
// Özet en üstte: akışta pratikte yalnızca ilk satır okunuyor. Künye üstteyken
// bütün gönderiler aynı satırla başlıyor ve birbirinin aynı görünüyordu.

export function formatOnerge(o) {
  return [
    o.ozet,
    ``,
    `${o.tip} · ${o.esasNo}`,
    `Başkanlığa geliş: ${o.gelisTarihi} · Gelen Kâğıtlar No. ${o.gelenKagitNo} (${o.gelenKagitTarihi})`,
    `Kaynak: TBMM`,
  ].join("\n");
}

// Genel Kurul oylaması. Metnin tamamı tutanaktan; başlıktaki REDDEDİLDİ/KABUL EDİLDİ
// ve yanındaki işaret, tutanaktaki "Kabul edilmemiştir"/"Kabul edilmiştir"in karşılığıdır.
export function formatOylama(o) {
  const kunye = `${o.tarih || ""} · ${o.donem}. Dönem ${o.yasamaYili}. Yasama Yılı, ${o.birlesim}. Birleşim`.replace(/^ · /, "");
  return [
    `${o.isaret} ${o.sonuc}`,
    ``,
    `${o.grup ? o.grup + ", bir" : "Bir"} Meclis araştırması önergesinin Genel Kurul'da öncelikle görüşülmesini istedi:`,
    ``,
    `"${o.amac}"`,
    ``,
    `Oylandı, ${o.sonuc === "KABUL EDİLDİ" ? "kabul edildi" : "kabul edilmedi"}.`,
    ``,
    kunye,
    `Kaynak: TBMM Genel Kurul tutanağı`,
  ].join("\n");
}
