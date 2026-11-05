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
| `data/sources.js` | Cada fuente consultada (URL, idioma, tipo, tamaño de la lista) y qué partidos menciona y en qué puesto |
| `js/scoring.js` | Algoritmo de puntuación (lo usan tanto el navegador como Node) |
| `js/app.js` | Interfaz: filtros, pesos ajustables, detalle por partido y listado de fuentes |
| `scripts/ranking.mjs` | Valida los datos y muestra el ranking en consola |

## Algoritmo (resumen)

- **Consenso (80%)**: cada mención suma `peso_tipo × factor_posición`. El factor va de 1 a 2 según el puesto en la lista, y vale 1,4 si la fuente lo incluye sin posición. Hay bonus por ser N.º 1, por aparecer en listas de "todo el fútbol" y por aparecer en varios idiomas.
- **Espectáculo (20%)**: goles, remontada, instancia (final > semi > …) y dramatismo (prórroga y penales).

Los pesos se pueden cambiar en la interfaz. El detalle completo está en la pestaña *Metodología*.

## Cómo agregar una fuente

1. Si el partido no existe, agregalo en `data/matches.js`.
2. Agregá la fuente en `data/sources.js` con sus `mentions` (`rank: null` si no se conoce el puesto).
3. Corré `node scripts/ranking.mjs`: valida IDs, tipos y puestos e imprime el top 20.
