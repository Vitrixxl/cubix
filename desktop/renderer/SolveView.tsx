/**
 * A solve on its own: its time, scramble and solution, the solution played in 3D on the scrambled cube when it is
 * known, recorded by a smart cube or written by hand. The owner can write it (how the cube was held, then its turns,
 * rotations and slices included), share the solve by a link, and set its penalty, comment or delete it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Delete, Link2Off, MessageSquare, PenLine, Share2, Trash2 } from "lucide-react";
import { call } from "./bridge";
import { store as s } from "./store";
import { Alg, Button, Empty, FOCUS, LABEL, NUMERIC, PenaltyToggles, Surface, usePhone } from "./ui";
import { PlayerAlg, PlayerControls, PlayerCube, ViewButtons, useAlgPlayer } from "./AlgPlayer";
import { SolveAnalysisButton, capitalised, colourLabel } from "./SolveAnalysis";
import { FACE_COLORS } from "../../src/shared/cubeAppearance";
import { annotationAlg, COLOURS, frontsOf, heldAlg, readAnnotation, readSolution, writeAnnotation, type Annotation, type Colour } from "../../src/client/lib/solution";
import { mergeTurns } from "../../src/client/lib/solveAnalysis";
import { fmtSolve } from "../../src/client/lib/format";
import { puzzleInfo, puzzleOf, type StoredContext } from "../../src/shared/puzzles";
import { Button as UiButton } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { tr } from "../../src/client/i18n";
import { Logo, Wordmark } from "./logo";
import { applyTheme } from "./theme";
import { DEFAULT_THEME } from "../../src/client/lib/theme";

export type ViewedSolve = StoredContext & {
  id?: number;
  time_ms: number;
  penalty: string;
  scramble?: string | null;
  solution?: string | null;
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
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<Annotation>(() => readAnnotation(solve.solution) ?? { top: "yellow", front: "green", moves: "" }),
    draftText = writeAnnotation(draft),
    alg = (editing ? (draftText && draft.moves ? annotationAlg(draft) : "") : played(solve.solution)) ?? "",
    player = useAlgPlayer(alg, cube ? size : null, "full", { setup: setup ?? undefined });
  const [commenting, setCommenting] = useState(s.commenting);
  useEffect(() => setEditing(false), [solve.id]);
  const recorded = readSolution(solve.solution),
    annotation = readAnnotation(solve.solution);

  const save = async () => {
    if (!draftText || solve.id === undefined) return;
    try {
      await call("setSolution", solve.id, draft.moves.trim() ? draftText : null);
      s.overlaySolve = { ...s.overlaySolve, solution: draft.moves.trim() ? draftText : null };
      setEditing(false);
      await s.refresh();
    } catch (e) {
      s.fail(e);
    }
  };

  const solution = editing ? (
    <AnnotationEditor value={draft} onChange={setDraft} valid={!!draftText} onCancel={() => setEditing(false)} onSave={save} />
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
          {owner && !recorded && cube && (
            <UiButton variant="outline" size="xs" onClick={() => setEditing(true)} data-action="annotate">
              <PenLine />
              {annotation ? tr("Edit the turns") : tr("Write the turns")}
            </UiButton>
          )}
        </div>
      </div>
      {alg && player ? (
        <PlayerAlg key={alg} player={player} text={recorded ? "z2 " + alg : annotation!.moves} size={16} className="max-h-32 overflow-y-auto" />
      ) : (
        <p className="text-sm text-muted-foreground">{owner && cube ? tr("No turns yet: write them to replay the solve.") : tr("No turns recorded for this solve.")}</p>
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
          <span className={cn(NUMERIC, "text-5xl font-medium tracking-tight", solve.penalty === "dnf" && "text-destructive", solve.penalty === "+2" && "text-warning")}>
            {fmtSolve(solve.time_ms, solve.penalty as any)}
          </span>
          <span className="text-sm text-muted-foreground">
            {[solve.username, puzzleInfo(puzzleOf(solve)).label, solve.displayDate ?? (solve.created_at && new Date(solve.created_at).toLocaleString())].filter(Boolean).join(" · ")}
          </span>
        </header>
        {solve.scramble && (
          <section className="flex flex-col gap-2" aria-label={tr("Scramble")}>
            <span className={LABEL}>{tr("Scramble")}</span>
            <Alg text={solve.scramble} size={15} className="text-foreground/90" />
          </section>
        )}
        {solution}
        {owner && solve.id !== undefined && (commenting ? <CommentField solve={solve} onDone={() => setCommenting(false)} /> : solve.comment && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{solve.comment}</p>)}
        {owner && solve.id !== undefined && !editing && (
          // The same actions as under the timer: the penalties, the comment, the link, then delete apart.
          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <PenaltyToggles penalty={solve.penalty} prefix={"penalty:" + solve.id + ":"} />
            <UiButton variant="outline" size="sm" onClick={() => setCommenting(true)} data-action="comment" className={cn("text-muted-foreground", solve.comment && "text-primary")}>
              <MessageSquare />
              {tr("Comment")}
            </UiButton>
            {!s.user.isGuest && (
              <Button action={"share:" + solve.id} icon={Share2} size="sm" variant="outline" className="text-muted-foreground">
                {tr("Share")}
              </Button>
            )}
            <Button action={"delete:" + solve.id} icon={Trash2} size="sm" variant="outline" className="ml-auto text-muted-foreground hover:text-destructive">
              {tr("Delete")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The comment written in place, focused: Enter or leaving it saves, Shift+Enter breaks the line, Escape cancels. */
function CommentField({ solve, onDone }: { solve: ViewedSolve; onDone: () => void }) {
  const [text, setText] = useState(solve.comment ?? ""),
    cancelled = useRef(false);
  const save = async () => {
    onDone();
    if (cancelled.current) return;
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
      autoFocus
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
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancelled.current = true;
          onDone();
        }
      }}
    />
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

