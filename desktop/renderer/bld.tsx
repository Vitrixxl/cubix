/**
 * Blindfolded training (3×3), in the training page's panel: Memo (a blindfolded scramble and its cube held white on
 * top, the memo typed, then checked against the one traced) and Pairs (each letter pair's word, written once, then
 * recalled); the letter scheme and the buffers in a drawer. The rules are src/client/lib/bld.ts's.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Eye, Pencil, RotateCcw, Settings2, SkipForward, X } from "lucide-react";
import { Button as UiButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  BLD_COLORS, BLD_FACES, BLD_PREFS, BLD_SCRAMBLE, BUFFERS, SPEFFZ, allPairs, bldPicture, bldState, cleanBuffers, cleanScheme, nextPair, pairsOf,
  recentPairs, repeated, reviewPair, sameMemo, stickerAt, traceMemo, withLetter, type BldKind, type Memo, type PairBoxes,
} from "../../src/client/lib/bld";
import { tr } from "../../src/client/i18n";
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

/** The blindfolded training: Memo or Pairs, and its settings' drawer. */
export function BldCard({ phone }: { phone: boolean }) {
  const mode = s.prefs[BLD_PREFS.mode] === "pairs" ? "pairs" : "memo",
    [settings, setSettings] = useState(false);
  return (
    <Surface className={cn("gap-3.5 px-5 py-4 md:px-6 md:py-5", !phone && "min-h-0 flex-1")}>
      <SectionHead title={tr("BLD")}>
        <Segmented label={tr("Blindfolded")} value={mode} onChange={(id) => save(BLD_PREFS.mode, id)} options={[{ id: "memo", label: tr("Memo") }, { id: "pairs", label: tr("Pairs") }]} />
        <Tip content={tr("Letter scheme and buffers")}>
          <UiButton variant="ghost" size="icon" aria-label={tr("Letter scheme and buffers")} onClick={() => setSettings(true)}>
            <Settings2 />
          </UiButton>
        </Tip>
      </SectionHead>
      {mode === "memo" ? <MemoDrill /> : <PairsDrill />}
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

/** A blindfolded scramble and its cube, the memo typed, then the one traced beside it. */
function MemoDrill() {
  const { h } = useViewport(),
    phone = usePhone(),
    [scramble, setScramble] = useState(""),
    [typed, setTyped] = useState(""),
    [memo, setMemo] = useState<Memo | null>(null),
    room = useRef<HTMLDivElement>(null),
    [fit, setFit] = useState(0),
    // A phone's drawer grows with its content: its cube follows the window; a desktop's fills the room left for it.
    size = phone ? Math.round(Math.max(120, Math.min(h * 0.28, 230))) : fit;
  useLayoutEffect(() => {
    if (phone) return;
    const observer = new ResizeObserver(([e]) => setFit(Math.floor(Math.min(360, e!.contentRect.width, e!.contentRect.height) - 16)));
    observer.observe(room.current!);
    return () => observer.disconnect();
  }, [phone]);
  const draw = () => {
    setMemo(null);
    setTyped("");
    call("scramble", BLD_SCRAMBLE).then(setScramble, () => {});
  };
  useEffect(draw, []);
  const check = () => {
    const traced = traceMemo(bldState(scramble), scheme(), buffers());
    setMemo(traced);
    save(BLD_PREFS.recent, recentPairs(traced, s.prefs[BLD_PREFS.recent] ?? []));
  };
  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!scramble) return;
        if (memo) draw();
        else check();
      }}
    >
      <Alg text={scramble || "…"} size={17} className="shrink-0" />
      <div ref={room} className="flex min-h-0 flex-1 items-center justify-center">{scramble && size >= 64 && <Cube key={scramble} setup={bldPicture(scramble)} held cubeSize={3} size={size} animated={false} />}</div>
      {memo && <MemoResult memo={memo} right={sameMemo(typed, memo)} />}
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

