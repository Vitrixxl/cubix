/**
 * Blindfolded training (3×3, 4×4, 5×5), in the training page's panel: Memo (a blindfolded scramble and its cube held
 * white on top, the memo typed, then checked against the one traced), Pairs (each letter pair's word, written once,
 * then recalled) and Comms (a pair of targets, then its 3-style commutator played in 3D); the letter scheme and the
 * buffers in a drawer. The rules are src/client/lib/bld.ts's.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Eye, ListFilter, Pencil, RotateCcw, Settings2, SkipForward, X } from "lucide-react";
import { Button as UiButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  BLD_COLORS, BLD_FACES, BLD_INK, BLD_KINDS, BLD_PREFS, BLD_PUZZLES, BUFFER_NAMES, BUFFERS, SPEFFZ, allPairs, bldPicture, bldScramble, bldState, cleanBuffers, cleanCommFilter,
  cleanPuzzle, cleanScheme, commLetters, commOf, commPool, doesComm, netSize, nextPair, ownAlg, pairsOf, recentPairs, repeated, reviewPair, sameMemo, stickerAt,
  kindName, traceMemo, withLetter, withOwnAlg, type BldKind, type BldPuzzle, type CommFilter, type Memo, type OwnAlgs, type PairBoxes,
} from "../../src/client/lib/bld";
import { puzzleInfo } from "../../src/shared/puzzles";
import { tr } from "../../src/client/i18n";
import { PlayerAlg, PlayerControls, PlayerCube, useAlgPlayer } from "./AlgPlayer";
import { call } from "./bridge";
import { Cube } from "./Cube";
import { PhoneSheet } from "./phone";
import { store as s } from "./store";
import { Alg, Empty, FOCUS, NUMERIC, SectionHead, Segmented, Surface, Tip, usePhone, useViewport } from "./ui";

const save = (key: string, value: unknown) => {
  s.pref(key, value);
  s.emit();
};
const scheme = () => cleanScheme(s.prefs[BLD_PREFS.scheme]);
const buffers = () => cleanBuffers(s.prefs[BLD_PREFS.buffers]);
const words = (): Record<string, string> => s.prefs[BLD_PREFS.words] ?? {};
/** The pairs with a word written, for the training list's count. */
export const bldWords = () => Object.values(words()).filter(Boolean).length;
const kindLabel = (kind: BldKind, puzzle?: BldPuzzle) => tr(kindName(kind, puzzle));

/** The blindfolded training: Memo, Pairs or Comms, and its settings' drawer. */
export function BldCard({ phone }: { phone: boolean }) {
  const mode = ["pairs", "comms"].includes(s.prefs[BLD_PREFS.mode]) ? s.prefs[BLD_PREFS.mode] : "memo",
    [settings, setSettings] = useState(false);
  return (
    <Surface className={cn("gap-3.5 px-5 py-4 md:px-6 md:py-5", !phone && "min-h-0 flex-1")}>
      <SectionHead title={tr("BLD")}>
        <Segmented
          label={tr("Blindfolded")}
          value={mode}
          onChange={(id) => save(BLD_PREFS.mode, id)}
          options={[{ id: "memo", label: tr("Memo") }, { id: "pairs", label: tr("Pairs") }, { id: "comms", label: tr("Comms") }]}
        />
        <Tip content={tr("Letter scheme and buffers")}>
          <UiButton variant="ghost" size="icon" aria-label={tr("Letter scheme and buffers")} onClick={() => setSettings(true)}>
            <Settings2 />
          </UiButton>
        </Tip>
      </SectionHead>
      {mode === "memo" ? <MemoDrill /> : mode === "pairs" ? <PairsDrill /> : <CommsDrill />}
      <Drawer open={settings} onOpenChange={setSettings} title={tr("Settings")}>
        <BldSettings />
      </Drawer>
    </Surface>
  );
}

