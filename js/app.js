import { matches } from "../data/matches.js";
import { sources } from "../data/sources.js";
import { computeRanking, SOURCE_TYPES, DEFAULTS } from "./scoring.js";

const COMP_LABEL = {
  mundial: "Copa del Mundo", ucl: "Copa de Europa / Champions", libertadores: "Copa Libertadores",
  eurocopa: "Eurocopa", liga: "Liga", "copa-nacional": "Copa nacional", amistoso: "Amistoso",
};
const STAGE_LABEL = {
  final: "Final", semi: "Semifinal", cuartos: "Cuartos de final", octavos: "Octavos de final",
  "segunda-fase": "Segunda fase", grupos: "Fase de grupos", liga: "Liga", amistoso: "Amistoso",
};
const LANG_LABEL = { es: "Español", en: "Inglés", pt: "Portugués", it: "Italiano", fr: "Francés", de: "Alemán" };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = {
  q: "", comp: "", era: "",
  spec: 20,
  typeWeights: { ...DEFAULTS.typeWeights },
  open: new Set(),
};

// ── encabezado ──
const activeSources = sources.filter(s => s.mentions.length);
const langs = new Set(sources.map(s => s.lang));
$("#updated").textContent = sources.map(s => s.accessed).sort().at(-1);
$("#stats").innerHTML = [
  [sources.length, "fuentes"],
  [sources.reduce((a, s) => a + s.mentions.length, 0), "menciones"],
  [matches.length, "partidos"],
  [langs.size, "idiomas"],
].map(([n, l]) => `<div><dt>${l}</dt><dd>${n}</dd></div>`).join("");

// ── pestañas ──
document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b === btn));
  document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== `tab-${btn.dataset.tab}`; });
}));

// ── controles ──
function renderTypeWeights() {
  $("#type-weights").innerHTML = Object.entries(SOURCE_TYPES).map(([k, v]) => `
    <div class="ctrl tw">
      <label for="tw-${k}">${v.label} <output>${state.typeWeights[k].toFixed(1)}</output></label>
      <input id="tw-${k}" data-type="${k}" type="range" min="0" max="2" step="0.1" value="${state.typeWeights[k]}">
    </div>`).join("");
  document.querySelectorAll("[data-type]").forEach(inp => inp.addEventListener("input", () => {
    state.typeWeights[inp.dataset.type] = Number(inp.value);
    inp.previousElementSibling.querySelector("output").textContent = Number(inp.value).toFixed(1);
    render();
  }));
}
renderTypeWeights();

$("#q").addEventListener("input", e => { state.q = e.target.value.trim().toLowerCase(); render(); });
$("#comp").addEventListener("change", e => { state.comp = e.target.value; render(); });
$("#era").addEventListener("change", e => { state.era = e.target.value; render(); });
const specOut = () => { $("#w-spec-out").textContent = `${100 - state.spec} / ${state.spec}`; };
$("#w-spec").addEventListener("input", e => { state.spec = Number(e.target.value); specOut(); render(); });
if (window.matchMedia("(max-width: 820px)").matches) $(".weights").open = false;
$("#reset").addEventListener("click", () => {
  state.spec = 20; $("#w-spec").value = 20; specOut();
  state.typeWeights = { ...DEFAULTS.typeWeights };
  renderTypeWeights(); render();
});

