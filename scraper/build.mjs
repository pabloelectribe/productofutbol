// Junta lo recolectado en data/scraped/*.json en un módulo que lee la web.
//   node scraper/build.mjs
import { readFile, writeFile } from "node:fs/promises";

const read = async (f) => { try { return JSON.parse(await readFile(`data/scraped/${f}`, "utf8")); } catch { return null; } };
const reddit = await read("reddit.json");
const bluesky = await read("bluesky.json");
const wiki = await read("wikipedia.json");

const hasData = Boolean(reddit || bluesky || wiki);
if (!hasData) { console.error("No hay nada recolectado en data/scraped/. Corré primero los scrapers."); process.exit(1); }

const scraped = {
  builtAt: new Date().toISOString(),
  conversation: [...(reddit?.sources || []), ...(bluesky?.sources || [])].map(s => ({ ...s, collectedAt: (s.platform === "Reddit" ? reddit : bluesky).collectedAt })),
  memory: wiki ? { collectedAt: wiki.collectedAt, window: wiki.window, matches: wiki.matches } : null,
};
await writeFile("data/scraped.js",
  "// Generado por scraper/build.mjs — no editar a mano.\n" +
  `export const scraped = ${JSON.stringify(scraped, null, 2)};\n`);
console.log(`data/scraped.js: ${scraped.conversation.length} fuentes de conversación · memoria: ${scraped.memory ? Object.keys(scraped.memory.matches).length + " partidos" : "sin datos"}`);
