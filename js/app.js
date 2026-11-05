import { matches } from "../data/matches.js";
import { players } from "../data/players.js";
import { sources as curated } from "../data/sources.js";
import { scraped } from "../data/scraped.js";
import { conversationSources, memoryScores, MIN_AUTHORS } from "./scraped-sources.js";
import { computeRanking, rankByVoice, SOURCE_TYPES, VOICES, CORRECTIONS, DEFAULTS } from "./scoring.js";

const COMP_LABEL = {
  mundial: "Copa del Mundo", ucl: "Copa de Europa / Champions", libertadores: "Copa Libertadores",
  eurocopa: "Eurocopa", liga: "Liga", "copa-nacional": "Copa nacional", amistoso: "Amistoso",
};
const STAGE_LABEL = {
  final: "Final", semi: "Semifinal", cuartos: "Cuartos de final", octavos: "Eliminatoria",
  "segunda-fase": "Segunda fase", grupos: "Fase de grupos", liga: "Liga", amistoso: "Amistoso",
};
// Países (código de data/matches.js → nombre), para el filtro y la búsqueda
const COUNTRY = {
  ARG: "Argentina", BEL: "Bélgica", BRA: "Brasil", CHI: "Chile", COL: "Colombia", CPV: "Cabo Verde", CRO: "Croacia",
  DEN: "Dinamarca", ECU: "Ecuador", ENG: "Inglaterra", ESP: "España", FRA: "Francia", GER: "Alemania",
  HUN: "Hungría", ITA: "Italia", NED: "Países Bajos", POR: "Portugal", PRK: "Corea del Norte", SWE: "Suecia", URU: "Uruguay",
};
const fold = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const LANG_LABEL = { es: "Español", en: "Inglés", pt: "Portugués", it: "Italiano", fr: "Francés", de: "Alemán" };
const AGREEMENT = {
  "convergente":   { label: "Expertos e hinchas coinciden", cls: "ok" },
  "parcial":       { label: "Coincidencia parcial", cls: "mid" },
  "solo-expertos": { label: "Sólo lo eligen los expertos", cls: "exp" },
  "solo-hinchas":  { label: "Sólo lo eligen los hinchas", cls: "pop" },
  "sin-datos":     { label: "Una voz sin datos (imputada)", cls: "mid" },
};

// Explicación de cada corrección: el problema, la corrección y la referencia.
const PRINCIPLES = {
  independence: {
    problem: "Cuando un medio publica varias listas, o cuando las listas se copian entre sí, el mismo juicio se cuenta varias veces. La influencia social reduce la diversidad de opiniones y hace que la multitud se equivoque con más confianza (Lorenz et al., 2011); en el extremo se producen cascadas informativas, donde cada uno repite lo que dijo el anterior (Bikhchandani et al., 1992).",
    fix: "La primera lista de cada medio cuenta completa; cada repetición del mismo partido por el mismo medio vale (1 − s)^k. Las fuentes que sólo reproducen otra lista no suman.",
  },
  ingroup: {
    problem: "Los hinchas de Dartmouth y Princeton vieron, literalmente, partidos distintos en el mismo video (Hastorf y Cantril, 1954). La identidad social lleva a valorar más lo propio (Tajfel y Turner, 1979): un medio inglés tiende a recordar partidos ingleses; uno argentino, partidos argentinos.",
    fix: "Si la fuente es del mismo país que alguno de los equipos, esa mención se descuenta un s%. No se anula: un medio argentino puede tener razón sobre un partido argentino, pero su voto vale menos como evidencia independiente.",
  },
  recency: {
    problem: "Juzgamos como más importante lo que nos viene a la mente con más facilidad (Tversky y Kahneman, 1973). Un partido reciente está fresco y aparece en todas las listas nuevas, antes de que el tiempo filtre la emoción del momento.",
    fix: "Los partidos de menos de 10 años reciben un descuento que va desde s% (partido de este año) hasta 0% (partido de hace 10 años): la “prueba del tiempo”.",
  },
  exposure: {
    problem: "Hay decenas de rankings de Champions League y muy pocos de Copa Libertadores. Ignorar esa diferencia es caer en la negligencia de la tasa base (Bar-Hillel, 1980): un partido de Champions acumula menciones simplemente porque tiene más oportunidades.",
    fix: "Para cada partido se cuentan las fuentes que podían haberlo mencionado (por tema y por fecha) y los puntos se dividen por oportunidades^α. Importa la proporción de veces que se lo elige, no sólo la cantidad.",
  },
  smallSample: {
    problem: "Tendemos a creer que una muestra chica refleja a la población tan bien como una grande: la “ley de los pequeños números” (Tversky y Kahneman, 1971). Una sola mención en un foro no debería poner a un partido entre los mejores.",
    fix: "El puntaje de cada voz se multiplica por n / (n + k), donde n es la cantidad de fuentes de esa voz que lo mencionan. Con k = 1, una sola mención vale la mitad, dos valen dos tercios y diez, el 91%.",
  },
};

