// Cómo se reconoce cada partido en texto libre (foros, redes) y en Wikipedia.
//
// Un comentario menciona un partido si:
//   · contiene alguna de sus `phrases` (apodos inequívocos), o
//   · nombra a los dos equipos (`teams`) en la misma oración Y alguna pista
//     (`hints`: año o resultado) en esa misma oración.
// Todo se compara en minúsculas y sin tildes.
//
// `wiki`: título (o búsqueda) del artículo de Wikipedia por idioma, para medir
// memoria colectiva con las visitas. El scraper resuelve redirecciones y, si el
// título no existe, usa el primer resultado de búsqueda y lo deja anotado.

const T = {
  arg: ["argentina"], fra: ["france", "francia", "franca", "les bleus"], ita: ["italy", "italia", "azzurri"],
  ger: ["germany", "west germany", "alemania", "alemania federal", "alemanha", "germania", "rfa"],
  bra: ["brazil", "brasil", "brasile", "selecao"], eng: ["england", "inglaterra", "inghilterra"],
  uru: ["uruguay", "uruguai", "celeste"], hun: ["hungary", "hungria", "ungheria"], ned: ["netherlands", "holland", "holanda", "paises bajos", "olanda"],
  swe: ["sweden", "suecia", "svezia"], por: ["portugal", "portogallo"], prk: ["north korea", "corea del norte", "coreia do norte"],
  den: ["denmark", "dinamarca", "danimarca"], esp: ["spain", "espana", "espanha", "spagna"], cro: ["croatia", "croacia", "croazia"],
  chi: ["chile", "la roja"],
  cpv: ["cape verde", "cabo verde", "capo verde"],
  milan: ["milan", "ac milan"], liverpool: ["liverpool"], manutd: ["man utd", "man united", "manchester united", "united"],
  bayern: ["bayern", "bayern munich", "bayern munchen"], barca: ["barcelona", "barca"], psg: ["psg", "paris saint-germain", "paris"],
  real: ["real madrid", "madrid"], eintracht: ["eintracht", "frankfurt"], reims: ["reims"], werder: ["werder", "bremen"],
  anderlecht: ["anderlecht"], ajax: ["ajax"], spurs: ["tottenham", "spurs"], juve: ["juventus", "juve"], monaco: ["monaco"],
  depor: ["deportivo", "depor"], city: ["man city", "manchester city", "city"], atleti: ["atletico", "atleti"],
  dortmund: ["dortmund", "bvb"], river: ["river", "river plate"], boca: ["boca", "boca juniors"], estudiantes: ["estudiantes"],
  cruzeiro: ["cruzeiro"], flu: ["fluminense", "flu"], ldu: ["ldu", "liga de quito"], penarol: ["penarol"], america: ["america de cali"],
  independiente: ["independiente"], colocolo: ["colo colo", "colo-colo"], palmeiras: ["palmeiras"], santos: ["santos"],
  flamengo: ["flamengo"], newcastle: ["newcastle"], arsenal: ["arsenal"], napoli: ["napoli", "napoles"],
};

const m = (teams, hints, phrases = [], wiki = {}) => ({ teams: teams.map(k => T[k]), hints, phrases, wiki });

