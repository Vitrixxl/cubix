/**
 * A solve on its own: its time, scramble and solution, the solution played in 3D on the scrambled cube when it is
 * known, recorded by a smart cube or written by hand. The owner can write it (how the cube was held, then its turns,
 * rotations and slices included), share the solve by a link, and set its penalty, comment or delete it.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Delete, MessageSquare, PenLine, Share2, Trash2 } from "lucide-react";
import { call } from "./bridge";
import { store as s } from "./store";
import { ActionToggle, Alg, Button, LABEL, NUMERIC, usePhone } from "./ui";
import { PlayerAlg, PlayerControls, PlayerCube, ViewButtons, useAlgPlayer } from "./AlgPlayer";
import { SolveAnalysisButton, colourLabel } from "./SolveAnalysis";
import { annotationAlg, COLOURS, frontsOf, heldAlg, readAnnotation, readSolution, writeAnnotation, type Annotation, type Colour } from "../../src/client/lib/solution";
import { mergeTurns } from "../../src/client/lib/solveAnalysis";
import { fmtSolve } from "../../src/client/lib/format";
import { puzzleInfo, puzzleOf, type StoredContext } from "../../src/shared/puzzles";
import { Button as UiButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const SWATCH: Record<Colour, string> = { white: "#ece8e2", yellow: "#ffe62a", green: "#1abe57", blue: "#3d7ce0", red: "#eb4242", orange: "#ff801f" };
const colourName = (c: Colour) => capitalised(colourLabel(c));
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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
  const share = async () => {
    try {
      const url = location.origin + "/solve/" + (await call("shareSolve", solve.id));
      if (phone && navigator.share) await navigator.share({ url, title: fmtSolve(solve.time_ms, solve.penalty as any) });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(tr("Link copied"), { description: url });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") s.fail(e);
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
        {owner && solve.comment && <p className="text-sm text-muted-foreground">{solve.comment}</p>}
        {owner && solve.id !== undefined && !editing && (
          <div className="mt-auto flex flex-wrap items-center gap-1">
            <ActionToggle action={"penalty:" + solve.id + ":+2"} pressed={solve.penalty === "+2"}>
              +2
            </ActionToggle>
            <ActionToggle action={"penalty:" + solve.id + ":dnf"} pressed={solve.penalty === "dnf"}>
              {tr("DNF")}
            </ActionToggle>
            <Button action={"comment:" + solve.id} icon={MessageSquare}>
              {tr("Comment")}
            </Button>
            {!s.user.isGuest && (
              <UiButton variant="ghost" onClick={share} data-action="share">
                <Share2 />
                {tr("Share")}
              </UiButton>
            )}
            <Button action={"delete:" + solve.id} icon={Trash2} variant="destructive" className="ml-auto">
              {tr("Delete")}
            </Button>
          </div>
        )}
      </div>
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

const Swatch = ({ colour }: { colour: Colour }) => <span className="inline-block size-3 rounded-[3px] ring-1 ring-foreground/20" style={{ background: SWATCH[colour] }} aria-label={colourName(colour)} />;

function ColourSelect({ label, value, options, onChange }: { label: string; value: Colour; options: readonly Colour[]; onChange: (c: Colour) => void }) {
  const items = options.map((c) => ({ value: c, label: colourName(c) }));
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
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
    </label>
  );
}

/** The keys of the turn pad: face turns, wide turns, slices and rotations. */
const PAD = [
  ["R", "L", "U", "D", "F", "B"],
  ["r", "l", "u", "d", "f", "b"],
  ["M", "E", "S", "x", "y", "z"],
];

/**
 * The turns written by hand: how the cube was held (the colours on top and in front), then the turns, typed or put
 * in with the pad. A modifier changes the last turn (R, R', R2).
 */
function AnnotationEditor({ value, onChange, valid, onCancel, onSave }: { value: Annotation; onChange: (a: Annotation) => void; valid: boolean; onCancel: () => void; onSave: () => void }) {
  const tokens = value.moves.trim().split(/\s+/).filter(Boolean),
    set = (moves: string[]) => onChange({ ...value, moves: moves.join(" ") }),
    modify = (suffix: "" | "'" | "2") => {
      const last = tokens.at(-1);
      if (last) set([...tokens.slice(0, -1), last.replace(/(2'|2|')$/, "") + suffix]);
    };
  return (
    <section className="flex flex-col gap-3" aria-label={tr("Write the turns")}>
      <div className="flex gap-3">
        <ColourSelect label={tr("On top")} value={value.top} options={COLOURS} onChange={(top) => onChange({ ...value, top, front: frontsOf(top).includes(value.front) ? value.front : frontsOf(top)[0]! })} />
        <ColourSelect label={tr("In front")} value={value.front} options={frontsOf(value.top)} onChange={(front) => onChange({ ...value, front })} />
      </div>
      <Textarea
        aria-label={tr("Turns")}
        aria-invalid={!valid}
        className="min-h-20 font-medium"
        placeholder="x2 y R U R' U' r M' …"
        value={value.moves}
        onChange={(e) => onChange({ ...value, moves: e.target.value })}
      />
      {!valid && <p className="text-xs text-destructive">{tr("A turn cannot be read: use the notation of the pad.")}</p>}
      <div className="grid grid-cols-[repeat(6,minmax(0,1fr))_auto] gap-1">
        {PAD.map((row, r) => (
          <div key={r} className="contents">
            {row.map((key) => (
              <UiButton key={key} type="button" variant="outline" size="sm" className="font-medium" onClick={() => set([...tokens, key])}>
                {key}
              </UiButton>
            ))}
            {r === 0 ? (
              <UiButton type="button" variant="outline" size="sm" onClick={() => modify("'")} aria-label={tr("Counter-clockwise")}>
                ′
              </UiButton>
            ) : r === 1 ? (
              <UiButton type="button" variant="outline" size="sm" onClick={() => modify("2")} aria-label={tr("Half turn")}>
                2
              </UiButton>
            ) : (
              <UiButton type="button" variant="outline" size="sm" onClick={() => set(tokens.slice(0, -1))} aria-label={tr("Remove the last turn")}>
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
        <a href="/" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <Logo size={24} />
          <Wordmark className="text-xl" />
        </a>
        <UiButton variant="outline" className="ml-auto" render={<a href="/timer" />}>
          {tr("Open Qbix")}
        </UiButton>
      </header>
      <main className="w-full max-w-4xl rounded-2xl border bg-card p-5 md:p-8">
        {solve ? <SolveView solve={solve} /> : solve === null ? <p className="text-center text-muted-foreground">{tr("This solve is not shared, or no longer.")}</p> : <div className="h-80" aria-busy="true" />}
      </main>
    </div>
  );
}
