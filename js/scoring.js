// Motor de puntuación (v2). Funciona igual en el navegador y en Node.
//
// MARCO: el ranking se trata como un problema de juicio colectivo. La pregunta
// "¿cuál es el mejor partido de la historia?" no tiene respuesta objetiva, pero
// sí puede estimarse agregando muchos juicios independientes (sabiduría de las
// multitudes) y corrigiendo los sesgos conocidos de la memoria y la identidad.
//
// 1) DOS VOCES CON EL MISMO PESO
//    · Voz experta: encuestas a especialistas, medios, libros, organismos, blogs.
//    · Voz popular: votaciones y ratings de hinchas, foros y comunidades.
//    Cada voz se calcula y normaliza (0..1) por separado y después se promedian
//    (50/50 por defecto). Así, aunque haya muchas más listas de periodistas que
//    encuestas de hinchas, ninguna voz domina por volumen.
//
// 2) PUNTOS POR MENCIÓN
//    peso_tipo × factor_posición × alcance × correcciones
//      factor_posición = 1 + (N − r + 1)/N  (puesto r de N, entre 1 y 2)
//                      = 1 + 1/r           (puesto conocido, tamaño desconocido)
//                      = 1.4               (incluido sin posición)
//      +0.5 × peso si la fuente lo declara N.º 1.
//
// 3) CORRECCIONES DE SESGO (todas ajustables, 0 = desactivada)
//    · Independencia (contagio/cascadas): el mismo medio que repite un partido
//      en varias listas no es un juicio nuevo → cada repetición vale × (1 − s)^k.
//    · Sesgo endogrupal (identidad social): una fuente del mismo país que uno de
//      los equipos → × (1 − s).
//    · Recencia (heurística de disponibilidad): partidos de menos de 10 años
//      todavía no pasaron la "prueba del tiempo" → × (1 − s·(1 − años/10)).
//    · Exposición (tasa base): un partido de una competición con muchas listas
//      tiene más oportunidades de ser mencionado → puntos ÷ oportunidades^α.
//    · Muestras pequeñas (ley de los pequeños números): una sola mención es poco
//      fiable → el puntaje de cada voz se encoge × n / (n + k).
//
// 4) INTENSIDAD EMOCIONAL (regla pico-final, 0..1)
//      goles 25% · remontada 20% · lo que estaba en juego 25%
//      clímax tardío 20% · prórroga/penales 10%
//
// 5) FINAL = (1 − i) × consenso + i × intensidad, escala 0..100 (i = 20% por defecto).

export const VOICES = {
  experta: { label: "Voz experta", short: "Expertos" },
  popular: { label: "Voz popular", short: "Hinchas" },
};

export const SOURCE_TYPES = {
  "encuesta-expertos": { label: "Encuesta de expertos", voice: "experta", weight: 1.3 },
  "libro":             { label: "Libro",                voice: "experta", weight: 1.1 },
  "editorial":         { label: "Medio / editorial",    voice: "experta", weight: 1.0 },
  "oficial":           { label: "Organismo oficial",    voice: "experta", weight: 1.0 },
  "blog":              { label: "Blog / sitio menor",   voice: "experta", weight: 0.5 },
  "voto-fans":         { label: "Votación de hinchas",  voice: "popular", weight: 1.3 },
  "foro":              { label: "Foro / comunidad",     voice: "popular", weight: 0.7 },
};

export const STAGE_VALUE = {
  "final": 1, "semi": 0.8, "cuartos": 0.65, "octavos": 0.55,
  "segunda-fase": 0.6, "grupos": 0.35, "liga": 0.3, "amistoso": 0.4,
};

