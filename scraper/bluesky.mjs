// Busca en Bluesky posts que hablen del "mejor partido de la historia" y nombren uno.
// Bluesky es la alternativa abierta a X/Twitter: su API es pública y gratuita.
//
//   BSKY_HANDLE=usuario.bsky.social BSKY_APP_PASSWORD=xxxx node scraper/bluesky.mjs
//
// La búsqueda requiere iniciar sesión con una "app password" (Configuración →
// Privacidad y seguridad → App passwords). Nunca uses la contraseña principal.
// Dominios necesarios: bsky.social
import { writeFile, mkdir } from "node:fs/promises";
import { getJSON, tally, ELICITATION, UA } from "./lib.mjs";

const { BSKY_HANDLE, BSKY_APP_PASSWORD } = process.env;
if (!BSKY_HANDLE || !BSKY_APP_PASSWORD) {
  console.error("Faltan BSKY_HANDLE y BSKY_APP_PASSWORD (ver el encabezado del archivo).");
  process.exit(1);
}

const login = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
  method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA },
  body: JSON.stringify({ identifier: BSKY_HANDLE, password: BSKY_APP_PASSWORD }),
});
if (!login.ok) { console.error(`Login fallido: HTTP ${login.status}`); process.exit(1); }
const { accessJwt } = await login.json();
const headers = { Authorization: `Bearer ${accessJwt}` };

const LANGS = { en: ELICITATION.en, es: ELICITATION.es, pt: ELICITATION.pt, it: ELICITATION.it };
const sources = [];
for (const [lang, queries] of Object.entries(LANGS)) {
  const posts = new Map();
  for (const q of queries) {
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const u = `https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(`"${q}"`)}&lang=${lang}&limit=100${cursor ? `&cursor=${cursor}` : ""}`;
      let j;
      try { j = await getJSON(u, { headers }); } catch (e) { console.warn(`"${q}": ${e.message}`); break; }
      for (const p of j.posts || []) {
        const rkey = p.uri.split("/").pop();
        posts.set(p.uri, {
          author: p.author.handle, text: p.record?.text || "",
          score: (p.likeCount || 0) + (p.repostCount || 0),
          url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
        });
      }
      if (!j.cursor) break;
      cursor = j.cursor;
    }
  }
  const items = [...posts.values()];
  const { authors, results } = tally(items);
  console.log(`Bluesky (${lang}): ${items.length} posts · ${authors} autores con menciones`);
  sources.push({
    id: `bluesky-${lang}`, platform: "Bluesky", name: `Bluesky (${lang})`, lang, cc: null, url: "https://bsky.app/",
    comments: items.length, authors, results,
  });
}

await mkdir("data/scraped", { recursive: true });
await writeFile("data/scraped/bluesky.json", JSON.stringify({ collectedAt: new Date().toISOString(), sources }, null, 2));
console.log("→ data/scraped/bluesky.json");
