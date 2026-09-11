import { LayoutGroup, motion } from "motion/react";
import type { AlgEntry } from "../../shared/types";
import { IconCheck } from "./icons";

interface Props {
  algorithms: AlgEntry[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

const SOURCE_LABEL: Record<string, string> = { speedcubedb: "SpeedCubeDB", jperm: "J Perm", f2ltrainer: "F2L Trainer" };

function sourceLabel(source: string) {
  if (SOURCE_LABEL[source]) return SOURCE_LABEL[source];
  if (source.startsWith("Cubix")) return "Cubix drill";
  const sites: Record<string, string> = { "jperm.net": "J Perm", "speedcubedb.com": "SpeedCubeDB", "jaapsch.net": "Jaap's Puzzle Page", "cubezone.be": "CubeZone", "cubeskills.com": "CubeSkills", "speedcube.com.au": "Speedcube", "sarah.cubing.net": "Sarah Strong", "youtube.com": "Cubing World" };
  return Object.entries(sites).find(([domain]) => source.includes(domain))?.[1] ?? source;
}

const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } } };
const rowVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const } },
};

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

export function AlgorithmList({ algorithms, activeIndex, onSelect }: Props) {
  return (
    <LayoutGroup id="algorithm-list-selection">
      <motion.div className="alg-list" variants={listVariants} initial="hidden" animate="show">
        {algorithms.map((a, i) => {
          const active = i === activeIndex;
          return (
            <motion.button
              key={i}
              className={`alg-row ${active ? "active" : ""}`}
              onClick={() => onSelect(i)}
              title="Show this algorithm on the cube"
              aria-pressed={active}
              variants={rowVariants}
            >
              {active && (
                <motion.span
                  className="alg-row-selection"
                  layoutId="active-algorithm"
                  transition={{ type: "spring", stiffness: 460, damping: 38, mass: 0.8 }}
                />
              )}
              <motion.span
                className="alg-selected-indicator"
                aria-hidden="true"
                animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.65 }}
                transition={{ type: "spring", stiffness: 520, damping: 32 }}
              >
                <IconCheck />
              </motion.span>
              <AlgText alg={a.alg} preAuf={a.pre_auf} />
              <AlgorithmBadges algorithm={a} primary={i === 0} />
            </motion.button>
          );
        })}
      </motion.div>
    </LayoutGroup>
  );
}

export function AlgorithmBadges({algorithm: a, primary = false}: {algorithm: AlgEntry; primary?: boolean}) {
  return (
    <div className="badges">
      {primary && <span className="chip accent">Primary</span>}
      {a.recommended_by?.includes("jperm") && <span className="chip">J Perm pick</span>}
      {a.votes !== undefined && <span className="chip">▲ {a.votes}</span>}
      {a.stm !== undefined && <span className="chip">{a.stm} STM</span>}
      {a.gen && <span className="chip">{a.gen}</span>}
      <span className="chip" title={a.source}>{sourceLabel(a.source)}</span>
      {a.youtube && (
        <a className="chip" href={a.youtube} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          Video
        </a>
      )}
    </div>
  );
}