function ColourSelect({ label, value, options, onChange }: { label: string; value: Colour; options: readonly Colour[]; onChange: (c: Colour) => void }) {
  const items = options.map((c) => ({ value: c, label: colourName(c) }));
  return (
    <Field className="min-w-0 flex-1 gap-1.5">
      <FieldLabel className={LABEL}>{label}</FieldLabel>
      <Select items={items} value={value} onValueChange={(v) => onChange(v as Colour)}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem key={c} value={c}>
              <Swatch colour={c} />
              {colourName(c)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** The keys of the turn pad: face turns, wide turns, slices and rotations. */
const PAD = [
  ["R", "L", "U", "D", "F", "B"],
  ["r", "l", "u", "d", "f", "b"],
  ["M", "E", "S", "x", "y", "z"],
];

/** A pad key or its keyboard key: a face appends a turn, a modifier toggles on the last turn, ⌫ removes it. */
function padPress(tokens: string[], key: string): string[] | null {
  const last = tokens.at(-1);
  if (key === "Backspace") return tokens.slice(0, -1);
  if (key === "'" || key === "2") {
    if (!last) return null;
    const base = last.replace(/(2'|2|')$/, ""), suffix = last.slice(base.length);
    return [...tokens.slice(0, -1), base + (suffix === key ? "" : key)];
  }
  return PAD.some((row) => row.includes(key)) ? [...tokens, key] : null;
}

/**
 * The turns written by hand: how the cube was held (the colours on top and in front), then the turns, put in with the
 * pad or the same keys on the keyboard, never typed freely. A modifier toggles on the last turn (R, R', R2).
 */
function AnnotationEditor({ value, onChange, valid, onCancel, onSave }: { value: Annotation; onChange: (a: Annotation) => void; valid: boolean; onCancel: () => void; onSave: () => void }) {
  const tokens = value.moves.trim().split(/\s+/).filter(Boolean),
    press = (key: string) => {
      const moves = padPress(tokens, key);
      if (moves) onChange({ ...value, moves: moves.join(" ") });
      return !!moves;
    };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as Element | null)?.closest?.("input, textarea, select, [role=listbox]")) return;
      if (press(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  });
  return (
    <section className="flex flex-col gap-3" aria-label={tr("Write the turns")}>
      <div className="flex gap-3">
        <ColourSelect label={tr("On top")} value={value.top} options={COLOURS} onChange={(top) => onChange({ ...value, top, front: frontsOf(top).includes(value.front) ? value.front : frontsOf(top)[0]! })} />
        <ColourSelect label={tr("In front")} value={value.front} options={frontsOf(value.top)} onChange={(front) => onChange({ ...value, front })} />
      </div>
      <div role="list" aria-label={tr("Turns")} className="flex max-h-28 min-h-16 flex-wrap content-start gap-1 overflow-y-auto rounded-md border border-input bg-muted/30 p-2">
        {tokens.length ? (
          tokens.map((t, i) => (
            <code key={i} role="listitem" className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-sm font-medium">
              {t}
            </code>
          ))
        ) : (
          <span className="self-center text-xs text-muted-foreground">x2 y R U R' U' r M' …</span>
        )}
      </div>
      <div className="grid grid-cols-[repeat(6,minmax(0,1fr))_auto] gap-1">
        {PAD.map((row, r) => (
          <div key={r} className="contents">
            {row.map((key) => (
              <UiButton key={key} type="button" variant="outline" size="sm" className="font-medium" onClick={() => press(key)}>
                {key}
              </UiButton>
            ))}
            {r === 0 ? (
              <UiButton type="button" variant="outline" size="sm" onClick={() => press("'")} aria-label={tr("Counter-clockwise")}>
                ′
              </UiButton>
            ) : r === 1 ? (
              <UiButton type="button" variant="outline" size="sm" onClick={() => press("2")} aria-label={tr("Half turn")}>
                2
              </UiButton>
            ) : (
              <UiButton type="button" variant="outline" size="sm" onClick={() => press("Backspace")} aria-label={tr("Remove the last turn")}>
                <Delete />
              </UiButton>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <UiButton type="button" variant="ghost" onClick={onCancel}>
          {tr("Cancel")}
        </UiButton>
        <UiButton type="button" disabled={!valid} onClick={onSave} data-action="saveTurns">
          {tr("Save")}
        </UiButton>
      </div>
    </section>
  );
}

/** A solve shared by its link, as anyone opening the link sees it, signed in or not. */
export function SharedSolve({ token }: { token: string }) {
  const [solve, setSolve] = useState<ViewedSolve | null | undefined>(undefined);
  // The app's own look, the stored settings being the app's to read.
  useEffect(() => applyTheme(DEFAULT_THEME, matchMedia("(prefers-color-scheme: light)").matches), []);
  useEffect(() => {
    fetch(location.origin + "/api/shared/" + encodeURIComponent(token))
      .then((response) => (response.ok ? response.json() : null))
      .then(setSolve, () => setSolve(null));
  }, [token]);
  return (
    <div className="flex min-h-svh flex-col items-center gap-8 bg-background px-4 py-6 md:py-10">
      <header className="flex w-full max-w-4xl items-center gap-3">
        <a href="/" className={cn("flex items-center gap-2 rounded-md", FOCUS)}>
          <Logo size={24} />
          <Wordmark className="text-xl" />
        </a>
        <UiButton variant="outline" className="ml-auto" render={<a href="/timer" />}>
          {tr("Open Qbix")}
        </UiButton>
      </header>
      <main className="w-full max-w-4xl">
        <Surface className="p-5 md:p-8">
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
