// Utilidades compartidas por los scrapers. Sin dependencias externas (Node 18+).
import { aliases } from "../data/aliases.js";

export const UA = "productofutbol-research/0.2 (https://github.com/pabloelectribe/productofutbol; ranking académico de partidos)";

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// GET JSON con reintentos y pausa entre pedidos (scraping respetuoso).
// `allow`: códigos HTTP cuyo cuerpo JSON se devuelve igual (p. ej. 422 de Arctic Shift = timeout).
export async function getJSON(url, { headers = {}, retries = 3, delay = 1100, allow = [] } = {}) {
  for (let i = 0; i <= retries; i++) {
    await sleep(delay);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers } });
      if (res.status === 429 || res.status >= 500) {
        if (i === retries) throw new Error(`HTTP ${res.status} (agotados los reintentos) en ${url}`);
        await sleep(Number(res.headers.get("retry-after")) * 1000 || 3000 * 2 ** i);
        continue;
      }
      if (!res.ok && !allow.includes(res.status)) throw new Error(`HTTP ${res.status} en ${url}`);
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
//
// Sesgo endogrupal individual: si la persona declara ser hincha de uno de los
// equipos (el "flair" de Reddit), su voto para ese partido vale × PARTISAN.
export const PARTISAN = 0.5;
const byId = new Map(compiled.map(c => [c.id, c]));
export const isPartisan = (flair, id) => {
  if (!flair) return false;
  const f = normalize(flair);
  return byId.get(id).teams.some(list => list.some(re => re.test(f)));
};

export function tally(items) {
  // items: [{ author, text, score, url, flair? }]
  const byAuthor = new Map();
  const candidates = new Map();
  for (const it of items) {
    if (isBot(it.author)) continue;
    const found = detectMatches(it.text);
    for (const k of extractCandidates(it.text)) {
      const c = candidates.get(k) || { label: k, authors: new Set(), example: it.text.slice(0, 160) };
      c.authors.add(it.author); candidates.set(k, c);
    }
    if (!found.length) continue;
    const prev = byAuthor.get(it.author);
    if (!prev || (it.score || 0) > (prev.score || 0)) byAuthor.set(it.author, { ...it, found });
  }
  const res = new Map();
  for (const it of byAuthor.values()) {
    const share = endorsement(it.score) / it.found.length;
    for (const id of it.found) {
      const r = res.get(id) || { match: id, votes: 0, authors: 0, partisans: 0, quotes: [] };
      const partisan = isPartisan(it.flair, id);
      r.votes += share * (partisan ? PARTISAN : 1); r.authors++; if (partisan) r.partisans++;
      if (r.quotes.length < 3) r.quotes.push({ text: it.text.slice(0, 220), url: it.url, score: it.score ?? null, flair: it.flair || null });
      res.set(id, r);
    }
  }
  return {
    authors: byAuthor.size,
    results: [...res.values()].sort((a, b) => b.votes - a.votes).map(r => ({ ...r, votes: +r.votes.toFixed(3) })),
    // partidos que la gente nombra pero no están en el catálogo (para revisión humana)
    candidates: [...candidates.values()].map(c => ({ label: c.label, authors: c.authors.size, example: c.example }))
      .filter(c => c.authors >= 2).sort((a, b) => b.authors - a.authors).slice(0, 60),
  };
}

// Detección abierta de partidos con marcador ("lyon 5-5 marseille") que NO
// coinciden con ningún partido del catálogo. Es ruidosa a propósito: sirve para
// descubrir candidatos, que después una persona revisa y agrega al catálogo.
const STOP = new Set("the a an and or vs v x in at of on for when that this my me i was is it its de del el la los las y o en con contra que al um uma o os e do da no na di il lo le".split(" "));
const trim = (tokens) => { while (tokens.length && (STOP.has(tokens[0]) || /^\d+$/.test(tokens[0]))) tokens.shift(); while (tokens.length && (STOP.has(tokens.at(-1)) || /^\d+$/.test(tokens.at(-1)))) tokens.pop(); return tokens; };
export function extractCandidates(text) {
  const out = new Set();
  for (const s of normalize(text).split(/(?<=[.!?\n;,(])\s*|\n+/)) {
    if (detectMatches(s).length) continue;
    for (const m of s.matchAll(/([a-z][a-z.'&]*(?: [a-z][a-z.'&]*){0,2})\s+(\d{1,2})\s?-\s?(\d{1,2})\s+([a-z][a-z.'&]*(?: [a-z][a-z.'&]*){0,2})/g)) {
      const a = trim(m[1].split(" ").slice(-2)), b = trim(m[4].split(" ").slice(0, 2));
      if (!a.length || !b.length || Number(m[2]) + Number(m[3]) > 15) continue;
      out.add(`${a.join(" ")} ${m[2]}-${m[3]} ${b.join(" ")}`);
    }
  }
  return [...out];
}

// Preguntas que piden explícitamente "el mejor partido" (muestreo por elicitación):
// sólo se cuentan respuestas a estas preguntas, no la charla general.
// SEARCH: palabras para buscar hilos; ELICITATION_RE: filtro fino sobre el título.
export const SEARCH = {
  en: ["greatest match", "best match", "best game", "greatest game", "favourite match", "favorite match", "best football match", "match you've ever"],
  es: ["mejor partido", "partido mas epico"],
  pt: ["melhor jogo", "maior jogo", "melhor partida"],
  it: ["partita piu bella", "miglior partita"],
};
export const ELICITATION = SEARCH; // compatibilidad con bluesky.mjs
const ELICITATION_RE = [
  /\b(best|greatest|favou?rite|most entertaining|most exciting)\b.{0,25}\b(football |soccer )?(match|game)(es|s)?\b.{0,40}\b(ever|all[- ]time|history|you('ve| have)? (ever )?(seen|watched|saw)|you (saw|watched)|witnessed|live)\b/,
  /\bmejor(es)? partido(s)?\b.{0,40}\b(historia|todos los tiempos|viste|vi |visto|en vivo|de la vida)\b/,
  /\b(melhor(es)?|maior(es)?) (jogo|partida)s?\b.{0,40}\b(historia|todos os tempos|viu|vi |visto|ao vivo)\b/,
  /\b(partita piu bella|miglior(e)? partita)\b.{0,40}\b(sempre|storia|vista|visto)\b/,
];
const EXCLUDE_RE = /\b(performance|goal|gol|player|jugador|jogador|giocatore|kit|stadium|estadio|save|xi|team|equipo|squadra|manager|season|temporada|impact)s?\b/;
export const isElicitation = (title) => {
  const t = normalize(title);
  return ELICITATION_RE.some(re => re.test(t)) && !EXCLUDE_RE.test(t) && !/man of the match/.test(t);
};
