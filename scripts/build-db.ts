/**
 * Consolide les sources brutes (data/raw/*.json) en une base d'algorithmes CFOP
 * prête à l'emploi (data/*.json), avec pour chaque cas :
 *   - les algorithmes classés (votes SpeedCubeDB, reco JPerm, F2LTrainer)
 *   - un `setup` calculé = inverse de l'algo principal (via cubing.js)
 *   - des `setups_alt` (setup SpeedCubeDB, scrambles F2LTrainer)
 *   - une vérification : setup + algo => état attendu (résolu / OLL fait / F2L fait)
 *
 * Usage : npx tsx scripts/build-db.ts [--verify-only]
 */
import { Alg } from "cubing/alg";
import { cube3x3x3 } from "cubing/puzzles";
import type { KPattern } from "cubing/kpuzzle";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const RAW = join(ROOT, "data", "raw");
const OUT = join(ROOT, "data");
const VERIFY_ONLY = process.argv.includes("--verify-only");

const readJson = <T = any>(name: string): T => JSON.parse(readFileSync(join(RAW, name), "utf8"));

// ---------------------------------------------------------------------------
// cubing.js helpers
// ---------------------------------------------------------------------------
const kpuzzle = await cube3x3x3.kpuzzle();
const SOLVED = kpuzzle.defaultPattern();

/** Normalise une chaîne d'algo : parse, aplatit les parenthèses, espace canonique. */
function canon(alg: string): string | null {
  try {
    return new Alg(alg).expand().toString().trim();
  } catch {
    return null;
  }
}

