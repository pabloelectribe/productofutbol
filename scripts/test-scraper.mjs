// Pruebas del detector de partidos y del conteo de votos.
//   node scripts/test-scraper.mjs
// Los textos son casos de prueba escritos a mano, no datos reales.
import assert from "node:assert/strict";
import { detectMatches, tally, endorsement, isElicitation, normalize } from "../scraper/lib.mjs";
import { conversationSources } from "../js/scraped-sources.js";
import { computeRanking } from "../js/scoring.js";
import { matches } from "../data/matches.js";
import { sources } from "../data/sources.js";
import { aliases } from "../data/aliases.js";

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("✓", name); };

test("todos los partidos tienen alias y viceversa", () => {
  const ids = new Set(matches.map(m => m.id));
  for (const id of Object.keys(aliases)) assert.ok(ids.has(id), `alias huérfano: ${id}`);
  for (const id of ids) assert.ok(aliases[id], `partido sin alias: ${id}`);
  for (const [id, a] of Object.entries(aliases)) assert.equal(a.teams.length, 2, `${id}: teams debe tener 2 equipos`);
});

test("normaliza tildes y marcadores", () => {
  assert.equal(normalize("Alemania 7x1 Brasil — Mineirão"), "alemania 7-1 brasil - mineirao");
});

const cases = [
  ["Istanbul 2005, nothing comes close", ["mil-liv-2005"]],
  ["The Miracle of Istanbul obviously", ["mil-liv-2005"]],
  ["Para mí el milagro de Estambul", ["mil-liv-2005"]],
  ["Argentina vs France in Qatar, no debate", ["arg-fra-2022"]],
  ["Argentina-Francia 3-3. Messi y Mbappé.", ["arg-fra-2022"]],
  ["La mano de Dios y el gol del siglo en el mismo partido", ["arg-eng-1986"]],
  ["Italia Alemania 4-3 en el Azteca", ["ita-frg-1970"]],
  ["Brasil 1x7 Alemanha foi histórico", ["bra-ger-2014"]],
  ["River-Boca en el Bernabéu, la final del mundo", ["riv-boc-2018"]],
  ["Liverpool 4-3 Newcastle, Collymore at the death", ["liv-new-1996"]],
  ["Man United vs Bayern 1999 and Liverpool v Barcelona 4-0", ["mun-bay-1999", "liv-bar-2019"]],
  // no deben detectar nada
  ["Liverpool are playing Milan next week", []],
  ["Argentina is my favourite team", []],
  ["I watched Brazil yesterday and Germany today", []],
];
test("detecta partidos en texto libre (y no inventa)", () => {
  for (const [text, expected] of cases)
    assert.deepEqual(detectMatches(text).sort(), [...expected].sort(), `texto: "${text}"`);
});

test("respaldo social con techo logarítmico", () => {
  assert.equal(endorsement(0), 1);
  assert.ok(endorsement(10) > 1.3 && endorsement(10) < 1.4);
  assert.equal(endorsement(1e6), 2);
  assert.equal(endorsement(-50), 1);
});

test("una persona = un voto, repartido entre los partidos que nombra", () => {
  const { authors, results } = tally([
    { author: "ana", text: "Istanbul 2005", score: 0 },
    { author: "ana", text: "Istanbul 2005 again!!", score: 0 },           // repite: no suma
    { author: "beto", text: "Istanbul 2005 or the 2022 world cup final", score: 0 },
    { author: "AutoModerator", text: "Istanbul 2005", score: 999 },      // bot: no cuenta
    { author: "caro", text: "no sé, todos son buenos", score: 50 },       // sin partido
  ]);
  assert.equal(authors, 2);
  const ist = results.find(r => r.match === "mil-liv-2005");
  const qat = results.find(r => r.match === "arg-fra-2022");
  assert.equal(ist.authors, 2);
  assert.equal(ist.votes, 1.5);   // ana 1 + beto 1/2
  assert.equal(qat.votes, 0.5);
});

test("sólo cuenta hilos que preguntan por el mejor partido", () => {
  assert.ok(isElicitation("What's the greatest match of all time?"));
  assert.ok(isElicitation("¿Cuál es el mejor partido de la historia?"));
  assert.ok(!isElicitation("Match thread: Liverpool vs Milan"));
});

test("las conversaciones se integran como fuentes de la voz popular", () => {
  const fake = { conversation: [{
    id: "reddit-test", platform: "Reddit", name: "r/test", lang: "en", cc: null, url: "https://example.org",
    collectedAt: "2026-11-05T00:00:00Z", comments: 10, authors: 6, threads: [],
    results: [
      { match: "mil-liv-2005", votes: 4, authors: 4, quotes: [{ text: "Istanbul 2005" }] },
      { match: "arg-fra-2022", votes: 1, authors: 1, quotes: [] },   // menos de 3 personas: no entra
    ],
  }] };
  const conv = conversationSources(fake);
  assert.equal(conv.length, 1);
  assert.equal(conv[0].mentions.length, 1);
  const rows = computeRanking(matches, [...sources, ...conv]);
  const ist = rows.find(r => r.match.id === "mil-liv-2005");
  assert.ok(ist.mentions.some(x => x.source.id === "reddit-test" && x.voice === "popular"));
});

console.log(`\n${n} pruebas OK`);