export const CORRECTIONS = {
  independence: { label: "Independencia de fuentes", concept: "Contagio social y cascadas informativas", def: 0.5, max: 1 },
  ingroup:      { label: "Sesgo endogrupal",          concept: "Teoría de la identidad social",          def: 0.25, max: 0.6 },
  recency:      { label: "Sesgo de recencia",          concept: "Heurística de disponibilidad",           def: 0.2, max: 0.6 },
  exposure:     { label: "Exposición desigual",        concept: "Negligencia de la tasa base",            def: 0.3, max: 1 },
  smallSample:  { label: "Muestras pequeñas",          concept: "Ley de los pequeños números",           def: 1, max: 3 },
};

export const DEFAULTS = {
  popularShare: 0.5,
  intensityWeight: 0.2,
  unrankedFactor: 1.4,
  numberOneBonus: 0.5,
  globalScopeBoost: 1.25,
  languageBonus: 0.08,
  currentYear: 2026,
  typeWeights: Object.fromEntries(Object.entries(SOURCE_TYPES).map(([k, v]) => [k, v.weight])),
  corrections: Object.fromEntries(Object.entries(CORRECTIONS).map(([k, v]) => [k, v.def])),
};

const year = (m) => Number(String(m.date).slice(0, 4));

// ¿Podía esta fuente haber mencionado este partido? (alcance temático y temporal)
export function covers(src, m) {
  if (src.year && year(m) > src.year) return false;
  const y = year(m);
  switch (src.scope) {
    case "todo": return true;
    case "mundial": return m.comp === "mundial";
    case "mundial-2022": return m.comp === "mundial" && y === 2022;
    case "mundial-2026": return m.comp === "mundial" && y === 2026;
    case "selecciones": return ["mundial", "eurocopa", "amistoso"].includes(m.comp);
    case "clubes": return ["ucl", "libertadores", "liga", "copa-nacional"].includes(m.comp);
    case "ucl": return m.comp === "ucl";
    case "libertadores": return m.comp === "libertadores";
    case "premier": return m.comp === "liga" && m.nat.includes("ENG") && y >= 1992;
    case "inglaterra": return ["liga", "copa-nacional"].includes(m.comp) && m.nat.includes("ENG");
    default: return false;
  }
}

export function intensity(m) {
  const goals = Math.min((m.hs + m.as) / 8, 1);
  const stake = STAGE_VALUE[m.stage] ?? 0.3;
  const drama = (m.aet ? 0.5 : 0) + (m.pens ? 0.5 : 0);
  return 0.25 * goals + 0.2 * (m.comeback ? 1 : 0) + 0.25 * stake + 0.2 * (m.late ? 1 : 0) + 0.1 * drama;
}

function positionFactor(rank, size, unrankedFactor) {
  if (rank == null) return unrankedFactor;
  if (!size) return 1 + 1 / rank;
  return 1 + (size - rank + 1) / size;
}