/** Setup = inverse de l'algo, sans parenthèses, mouvements annulés/simplifiés. */
function makeSetup(alg: string): string {
  const inv = new Alg(alg).invert().expand();
  let out: string;
  try {
    out = inv.experimentalSimplify({ cancel: true }).toString();
  } catch {
    out = inv.toString();
  }
  // "U2'" is valid SiGN but unusual for humans → "U2"
  return out.replace(/2'/g, "2");
}

const AUFS = ["", "U", "U2", "U'"];
const ROTATIONS: string[] = (() => {
  const seen = new Map<string, string>();
  const gens = ["", "x", "x2", "x'", "y", "y2", "y'", "z", "z2", "z'"];
  for (const a of gens)
    for (const b of gens) {
      const alg = `${a} ${b}`.trim();
      const key = JSON.stringify(SOLVED.applyAlg(alg).patternData.CENTERS);
      if (!seen.has(key)) seen.set(key, alg);
    }
  return [...seen.values()];
})();
const CENTERS_KEY = JSON.stringify(SOLVED.patternData.CENTERS.pieces);

/** Ramène le cube dans l'orientation standard (centres à leur place). */
function normalizeOrientation(p: KPattern): KPattern | null {
  for (const rot of ROTATIONS) {
    const q = rot ? p.applyAlg(rot) : p;
    if (JSON.stringify(q.patternData.CENTERS.pieces) === CENTERS_KEY) return q;
  }
  return null;
}

/** Indices des pièces de la couche U (déterminés dynamiquement). */
const U_LAYER = (() => {
  const u = SOLVED.applyAlg("U").patternData;
  const idx = (orbit: "EDGES" | "CORNERS") =>
    u[orbit].pieces.map((p, i) => (p !== i ? i : -1)).filter((i) => i >= 0);
  return { EDGES: new Set(idx("EDGES")), CORNERS: new Set(idx("CORNERS")) };
})();

type Check = "solved" | "oll" | "f2l";

function piecesOk(p: KPattern, check: Check): boolean {
  const d = p.patternData;
  for (const orbit of ["EDGES", "CORNERS"] as const) {
    const { pieces, orientation } = d[orbit];
    for (let i = 0; i < pieces.length; i++) {
      const inU = U_LAYER[orbit].has(i);
      if (check === "solved" || !inU) {
        if (pieces[i] !== i || orientation[i] !== 0) return false;
      } else if (check === "oll") {
        if (orientation[i] !== 0) return false; // orienté, position libre
      }
      // check === "f2l" : couche U ignorée
    }
  }
  return true;
}

/** setup + alg atteint-il l'état attendu (à un AUF près, orientation du cube ignorée) ? */
function verify(setup: string, alg: string, check: Check): boolean {
  let p: KPattern;
  try {
    p = SOLVED.applyAlg(setup).applyAlg(alg);
  } catch {
    return false;
  }
  for (const auf of AUFS) {
    const q = normalizeOrientation(auf ? p.applyAlg(auf) : p);
    if (q && piecesOk(q, check)) return true;
  }
  return false;
}

/** Retourne l'AUF ("" si aucun) à jouer avant `alg` pour que setup + auf + alg atteigne l'état, ou null. */
function findPreAuf(setup: string, alg: string, check: Check): string | null {
  for (const auf of AUFS) if (verify(`${setup} ${auf}`.trim(), alg, check)) return auf;
  return null;
}

// ---------------------------------------------------------------------------
// Types de sortie
// ---------------------------------------------------------------------------
interface AlgEntry {
  alg: string;
  source: "speedcubedb" | "jperm" | "f2ltrainer";
  votes?: number;
  etm?: number;
  stm?: number;
  gen?: string;
  youtube?: string;
  recommended_by?: string[];
  /** AUF à jouer AVANT l'algo depuis l'état `setup` (l'algo est écrit depuis un autre angle). */
  pre_auf?: string;
  verified: boolean;
}
interface CaseEntry {
  id: string;
  name: string;
  group: string;
  subgroup?: string;
  probability?: string;
  stickers?: Record<string, string>;
  facelets?: string;
  algorithms: AlgEntry[];
  setup: string;
  setups_alt: string[];
  verified: boolean;
}

const stats = { cases: 0, algs: 0, algsDropped: 0, setupsAltDropped: 0, casesFailed: [] as string[] };

/** Fusionne + déduplique + vérifie une liste d'algos (ordre = priorité). */
function mergeAlgs(check: Check, ...lists: Omit<AlgEntry, "verified">[][]): { algs: AlgEntry[]; setup: string } {
  const byKey = new Map<string, AlgEntry>();
  for (const list of lists)
    for (const a of list) {
      const key = canon(a.alg);
      if (!key) {
        stats.algsDropped++;
        console.warn(`  ! algo non parsable ignoré : ${a.alg}`);
        continue;
      }
      const existing = byKey.get(key);
      if (existing) {
        if (a.recommended_by) existing.recommended_by = [...(existing.recommended_by ?? []), ...a.recommended_by];
        if (a.votes !== undefined && existing.votes === undefined) Object.assign(existing, { votes: a.votes, etm: a.etm, stm: a.stm, gen: a.gen, youtube: a.youtube });
        continue;
      }
      byKey.set(key, { ...a, alg: a.alg.trim(), verified: false });
    }
  const algs = [...byKey.values()];
  // référence = premier algo (le plus voté SpeedCubeDB) ; setup = son inverse
  const setup = makeSetup(algs[0].alg);
  for (const a of algs) {
    const pre = findPreAuf(setup, a.alg, check);
    a.verified = pre !== null;
    if (pre) a.pre_auf = pre;
    if (!a.verified) {
      stats.algsDropped++;
      console.warn(`  ! algo ne résout pas le cas depuis le setup (retiré) : ${a.alg}`);
    }
  }
  const kept = algs.filter((a) => a.verified);
  stats.algs += kept.length;
  return { algs: kept, setup };
}

function checkSetupsAlt(setups: string[], alg: string, check: Check): string[] {
  const ok: string[] = [];
  for (const s of setups) {
    if (!s) continue;
    const pre = findPreAuf(s, alg, check);
    if (pre !== null) {
      const full = `${s.trim()} ${pre}`.trim();
      if (!ok.includes(full)) ok.push(full);
    } else {
      stats.setupsAltDropped++;
      console.warn(`  ! setup alternatif invalide (retiré) : ${s}`);
    }
  }
  return ok;
}

function finish(c: CaseEntry): CaseEntry {
  stats.cases++;
  c.verified = c.algorithms.length > 0 && verify(c.setup, c.algorithms[0].alg, c.id.startsWith("OLL") ? "oll" : c.id.startsWith("PLL") ? "solved" : "f2l");
  if (!c.verified) stats.casesFailed.push(c.id);
  return c;
}

const scdbAlgs = (alts: any[]): Omit<AlgEntry, "verified">[] =>
  [...alts]
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
    .map((a) => ({ alg: a.alg, source: "speedcubedb" as const, votes: a.votes ?? undefined, etm: a.etm ?? undefined, stm: a.stm ?? undefined, gen: a.gen ?? undefined, youtube: a.yt ? `https://www.youtube.com/watch?v=${a.yt}` : undefined }));
const jpermAlgs = (algs: string[]): Omit<AlgEntry, "verified">[] =>
  algs.map((alg, i) => ({ alg, source: "jperm" as const, recommended_by: i === 0 ? ["jperm"] : undefined }));
const f2ltAlgs = (algs: string[]): Omit<AlgEntry, "verified">[] =>
  algs.map((alg, i) => ({ alg, source: "f2ltrainer" as const, recommended_by: i === 0 ? ["f2ltrainer"] : undefined }));

// ---------------------------------------------------------------------------
// PLL
// ---------------------------------------------------------------------------
function buildPLL(): CaseEntry[] {
  console.log("== PLL");
  const scdb = readJson<any[]>("speedcubedb_pll.json");
  const jperm = readJson<any[]>("jperm_pll.json");
  const andy = readJson<any[]>("andyjudson_pll.json");
  return scdb.map((c) => {
    const j = jperm.find((x) => x.name === c.name);
    const a = andy.find((x) => x.wca_id === c.name);
    const { algs, setup } = mergeAlgs("solved", scdbAlgs(c.alts), j ? jpermAlgs(j.alg) : []);
    return finish({
      id: `PLL ${c.name}`,
      name: a?.name ?? `${c.name} Perm`,
      group: j?.group ?? c.subgroup,
      subgroup: c.subgroup,
      probability: a?.prob ?? (j ? `${j.prob}/72` : undefined),
      stickers: c.stickers ?? undefined,
      algorithms: algs,
      setup,
      setups_alt: checkSetupsAlt([c.setup], algs[0].alg, "solved"),
      verified: false,
    });
  });
}

// ---------------------------------------------------------------------------
// OLL
// ---------------------------------------------------------------------------
function buildOLL(): CaseEntry[] {
  console.log("== OLL");
  const scdb = readJson<any[]>("speedcubedb_oll.json");
  const jperm = readJson<any[]>("jperm_oll.json");
  const andy = readJson<any[]>("andyjudson_oll.json");
  return scdb.map((c) => {
    const n = Number(/(\d+)\s*$/.exec(c.name)?.[1]);
    const j = jperm.find((x) => Number(x.name) === n);
    const a = andy.find((x) => Number(x.wca_id) === n);
    const { algs, setup } = mergeAlgs("oll", scdbAlgs(c.alts), j ? jpermAlgs(j.alg) : []);
    return finish({
      id: `OLL ${n}`,
      name: a?.name ?? `OLL ${n}`,
      group: j?.group ?? c.subgroup,
      subgroup: c.subgroup,
      probability: a?.prob ?? (j ? `${j.prob}/216` : undefined),
      stickers: c.stickers ?? undefined,
      algorithms: algs,
      setup,
      setups_alt: checkSetupsAlt([c.setup], algs[0].alg, "oll"),
      verified: false,
    });
  });
}

// ---------------------------------------------------------------------------
// F2L (41 cas standards, slot avant-droit) + jeux avancés F2LTrainer
// ---------------------------------------------------------------------------
function buildF2L(): { basic: CaseEntry[]; advanced: CaseEntry[]; expert: CaseEntry[] } {
  console.log("== F2L");
  const scdb = readJson<any[]>("speedcubedb_f2l.json");
  const ft = readJson<any>("f2ltrainer_dave2ooo.json");
  const categoryOf = (group: string, n: number): string =>
    ft.groups[group].categories.find((c: any) => c.cases.includes(n))?.name ?? "";

  const basic = scdb.map((c) => {
    const n = Number(/(\d+)\s*$/.exec(c.name)?.[1]);
    const ftAlgs: string[] = ft.algs.basic[n] ?? [];
    const ftScr: string[] = ft.scrambles.basic[n] ?? [];
    const { algs, setup } = mergeAlgs("f2l", scdbAlgs(c.alts_by_ori["0"] ?? []), f2ltAlgs(ftAlgs));
    return finish({
      id: `F2L ${n}`,
      name: `F2L ${n}`,
      group: c.subgroup,
      subgroup: categoryOf("basic", n),
      facelets: c.facelets ?? undefined,
      algorithms: algs,
      setup,
      setups_alt: checkSetupsAlt([c.setup, ...ftScr], algs[0].alg, "f2l"),
      verified: false,
    });
  });

  const fromFT = (group: "advanced" | "expert", prefix: string): CaseEntry[] => {
    console.log(`== F2L ${group} (F2LTrainer)`);
    const ids = Object.keys(ft.algs[group]).map(Number).sort((a, b) => a - b);
    return ids.map((n) => {
      const { algs, setup } = mergeAlgs("f2l", f2ltAlgs(ft.algs[group][n]));
      const label = ft.groups[group].caseNumberMapping?.[n];
      return finish({
        id: `${prefix} ${n}`,
        name: label ? `${prefix} ${n} (${label})` : `${prefix} ${n}`,
        group: ft.groups[group].name,
        subgroup: categoryOf(group, n),
        algorithms: algs,
        setup,
        setups_alt: checkSetupsAlt(ft.scrambles[group][n] ?? [], algs[0].alg, "f2l"),
        verified: false,
      });
    });
  };
  return { basic, advanced: fromFT("advanced", "F2L-ADV"), expert: fromFT("expert", "F2L-EXP") };
}

// ---------------------------------------------------------------------------
// 2-look OLL / PLL (JPerm) — parcours débutant
// ---------------------------------------------------------------------------
function build2Look(file: string, prefix: string, check: Check): CaseEntry[] {
  console.log(`== ${prefix} (2-look)`);
  return readJson<any[]>(file).map((c) => {
    const { algs, setup } = mergeAlgs(check, jpermAlgs(c.alg));
    return finish({ id: `${prefix} ${c.name}`, name: c.name, group: c.group, probability: c.prob ? `${c.prob}/${check === "solved" ? 72 : 216}` : undefined, algorithms: algs, setup, setups_alt: [], verified: false });
  });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const SOURCES = {
  speedcubedb: { url: "https://speedcubedb.com/a/3x3/", provides: "setups, algorithmes alternatifs classés par votes, movecount ETM/STM, liens YouTube" },
  jperm: { url: "https://jperm.net/algs/", provides: "algorithme recommandé par cas, groupes de formes, probabilités, 2-look OLL/PLL" },
  f2ltrainer: { url: "https://github.com/Dave2ooo/F2LTrainer", license: "MIT", provides: "F2L 41 cas + 60 avancés + 33 experts, avec scrambles de setup" },
  andyjudson_cfop: { url: "https://github.com/andyjudson/cfop", license: "MIT", provides: "noms des cas OLL/PLL, probabilités" },
  cubing_js: { url: "https://js.cubing.net/cubing/", license: "MPL-2.0/GPL-3.0", provides: "calcul des setups (inverse) et vérification de chaque cas" },
};

const out = (name: string, set: string, cases: CaseEntry[], extra: Record<string, unknown> = {}) => {
  const doc = { set, generated: new Date().toISOString().slice(0, 10), count: cases.length, sources: SOURCES, conventions: { orientation: "cross en bas (D), dernière couche en haut (U) ; les algos F2L visent le slot avant-droit (FR)", setup: "appliquer `setup` sur un cube résolu pour obtenir le cas ; `setups_alt` sont des alternatives équivalentes ; ajouter un AUF aléatoire (U/U2/U') avant pour varier l'angle", verified: "setup + algorithms[0] ramène l'état attendu (résolu / OLL fait / paire insérée) à un AUF près" }, ...extra, cases };
  if (!VERIFY_ONLY) writeFileSync(join(OUT, name), JSON.stringify(doc, null, 2) + "\n");
  console.log(`-> ${name}: ${cases.length} cas, ${cases.reduce((n, c) => n + c.algorithms.length, 0)} algos`);
};

const pll = buildPLL();
const oll = buildOLL();
const f2l = buildF2L();
const lookOll = build2Look("jperm_2lookoll.json", "2L-OLL", "oll");
const lookPll = build2Look("jperm_2lookpll.json", "2L-PLL", "solved");

out("pll.json", "PLL", pll);
out("oll.json", "OLL", oll);
out("f2l.json", "F2L", f2l.basic);
out("f2l-advanced.json", "F2L advanced", f2l.advanced);
out("f2l-expert.json", "F2L expert", f2l.expert);
out("2look-oll.json", "2-look OLL", lookOll);
out("2look-pll.json", "2-look PLL", lookPll);

console.log("\n== Résumé");
console.log(`cas: ${stats.cases} | algos conservés: ${stats.algs} | algos retirés: ${stats.algsDropped} | setups alternatifs retirés: ${stats.setupsAltDropped}`);
if (stats.casesFailed.length) {
  console.error(`CAS NON VÉRIFIÉS: ${stats.casesFailed.join(", ")}`);
  process.exit(1);
}
console.log("Tous les cas sont vérifiés.");
