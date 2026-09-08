import { LayoutGroup, motion } from "motion/react";
import type { AlgEntry } from "../../shared/types";
import { IconCheck } from "./icons";

interface Props {
  algorithms: AlgEntry[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

const SOURCE_LABEL: Record<string, string> = { speedcubedb: "SpeedCubeDB", jperm: "J Perm", f2ltrainer: "F2L Trainer" };

const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } } };
const rowVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const } },
};

function moveTokens(alg: string) {
  return alg.split(/([URFDLBMESxyzurfdlb]w?[23]?['’]?)/g).map((token, index) => {
    return /^[URFDLBMESxyzurfdlb]w?[23]?['’]?$/.test(token)
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
              <div className="badges">
                {i === 0 && <span className="chip accent">Primary</span>}
                {a.recommended_by?.includes("jperm") && <span className="chip">J Perm pick</span>}
                {a.votes !== undefined && <span className="chip">▲ {a.votes}</span>}
                {a.stm !== undefined && <span className="chip">{a.stm} STM</span>}
                {a.gen && <span className="chip">{a.gen}</span>}
                <span className="chip">{SOURCE_LABEL[a.source] ?? a.source}</span>
                {a.youtube && (
                  <a className="chip" href={a.youtube} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    Video
                  </a>
                )}
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </LayoutGroup>
  );
}
