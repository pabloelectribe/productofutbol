// Recolecta respuestas de hilos de Reddit que preguntan por "el mejor partido".
//
//   node scraper/reddit.mjs                 (usa el archivo público Arctic Shift)
//   node scraper/reddit.mjs --backend reddit (usa la API JSON pública de Reddit)
//
// Dominios necesarios: arctic-shift.photon-reddit.com  (o  www.reddit.com)
import { writeFile, mkdir } from "node:fs/promises";
import { getJSON, tally, isElicitation, ELICITATION } from "./lib.mjs";

// cc: país de la comunidad (para el sesgo endogrupal); null si es internacional
const SUBS = [
  { sub: "soccer", lang: "en", cc: null }, { sub: "football", lang: "en", cc: null }, { sub: "PremierLeague", lang: "en", cc: "ENG" },
  { sub: "futbol", lang: "es", cc: null }, { sub: "argentina", lang: "es", cc: "ARG" }, { sub: "LigaMX", lang: "es", cc: "MEX" },
  { sub: "futebol", lang: "pt", cc: "BRA" }, { sub: "calcio", lang: "it", cc: "ITA" },
];
const MAX_THREADS = 25, MAX_COMMENTS = 500;

const backend = process.argv.includes("--backend") ? process.argv[process.argv.indexOf("--backend") + 1] : "arctic";

const api = {
  arctic: {
    async threads(sub, q) {
      const u = `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${sub}&title=${encodeURIComponent(q)}&limit=100&sort=desc`;
      const j = await getJSON(u);
      return (j.data || []).map(p => ({ id: p.id, title: p.title, num_comments: p.num_comments, created: p.created_utc }));
    },
    async comments(id) {
      const out = [];
      let after = 0;
      while (out.length < MAX_COMMENTS) {
        const u = `https://arctic-shift.photon-reddit.com/api/comments/search?link_id=${id}&limit=100&sort=asc${after ? `&after=${after}` : ""}`;
        const j = await getJSON(u);
        const batch = j.data || [];
        if (!batch.length) break;
        out.push(...batch.map(c => ({ author: c.author, text: c.body, score: c.score, url: `https://www.reddit.com${c.permalink || `/comments/${id}/_/${c.id}`}` })));
        after = batch.at(-1).created_utc;
        if (batch.length < 100) break;
      }
      return out;
    },
  },
  reddit: {
    async threads(sub, q) {
      const u = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(`"${q}"`)}&restrict_sr=1&limit=100&sort=relevance&t=all`;
      const j = await getJSON(u);
      return (j.data?.children || []).map(c => c.data).map(p => ({ id: p.id, title: p.title, num_comments: p.num_comments, created: p.created_utc }));
    },
    async comments(id) {
      const j = await getJSON(`https://www.reddit.com/comments/${id}.json?limit=${MAX_COMMENTS}&depth=3`);
      const out = [];
      const walk = (nodes) => (nodes || []).forEach(n => {
        const d = n.data; if (!d || n.kind !== "t1") return;
        out.push({ author: d.author, text: d.body, score: d.score, url: `https://www.reddit.com${d.permalink}` });
        walk(d.replies?.data?.children);
      });
      walk(j[1]?.data?.children);
      return out;
    },
  },
}[backend];

const sources = [];
for (const { sub, lang, cc } of SUBS) {
  const queries = [...ELICITATION[lang], ...(lang !== "en" ? ELICITATION.en.slice(0, 4) : [])];
  const threads = new Map();
  for (const q of queries) {
    try {
      for (const t of await api.threads(sub, q)) if (isElicitation(t.title) && t.num_comments >= 10) threads.set(t.id, t);
    } catch (e) { console.warn(`r/${sub} "${q}": ${e.message}`); }
  }
  const chosen = [...threads.values()].sort((a, b) => b.num_comments - a.num_comments).slice(0, MAX_THREADS);
  const items = [];
  for (const t of chosen) {
    try { items.push(...await api.comments(t.id)); } catch (e) { console.warn(`hilo ${t.id}: ${e.message}`); }
  }
  const { authors, results } = tally(items);
  console.log(`r/${sub}: ${chosen.length} hilos · ${items.length} comentarios · ${authors} autores con menciones`);
  sources.push({
    id: `reddit-${sub.toLowerCase()}`, platform: "Reddit", name: `r/${sub}`, lang, cc, url: `https://www.reddit.com/r/${sub}/`,
    threads: chosen.map(t => ({ id: t.id, title: t.title, comments: t.num_comments, year: new Date(t.created * 1000).getUTCFullYear() })),
    comments: items.length, authors, results,
  });
}

await mkdir("data/scraped", { recursive: true });
await writeFile("data/scraped/reddit.json", JSON.stringify({ collectedAt: new Date().toISOString(), backend, sources }, null, 2));
console.log("→ data/scraped/reddit.json");
