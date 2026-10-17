/**
 * The timer's WCA attempts that are not a single timed solve: Fewest Moves (an hour to write a solution) and the cubes
 * solved of a Multi-Blind attempt; the numbered scrambles of a Multi-Blind attempt; the scrambles to export.
 */
import { useEffect, useRef, useState } from "react";
import { Copy, Download, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button as UiButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FMC_LIMIT_MS, fmcResult, readFmcSolution } from "../../src/client/lib/fewestMoves";
import { mbldValue, numberedScrambles, scrambleList, wcaResult } from "../../src/client/lib/wca";
import { Skeleton } from "@/components/ui/skeleton";
import { call } from "./bridge";
import { download, store as s } from "./store";
import { Alg, Digits, Segmented, said } from "./base";
import { NUMERIC } from "./ui";
import { tr } from "../../src/client/i18n";
import { puzzleInfo, relayOf, type PuzzleId } from "../../src/shared/puzzles";

/** Minutes and seconds left, as a countdown shows them: 59:07. */
const countdown = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * A Fewest Moves attempt (WCA Article E): Start gives an hour to write a solution of the scramble, its moves counted as
 * they are typed; Done, or the hour's end, saves its result (the moves, or a DNF and why).
 */
export function FewestMoves({ enabled, className }: { enabled: boolean; className?: string }) {
  const [started, setStarted] = useState<number | null>(null),
    [text, setText] = useState(""),
    [now, setNow] = useState(() => performance.now()),
    field = useRef<HTMLTextAreaElement>(null);
  // A new scramble, or the timer reset, ends the attempt unsaved.
  useEffect(() => {
    setStarted(null);
    setText("");
  }, [s.timerEpoch, s.scramble]);
  useEffect(() => {
    if (started === null) return;
    field.current?.focus();
    const interval = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(interval);
  }, [started]);
  const left = started === null ? FMC_LIMIT_MS : FMC_LIMIT_MS - (now - started),
    read = readFmcSolution(text);
  const done = () => {
    if (started === null) return;
    const ms = Math.min(FMC_LIMIT_MS, performance.now() - started),
      result = fmcResult(s.scramble, text);
    setStarted(null);
    setText("");
    if (result.dnf) toast.error(`${tr("DNF")} · ${said(result.why)}`);
    void s.save(ms, result.dnf ? "dnf" : "none", result.solution || null, undefined, false, result.moves !== null ? { moves: result.moves } : {});
  };
  // The hour is up: what is written is the solution.
  useEffect(() => {
    if (started !== null && left <= 0) done();
  }, [left <= 0]);
  return (
    <div className={cn("flex w-full max-w-2xl flex-col items-center gap-4", className)} data-no-timer>
      <Digits text={countdown(left)} phase="idle" className="text-[clamp(48px,min(calc(120cqw/var(--chars)),24cqh),160px)]" />
      {started === null ? (
        <UiButton className="min-w-28" disabled={!enabled} onClick={() => setStarted(performance.now())}>
          {tr("Start")}
        </UiButton>
      ) : (
        <>
          <Textarea
            ref={field}
            aria-label={tr("Solution")}
            placeholder="R U2 F' Rw x …"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={"error" in read}
            spellCheck={false}
            className="max-h-[22cqh] font-mono text-base md:text-base"
          />
          <div className="flex w-full items-center gap-3">
            <span className={cn(NUMERIC, "flex-1 text-sm", "error" in read ? "text-destructive" : "text-muted-foreground")}>
              {"error" in read ? said(read.error) : tr("{0} moves", { 0: read.moves })}
            </span>
            <UiButton onClick={done}>{tr("Done")}</UiButton>
          </div>
        </>
      )}
    </div>
  );
}