export const aliases = {
  "arg-fra-2022": m(["arg", "fra"], ["2022", "3-3", "qatar", "lusail"], ["final de qatar", "final de lusail", "qatar final", "2022 world cup final", "final del mundial 2022"], { en: "2022 FIFA World Cup final", es: "Final de la Copa Mundial de Fútbol de 2022" }),
  "ita-frg-1970": m(["ita", "ger"], ["1970", "4-3", "azteca"], ["partido del siglo", "game of the century", "partita del secolo", "jogo do seculo"], { en: "Italy v West Germany (1970 FIFA World Cup)", it: "Italia-Germania 4-3" }),
  "bra-ita-1970": m(["bra", "ita"], ["1970", "4-1", "mexico 70"], ["1970 world cup final", "final de mexico 70"], { en: "1970 FIFA World Cup final" }),
  "ita-bra-1982": m(["ita", "bra"], ["1982", "3-2", "sarria"], ["tragedia del sarria", "tragedia do sarria"], { en: "Italy v Brazil (1982 FIFA World Cup)" }),
  "arg-eng-1986": m(["arg", "eng"], ["1986", "86", "2-1"], ["hand of god", "mano de dios", "goal of the century", "gol del siglo", "mao de deus"], { en: "Argentina v England (1986 FIFA World Cup)" }),
  "uru-bra-1950": m(["uru", "bra"], ["1950", "maracana"], ["maracanazo", "maracanaco"], { en: "Uruguay v Brazil (1950 FIFA World Cup)", es: "Maracanazo" }),
  "frg-hun-1954": m(["ger", "hun"], ["1954", "3-2", "bern"], ["miracle of bern", "milagro de berna", "wunder von bern", "milagre de berna"], { en: "1954 FIFA World Cup final" }),
  "eng-frg-1966": m(["eng", "ger"], ["1966", "4-2", "wembley"], ["1966 world cup final"], { en: "1966 FIFA World Cup final" }),
  "fra-frg-1982": m(["fra", "ger"], ["1982", "3-3", "seville", "sevilla"], ["night of seville", "noche de sevilla", "nuit de seville", "schumacher battiston"], { en: "West Germany v France (1982 FIFA World Cup)" }),
  "fra-bra-1986": m(["fra", "bra"], ["1986", "guadalajara"], [], { en: "Brazil v France (1986 FIFA World Cup)" }),
  "bra-ger-2014": m(["bra", "ger"], ["2014", "7-1", "1-7"], ["mineirazo"], { en: "Brazil v Germany (2014 FIFA World Cup)" }),
  "bra-chi-2014": m(["bra", "chi"], ["2014", "pinilla", "jara"], ["pinilla crossbar", "travesano de pinilla", "palo de pinilla"], { en: "Brazil v Chile (2014 FIFA World Cup)" }),
  "swe-bra-1958": m(["swe", "bra"], ["1958", "5-2", "2-5"], ["1958 world cup final"], { en: "1958 FIFA World Cup final" }),
  "frg-ned-1974": m(["ger", "ned"], ["1974", "2-1"], ["1974 world cup final"], { en: "1974 FIFA World Cup final" }),
  "uru-arg-1930": m(["uru", "arg"], ["1930", "4-2"], ["1930 world cup final", "final de 1930", "primera final"], { en: "1930 FIFA World Cup final" }),
  "por-prk-1966": m(["por", "prk"], ["1966", "5-3"], [], { en: "Portugal v North Korea (1966 FIFA World Cup)" }),
  "den-uru-1986": m(["den", "uru"], ["1986", "6-1"], ["danish dynamite"], {}),
  "arg-ned-1978": m(["arg", "ned"], ["1978", "3-1"], ["1978 world cup final"], { en: "1978 FIFA World Cup final" }),
  "ned-bra-1994": m(["ned", "bra"], ["1994", "3-2"], [], {}),
  "por-esp-2018": m(["por", "esp"], ["2018", "3-3"], [], { en: "Portugal v Spain (2018 FIFA World Cup)" }),
  "bra-eng-1970": m(["bra", "eng"], ["1970"], ["banks save", "atajada de banks"], {}),
  "eng-cro-2026": m(["eng", "cro"], ["2026", "4-2"], [], {}),
  "arg-cpv-2026": m(["arg", "cpv"], ["2026", "3-2"], [], {}),
  "mil-liv-2005": m(["milan", "liverpool"], ["2005", "3-3", "istanbul", "estambul"], ["miracle of istanbul", "milagro de estambul", "milagre de istambul", "istanbul 2005", "night in istanbul", "estambul 2005"], { en: "2005 UEFA Champions League final", es: "Final de la Liga de Campeones de la UEFA 2004-05" }),
  "mun-bay-1999": m(["manutd", "bayern"], ["1999", "99", "2-1", "camp nou"], ["1999 champions league final"], { en: "1999 UEFA Champions League final" }),
  "bar-psg-2017": m(["barca", "psg"], ["2017", "6-1"], ["la remontada", "remontada del barca"], { en: "Barcelona 6–1 Paris Saint-Germain" }),
  "rma-ein-1960": m(["real", "eintracht"], ["1960", "7-3"], ["hampden 1960"], { en: "1960 European Cup final" }),
  "rma-rei-1956": m(["real", "reims"], ["1956", "4-3"], [], { en: "1956 European Cup final" }),
  "wer-and-1993": m(["werder", "anderlecht"], ["1993", "5-3"], [], {}),
  "aja-tot-2019": m(["ajax", "spurs"], ["2019", "lucas moura", "moura"], ["lucas moura hat trick", "lucas moura hat-trick"], {}),
  "juv-mun-1999": m(["juve", "manutd"], ["1999", "3-2", "keane"], [], {}),
  "mon-rma-2004": m(["monaco", "real"], ["2004", "3-1", "morientes"], [], {}),
  "mon-dep-2003": m(["monaco", "depor"], ["2003", "8-3"], [], {}),
  "liv-bar-2019": m(["liverpool", "barca"], ["2019", "4-0", "anfield", "origi"], ["corner taken quickly"], { en: "Liverpool 4–0 Barcelona" }),
  "bay-bar-2020": m(["bayern", "barca"], ["2020", "8-2", "2-8"], [], {}),
  "rma-mci-2022": m(["real", "city"], ["2022", "rodrygo"], [], {}),
  "rma-atm-2014": m(["real", "atleti"], ["2014", "4-1", "lisbon", "lisboa", "92:48", "93"], ["la decima"], { en: "2014 UEFA Champions League final" }),
  "bar-bay-2015": m(["barca", "bayern"], ["2015", "3-0", "boateng"], [], {}),
  "bay-bvb-2013": m(["bayern", "dortmund"], ["2013", "wembley", "robben"], [], { en: "2013 UEFA Champions League final" }),
  "mil-bar-1994": m(["milan", "barca"], ["1994", "4-0", "athens", "atenas"], [], { en: "1994 UEFA Champions League final" }),
  "rma-psg-2022": m(["real", "psg"], ["2022", "3-1", "benzema"], [], {}),
  "riv-boc-2018": m(["river", "boca"], ["2018", "madrid", "bernabeu", "3-1", "quintero"], ["final de madrid", "la final del mundo"], { en: "2018 Copa Libertadores finals", es: "Final de la Copa Libertadores 2018" }),
  "est-cru-2009": m(["estudiantes", "cruzeiro"], ["2009", "mineirao"], [], { en: "2009 Copa Libertadores finals" }),
  "flu-ldu-2008": m(["flu", "ldu"], ["2008"], [], { en: "2008 Copa Libertadores finals" }),
  "pen-ame-1987": m(["penarol", "america"], ["1987", "aguirre"], [], { en: "1987 Copa Libertadores finals" }),
  "ind-col-1973": m(["independiente", "colocolo"], ["1973"], [], { en: "1973 Copa Libertadores finals" }),
  "est-pal-1968": m(["estudiantes", "palmeiras"], ["1968"], [], { en: "1968 Copa Libertadores finals" }),
  "pen-riv-1966": m(["penarol", "river"], ["1966"], [], { en: "1966 Copa Libertadores finals" }),
  "san-fla-2011": m(["santos", "flamengo"], ["2011", "5-4", "4-5", "neymar", "ronaldinho"], [], {}),
  "liv-new-1996": m(["liverpool", "newcastle"], ["1996", "4-3", "collymore"], [], { en: "Liverpool F.C. 4–3 Newcastle United F.C. (1996)" }),
  "new-ars-2011": m(["newcastle", "arsenal"], ["2011", "4-4", "tiote"], [], { en: "Newcastle United F.C. 4–4 Arsenal F.C." }),
  "nap-mil-1988": m(["napoli", "milan"], ["1988", "1989", "4-1"], [], {}),
  "ars-mun-1999": m(["arsenal", "manutd"], ["1999", "giggs", "villa park"], ["giggs goal", "gol de giggs"], { en: "Arsenal 1–2 Manchester United (1999)" }),
  "fra-ita-2000": m(["fra", "ita"], ["2000", "trezeguet", "golden goal"], ["euro 2000 final", "final de la euro 2000"], { en: "UEFA Euro 2000 final" }),
  "eng-hun-1953": m(["eng", "hun"], ["1953", "6-3", "3-6", "wembley"], ["match of the century"], { en: "England v Hungary (1953)" }),
};