// Fuentes curadas a mano + comunidades recolectadas automáticamente
const sources = [...curated, ...conversationSources(scraped)];
const memory = memoryScores(scraped);
const hasMemory = Object.keys(memory).length > 0;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x) => Math.round(x * 100);

const fresh = () => ({
  popularShare: DEFAULTS.popularShare * 100,
  intensity: DEFAULTS.intensityWeight * 100,
  memoryWeight: 0,
  typeWeights: { ...DEFAULTS.typeWeights },
  corrections: { ...DEFAULTS.corrections },
});
const state = { q: "", comp: "", era: "", country: "", open: new Set(), ...fresh() };

function compute() {
  return computeRanking(matches, sources, {
    popularShare: state.popularShare / 100,
    intensityWeight: state.intensity / 100,
    memoryWeight: state.memoryWeight / 100,
    memory,
    typeWeights: state.typeWeights,
    corrections: state.corrections,
  });
}

// ── encabezado ──
const countBy = (voice) => sources.filter(s => SOURCE_TYPES[s.type].voice === voice).length;
$("#updated").textContent = sources.map(s => s.accessed).sort().at(-1);
$("#stats").innerHTML = [
  [sources.length, "fuentes"],
  [countBy("experta"), "de expertos"],
  [countBy("popular"), "de hinchas"],
  [matches.length, "partidos"],
  [new Set(sources.map(s => s.lang)).size, "idiomas"],
].map(([n, l]) => `<div><dt>${l}</dt><dd>${n}</dd></div>`).join("");

// ── pestañas ──
document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b === btn));
  document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== `tab-${btn.dataset.tab}`; });
}));

// ── controles ──
function slider({ id, label, sub, min, max, step, value, fmt }) {
  return `
    <div class="ctrl tw">
      <label for="${id}"><span>${label}${sub ? `<small>${sub}</small>` : ""}</span> <output>${fmt(value)}</output></label>
      <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    </div>`;
}

function renderControls() {
  $("#w-voice").value = state.popularShare;
  $("#w-int").value = state.intensity;
  $("#w-voice-out").textContent = `${100 - state.popularShare} / ${state.popularShare}`;
  $("#w-int-out").textContent = `${state.intensity}%`;
  $("#w-mem").value = state.memoryWeight;
  $("#w-mem").disabled = !hasMemory;
  $("#w-mem-out").textContent = hasMemory ? `${state.memoryWeight}%` : "sin datos";

  $("#corrections").innerHTML = Object.entries(CORRECTIONS).map(([k, c]) => slider({
    id: `c-${k}`, label: c.label, sub: c.concept, min: 0, max: c.max,
    step: k === "smallSample" ? 0.5 : 0.05, value: state.corrections[k],
    fmt: v => k === "smallSample" ? (v ? `k = ${v}` : "off") : k === "exposure" ? (v ? `α = ${v}` : "off") : (v ? `−${pct(v)}%` : "off"),
  })).join("");

  $("#type-weights").innerHTML = Object.entries(VOICES).map(([vk, v]) => `
    <p class="voice-title ${vk}">${v.label}</p>
    ${Object.entries(SOURCE_TYPES).filter(([, t]) => t.voice === vk).map(([k, t]) => slider({
      id: `tw-${k}`, label: t.label, min: 0, max: 2, step: 0.1, value: state.typeWeights[k], fmt: v => Number(v).toFixed(1),
    })).join("")}`).join("");

  document.querySelectorAll("#corrections input").forEach(inp => inp.addEventListener("input", () => {
    state.corrections[inp.id.slice(2)] = Number(inp.value); renderControls(); render();
  }));
  document.querySelectorAll("#type-weights input").forEach(inp => inp.addEventListener("input", () => {
    state.typeWeights[inp.id.slice(3)] = Number(inp.value); renderControls(); render();
  }));
}

