// Utilidades compartidas por los scrapers. Sin dependencias externas (Node 18+).
import { aliases } from "../data/aliases.js";

export const UA = "productofutbol-research/0.2 (ranking académico de partidos; contacto vía GitHub pabloelectribe/productofutbol)";

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// GET JSON con reintentos y pausa entre pedidos (scraping respetuoso).
export async function getJSON(url, { headers = {}, retries = 3, delay = 1100 } = {}) {
  for (let i = 0; i <= retries; i++) {
    await sleep(delay);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers } });
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * 2 ** i); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return await res.json();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(2000 * 2 ** i);
    }
  }
}

export const normalize = (s) => String(s || "")
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[–—]/g, "-")
  .replace(/(\d)\s*[x:]\s*(\d)/g, "$1-$2")   // 7x1, 3:3 → 7-1, 3-3
  .replace(/\s+/g, " ");

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (s) => new RegExp(`(^|[^a-z0-9])${esc(normalize(s))}($|[^a-z0-9])`);

const compiled = Object.entries(aliases).map(([id, a]) => ({
  id,
  phrases: a.phrases.map(word),
  teams: a.teams.map(list => list.map(word)),
  hints: a.hints.map(word),
}));

// Devuelve los ids de partidos mencionados en un texto.
export function detectMatches(text) {
  const t = normalize(text);
  const sentences = t.split(/(?<=[.!?\n;])\s+|\n+/);
  const found = new Set();
  for (const c of compiled) {
    if (c.phrases.some(re => re.test(t))) { found.add(c.id); continue; }
    for (const s of sentences) {
      const bothTeams = c.teams.every(list => list.some(re => re.test(s)));
      if (bothTeams && c.hints.some(re => re.test(s))) { found.add(c.id); break; }
    }
  }
  return [...found];
}

// Peso del respaldo social (upvotes/likes). Crece con el logaritmo y tiene techo:
// el primer voto positivo importa, el voto número 5.000 casi no agrega (efecto
// Mateo / herding: Salganik et al., 2006; Muchnik et al., 2013).
export const endorsement = (score) => Math.min(2, 1 + Math.log10(1 + Math.max(0, score || 0)) / 3);

// Cuentas que no son personas
export const isBot = (author) => !author || /^(automoderator|\[deleted\]|deleted|.*bot)$/i.test(author);

// Agrega "votos": cada autor reparte 1 voto entre los partidos que nombra
// (si nombra 4, cada uno recibe 1/4), multiplicado por el respaldo de su mensaje.
// Un autor que comenta varias veces no suma más: se queda su mensaje con más respaldo.
export function tally(items) {
  // items: [{ author, text, score, url }]
  const byAuthor = new Map();
  for (const it of items) {
    if (isBot(it.author)) continue;
    const found = detectMatches(it.text);
    if (!found.length) continue;
    const prev = byAuthor.get(it.author);
    if (!prev || (it.score || 0) > (prev.score || 0)) byAuthor.set(it.author, { ...it, found });
  }
  const res = new Map();
  for (const it of byAuthor.values()) {
    const share = endorsement(it.score) / it.found.length;
    for (const id of it.found) {
      const r = res.get(id) || { match: id, votes: 0, authors: 0, quotes: [] };
      r.votes += share; r.authors++;
      if (r.quotes.length < 3) r.quotes.push({ text: it.text.slice(0, 220), url: it.url, score: it.score ?? null });
      res.set(id, r);
    }
  }
  return {
    authors: byAuthor.size,
    results: [...res.values()].sort((a, b) => b.votes - a.votes).map(r => ({ ...r, votes: +r.votes.toFixed(3) })),
  };
}

// Preguntas que piden explícitamente "el mejor partido" (muestreo por elicitación):
// sólo se cuentan respuestas a estas preguntas, no la charla general.
export const ELICITATION = {
  en: ["best match ever", "greatest match ever", "best game ever", "greatest game ever", "best football match", "greatest football match", "best match you've ever watched", "best game you've ever seen", "greatest match of all time", "best match of all time"],
  es: ["mejor partido de la historia", "mejor partido que viste", "mejor partido de todos los tiempos", "partido mas epico"],
  pt: ["melhor jogo da historia", "maior jogo da historia", "melhor jogo que voce viu", "melhor partida da historia"],
  it: ["partita piu bella di sempre", "miglior partita di sempre", "partita piu bella della storia"],
};
export const isElicitation = (title) => Object.values(ELICITATION).flat().some(q => normalize(title).includes(q));