// ── ranking ──
function matchesFilter(r) {
  const m = r.match;
  if (state.comp && m.comp !== state.comp) return false;
  if (state.era) {
    const [a, b] = state.era.split("-").map(Number);
    const y = Number(m.date.slice(0, 4));
    if (y < a || y > b) return false;
  }
  if (state.q) {
    const hay = `${m.home} ${m.away} ${m.nickname} ${m.venue} ${m.date} ${COMP_LABEL[m.comp]}`.toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

function scoreline(m) {
  const pens = m.pens ? `<span class="pens">(${m.pens} pen.)</span>` : "";
  const aet = m.aet && !m.pens ? `<span class="pens">(t.e.)</span>` : "";
  return `${esc(m.home)} <b>${m.hs}–${m.as}</b> ${esc(m.away)} ${pens}${aet}`;
}

function fmtDate(d) {
  if (d.length <= 7) return d.slice(0, 4);
  return new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function render() {
  const rows = computeRanking(matches, sources, {
    consensusWeight: 1 - state.spec / 100,
    spectacleWeight: state.spec / 100,
    typeWeights: state.typeWeights,
  });
  const visible = rows.filter(matchesFilter);
  $("#count").textContent = `${visible.length} de ${rows.length} partidos`;
  const top = rows[0]?.score || 1;

  $("#ranking").innerHTML = visible.map(r => {
    const m = r.match;
    const open = state.open.has(m.id);
    const tags = [
      COMP_LABEL[m.comp], STAGE_LABEL[m.stage],
      m.comeback && "Remontada", (m.hs + m.as) >= 6 && `${m.hs + m.as} goles`,
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
          <span class="tags">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</span>
        </span>
        <span class="pts">
          <span class="num">${r.score.toFixed(1)}</span>
          <span class="bar"><i style="width:${(r.score / top * 100).toFixed(1)}%"></i></span>
          <span class="sub">${r.mentions.length} fuente${r.mentions.length !== 1 ? "s" : ""} · ${r.langs.size} idioma${r.langs.size !== 1 ? "s" : ""}</span>
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
}

function detail(r) {
  const m = r.match;
  return `
  <div class="detail">
    <p>${esc(m.summary)}</p>
    <div class="breakdown">
      <div><span>Consenso</span><b>${(r.consensus * 100).toFixed(0)}</b><i style="--v:${r.consensus}"></i></div>
      <div><span>Espectáculo</span><b>${(r.spectacle * 100).toFixed(0)}</b><i style="--v:${r.spectacle}"></i></div>
    </div>
    <h4>Qué dicen las fuentes</h4>
    <ul class="mentions">
      ${r.mentions.map(x => `
        <li>
          <span class="rk">${x.rank ? "#" + x.rank : "✓"}</span>
          <span>
            <a href="${esc(x.source.url)}" target="_blank" rel="noopener" title="${esc(x.source.name)}">${esc(x.source.outlet)}</a>
            <span class="muted"> · ${esc(SOURCE_TYPES[x.source.type].label)} · ${esc(LANG_LABEL[x.source.lang] || x.source.lang)}</span>
            <q>${esc(x.quote.replace(/^"|"$/g, ""))}</q>
          </span>
          <span class="muted pts-small">+${x.points.toFixed(2)}</span>
        </li>`).join("")}
    </ul>
  </div>`;
}

// ── fuentes ──
function renderSources() {
  const byId = new Map(matches.map(m => [m.id, m]));
  const groups = {};
  for (const s of sources) (groups[s.type] ||= []).push(s);
  $("#sources").innerHTML = Object.entries(SOURCE_TYPES).filter(([k]) => groups[k]).map(([k, t]) => `
    <h3>${t.label} <span class="muted">· peso ${t.weight}</span></h3>
    <ul>
      ${groups[k].map(s => `
        <li>
          <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>
          <span class="muted"> · ${esc(LANG_LABEL[s.lang] || s.lang)} · ${esc(s.country)}${s.ranked ? " · ranking" : ""}</span>
          ${s.note ? `<div class="note">${esc(s.note)}</div>` : ""}
          ${s.duplicateOf ? `<div class="note">Reproduce la lista de otra fuente ya contada; no suma puntos.</div>` : ""}
          ${s.mentions.length ? `<div class="chips">${s.mentions.map(x => {
            const m = byId.get(x.match);
            return `<span class="chip">${x.rank ? `<b>#${x.rank}</b> ` : ""}${esc(m.home)} ${m.hs}–${m.as} ${esc(m.away)} ’${m.date.slice(2, 4)}</span>`;
          }).join("")}</div>` : ""}
        </li>`).join("")}
    </ul>`).join("");
}

renderSources();
render();