$("#q").addEventListener("input", e => { state.q = fold(e.target.value.trim()); render(); });
$("#country").innerHTML = `<option value="">Todos</option>` + [...new Set(matches.flatMap(m => m.nat))]
  .sort((a, b) => (COUNTRY[a] || a).localeCompare(COUNTRY[b] || b, "es"))
  .map(c => `<option value="${c}">${esc(COUNTRY[c] || c)}</option>`).join("");
$("#country").addEventListener("change", e => { state.country = e.target.value; render(); });
$("#comp").addEventListener("change", e => { state.comp = e.target.value; render(); });
$("#era").addEventListener("change", e => { state.era = e.target.value; render(); });
$("#w-voice").addEventListener("input", e => { state.popularShare = Number(e.target.value); renderControls(); render(); });
$("#w-int").addEventListener("input", e => { state.intensity = Number(e.target.value); renderControls(); render(); });
$("#w-mem").addEventListener("input", e => { state.memoryWeight = Number(e.target.value); renderControls(); render(); });
$("#reset").addEventListener("click", () => { Object.assign(state, fresh()); renderControls(); render(); });
if (window.matchMedia("(max-width: 820px)").matches) $("#bias-group").open = false;

// ── utilidades de partido ──
function scoreline(m) {
  const extra = m.pens ? `<span class="pens">(${m.pens} pen.)</span>` : m.aet ? `<span class="pens">(t.e.)</span>` : "";
  return `${esc(m.home)} <b>${m.hs}–${m.as}</b> ${esc(m.away)} ${extra}`;
}
function fmtDate(d) {
  if (d.length <= 7) return d.slice(0, 4);
  return new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}
const shortName = (m) => `${m.home} ${m.hs}–${m.as} ${m.away} ’${m.date.slice(2, 4)}`;