/** A drawer: from the right on a desktop, from the bottom on a phone. */
function Drawer({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: React.ReactNode }) {
  if (usePhone())
    return (
      <PhoneSheet open={open} onOpenChange={onOpenChange} title={title}>
        {children}
      </PhoneSheet>
    );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[26rem] gap-4 overflow-y-auto p-5 sm:max-w-[26rem]">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-extrabold tracking-[-0.025em]">{title}</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** The side of the largest square the room left holds (a desktop's; a phone's drawer grows with its content: its cube follows the window). */
function useFit(max: number) {
  const { h } = useViewport(),
    phone = usePhone(),
    room = useRef<HTMLDivElement>(null),
    [fit, setFit] = useState(0);
  useLayoutEffect(() => {
    if (phone || !room.current) return;
    const observer = new ResizeObserver(([e]) => setFit(Math.floor(Math.min(max, e!.contentRect.width, e!.contentRect.height) - 16)));
    observer.observe(room.current);
    return () => observer.disconnect();
  }, [phone, max]);
  return { room, size: phone ? Math.round(Math.max(120, Math.min(h * 0.28, 230))) : fit };
}

/** A blindfolded scramble of the puzzle chosen and its cube, the memo typed, then the one traced beside it. */
function MemoDrill() {
  const puzzle = cleanPuzzle(s.prefs[BLD_PREFS.puzzle]),
    n = puzzleInfo(puzzle).cubeSize!,
    [round, setRound] = useState(0),
    [scramble, setScramble] = useState(""),
    [typed, setTyped] = useState(""),
    [memo, setMemo] = useState<Memo | null>(null),
    { room, size } = useFit(360);
  useEffect(() => {
    let live = true;
    setMemo(null);
    setTyped("");
    setScramble("");
    call("scramble", bldScramble(puzzle)).then((v: string) => live && setScramble(v), () => {});
    return () => void (live = false);
  }, [puzzle, round]);
  const check = () => {
    const traced = traceMemo(bldState(scramble, n), scheme(), buffers());
    setMemo(traced);
    save(BLD_PREFS.recent, recentPairs(traced, s.prefs[BLD_PREFS.recent] ?? []));
  };
  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!scramble) return;
        if (memo) setRound(round + 1);
        else check();
      }}
    >
      <Segmented label={tr("Puzzle")} value={puzzle} onChange={(id) => save(BLD_PREFS.puzzle, id)} options={BLD_PUZZLES.map((id) => ({ id, label: puzzleInfo(id).label }))} className="self-start" />
      <Alg text={scramble || "…"} size={n > 3 ? 15 : 17} className="shrink-0" />
      <div ref={room} className="flex min-h-0 flex-1 items-center justify-center">{scramble && size >= 64 && <Cube key={scramble} setup={bldPicture(scramble, n)} held cubeSize={n} size={size} animated={false} />}</div>
      {memo && <MemoResult memo={memo} puzzle={puzzle} right={sameMemo(typed, memo)} />}
      <div className="flex shrink-0 items-center gap-2">
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="AB CD EF" aria-label={tr("Your memo")} readOnly={!!memo} autoComplete="off" spellCheck={false} className="flex-1 font-semibold uppercase" />
        {memo ? (
          <UiButton type="submit">
            <SkipForward />
            {tr("Next")}
          </UiButton>
        ) : (
          <UiButton type="submit" disabled={!scramble}>
            <Check />
            {tr("Check")}
          </UiButton>
        )}
      </div>
    </form>
  );
}

