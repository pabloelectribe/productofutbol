// Memoria colectiva: visitas a los artículos de Wikipedia de cada partido.
//
//   node scraper/wikipedia.mjs
//
// Se usa la mediana de visitas mensuales de los últimos 36 meses (la mediana
// evita que un aniversario o un documental inflen el número). Es una medida de
// atención sostenida, no de valoración: un partido puede ser recordado por
// trágico o polémico. Por eso entra como señal aparte y con peso 0 por defecto.
//
// Dominios necesarios: *.wikipedia.org, wikimedia.org
import { writeFile, mkdir } from "node:fs/promises";
import { aliases } from "../data/aliases.js";
import { getJSON, normalize } from "./lib.mjs";

const end = new Date(); end.setUTCDate(1);
const start = new Date(end); start.setUTCMonth(start.getUTCMonth() - 36);
const ym = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}01`;

async function resolve(lang, title) {
  const base = `https://${lang}.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*`;
  const j = await getJSON(`${base}&action=query&redirects=1&titles=${encodeURIComponent(title)}`, { delay: 1500, retries: 5 });
  const page = j.query?.pages?.[0];
  if (page && !page.missing) return { title: page.title, how: j.query.redirects ? "redirección" : "exacto" };
  const s = await getJSON(`${base}&action=query&list=search&srlimit=1&srsearch=${encodeURIComponent(title)}`, { delay: 1500, retries: 5 });
  const hit = s.query?.search?.[0];
  return hit ? { title: hit.title, how: "búsqueda (revisar)" } : null;
}

// El título es específico si nombra a algún equipo del partido o una de sus frases.
const specific = (id, title) => {
  const t = normalize(title), a = aliases[id];
  return [...a.teams.flat(), ...a.phrases].some(w => t.includes(normalize(w)));
};

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

const out = {};
for (const [id, a] of Object.entries(aliases)) {
  const langs = {};
  for (const [lang, title] of Object.entries(a.wiki || {})) {
    try {
      const r = await resolve(lang, title);
      if (!r) continue;
      // Validez: una redirección o búsqueda que cae en un artículo general
      // (p. ej. "fase eliminatoria 2018-19") no mide la atención a ESE partido.
      if (r.how !== "exacto" && !specific(id, r.title)) {
        console.warn(`${id} [${lang}] descartado: "${title}" lleva a "${r.title}", que no es específico del partido`);
        continue;
      }
      const art = encodeURIComponent(r.title.replace(/ /g, "_"));
      const j = await getJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${art}/monthly/${ym(start)}/${ym(end)}`, { delay: 1500, retries: 5 });
      const views = (j.items || []).map(x => x.views);
      langs[lang] = { title: r.title, resolvedBy: r.how, months: views.length, medianMonthly: median(views) };
      console.log(`${id} [${lang}] ${r.title}: ${langs[lang].medianMonthly}/mes (${r.how})`);
    } catch (e) { console.warn(`${id} [${lang}]: ${e.message}`); }
  }
  // Para comparar partidos se usa sólo Wikipedia en inglés (todos los artículos en
  // la misma escala); los demás idiomas quedan registrados como referencia.
  if (Object.keys(langs).length) out[id] = { langs, medianMonthly: langs.en?.medianMonthly ?? null };
}

await mkdir("data/scraped", { recursive: true });
await writeFile("data/scraped/wikipedia.json", JSON.stringify({ collectedAt: new Date().toISOString(), window: [ym(start), ym(end)], matches: out }, null, 2));
console.log("→ data/scraped/wikipedia.json");