function matchesFilter(r) {
  const m = r.match;
  if (state.comp && m.comp !== state.comp) return false;
  if (state.era) {
    const [a, b] = state.era.split("-").map(Number);
    const y = Number(m.date.slice(0, 4));
    if (y < a || y > b) return false;
  }
  if (state.country && !m.nat.includes(state.country)) return false;
  if (state.q) {
    // cada palabra tiene que aparecer: "messi 2022", "pinilla", "chile 2014"
    const hay = fold([m.home, m.away, m.nickname, m.venue, m.date, COMP_LABEL[m.comp],
      ...m.nat.map(c => COUNTRY[c] || c), ...(players[m.id] || [])].join(" "));
    if (!state.q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

const meter = (label, v, cls, note = "") =>
  `<div class="meter ${cls}"><span>${label}</span><b>${note || pct(v)}</b><i style="--v:${v}"></i></div>`;

// ── ranking ──
function render() {
  const rows = compute();
  const visible = rows.filter(matchesFilter);
  $("#count").textContent = `${visible.length} de ${rows.length} partidos`;
  const top = rows[0]?.score || 1;

  $("#ranking").innerHTML = visible.map(r => {
    const m = r.match;
    const open = state.open.has(m.id);
    const ag = AGREEMENT[r.agreement];
    const tags = [
      COMP_LABEL[m.comp], STAGE_LABEL[m.stage],
      m.comeback && "Remontada", m.late && "Clímax tardío", (m.hs + m.as) >= 6 && `${m.hs + m.as} goles`,
      r.numberOnes && `N.º 1 en ${r.numberOnes} ${r.numberOnes > 1 ? "listas" : "lista"}`,
    ].filter(Boolean);
    return `
    <li class="card ${r.position <= 3 ? "podium p" + r.position : ""}">
      <button class="card-head" aria-expanded="${open}" data-id="${m.id}">
        <span class="pos">${r.position}</span>
        <span class="main">
          ${m.nickname ? `<span class="nick">${esc(m.nickname)}</span>` : ""}
          <span class="score">${scoreline(m)}</span>
          <span class="meta">${fmtDate(m.date)} · ${esc(m.venue)}${m.verify ? ` · <span class="warn">datos en verificación</span>` : ""}</span>
          <span class="tags"><span class="tag ag ${ag.cls}">${ag.label}</span>${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</span>
        </span>
        <span class="pts">
          <span class="num">${r.score.toFixed(1)}</span>
          <span class="bar"><i style="width:${(r.score / top * 100).toFixed(1)}%"></i></span>
          <span class="duo">
            <span class="exp" title="Voz experta">Exp. <b>${r.voice.experta.imputed ? "–" : pct(r.voice.experta.score)}</b></span>
            <span class="pop" title="Voz popular">Hinchas <b>${r.voice.popular.imputed ? "–" : pct(r.voice.popular.score)}</b></span>
          </span>
        </span>
      </button>
      ${open ? detail(r) : ""}
    </li>`;
  }).join("") || `<li class="empty">Ningún partido coincide con los filtros.</li>`;

  document.querySelectorAll(".card-head").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.id;
    state.open.has(id) ? state.open.delete(id) : state.open.add(id);
    render();
  }));

  renderVoices(rows);
  renderPrinciples(rows);
}

function voiceNote(v, name) {
  const notes = [];
  if (v.imputed) notes.push(`Ninguna fuente de ${name} podía haberlo mencionado; se imputa con la otra voz.`);
  else notes.push(`${v.n} de ${v.opp} fuentes que podían mencionarlo lo eligieron.`);
  if (!v.imputed && v.n && v.shrink < 1) notes.push(`Muestra chica: × ${v.shrink.toFixed(2)}.`);
  return notes.join(" ");
}

function detail(r) {
  const m = r.match;
  const E = r.voice.experta, P = r.voice.popular;
  const byVoice = (vk) => r.mentions.filter(x => x.voice === vk);
  const mentionList = (list) => list.length ? `<ul class="mentions">${list.map(x => `
        <li>
          <span class="rk">${x.rank ? "#" + x.rank : "✓"}</span>
          <span>
            <a href="${esc(x.source.url)}" target="_blank" rel="noopener" title="${esc(x.source.name)}">${esc(x.source.outlet)}</a>
            <span class="muted"> · ${esc(SOURCE_TYPES[x.source.type].label)} · ${esc(LANG_LABEL[x.source.lang] || x.source.lang)}</span>
            <q>${esc(x.quote.replace(/^"|"$/g, ""))}</q>
            ${x.adj.length ? `<span class="adjs">${x.adj.map(a => `<span class="adj" title="${esc(CORRECTIONS[a.key].concept)}">−${pct(1 - a.factor)}% ${esc(a.label)}</span>`).join("")}</span>` : ""}
          </span>
          <span class="muted pts-small">+${x.points.toFixed(2)}</span>
        </li>`).join("")}</ul>` : `<p class="muted small">Sin menciones en esta voz.</p>`;

  return `
  <div class="detail">
    <p>${esc(m.summary)}</p>
    ${players[m.id] ? `<p class="players"><b>Protagonistas:</b> ${players[m.id].map(esc).join(" · ")}</p>` : ""}
    <div class="breakdown">
      ${meter("Voz experta", E.imputed ? 0 : E.score, "exp", E.imputed ? "imputada" : "")}
      ${meter("Voz popular", P.imputed ? 0 : P.score, "pop", P.imputed ? "imputada" : "")}
      ${meter("Intensidad", r.intensity, "int")}
    </div>
    ${r.memory ? `<p class="muted small">Memoria colectiva: ${r.memory.views.toLocaleString("es-AR")} visitas mensuales (mediana) al artículo de Wikipedia en inglés.</p>` : ""}
    <div class="cols">
      <div>
        <h4 class="exp">Voz experta</h4>
        <p class="muted small">${voiceNote(E, "expertos")}</p>
        ${mentionList(byVoice("experta"))}
      </div>
      <div>
        <h4 class="pop">Voz popular</h4>
        <p class="muted small">${voiceNote(P, "hinchas")}</p>
        ${mentionList(byVoice("popular"))}
      </div>
    </div>
  </div>`;
}

