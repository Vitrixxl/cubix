import type { AlgEntry } from "../../shared/types";

const SOURCE_LABEL: Record<string, string> = { speedcubedb: "SpeedCubeDB", jperm: "J Perm", f2ltrainer: "F2L Trainer" };

function sourceLabel(source: string) {
  if (SOURCE_LABEL[source]) return SOURCE_LABEL[source];
  if (source.startsWith("Cubix")) return "Cubix drill";
  const sites: Record<string, string> = { "jperm.net": "J Perm", "speedcubedb.com": "SpeedCubeDB", "jaapsch.net": "Jaap's Puzzle Page", "cubezone.be": "CubeZone", "cubeskills.com": "CubeSkills", "speedcube.com.au": "Speedcube", "sarah.cubing.net": "Sarah Strong", "youtube.com": "Cubing World" };
  return Object.entries(sites).find(([domain]) => source.includes(domain))?.[1] ?? source;
}

function moveTokens(alg: string) {
  const notation = /(\(-?\d+,\s*-?\d+\)|(?:UR|UL|DR|DL|ALL|[URDLFB])\d+[+-]|[RD](?:\+\+|--)|\d*[URFDLBMESxyzurfdlb]w?[23]?['’]?|\/)/g;
  return alg.split(notation).map((token, index) => {
    return index % 2
      ? <span className="alg-move" key={index}>{token}</span>
      : token;
  });
}

export function AlgText({ alg, preAuf, className = "" }: { alg: string; preAuf?: string; className?: string }) {
  return (
    <span className={`alg-text ${className}`}>
      {preAuf && <span className="pre-auf">({moveTokens(preAuf)}) </span>}
      {moveTokens(alg)}
    </span>
  );
}

export function AlgorithmBadges({algorithm: a, primary = false}: {algorithm: AlgEntry; primary?: boolean}) {
  return (
    <div className="badges">
      {primary && <span className="chip accent">Primary</span>}
      {a.recommended_by?.includes("jperm") && <span className="chip">J Perm pick</span>}
      {a.stm !== undefined && <span className="chip">{a.stm} STM</span>}
      <span className="chip" title={a.source}>{sourceLabel(a.source)}</span>
      {a.youtube && (
        <a className="chip" href={a.youtube} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          Video
        </a>
      )}
    </div>
  );
}