/** A Multi-Blind attempt stopped: the cubes solved out of its cubes, its result as the WCA writes it, then Save. */
export function MultiBlindResult() {
  const pending = s.mbldPending!,
    [solved, setSolved] = useState(pending.cubes),
    value = mbldValue(solved, pending.cubes, pending.ms);
  return (
    <div role="group" aria-label={tr("Solved")} className="mt-3 flex flex-col items-center gap-3 md:mt-5" data-no-timer>
      <div className="flex items-center gap-2">
        <UiButton variant="outline" size="icon" aria-label={tr("Less")} disabled={solved <= 0} onClick={() => setSolved(solved - 1)}>
          <Minus />
        </UiButton>
        <span className={cn(NUMERIC, "min-w-24 text-center text-2xl font-bold")}>
          {solved}/{pending.cubes}
        </span>
        <UiButton variant="outline" size="icon" aria-label={tr("More")} disabled={solved >= pending.cubes} onClick={() => setSolved(solved + 1)}>
          <Plus />
        </UiButton>
      </div>
      <span className={cn(NUMERIC, "text-sm text-muted-foreground")}>{value === null ? tr("DNF") : wcaResult("333mbf", "single", value)}</span>
      <div className="flex gap-2">
        <UiButton variant="outline" onClick={() => void s.action("mbld:cancel")}>{tr("Cancel")}</UiButton>
        <UiButton onClick={() => void s.action("mbld:" + solved)}>{tr("Save")}</UiButton>
      </div>
    </div>
  );
}

/** A Multi-Blind attempt's scrambles, one a line, numbered; a relay's (`puzzle`), each named by its puzzle. */
export function ScrambleLines({ text, size, puzzle }: { text: string; size: number; puzzle?: string }) {
  const relay = puzzle ? relayOf(puzzle as PuzzleId) : undefined;
  return (
    <ol className="flex flex-col gap-1.5">
      {scrambleList(text).map((scramble, i) => (
        <li key={i} className="flex items-baseline gap-3">
          <span className={cn(NUMERIC, "shrink-0 text-right text-muted-foreground", relay ? "w-9" : "w-7")} style={{ fontSize: size * 0.8 }}>
            {relay?.[i] ? said(puzzleInfo(relay[i]).label) : `${i + 1}.`}
          </span>
          <Alg text={scramble} size={size} />
        </li>
      ))}
    </ol>
  );
}

const COUNTS = [5, 12, 25, 50, 100];

/** Scrambles of the timer's event and scramble type to take away, numbered as a WCA sheet: to copy or download. */
export function ScrambleExport() {
  const [count, setCount] = useState(12),
    [text, setText] = useState<string | null>(null),
    event = s.event().label,
    kind = s.scrambleType !== "normal" ? " · " + s.label("scrambles", s.scrambleType) : "";
  useEffect(() => {
    let live = true;
    setText(null);
    // A Multi-Blind attempt's own scrambles are 3×3 blindfolded ones: one a line, as for the other events.
    const context = s.context();
    void Promise.all(Array.from({ length: count }, () => call("scramble", context) as Promise<string>))
      .then((list) => live && setText(numberedScrambles(list, relayOf(context.puzzle as PuzzleId)?.map((p) => puzzleInfo(p).label))))
      .catch(s.fail);
    return () => void (live = false);
  }, [count]);
  const file = text && `${event}${kind}\n\n${text}\n`;
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Segmented label={tr("Scrambles")} value={String(count)} options={COUNTS.map((n) => ({ id: String(n), label: String(n) }))} onChange={(id) => setCount(Number(id))} />
      <div className="max-h-[50vh] min-h-32 overflow-y-auto rounded-[12px] bg-muted p-3 font-mono text-sm whitespace-pre-wrap select-text">
        {text ?? <Skeleton className="h-24 w-full" />}
      </div>
      <div className="flex justify-end gap-2">
        <UiButton
          variant="outline"
          disabled={!file}
          onClick={() => void navigator.clipboard?.writeText(file!).then(() => toast.success(tr("Copied")), () => {})}
        >
          <Copy />
          {tr("Copy")}
        </UiButton>
        <UiButton disabled={!file} onClick={() => download(file!, "text/plain", `qbix-scrambles-${s.event().id}.txt`)}>
          <Download />
          {tr("Download")}
        </UiButton>
      </div>
    </div>
  );
}
