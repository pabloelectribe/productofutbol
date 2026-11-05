// Valida los datos y muestra el ranking en consola:  node scripts/ranking.mjs [N]
import { matches } from "../data/matches.js";
import { sources } from "../data/sources.js";
import { computeRanking, rankByVoice, SOURCE_TYPES, STAGE_VALUE } from "../js/scoring.js";

const errors = [];
const ids = new Set();
for (const m of matches) {
  if (ids.has(m.id)) errors.push(`Partido duplicado: ${m.id}`);
  ids.add(m.id);
  if (!(m.stage in STAGE_VALUE)) errors.push(`${m.id}: instancia desconocida ${m.stage}`);
  if (!Array.isArray(m.nat) || !m.nat.length) errors.push(`${m.id}: falta nat`);
  for (const k of ["home", "away", "hs", "as", "comp", "date"]) if (m[k] == null) errors.push(`${m.id}: falta ${k}`);
}
const srcIds = new Set();
for (const s of sources) {
  if (srcIds.has(s.id)) errors.push(`Fuente duplicada: ${s.id}`);
  srcIds.add(s.id);
  if (!(s.type in SOURCE_TYPES)) errors.push(`${s.id}: tipo desconocido ${s.type}`);
  for (const men of s.mentions) {
    if (!ids.has(men.match)) errors.push(`${s.id}: partido desconocido ${men.match}`);
    if (men.rank != null && s.size && men.rank > s.size) errors.push(`${s.id}: puesto ${men.rank} > tamaño ${s.size}`);
  }
}
const mentioned = new Set(sources.flatMap(s => s.mentions.map(x => x.match)));
for (const id of ids) if (!mentioned.has(id)) errors.push(`Partido sin fuentes: ${id}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

const n = Number(process.argv[2] || 20);
const rows = computeRanking(matches, sources);
const line = (r, s) => { const m = r.match; return `${m.home} ${m.hs}-${m.as} ${m.away} (${m.date.slice(0, 4)})${s ? "  " + s : ""}`; };
console.log(`${matches.length} partidos · ${sources.length} fuentes · ${sources.reduce((a, s) => a + s.mentions.length, 0)} menciones\n`);
for (const r of rows.slice(0, n))
  console.log(`${String(r.position).padStart(2)}. ${r.score.toFixed(1).padStart(5)}  ${line(r, `[E ${(r.voice.experta.score * 100).toFixed(0)} · H ${(r.voice.popular.score * 100).toFixed(0)} · ${r.agreement}]`)}`);
for (const v of ["experta", "popular"]) {
  console.log(`\nTop 5 voz ${v}:`);
  rankByVoice(rows, v).slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${line(r)}`));
}
