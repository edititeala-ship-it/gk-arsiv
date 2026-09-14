// Kural: tek kelime bile bizim değil. TBMM özeti aynen, altına künye.
// Sıfat, yorum, etiket yok.

export function formatOnerge(o) {
  return [
    `Meclis araştırması önergesi (${o.esasNo})`,
    ``,
    o.ozet,
    ``,
    `Başkanlığa geliş: ${o.gelisTarihi}`,
    `Gelen Kâğıtlar No. ${o.gelenKagitNo} · ${o.gelenKagitTarihi}`,
    `Kaynak: TBMM`,
  ].join("\n");
}
