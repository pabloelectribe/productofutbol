# El mejor partido de la historia

Web estática que arma un **ranking de los mejores partidos de fútbol profesional de la historia** juntando lo que dicen medios, encuestas de expertos, votaciones de hinchas, foros, libros y organismos oficiales en varios idiomas, y lo combina con datos objetivos de cada partido.

## Cómo verla

No hay que compilar nada. Sirve la carpeta con cualquier servidor estático (los módulos ES no funcionan abriendo el archivo con `file://`):

```bash
python3 -m http.server 8000
```

Después abrí http://localhost:8000. También funciona tal cual en GitHub Pages, Netlify o Vercel.

## Estructura

| Archivo | Qué contiene |
|---|---|
| `data/matches.js` | Catálogo de partidos: resultado, instancia, prórroga, penales, remontada, apodo, resumen |
| `data/sources.js` | Cada fuente consultada (URL, idioma, país, año, tipo, tamaño de la lista) y qué partidos menciona y en qué puesto |
| `js/scoring.js` | Algoritmo de puntuación (lo usan tanto el navegador como Node) |
| `js/app.js` | Interfaz: filtros, pesos ajustables, detalle por partido y listado de fuentes |
| `scripts/ranking.mjs` | Valida los datos y muestra el ranking en consola |

## Algoritmo (resumen)

El ranking se trata como un **problema de juicio colectivo**, con herramientas de psicología social y psicometría:

- **Dos voces con el mismo peso:** la *voz experta* (medios, encuestas a especialistas, libros, organismos) y la *voz popular* (votaciones de hinchas, ratings, foros) se puntúan y normalizan por separado y se combinan 50/50. La votación de hinchas pesa lo mismo por fuente (1,3) que la encuesta de expertos.
- **Correcciones de sesgo** (todas ajustables):
  - *Independencia* (contagio social, cascadas informativas): el mismo medio repitiendo un partido no cuenta como un juicio nuevo.
  - *Sesgo endogrupal* (identidad social): una fuente del mismo país que un equipo vale menos.
  - *Recencia* (heurística de disponibilidad): los partidos de menos de 10 años todavía no pasaron la "prueba del tiempo".
  - *Exposición* (tasa base): se tiene en cuenta cuántas fuentes podían haber mencionado cada partido.
  - *Muestras pequeñas* (ley de los pequeños números): una mención aislada se encoge.
- **Dato faltante ≠ cero:** si ninguna fuente de una voz podía ver el partido, se imputa con la otra voz.
- **Intensidad emocional (20%)** según la regla pico-final: goles, remontada, lo que estaba en juego, clímax tardío y prórroga/penales.

La pestaña *Fundamentos* explica cada decisión con sus referencias, y *Expertos vs Hinchas* compara ambas voces.

## Cómo agregar una fuente

1. Si el partido no existe, agregalo en `data/matches.js`.
2. Agregá la fuente en `data/sources.js` con sus `mentions` (`rank: null` si no se conoce el puesto).
3. Corré `node scripts/ranking.mjs`: valida IDs, tipos y puestos e imprime el top 20.
