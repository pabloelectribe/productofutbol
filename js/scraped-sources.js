// Convierte lo recolectado por los scrapers (data/scraped.js) en fuentes del ranking.
//
// Cada comunidad (un subreddit, un idioma de Bluesky) es UNA fuente de la voz
// popular, con su propio ranking: los partidos ordenados por votos ponderados.
// Sólo entran partidos nombrados por al menos MIN_AUTHORS personas distintas:
// una sola persona no es una comunidad (ley de los pequeños números).
export const MIN_AUTHORS = 3;

export function conversationSources(scraped, minAuthors = MIN_AUTHORS) {
  return (scraped?.conversation || []).map(s => {
    const ranked = s.results.filter(r => r.authors >= minAuthors);
    return {
      id: s.id, cc: s.cc ?? null, year: s.collectedAt ? Number(s.collectedAt.slice(0, 4)) : null,
      name: `${s.name} — respuestas a "¿cuál es el mejor partido?" (${s.authors} personas)`,
      outlet: s.name, url: s.url, lang: s.lang, country: s.cc ? s.cc : "Internacional",
      type: "conversacion", scope: "todo", size: ranked.length || null, ranked: true,
      accessed: s.collectedAt?.slice(0, 10), scraped: true,
      note: `${s.platform}: ${s.threads ? s.threads.length + " hilos, " : ""}${s.comments} mensajes, ${s.authors} autores que nombran algún partido. Cada persona reparte un voto entre los partidos que nombra.`,
      mentions: ranked.map((r, i) => ({
        match: r.match, rank: i + 1,
        quote: `${r.authors} personas lo nombraron (${r.votes} votos ponderados). Ej.: “${(r.quotes[0]?.text || "").replace(/\s+/g, " ").slice(0, 140)}”`,
      })),
    };
  }).filter(s => s.mentions.length);
}

// Memoria colectiva: 0..1 según log10 de la mediana de visitas mensuales en Wikipedia (inglés).
export function memoryScores(scraped) {
  const m = scraped?.memory?.matches || {};
  const logs = Object.fromEntries(Object.entries(m).filter(([, v]) => v.medianMonthly > 0).map(([id, v]) => [id, Math.log10(v.medianMonthly)]));
  const max = Math.max(...Object.values(logs), 1e-9);
  return Object.fromEntries(Object.entries(logs).map(([id, v]) => [id, { score: v / max, views: m[id].medianMonthly, langs: m[id].langs }]));
}
