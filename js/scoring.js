// Motor de puntuación. Funciona igual en el navegador y en Node.
//
// Puntaje final = consenso (lo que dicen las fuentes) + espectáculo (datos objetivos).
//
// 1) CONSENSO
//    Cada mención aporta  peso_tipo_fuente × factor_posición
//      factor_posición = 1 + (N − r + 1) / N   si la fuente lo ubica en el puesto r de N  (1..2)
//                      = 1.4                    si aparece pero sin posición conocida
//    Bonus "número 1": +0.5 × peso si la fuente lo declara el mejor de su lista.
//    Bonus de alcance: listas de "todo el fútbol" pesan ×1.25; las de una sola
//    competición ×1 (es más fácil entrar en un top de Premier que en uno global).
//    Diversidad: se multiplica por (1 + 0.08 × (idiomas distintos − 1)) para premiar
//    a los partidos que se mencionan en varias culturas futboleras.
//
// 2) ESPECTÁCULO (0..1), sólo con datos verificables del partido
//      goles         min(goles / 8, 1)                       30%
//      remontada     1 si hubo remontada                     25%
//      instancia     final 1 · semi .8 · cuartos .65 · ...   30%
//      dramatismo    prórroga .5 + penales .5                15%
//
// 3) FINAL = pesoConsenso × consenso_normalizado + pesoEspectáculo × espectáculo
//    (escala 0..100).

export const SOURCE_TYPES = {
  "encuesta-expertos": { label: "Encuesta de expertos", weight: 1.3 },
  "editorial":         { label: "Medio / editorial",     weight: 1.0 },
  "oficial":           { label: "Organismo oficial",     weight: 1.0 },
  "libro":             { label: "Libro",                 weight: 1.1 },
  "voto-fans":         { label: "Votación de hinchas",   weight: 0.9 },
  "foro":              { label: "Foro / comunidad",      weight: 0.7 },
  "blog":              { label: "Blog / sitio menor",    weight: 0.5 },
};

export const STAGE_VALUE = {
  "final": 1, "semi": 0.8, "cuartos": 0.65, "octavos": 0.55,
  "segunda-fase": 0.6, "grupos": 0.35, "liga": 0.3, "amistoso": 0.4,
};

export const DEFAULTS = {
  consensusWeight: 0.8,
  spectacleWeight: 0.2,
  unrankedFactor: 1.4,
  numberOneBonus: 0.5,
  globalScopeBoost: 1.25,
  languageBonus: 0.08,
  typeWeights: Object.fromEntries(Object.entries(SOURCE_TYPES).map(([k, v]) => [k, v.weight])),
};

export function spectacle(m) {
  const goals = m.hs + m.as;
  const g = Math.min(goals / 8, 1);
  const c = m.comeback ? 1 : 0;
  const s = STAGE_VALUE[m.stage] ?? 0.3;
  const d = (m.aet ? 0.5 : 0) + (m.pens ? 0.5 : 0);
  return 0.3 * g + 0.25 * c + 0.3 * s + 0.15 * d;
}

function positionFactor(rank, size, unrankedFactor) {
  if (rank == null || !size) return unrankedFactor;
  return 1 + (size - rank + 1) / size;
}

export function computeRanking(matches, sources, opts = {}) {
  const o = { ...DEFAULTS, ...opts, typeWeights: { ...DEFAULTS.typeWeights, ...(opts.typeWeights || {}) } };
  const byId = new Map(matches.map(m => [m.id, {
    match: m, raw: 0, mentions: [], langs: new Set(), types: new Set(), numberOnes: 0,
  }]));

  for (const src of sources) {
    const w = o.typeWeights[src.type] ?? 0;
    if (!w) continue;
    const scopeBoost = src.scope === "todo" ? o.globalScopeBoost : 1;
    for (const men of src.mentions) {
      const entry = byId.get(men.match);
      if (!entry) throw new Error(`Fuente ${src.id} menciona partido desconocido: ${men.match}`);
      let pts = w * scopeBoost * positionFactor(men.rank, src.size, o.unrankedFactor);
      if (men.rank === 1) { pts += o.numberOneBonus * w; entry.numberOnes++; }
      entry.raw += pts;
      entry.langs.add(src.lang);
      entry.types.add(src.type);
      entry.mentions.push({ source: src, rank: men.rank, quote: men.quote, points: pts });
    }
  }

  const rows = [...byId.values()].map(e => {
    const diversity = 1 + o.languageBonus * Math.max(0, e.langs.size - 1);
    return { ...e, consensusRaw: e.raw * diversity, spectacle: spectacle(e.match) };
  });

  const maxC = Math.max(...rows.map(r => r.consensusRaw), 1e-9);
  const totalW = o.consensusWeight + o.spectacleWeight || 1;
  for (const r of rows) {
    r.consensus = r.consensusRaw / maxC;
    r.score = 100 * (o.consensusWeight * r.consensus + o.spectacleWeight * r.spectacle) / totalW;
    r.mentions.sort((a, b) => b.points - a.points);
  }
  rows.sort((a, b) => b.score - a.score || b.mentions.length - a.mentions.length);
  rows.forEach((r, i) => { r.position = i + 1; });
  return rows;
}
