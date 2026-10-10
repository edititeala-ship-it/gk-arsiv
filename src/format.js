// Kural: tek kelime bile bizim değil. TBMM özeti aynen, altına künye.
// Sıfat, yorum, etiket yok. Başlıktaki tür adı Gelen Kâğıt'taki bölüm başlığından gelir.

export function formatOnerge(o) {
  return [
    `${o.tip} (${o.esasNo})`,
    ``,
    o.ozet,
    ``,
    `Başkanlığa geliş: ${o.gelisTarihi}`,
    `Gelen Kâğıtlar No. ${o.gelenKagitNo} · ${o.gelenKagitTarihi}`,
    `Kaynak: TBMM`,
  ].join("\n");
}

// Genel Kurul oylamasi. Metnin tamami tutanaktan; basliktaki REDDEDİLDİ/KABUL EDİLDİ
// tutanaktaki "Kabul edilmemiştir"/"Kabul edilmiştir" ifadesinin karsiligidir.
export function formatOylama(o) {
  const kunye = `${o.tarih || ""} · ${o.donem}. Dönem ${o.yasamaYili}. Yasama Yılı, ${o.birlesim}. Birleşim`.trim();
  return [
    `${o.isaret} ${o.sonuc}`,
    ``,
    `${o.grup ? o.grup + ", bir" : "Bir"} Meclis araştırması önergesinin Genel Kurul'da öncelikle görüşülmesini istedi:`,
    ``,
    `"${o.amac}"`,
    ``,
    `Oylandı, ${o.sonuc === "KABUL EDİLDİ" ? "kabul edildi" : "kabul edilmedi"}.`,
    ``,
    kunye.replace(/^ · /, ""),
    `Kaynak: TBMM Genel Kurul tutanağı`,
  ].join("\n");
}