/** The memo traced: right or not, each piece type's pairs in order (parity beside), then what is noted apart. */
function MemoResult({ memo, puzzle, right }: { memo: Memo; puzzle: BldPuzzle; right: boolean }) {
  const edges = memo.find((p) => p.kind === "edges"),
    corners = memo.find((p) => p.kind === "corners")!;
  const rows: [string, string, boolean][] = [
    ...memo.map((part): [string, string, boolean] => [kindLabel(part.kind, puzzle), pairsOf(part.targets).join(" "), part.parity]),
    ...(edges?.turned.length ? [[tr("Flipped"), edges.turned.join(" "), false] as [string, string, boolean]] : []),
    ...(corners.turned.length ? [[tr("Twisted"), corners.turned.join(" "), false] as [string, string, boolean]] : []),
  ];
  return (
    <div className="flex min-h-0 items-start gap-3 overflow-y-auto rounded-2xl bg-muted px-4 py-3" aria-live="polite">
      <span
        className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", right ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}
        role="img"
        aria-label={tr(right ? "Your memo is right" : "Your memo differs")}
      >
        {right ? <Check className="size-4" /> : <X className="size-4" />}
      </span>
      <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-1">
        {rows.map(([label, text, parity]) => [
          <dt key={label + "t"} className="text-xs font-bold text-faint">{label}</dt>,
          <dd key={label + "d"} className={cn(NUMERIC, "min-w-0 text-base font-extrabold tracking-wide break-words")}>{text || "–"}</dd>,
          <dd key={label + "p"}>{parity && <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">{tr("Parity")}</span>}</dd>,
        ])}
      </dl>
    </div>
  );
}

/** Again or Got it, under a card. */
const Answer = ({ onAnswer }: { onAnswer: (got: boolean) => void }) => (
  <div className="flex shrink-0 justify-center gap-2">
    <UiButton variant="outline" onClick={() => onAnswer(false)}>
      <RotateCcw />
      {tr("Again")}
    </UiButton>
    <UiButton onClick={() => onAnswer(true)}>
      <Check />
      {tr("Got it")}
    </UiButton>
  </div>
);

/** A letter pair to recall: shown, then its word (written here once), Got it or Again. */
function PairsDrill() {
  const from = s.prefs[BLD_PREFS.pool] === "recent" ? "recent" : "all",
    boxes: PairBoxes = s.prefs[BLD_PREFS.boxes] ?? {},
    pool: string[] = from === "recent" ? (s.prefs[BLD_PREFS.recent] ?? []) : allPairs(scheme()),
    [seen, setSeen] = useState<string[]>([]),
    [pair, setPair] = useState<string | undefined>(() => nextPair(pool, boxes, [])),
    [shown, setShown] = useState(false),
    [draft, setDraft] = useState<string | null>(null),
    word = pair ? words()[pair] : undefined;
  useEffect(() => {
    if (!pair || !pool.includes(pair)) setPair(nextPair(pool, boxes, seen));
  }, [from]);
  const answer = (got: boolean) => {
    if (!pair) return;
    const next = reviewPair(boxes, pair, got),
      last = [...seen, pair].slice(-6);
    save(BLD_PREFS.boxes, next);
    setSeen(last);
    setPair(nextPair(pool, next, last));
    setShown(false);
    setDraft(null);
  };
  const keep = () => {
    if (pair && draft != null) save(BLD_PREFS.words, { ...words(), [pair]: draft.trim() });
    setDraft(null);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Segmented
        label={tr("Pairs")}
        value={from}
        onChange={(id) => save(BLD_PREFS.pool, id)}
        options={[
          { id: "all", label: tr("All"), tip: tr("Every letter pair") },
          { id: "recent", label: tr("Recent"), tip: tr("The pairs of your last memos") },
        ]}
        className="self-start"
      />
      {!pair ? (
        <Empty icon={Eye} title={tr("No memo yet")} className="my-auto py-8" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
          <b className={cn(NUMERIC, "text-[clamp(4rem,14vh,7rem)] leading-none font-extrabold tracking-[0.04em]")}>{pair}</b>
          {!shown ? (
            <UiButton variant="outline" onClick={() => setShown(true)}>
              <Eye />
              {tr("Show")}
            </UiButton>
          ) : draft != null || !word ? (
            <form
              className="flex w-full max-w-sm items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                keep();
              }}
            >
              <Input autoFocus value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} placeholder={tr("Your word")} aria-label={tr("Your word")} maxLength={40} className="flex-1" />
              <UiButton type="submit" disabled={!draft?.trim()}>{tr("Save")}</UiButton>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-extrabold tracking-[-0.02em]">{word}</span>
              <Tip content={tr("Edit")}>
                <UiButton variant="ghost" size="icon-sm" aria-label={tr("Edit")} onClick={() => setDraft(word)}>
                  <Pencil />
                </UiButton>
              </Tip>
            </div>
          )}
          <Answer onAnswer={answer} />
        </div>
      )}
    </div>
  );
}

/**
 * A pair of targets from the chosen buffer, in the player's letters: recall its commutator, show it (the player's own
 * or the catalogue's 3-style one, played in 3D from the case), then Got it or Again, boxed as the letter pairs are.
 */