export function computeRanking(matches, sources, opts = {}) {
  const o = {
    ...DEFAULTS, ...opts,
    typeWeights: { ...DEFAULTS.typeWeights, ...(opts.typeWeights || {}) },
    corrections: { ...DEFAULTS.corrections, ...(opts.corrections || {}) },
  };
  const c = o.corrections;
  const counted = sources.filter(s => !s.duplicateOf && (o.typeWeights[s.type] ?? 0) > 0);

  const rows = new Map(matches.map(m => [m.id, {
    match: m, mentions: [], numberOnes: 0,
    voice: {
      experta: { raw: 0, langs: new Set(), opp: 0, n: 0 },
      popular: { raw: 0, langs: new Set(), opp: 0, n: 0 },
    },
  }]));

  // oportunidades: cuántas fuentes de cada voz podían haber mencionado el partido
  for (const r of rows.values())
    for (const s of counted)
      if (covers(s, r.match)) r.voice[SOURCE_TYPES[s.type].voice].opp++;

  // menciones, en orden de fuente (la primera de cada medio cuenta completa)
  for (const src of counted) {
    const t = SOURCE_TYPES[src.type];
    const w = o.typeWeights[src.type];
    const scopeBoost = src.scope === "todo" ? o.globalScopeBoost : 1;
    for (const men of src.mentions) {
      const r = rows.get(men.match);
      if (!r) throw new Error(`Fuente ${src.id} menciona partido desconocido: ${men.match}`);
      const m = r.match;
      const adj = [];
      let pts = w * scopeBoost * positionFactor(men.rank, src.size, o.unrankedFactor);
      if (men.rank === 1) { pts += o.numberOneBonus * w; r.numberOnes++; }

      const repeats = r.mentions.filter(x => x.source.outlet.split(" (")[0] === src.outlet.split(" (")[0]).length;
      if (repeats && c.independence) {
        const f = Math.pow(1 - c.independence, repeats);
        adj.push({ key: "independence", factor: f, label: `mismo medio (${repeats + 1}.ª lista)` });
        pts *= f;
      }
      if (src.cc && m.nat.includes(src.cc) && c.ingroup) {
        const f = 1 - c.ingroup;
        adj.push({ key: "ingroup", factor: f, label: "fuente del mismo país que un equipo" });
        pts *= f;
      }
      const age = o.currentYear - year(m);
      if (age < 10 && c.recency) {
        const f = 1 - c.recency * (1 - age / 10);
        adj.push({ key: "recency", factor: f, label: `partido de hace ${age} año${age === 1 ? "" : "s"}` });
        pts *= f;
      }

      const v = r.voice[t.voice];
      v.raw += pts; v.n++; v.langs.add(src.lang);
      r.mentions.push({ source: src, voice: t.voice, rank: men.rank, quote: men.quote, points: pts, adj });
    }
  }

  const list = [...rows.values()];
  for (const r of list) {
    for (const v of Object.values(r.voice)) {
      const diversity = 1 + o.languageBonus * Math.max(0, v.langs.size - 1);
      const exposure = c.exposure ? Math.pow(Math.max(1, v.opp), c.exposure) : 1;
      const shrink = c.smallSample ? v.n / (v.n + c.smallSample) : 1;
      v.shrink = shrink;
      v.adjusted = v.raw * diversity * shrink / exposure;
    }
  }
  for (const key of Object.keys(VOICES)) {
    const max = Math.max(...list.map(r => r.voice[key].adjusted), 1e-9);
    for (const r of list) r.voice[key].score = r.voice[key].adjusted / max;
  }

  const share = o.popularShare;
  for (const r of list) {
    const E = r.voice.experta, P = r.voice.popular;
    // dato faltante ≠ cero: si ninguna fuente de una voz podía verlo, se imputa con la otra
    E.imputed = E.opp === 0; P.imputed = P.opp === 0;
    const e = E.imputed ? P.score : E.score;
    const p = P.imputed ? E.score : P.score;
    r.consensus = (1 - share) * e + share * p;
    r.intensity = intensity(r.match);
    r.score = 100 * ((1 - o.intensityWeight) * r.consensus + o.intensityWeight * r.intensity);
    r.langs = new Set([...E.langs, ...P.langs]);
    // validez convergente: ¿las dos voces, medidas por separado, señalan lo mismo?
    r.agreement =
      E.imputed || P.imputed ? "sin-datos" :
      P.n === 0 ? "solo-expertos" :
      E.n === 0 ? "solo-hinchas" :
      e >= 0.15 && p >= 0.15 ? "convergente" : "parcial";
    r.mentions.sort((a, b) => b.points - a.points);
  }
  list.sort((a, b) => b.score - a.score || b.mentions.length - a.mentions.length);
  list.forEach((r, i) => { r.position = i + 1; });
  return list;
}

// Ranking de una sola voz (para la comparación expertos vs hinchas)
export function rankByVoice(rows, voice) {
  return rows
    .filter(r => r.voice[voice].n > 0)
    .sort((a, b) => b.voice[voice].score - a.voice[voice].score);
}