// ── expertos vs hinchas ──
function renderVoices(rows) {
  const N = 10;
  const E = rankByVoice(rows, "experta"), P = rankByVoice(rows, "popular");
  const posE = new Map(E.map((r, i) => [r.match.id, i + 1]));
  const posP = new Map(P.map((r, i) => [r.match.id, i + 1]));
  const topE = E.slice(0, N), topP = P.slice(0, N);
  const shared = topE.filter(r => posP.get(r.match.id) <= N);
  const col = (list, other, vk, otherName) => `
    <ol class="vlist ${vk}">
      ${list.map(r => {
        const o = other.get(r.match.id);
        const hit = o && o <= N;
        return `<li class="${hit ? "hit" : ""}"><span class="vname">${esc(shortName(r.match))}</span>
          <span class="vother">${o ? `${otherName}: #${o}` : `${otherName}: no lo mencionan`}</span></li>`;
      }).join("")}
    </ol>`;
  $("#voices").innerHTML = `
    <div class="agree-box">
      <b>${shared.length} de ${N}</b>
      <span>partidos aparecen en el top ${N} de ambas voces${shared.length ? `: ${shared.map(r => esc(r.match.nickname || shortName(r.match))).join(", ")}` : ""}.</span>
    </div>
    <div class="vcols">
      <div><h3 class="exp">Top ${N} de los expertos</h3><p class="muted small">${countBy("experta")} fuentes</p>${col(topE, posP, "exp", "Hinchas")}</div>
      <div><h3 class="pop">Top ${N} de los hinchas</h3><p class="muted small">${countBy("popular")} fuentes</p>${col(topP, posE, "pop", "Expertos")}</div>
    </div>
    <p class="muted small narrow">La voz popular tiene menos fuentes porque se publican menos encuestas de hinchas que listas de periodistas. Por eso cada voz se normaliza por separado: así sus fuentes pesan lo mismo en el total, aunque sean menos. ¿Conocés una encuesta de hinchas? Es la forma más directa de mejorar este ranking.</p>`;
}

// ── fundamentos: ejemplos en vivo de cada corrección ──
function renderPrinciples(rows) {
  const examples = {};
  for (const r of rows) for (const x of r.mentions) for (const a of x.adj)
    (examples[a.key] ||= []).push(`${x.source.outlet} sobre ${shortName(r.match)} (−${pct(1 - a.factor)}%)`);
  const expo = rows.filter(r => r.voice.experta.opp).sort((a, b) => b.voice.experta.opp - a.voice.experta.opp);
  examples.exposure = [
    `${shortName(expo[0].match)}: ${expo[0].voice.experta.opp} fuentes expertas podían mencionarlo`,
    `${shortName(expo.at(-1).match)}: ${expo.at(-1).voice.experta.opp}`,
  ];
  const single = rows.filter(r => r.voice.popular.n === 1 || r.voice.experta.n === 1).slice(0, 2);
  examples.smallSample = single.map(r => `${shortName(r.match)}: una sola mención en una voz`);

  $("#principles").innerHTML = `<h3>3. Cinco correcciones de sesgo</h3>` + Object.entries(CORRECTIONS).map(([k, c]) => `
    <article class="principle">
      <header><span class="concept">${c.concept}</span><h4>${c.label}</h4></header>
      <p><strong>El problema.</strong> ${PRINCIPLES[k].problem}</p>
      <p><strong>La corrección.</strong> ${PRINCIPLES[k].fix} <span class="muted">Valor actual: ${state.corrections[k] || "desactivada"}.</span></p>
      ${examples[k]?.length ? `<p class="small muted"><strong>En los datos:</strong> ${examples[k].slice(0, 3).map(esc).join(" · ")}${examples[k].length > 3 ? ` · y ${examples[k].length - 3} más` : ""}.</p>` : ""}
    </article>`).join("");
}