function CommsDrill() {
  const filter = cleanCommFilter(s.prefs[BLD_PREFS.comms]),
    letters = scheme(),
    chosen = buffers(),
    boxes: PairBoxes = s.prefs[BLD_PREFS.commBoxes] ?? {},
    pool = commPool(filter, chosen, letters, boxes),
    [seen, setSeen] = useState<string[]>([]),
    [key, setKey] = useState<string | undefined>(() => nextPair(pool, boxes, [])),
    [shown, setShown] = useState(false),
    [filters, setFilters] = useState(false),
    setFilter = (change: Partial<CommFilter>) => save(BLD_PREFS.comms, { ...filter, ...change });
  useEffect(() => {
    if (!key || !pool.includes(key)) setKey(nextPair(pool, boxes, seen));
    setShown(false);
  }, [filter.kind, filter.letter, filter.fresh, chosen[filter.kind]]);
  const answer = (got: boolean) => {
    if (!key) return;
    const next = reviewPair(boxes, key, got),
      last = [...seen, key].slice(-6);
    save(BLD_PREFS.commBoxes, next);
    setSeen(last);
    setKey(nextPair(commPool(filter, chosen, letters, next), next, last));
    setShown(false);
  };
  const firsts = [...new Set(commPool({ ...filter, letter: "", fresh: false }, chosen, letters, {}).map((k) => commLetters(k, filter.kind, letters)[0]!))].sort();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* The pair shown, its commutator below: its letters move up between the bar's controls, leaving the cube the room. */}
      <div className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2">
        <Segmented label={tr("Pieces")} value={filter.kind} onChange={(id) => setFilter({ kind: id as CommFilter["kind"], letter: "" })} options={(["edges", "corners"] as const).map((id) => ({ id, label: kindLabel(id) }))} />
        {key && shown ? <b className={cn(NUMERIC, "justify-self-center text-3xl leading-none font-extrabold tracking-[0.04em]")}>{commLetters(key, filter.kind, letters)}</b> : <span />}
        <Tip content={tr("Filter")}>
          <UiButton variant={filter.letter || filter.fresh ? "secondary" : "ghost"} size="icon" aria-label={tr("Filter")} onClick={() => setFilters(true)}>
            <ListFilter />
          </UiButton>
        </Tip>
      </div>
      {!key ? (
        <Empty icon={Check} title={tr("All known")} className="my-auto py-8" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          {!shown && <b className={cn(NUMERIC, "shrink-0 text-[clamp(4rem,14vh,7rem)] leading-none font-extrabold tracking-[0.04em]")}>{commLetters(key, filter.kind, letters)}</b>}
          {shown ? (
            <CommAnswer key={key} id={key} kind={filter.kind} />
          ) : (
            <UiButton variant="outline" onClick={() => setShown(true)}>
              <Eye />
              {tr("Show")}
            </UiButton>
          )}
          <Answer onAnswer={answer} />
        </div>
      )}
      <Drawer open={filters} onOpenChange={setFilters} title={tr("Filter")}>
        <Field label={tr("First letter")}>
          <Segmented label={tr("First letter")} value={filter.letter} onChange={(letter) => setFilter({ letter })} options={[{ id: "", label: tr("All") }, ...firsts.map((id) => ({ id, label: id }))]} />
        </Field>
        <Field label={tr("Pairs")}>
          <Segmented label={tr("Pairs")} value={filter.fresh ? "new" : "all"} onChange={(id) => setFilter({ fresh: id === "new" })} options={[{ id: "all", label: tr("All") }, { id: "new", label: tr("New") }]} />
        </Field>
      </Drawer>
    </div>
  );
}

/** A commutator shown: played in 3D from its case, its moves and notation, and the player's own written in its place. */
function CommAnswer({ id, kind }: { id: string; kind: CommFilter["kind"] }) {
  const own: OwnAlgs = s.prefs[BLD_PREFS.own] ?? {},
    mine = ownAlg(own, id),
    comm = commOf(id, kind, s.find),
    alg = mine ?? comm?.alg ?? "",
    player = useAlgPlayer(alg, alg ? 3 : null, "full", { autoplay: 300 }),
    { room, size } = useFit(260),
    [draft, setDraft] = useState<string | null>(null),
    typed = draft?.trim().replace(/\s+/g, " ") ?? "",
    valid = !typed || doesComm(id, kind, typed);
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2">
      <div ref={room} className="flex min-h-0 w-full flex-1 items-center justify-center">{player && size >= 64 && <PlayerCube player={player} size={size} />}</div>
      {draft != null ? (
        // The player's own, in place of the moves while written: saved once it does this cycle.
        <form
          className="flex w-full max-w-md shrink-0 flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            save(BLD_PREFS.own, withOwnAlg(own, id, typed === comm?.alg ? "" : typed));
            setDraft(null);
          }}
        >
          <div className="flex items-center gap-2">
            <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={comm?.alg} aria-label={tr("Your algorithm")} aria-invalid={!valid || undefined} autoComplete="off" spellCheck={false} className="flex-1" />
            <UiButton type="submit" disabled={!valid}>{tr("Save")}</UiButton>
          </div>
          {!valid && <p className="text-sm text-destructive">{tr("Not this cycle")}</p>}
        </form>
      ) : (
        <>
          <div className="flex max-w-full shrink-0 items-center gap-1">
            <PlayerAlg player={player} text={alg || "–"} size={18} className="justify-center" />
            <Tip content={tr("Edit")}>
              <UiButton variant="ghost" size="icon-sm" aria-label={tr("Edit")} onClick={() => setDraft(mine ?? "")}>
                <Pencil />
              </UiButton>
            </Tip>
          </div>
          {mine ? <span className="shrink-0 text-xs font-bold text-faint">{tr("Yours")}</span> : comm?.notation && <span className={cn(NUMERIC, "shrink-0 text-sm text-muted-foreground")}>{comm.notation}</span>}
          {player && <PlayerControls player={player} inline className="shrink-0" />}
        </>
      )}
    </div>
  );
}

