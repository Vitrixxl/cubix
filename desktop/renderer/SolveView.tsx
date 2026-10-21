/**
 * A solve on its own: its time, scramble and solution, the solution played in 3D on the scrambled cube when it is
 * known, recorded by a smart cube or written by hand. The owner writes it in a field always there (its turns,
 * rotations and slices included, played as they are typed), share the solve by a link, and set its penalty, comment or delete it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link2Off, Share2, Trash2 } from "lucide-react";
import { call } from "./bridge";
import { store as s } from "./store";
import { Alg, Button, Empty, FOCUS, LABEL, NUMERIC, PenaltyToggles, Surface, usePhone } from "./ui";
import { PlayerAlg, PlayerControls, PlayerCube, ViewButtons, useAlgPlayer } from "./AlgPlayer";
import { PhaseSplits, SolveAnalysisButton, SolveSteps, capitalised, colourLabel } from "./SolveAnalysis";
import { FACE_COLORS } from "../../src/shared/cubeAppearance";
import { annotationAlg, heldAlg, pressTurn, readAnnotation, readSolution, readTurns, writeAnnotation, type Annotation, type Colour } from "../../src/client/lib/solution";
import { mergeTurns } from "../../src/client/lib/solveAnalysis";
import { fmtSolveOf, fmtTime, type Solved } from "../../src/client/lib/format";
import { ScrambleLines } from "./attempts";
import { attemptMode, puzzleInfo, puzzleOf, relayOf, type StoredContext } from "../../src/shared/puzzles";
import { Button as UiButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { language, tr } from "../../src/client/i18n";
import { localePath } from "../../src/client/lib/route";
import { Brand } from "./logo";
import { applyTheme } from "./theme";
import { cachedAppearance } from "../../src/client/lib/appearance";

export type ViewedSolve = StoredContext & {
  id?: number;
  time_ms: number;
  penalty: string;
  scramble?: string | null;
  solution?: string | null;
  /** Blindfolded: the memorisation, when it was marked. */
  memo_ms?: number | null;
  /** Timed in phases: when each phase but the last ended. */
  splits?: number[] | null;
  /** Fewest Moves' move count, Multi-Blind's cubes. */
  moves?: number | null;
  cubes_solved?: number | null;
  cubes_attempted?: number | null;
  comment?: string | null;
  created_at?: string;
  displayDate?: string;
  /** Whose solve it is, when it is not the account's (a shared one). */
  username?: string;
};

/** Each colour as the 3D cube draws it (its faces seen yellow on top, blue in front). */
const SWATCH: Record<Colour, string> = { white: FACE_COLORS.D, yellow: FACE_COLORS.U, green: FACE_COLORS.B, blue: FACE_COLORS.F, red: FACE_COLORS.R, orange: FACE_COLORS.L };
const colourName = (c: Colour) => capitalised(colourLabel(c));

/** How the solution plays on the cube Cubix shows the scramble on; null when there is none to play. */
function played(solution: string | null | undefined) {
  const recorded = readSolution(solution);
  if (recorded) return heldAlg(recorded.map((turn) => turn.move));
  const annotation = readAnnotation(solution);
  return annotation?.moves ? annotationAlg(annotation) : null;
}