// ── fuentes ──
function scrapeStatus() {
  const conv = scraped?.conversation || [];
  if (!scraped?.builtAt) return `
    <div class="scrape-box pending">
      <h3>Recolección automática · <span class="warn">pendiente</span></h3>
      <p>El sistema para extraer opiniones de comunidades abiertas está listo pero todavía no se ejecutó: Reddit (8 comunidades en 4 idiomas), Bluesky (4 idiomas) y visitas a Wikipedia. Cuando se corra, cada comunidad se suma como una fuente más de la voz popular.</p>
      <p class="small muted">Para correrlo: <code>npm run scrape</code> (ver README).</p>
    </div>`;
  const total = conv.reduce((a, s) => a + s.authors, 0);
  const cand = new Map();
  for (const s of conv) for (const c of s.candidates || []) {
    const x = cand.get(c.label) || { label: c.label, authors: 0, where: [] };
    x.authors += c.authors; x.where.push(s.name); cand.set(c.label, x);
  }
  const top = [...cand.values()].sort((a, b) => b.authors - a.authors).slice(0, 20);
  const candHtml = top.length ? `
      <details class="cands"><summary>Partidos que la gente nombra y no están en el catálogo (${cand.size})</summary>
        <p class="small muted">Detección automática por marcador (“equipo 4-3 equipo”); es ruidosa a propósito y requiere revisión humana antes de sumar un partido al catálogo.</p>
        <ol>${top.map(c => `<li><b>${esc(c.label)}</b> <span class="muted small">· ${c.authors} personas · ${esc(c.where.join(", "))}</span></li>`).join("")}</ol>
      </details>` : "";
  return `
    <div class="scrape-box">
      <h3>Recolección automática · ${new Date(scraped.builtAt).toLocaleDateString("es-AR")}</h3>
      <p>${conv.length} comunidades · ${total.toLocaleString("es-AR")} personas que nombraron algún partido · memoria colectiva: ${hasMemory ? Object.keys(memory).length + " partidos" : "sin datos"}.</p>
      <p class="small muted">Un partido entra en el ranking de una comunidad sólo si lo nombran al menos ${MIN_AUTHORS} personas distintas.</p>
      ${candHtml}
    </div>`;
}

function renderSources() {
  const byId = new Map(matches.map(m => [m.id, m]));
  $("#sources").innerHTML = scrapeStatus() + Object.entries(VOICES).map(([vk, v]) => `
    <h2 class="voice-h ${vk}">${v.label}</h2>
    ${Object.entries(SOURCE_TYPES).filter(([, t]) => t.voice === vk).map(([k, t]) => {
      const list = sources.filter(s => s.type === k);
      if (!list.length) return "";
      return `
      <h3>${t.label} <span class="muted">· peso ${t.weight} · ${list.length}</span></h3>
      <ul>
        ${list.map(s => `
          <li>
            <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>
            <span class="muted"> · ${esc(LANG_LABEL[s.lang] || s.lang)} · ${esc(s.country)}${s.year ? ` · ${s.year}` : ""}${s.ranked ? " · ranking" : ""}</span>
            ${s.note ? `<div class="note">${esc(s.note)}</div>` : ""}
            ${s.duplicateOf ? `<div class="note">Reproduce la lista de otra fuente ya contada; no suma puntos (independencia).</div>` : ""}
            ${s.mentions.length ? `<div class="chips">${s.mentions.map(x => {
              const m = byId.get(x.match);
              return `<span class="chip">${x.rank ? `<b>#${x.rank}</b> ` : ""}${esc(shortName(m))}</span>`;
            }).join("")}</div>` : ""}
          </li>`).join("")}
      </ul>`;
    }).join("")}`).join("");
}

renderControls();
renderSources();
render();
