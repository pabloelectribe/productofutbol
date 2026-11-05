// Valida los datos y muestra el ranking en consola:  node scripts/ranking.mjs [N]
import { matches } from "../data/matches.js";
import { sources } from "../data/sources.js";
import { computeRanking, SOURCE_TYPES, STAGE_VALUE } from "../js/scoring.js";

const errors = [];
const ids = new Set();
for (const m of matches) {
  if (ids.has(m.id)) errors.push(`Partido duplicado: ${m.id}`);
  ids.add(m.id);
  if (!(m.stage in STAGE_VALUE)) errors.push(`${m.id}: instancia desconocida ${m.stage}`);
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
console.log(`${matches.length} partidos · ${sources.length} fuentes · ${sources.reduce((a, s) => a + s.mentions.length, 0)} menciones\n`);
for (const r of rows.slice(0, n)) {
  const m = r.match;
  console.log(`${String(r.position).padStart(2)}. ${r.score.toFixed(1).padStart(5)}  ${m.home} ${m.hs}-${m.as} ${m.away} (${m.date.slice(0, 4)})  [${r.mentions.length} fuentes, ${r.langs.size} idiomas]`);
}