export function SolveView({ solve, owner = false }: { solve: ViewedSolve; owner?: boolean }) {
  const phone = usePhone(),
    size = puzzleInfo(puzzleOf(solve)).cubeSize,
    // The scramble as the cube Cubix shows it; a scramble it cannot follow leaves no cube to play on.
    setup = useMemo(() => (solve.scramble ? heldAlg(solve.scramble.trim().split(/\s+/)) : null), [solve.scramble]),
    cube = !!size && setup !== null,
    // Fewest Moves keeps the solution written, never turns recorded on a cube.
    fmc = solve.solve_mode === "fewest-moves",
    recorded = useMemo(() => (fmc ? null : readSolution(solve.solution)), [solve.solution, fmc]),
    annotation = fmc ? null : readAnnotation(solve.solution),
    // The owner writes the turns of a solve no cube recorded, in a field always there, played as they are typed.
    writable = owner && !recorded && !fmc && cube && solve.id !== undefined,
    [moves, setMoves] = useState(annotation?.moves ?? ""),
    draft: Annotation = { top: annotation?.top ?? "yellow", front: annotation?.front ?? "green", moves },
    draftText = writeAnnotation(draft),
    alg = (writable ? (draftText && moves.trim() ? annotationAlg(draft) : "") : played(solve.solution)) ?? "",
    player = useAlgPlayer(alg, cube ? size : null, "full", { setup: setup ?? undefined });
  useEffect(() => setMoves(readAnnotation(solve.solution)?.moves ?? ""), [solve.id]);

  const save = async () => {
    if (!draftText || moves.trim() === (annotation?.moves ?? "") || solve.id === undefined) return;
    try {
      await call("setSolution", solve.id, moves.trim() ? draftText : null);
      s.overlaySolve = { ...s.overlaySolve, solution: moves.trim() ? draftText : null };
      await s.refresh();
    } catch (e) {
      s.fail(e);
    }
  };

  const solution = fmc ? (
    <section className="flex flex-col gap-2" aria-label={tr("Solution")}>
      <span className={LABEL}>{tr("Solution")}</span>
      {solve.solution ? <Alg text={solve.solution} size={15} className="text-foreground/90" /> : <p className="text-sm text-muted-foreground">{tr("No solution")}</p>}
    </section>
  ) : (
    <section className="flex flex-col gap-2" aria-label={tr("Solution")} data-solution>
      <div className="flex min-h-7 items-center gap-3">
        <span className={LABEL}>{tr("Solution")}</span>
        {recorded && <SolutionFigures turns={recorded} />}
        {annotation && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Swatch colour={annotation.top} /> {tr("on top")} · <Swatch colour={annotation.front} /> {tr("in front")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {recorded && solve.id !== undefined && <SolveAnalysisButton solve={solve} turns={recorded} />}
        </div>
      </div>
      {writable ? (
        <TurnsField turns={moves.split(" ").filter(Boolean)} onChange={(turns) => setMoves(turns.join(" "))} onDone={save} />
      ) : alg && player ? (
        <PlayerAlg key={alg} player={player} text={recorded ? "z2 " + alg : annotation!.moves} size={16} className="max-h-32 overflow-y-auto" />
      ) : (
        !(owner && cube) && <p className="text-sm text-muted-foreground">{tr("No turns recorded for this solve.")}</p>
      )}
    </section>
  );

  return (
    <div className={cn("flex min-h-0 gap-6", phone ? "flex-col" : "items-stretch")}>
      {cube && player && (
        <div className={cn("flex shrink-0 flex-col items-center gap-3", !phone && "w-80")}>
          <div className="relative">
            <PlayerCube key={alg + setup} player={player} size={phone ? 240 : 300} />
            <ViewButtons player={player} className="absolute bottom-0 left-1/2 -translate-x-1/2" />
          </div>
          {alg && <PlayerControls player={player} compact touch={phone} className="w-full" />}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <header className="flex flex-col gap-1 pr-8">
          <span className={cn(NUMERIC, "text-5xl leading-none font-extrabold tracking-[-0.04em] md:text-6xl", solve.penalty === "dnf" && "text-destructive", solve.penalty === "+2" && "text-warning")}>
            {fmtSolveOf(solve as Solved)}
          </span>
          {fmc && <span className={cn(NUMERIC, "text-sm font-semibold")}>{fmtTime(solve.time_ms)}</span>}
          {solve.memo_ms != null && (
            <span className={cn(NUMERIC, "text-sm font-semibold")}>
              {tr("Memo {0} · execution {1}", { 0: fmtTime(solve.memo_ms), 1: fmtTime(solve.time_ms - solve.memo_ms) })}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {[solve.username, puzzleInfo(puzzleOf(solve)).label, solve.displayDate ?? (solve.created_at && new Date(solve.created_at).toLocaleString())].filter(Boolean).join(" · ")}
          </span>
        </header>
        <PhaseSplits solve={solve} />
        {solve.scramble && (
          <section className="flex flex-col gap-2" aria-label={tr("Scramble")}>
            <span className={LABEL}>{tr("Scramble")}</span>
            {solve.solve_mode === "multi-blind" || relayOf(puzzleOf(solve)) ? <ScrambleLines text={solve.scramble} size={15} puzzle={puzzleOf(solve)} /> : <Alg text={solve.scramble} size={15} className="text-foreground/90" />}
          </section>
        )}
        {/* A visitor sees no solution where none was recorded. */}
        {(owner || recorded || annotation || fmc) && solution}
        {!owner && recorded && <SolveSteps scramble={solve.scramble} turns={recorded} />}
        {owner && solve.id !== undefined ? <CommentField key={solve.id} solve={solve} focus={s.commenting} /> : solve.comment && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{solve.comment}</p>}
        {owner && solve.id !== undefined && (
          // The same actions as under the timer: the penalties, the comment, the link, then delete apart.
          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            {!attemptMode(solve.solve_mode) && <PenaltyToggles penalty={solve.penalty} prefix={"penalty:" + solve.id + ":"} />}
            {/* A guest is asked to sign in first (store.ts). */}
            <Button action={"share:" + solve.id} icon={Share2} variant="outline" className="text-muted-foreground">
              {tr("Share")}
            </Button>
            <Button action={"delete:" + solve.id} icon={Trash2} variant="outline" className="ml-auto text-muted-foreground hover:text-destructive">
              {tr("Delete")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The comment, always there for the owner (focused when the dialog opened for it): Enter or leaving it saves,
 * Shift+Enter breaks the line, Escape puts back the one saved. */
function CommentField({ solve, focus }: { solve: ViewedSolve; focus: boolean }) {
  const [text, setText] = useState(solve.comment ?? "");
  const save = async () => {
    if (text.trim() === (solve.comment ?? "").trim()) return;
    try {
      await call("setComment", solve.id, text.trim());
      s.overlaySolve = { ...s.overlaySolve, comment: text.trim() || null };
      await s.refresh();
    } catch (e) {
      s.fail(e);
    }
  };
  return (
    <Textarea
      autoFocus={focus}
      aria-label={tr("Comment")}
      placeholder={tr("What happened on this solve?")}
      className="min-h-20 text-sm"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.setSelectionRange(text.length, text.length)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape" && text !== (solve.comment ?? "")) {
          e.preventDefault();
          e.stopPropagation();
          setText(solve.comment ?? "");
        }
      }}
    />
  );
}

/**
 * The turns written by hand, each a chip, in a field that takes turns only: a key that is not a turn's is refused (said
 * under it), ' and 2 change the last turn, Backspace removes it, a pasted text keeps its turns (readTurns). Enter or
 * leaving the field saves.
 */
function TurnsField({ turns, onChange, onDone }: { turns: string[]; onChange: (turns: string[]) => void; onDone: () => void }) {
  const [refused, setRefused] = useState(""),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!refused) return;
    const id = setTimeout(() => setRefused(""), 2000);
    return () => clearTimeout(id);
  }, [refused]);
  // Typed one key at a time, or pasted (or put in by a phone's keyboard) at once.
  const typed = (text: string) => {
    if (!text) return;
    if (text.length > 1) return onChange([...turns, ...readTurns(text)]);
    const next = pressTurn(turns, text);
    if (next) onChange(next);
    else if (text.trim()) setRefused(text);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <InputGroup className="h-auto min-h-16 cursor-text flex-wrap content-start items-start gap-1 p-2" onClick={() => input.current?.focus()} aria-invalid={!!refused}>
        {turns.map((turn, i) => (
          <Badge key={i} variant="secondary" className="alg h-7 rounded-md px-2 font-sans text-sm font-bold">
            {turn}
          </Badge>
        ))}
        <InputGroupInput
          ref={input}
          aria-label={tr("Write the turns")}
          aria-invalid={!!refused}
          placeholder={turns.length ? "" : "x2 y R U R' U' r M' …"}
          className="h-7 min-w-24 px-1"
          value=""
          onChange={(e) => typed(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && turns.length) onChange(turns.slice(0, -1));
            else if (e.key === "Enter") e.currentTarget.blur();
            else return;
            e.preventDefault();
          }}
          onBlur={onDone}
        />
      </InputGroup>
      <span className="min-h-4 text-xs font-semibold text-destructive" role="status">
        {refused && tr("« {0} » is not a turn", { 0: refused })}
      </span>
    </div>
  );
}

/** The turns of a recorded solution, and its pace when timed. */
function SolutionFigures({ turns }: { turns: { move: string; at?: number }[] }) {
  const count = mergeTurns(turns.map((turn) => turn.move)).length,
    ms = turns.at(-1)!.at;
  return (
    <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
      {count} {tr("turns")}
      {ms ? tr(" · {0} TPS", { 0: (count / (ms / 1000)).toFixed(2) }) : ""}
    </span>
  );
}

export const Swatch = ({ colour }: { colour: Colour }) => <span className="inline-block size-3 rounded-[3px] ring-1 ring-foreground/20" style={{ background: SWATCH[colour] }} aria-label={colourName(colour)} />;

/** A solve shared by its link, as anyone opening the link sees it, signed in or not. */
export function SharedSolve({ token }: { token: string }) {
  const [solve, setSolve] = useState<ViewedSolve | null | undefined>(undefined);
  // The app's own look, the stored settings being the app's to read.
  useEffect(() => applyTheme(cachedAppearance().themeName, matchMedia("(prefers-color-scheme: light)").matches), []);
  useEffect(() => {
    fetch(location.origin + "/api/shared/" + encodeURIComponent(token))
      .then((response) => (response.ok ? response.json() : null))
      .then(setSolve, () => setSolve(null));
  }, [token]);
  return (
    <div className="flex h-svh flex-col items-center gap-4 overflow-hidden bg-background px-4 py-4 md:gap-6 md:py-8">
      <header className="flex w-full max-w-4xl shrink-0 items-center gap-3">
        <a href="/" className={cn("flex items-center gap-2 rounded-md", FOCUS)}>
          <Brand className="text-2xl" />
        </a>
        <UiButton variant="outline" className="ml-auto" render={<a href={localePath(language(), "/timer")} />}>
          {tr("Open Qbix")}
        </UiButton>
      </header>
      <main className="flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        {/* The page stays the window's height: a solve taller than it scrolls in its card. */}
        <Surface className="min-h-0 overflow-y-auto p-5 md:p-8">
          {solve ? (
            <SolveView solve={solve} />
          ) : solve === null ? (
            <Empty icon={Link2Off} title={tr("This solve is not shared, or no longer.")} />
          ) : (
            <div className="flex gap-6 max-md:flex-col" aria-busy="true" aria-label={tr("Loading")}>
              <Skeleton className="size-60 shrink-0 rounded-xl md:size-80" />
              <div className="flex flex-1 flex-col gap-3">
                <Skeleton className="h-12 w-48" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          )}
        </Surface>
      </main>
    </div>
  );
}
