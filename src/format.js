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
