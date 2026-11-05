// Recolecta respuestas de hilos de Reddit que preguntan por "el mejor partido".
//
//   node scraper/reddit.mjs                  (archivo público Arctic Shift — recomendado)
//   node scraper/reddit.mjs --backend reddit (API JSON pública de Reddit, más limitada)
//
// Dominios necesarios: arctic-shift.photon-reddit.com  (o  www.reddit.com)
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { getJSON, tally, isElicitation, SEARCH, sleep } from "./lib.mjs";

// cc: país de la comunidad (para el sesgo endogrupal); null si es internacional
const SUBS = [
  { sub: "soccer", lang: "en", cc: null }, { sub: "football", lang: "en", cc: null },
  { sub: "PremierLeague", lang: "en", cc: "ENG" }, { sub: "footballhighlights", lang: "en", cc: null },
  { sub: "futbol", lang: "es", cc: null }, { sub: "argentina", lang: "es", cc: "ARG" }, { sub: "LigaMX", lang: "es", cc: "MEX" },
  { sub: "futebol", lang: "pt", cc: "BRA" }, { sub: "calcio", lang: "it", cc: "ITA" },
];
const MAX_THREADS = 40, MAX_COMMENTS = 1500, MIN_COMMENTS = 10;
const backend = process.argv.includes("--backend") ? process.argv[process.argv.indexOf("--backend") + 1] : "arctic";
// --retally: vuelve a analizar con el caché local (data/scraped/raw/), sin pedir nada a la red.
// El caché guarda textos de usuarios: no se sube al repositorio (.gitignore).
const RETALLY = process.argv.includes("--retally");
const RAW = "data/scraped/raw/reddit";
const cacheRead = async (f) => { try { return JSON.parse(await readFile(`${RAW}/${f}`, "utf8")); } catch { return null; } };
const cacheWrite = async (f, data) => { await mkdir(RAW, { recursive: true }); await writeFile(`${RAW}/${f}`, JSON.stringify(data)); };
const only = process.argv.includes("--sub") ? process.argv[process.argv.indexOf("--sub") + 1] : null;

const A = "https://arctic-shift.photon-reddit.com/api";
const post = (p) => ({ id: p.id, title: p.title, num_comments: p.num_comments, created: p.created_utc });

// Arctic Shift rechaza con HTTP 422 ("slow down") las búsquedas por título con
// rango de fechas en subreddits grandes, y también cuando se pregunta muy seguido.
// Por eso: una búsqueda por frase sobre todo el período, con pausas y reintentos.
async function arcticSearch(sub, q) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const j = await getJSON(`${A}/posts/search?subreddit=${sub}&title=${encodeURIComponent(q)}&limit=100`, { delay: 5000, allow: [422] });
    if (j.data) return j.data.map(post);
    await sleep(15000 * (attempt + 1));
  }
  console.warn(`  sin respuesta: r/${sub} "${q}"`);
  return [];
}

const api = {
  arctic: {
    threads: arcticSearch,
    async comments(id) {
      const out = [];
      let after = 0, fails = 0;
      while (out.length < MAX_COMMENTS && fails < 4) {
        const j = await getJSON(`${A}/comments/search?link_id=${id}&limit=100${after ? `&after=${after}` : ""}`, { delay: 2500, allow: [422] });
        if (!j.data) { fails++; await sleep(15000); continue; }
        const batch = j.data || [];
        if (!batch.length) break;
        out.push(...batch.map(c => ({
          author: c.author, text: c.body, score: c.score, flair: c.author_flair_text || null,
          url: `https://www.reddit.com${c.permalink || `/comments/${id}/_/${c.id}`}`,
        })));
        const last = Math.max(...batch.map(c => c.created_utc));
        if (batch.length < 100 || last <= after) break;
        after = last;
      }
      return out;
    },
  },
  reddit: {
    async threads(sub, q) {
      const j = await getJSON(`https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(`"${q}"`)}&restrict_sr=1&limit=100&sort=relevance&t=all`);
      return (j.data?.children || []).map(c => post(c.data));
    },
    async comments(id) {
      const j = await getJSON(`https://www.reddit.com/comments/${id}.json?limit=${MAX_COMMENTS}&depth=3`);
      const out = [];
      const walk = (nodes) => (nodes || []).forEach(n => {
        const d = n.data; if (!d || n.kind !== "t1") return;
        out.push({ author: d.author, text: d.body, score: d.score, flair: d.author_flair_text || null, url: `https://www.reddit.com${d.permalink}` });
        walk(d.replies?.data?.children);
      });
      walk(j[1]?.data?.children);
      return out;
    },
  },
}[backend];

const sources = [];
for (const { sub, lang, cc } of SUBS.filter(s => !only || s.sub === only)) {
  const queries = [...new Set([...SEARCH[lang], ...SEARCH.en.slice(0, 4)])];
  // todos los hilos encontrados (antes de filtrar) quedan en caché para poder re-filtrar
  let found = RETALLY ? await cacheRead(`${sub}-threads.json`) : null;
  if (!found) {
    const all = new Map();
    for (const q of queries) {
      try { for (const t of await api.threads(sub, q)) all.set(t.id, t); }
      catch (e) { console.warn(`r/${sub} "${q}": ${e.message}`); }
    }
    found = [...all.values()];
    const prev = await cacheRead(`${sub}-threads.json`) || [];
    const merged = new Map([...prev, ...found].map(t => [t.id, t]));
    found = [...merged.values()];
    await cacheWrite(`${sub}-threads.json`, found);
  }
  const threads = new Map();
  for (const t of found) if (isElicitation(t.title) && t.num_comments >= MIN_COMMENTS) threads.set(t.id, t);
  const chosen = [...threads.values()].sort((a, b) => b.num_comments - a.num_comments).slice(0, MAX_THREADS);
  console.log(`r/${sub}: ${chosen.length} hilos que preguntan por el mejor partido`);
  const items = [];
  for (const t of chosen) {
    let cs = await cacheRead(`${t.id}.json`);
    if (!cs && !RETALLY) {
      try { cs = await api.comments(t.id); await cacheWrite(`${t.id}.json`, cs); }
      catch (e) { console.warn(`  hilo ${t.id}: ${e.message}`); }
    }
    items.push(...(cs || []));
  }
  const { authors, results, candidates } = tally(items);
  console.log(`  ${items.length} comentarios · ${authors} personas nombran un partido del catálogo · ${candidates.length} candidatos nuevos`);
  sources.push({
    id: `reddit-${sub.toLowerCase()}`, platform: "Reddit", name: `r/${sub}`, lang, cc, url: `https://www.reddit.com/r/${sub}/`,
    threads: chosen.map(t => ({ id: t.id, title: t.title, comments: t.num_comments, year: new Date(t.created * 1000).getUTCFullYear() })),
    comments: items.length, authors, results, candidates,
  });
}

await mkdir("data/scraped", { recursive: true });
const file = only ? `data/scraped/reddit-${only}.json` : "data/scraped/reddit.json";
await writeFile(file, JSON.stringify({ collectedAt: new Date().toISOString(), backend, sources }, null, 2));
console.log(`→ ${file}`);
