/**
 * Fewest Moves (WCA Article E): a written solution of the scramble, read as a delegate reads it. Only letters, digits
 * and apostrophes count, other symbols are ignored (E2c4); the case is corrected, "r" read as R (E2c5); R2' reads R2
 * (E2c6). The moves are WCA notation (12a): face turns, outer block turns (Rw, 2Rw) and rotations (x, y, z); slice
 * turns (M, E, S) are not. The result is the move count in OBTM (12a5: rotations count 0); more than 80 moves in ETM
 * (rotations counted) is a DNF (E2d1), as is a solution that does not solve the scramble (E2c) or that starts with
 * four or more moves of the inverse scramble (E2e1). The attempt lasts 60 minutes (E2b).
 */
import { applyAlg, invertAlg, solved } from "../../shared/cube";
import { isSolved } from "./smartCube";
import { msg } from "../i18n/msg";

export const FMC_LIMIT_MS = 60 * 60_000;
const ETM_LIMIT = 80;
/** A move as written (face or wide, then rotation): its letter, "w", and its amount. */
const MOVE = /^(2?)([URFDLB])(w?)(2'|'2|2|')?|^([xyz])(2'|'2|2|')?/;

export type FmcSolution = { turns: string[]; moves: number; etm: number } | { error: string };

/** The moves of a written solution, normalised ("Rw2", "x'"), and its OBTM and ETM counts; or what is not WCA notation. */
export function readFmcSolution(text: string): FmcSolution {
  let rest = text.replace(/[^A-Za-z0-9'\s]/g, "").replace(/[urfdlbXYZ]/g, (c) => (c === "X" || c === "Y" || c === "Z" ? c.toLowerCase() : c.toUpperCase()));
  const turns: string[] = [];
  let moves = 0;
  while ((rest = rest.trimStart())) {
    const m = MOVE.exec(rest);
    if (!m) return { error: /^[MES]/.test(rest) ? msg("No slice moves: {0}", { 0: rest[0] }) : msg("Not WCA notation: {0}", { 0: rest.split(/\s/)[0] }) };
    const amount = (m[4] ?? m[6]) === "'" ? "'" : (m[4] ?? m[6]) ? "2" : "";
    if (m[5]) turns.push(m[5] + amount);
    else {
      if (m[1] && !m[3]) return { error: msg("Not WCA notation: {0}", { 0: m[0] }) };
      turns.push(m[2] + m[3] + amount);
      moves++;
    }
    rest = rest.slice(m[0].length);
  }
  return { turns, moves, etm: turns.length };
}

export type FmcResult = { moves: number; solution: string; dnf: false } | { moves: number | null; solution: string; dnf: true; why: string };

/** The result of a solution of `scramble`: its move count, or a DNF and why. */
export function fmcResult(scramble: string, text: string): FmcResult {
  const read = readFmcSolution(text);
  if ("error" in read) return { moves: null, solution: text.trim(), dnf: true, why: read.error };
  const solution = read.turns.join(" "), dnf = (why: string): FmcResult => ({ moves: read.moves, solution, dnf: true, why });
  if (!read.turns.length) return dnf(msg("No solution"));
  if (read.etm > ETM_LIMIT) return dnf(msg("Over 80 moves"));
  const inverse = invertAlg(scramble).split(" ");
  if (read.turns.length >= 4 && read.turns.slice(0, 4).every((t, i) => t === inverse[i])) return dnf(msg("Taken from the scramble"));
  if (!isSolved(applyAlg(applyAlg(solved(), scramble), solution))) return dnf(msg("Not solved"));
  return { moves: read.moves, solution, dnf: false };
}