/** Where each face of the net stands, in faces: U above L F R B, D below. */
const NET: Record<(typeof BLD_FACES)[number], [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

/** The buffers, then the letter scheme on the cube's net: a sticker picked takes the letter typed, then the next one. */
function BldSettings() {
  const letters = scheme(),
    chosen = buffers(),
    [kind, setKind] = useState<BldKind>("edges"),
    [picked, setPicked] = useState(0),
    n = netSize(kind);
  const buffer = (BUFFERS[kind] as Record<string, number>)[chosen[kind]];
  return (
    <div className="flex flex-col gap-4">
      {BLD_KINDS.map((k) => (
        <Field key={k} label={tr(BUFFER_NAMES[k])}>
          <Segmented label={tr(BUFFER_NAMES[k])} value={chosen[k]} onChange={(id) => save(BLD_PREFS.buffers, { ...chosen, [k]: id })} options={Object.keys(BUFFERS[k]).map((id) => ({ id, label: id }))} />
        </Field>
      ))}
      <Field label={tr("Letters")}>
        <Segmented
          label={tr("Letters")}
          value={kind}
          onChange={(id) => {
            setKind(id as BldKind);
            setPicked(0);
          }}
          options={BLD_KINDS.map((id) => ({ id, label: kindLabel(id) }))}
        />
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${4 * n}, minmax(0, 1fr))` }} role="radiogroup" aria-label={tr("Letters")}>
          {BLD_FACES.flatMap((face) =>
            Array.from({ length: n * n }, (_, f) => {
              const sticker = stickerAt(face, f, n),
                [x, y] = NET[face],
                place = { gridColumn: x * n + (f % n) + 1, gridRow: y * n + Math.floor(f / n) + 1, background: BLD_COLORS[face] };
              if (sticker?.kind !== kind) return <span key={face + f} style={place} className={cn("aspect-square rounded-[4px]", f !== (n * n - 1) / 2 && "opacity-35")} aria-hidden="true" />;
              return (
                <button
                  key={face + f}
                  type="button"
                  role="radio"
                  aria-checked={picked === sticker.index}
                  aria-invalid={repeated(letters, kind, sticker.index) || undefined}
                  aria-label={`${face} ${letters[kind][sticker.index]}`}
                  onClick={() => setPicked(sticker.index)}
                  style={{ ...place, color: BLD_INK }}
                  // The theme's rim holds the pale stickers (white, yellow) on a light drawer; the ink is dark on every sticker.
                  className={cn(
                    "aspect-square rounded-[4px] font-extrabold inset-ring-1 inset-ring-[var(--rim)] aria-invalid:ring-3 aria-invalid:ring-destructive aria-checked:ring-3 aria-checked:ring-foreground",
                    n > 3 ? "text-xs" : "text-sm",
                    sticker.index === buffer && "underline decoration-2",
                    FOCUS,
                  )}
                >
                  {letters[kind][sticker.index]}
                </button>
              );
            }),
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={letters[kind][picked]}
            onChange={(e) => {
              if (!e.target.value.trim()) return;
              save(BLD_PREFS.scheme, withLetter(letters, kind, picked, e.target.value));
              setPicked((picked + 1) % 24);
            }}
            onFocus={(e) => e.target.select()}
            aria-label={tr("Letter of the sticker picked")}
            className="w-14 text-center font-extrabold uppercase"
          />
          <span className="flex-1" />
          <UiButton variant="ghost" onClick={() => save(BLD_PREFS.scheme, { ...letters, [kind]: SPEFFZ[kind] })}>
            <RotateCcw />
            {tr("Speffz")}
          </UiButton>
        </div>
      </Field>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-xs font-bold tracking-widest text-faint uppercase">{label}</h3>
    {children}
  </section>
);