/** The memo traced: right or not, edges then corners in pairs, then what is noted apart. */
function MemoResult({ memo, right }: { memo: Memo; right: boolean }) {
  const rows: [string, string][] = [
    [tr("Edges"), pairsOf(memo.edges).join(" ")],
    [tr("Corners"), pairsOf(memo.corners).join(" ")],
    ...(memo.flipped.length ? [[tr("Flipped"), memo.flipped.join(" ")] as [string, string]] : []),
    ...(memo.twisted.length ? [[tr("Twisted"), memo.twisted.join(" ")] as [string, string]] : []),
  ];
  return (
    <div className="flex shrink-0 items-start gap-3 rounded-2xl bg-muted px-4 py-3" aria-live="polite">
      <span
        className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", right ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}
        role="img"
        aria-label={tr(right ? "Your memo is right" : "Your memo differs")}
      >
        {right ? <Check className="size-4" /> : <X className="size-4" />}
      </span>
      <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
        {rows.map(([label, text]) => [
          <dt key={label + "t"} className="text-xs font-bold text-faint">{label}</dt>,
          <dd key={label + "d"} className={cn(NUMERIC, "text-base font-extrabold tracking-wide")}>{text || "–"}</dd>,
        ])}
      </dl>
      {memo.parity && <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">{tr("Parity")}</span>}
    </div>
  );
}

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
          <div className="flex gap-2">
            <UiButton variant="outline" onClick={() => answer(false)}>
              <RotateCcw />
              {tr("Again")}
            </UiButton>
            <UiButton onClick={() => answer(true)}>
              <Check />
              {tr("Got it")}
            </UiButton>
          </div>
        </div>
      )}
    </div>
  );
}

/** Where each face of the net stands, in stickers' thirds: U above L F R B, D below. */
const NET: Record<(typeof BLD_FACES)[number], [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

/** The buffers, then the letter scheme on the cube's net: a sticker picked takes the letter typed, then the next one. */
function BldSettings() {
  const letters = scheme(),
    chosen = buffers(),
    [kind, setKind] = useState<BldKind>("edges"),
    [picked, setPicked] = useState(0);
  const buffer = (BUFFERS[kind] as Record<string, number>)[chosen[kind]];
  return (
    <div className="flex flex-col gap-4">
      <Field label={tr("Edge buffer")}>
        <Segmented label={tr("Edge buffer")} value={chosen.edges} onChange={(id) => save(BLD_PREFS.buffers, { ...chosen, edges: id })} options={Object.keys(BUFFERS.edges).map((id) => ({ id, label: id }))} />
      </Field>
      <Field label={tr("Corner buffer")}>
        <Segmented label={tr("Corner buffer")} value={chosen.corners} onChange={(id) => save(BLD_PREFS.buffers, { ...chosen, corners: id })} options={Object.keys(BUFFERS.corners).map((id) => ({ id, label: id }))} />
      </Field>
      <Field label={tr("Letters")}>
        <Segmented label={tr("Letters")} value={kind} onChange={(id) => setKind(id as BldKind)} options={[{ id: "edges", label: tr("Edges") }, { id: "corners", label: tr("Corners") }]} />
        <div className="grid grid-cols-12 gap-0.5" role="radiogroup" aria-label={tr("Letters")}>
          {BLD_FACES.flatMap((face) =>
            Array.from({ length: 9 }, (_, f) => {
              const sticker = stickerAt(face, f),
                [x, y] = NET[face],
                place = { gridColumn: x * 3 + (f % 3) + 1, gridRow: y * 3 + Math.floor(f / 3) + 1, background: BLD_COLORS[face] };
              if (sticker?.kind !== kind) return <span key={face + f} style={place} className={cn("aspect-square rounded-[4px]", sticker && "opacity-35")} aria-hidden="true" />;
              return (
                <button
                  key={face + f}
                  type="button"
                  role="radio"
                  aria-checked={picked === sticker.index}
                  aria-invalid={repeated(letters, kind, sticker.index) || undefined}
                  aria-label={`${face} ${letters[kind][sticker.index]}`}
                  onClick={() => setPicked(sticker.index)}
                  style={place}
                  className={cn("aspect-square rounded-[4px] text-sm font-extrabold text-black/75 aria-invalid:ring-3 aria-invalid:ring-destructive aria-checked:ring-3 aria-checked:ring-foreground", sticker.index === buffer && "underline decoration-2", FOCUS)}
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
