/**
 * The onboarding page (a short step flow saved as the journey profile) and the app tour. The tour
 * dims the app and cuts out the tab and a part of its page, measured once the page transition has settled.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Ban, Check, CornerDownLeft, GraduationCap, Plus, Shapes, Timer, X } from "lucide-react";
import { store as s } from "./store";
import { Icon, Logo, NUMERIC, Wordmark, usePhone } from "./ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Input } from "@/components/ui/input";
import { fmtTime, parseTypedTime } from "../../src/client/lib/format";
import { PUZZLES, puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import { PROFILE_KEY, TOUR_STEPS, journeyProfile } from "../../src/client/lib/journey";
import { METHODS } from "../../src/shared/methods";
import { go, goPage, pageUrl } from "./navigation";
import { ImportTimes } from "./ImportTimes";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/* ------------------------------------------------------------------ Onboarding */

const STEPS = [
  { label: "Welcome", title: "Welcome to Cubix", sub: "A few seconds to set the app up for you" },
  { label: "Puzzles", title: "What can you solve?", sub: "The puzzles you already solve, then the methods you use" },
  { label: "Times", title: "Bring your times", sub: "Your history from another timer, if you have one" },
] as const;
const LAST = STEPS.length - 1;

/** A selectable card: one border, the primary tint once chosen, nothing else. */
const CARD =
  "relative flex cursor-pointer rounded-xl border bg-card text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-primary aria-checked:bg-primary/10 aria-pressed:border-primary aria-pressed:bg-primary/10";
const SECTION_LABEL = "text-xs font-medium text-muted-foreground";

/** One line: the title, then its muted subtitle on the same baseline. */
function StepHead({ title, sub }: { title: string; sub: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <header className="flex min-w-0 shrink-0 items-baseline gap-3">
      <h1 ref={ref} tabIndex={-1} id="journey-title" className="shrink-0 truncate text-xl font-semibold tracking-tight outline-none md:text-2xl">
        {title}
      </h1>
      <p className="min-w-0 truncate text-sm text-muted-foreground max-sm:hidden">{said(sub)}</p>
    </header>
  );
}

function Welcome() {
  const rows = [
    { icon: Shapes, title: "Your puzzles and methods", text: "What you can solve today" },
    { icon: GraduationCap, title: "Learn the others", text: "A new puzzle starts with its course" },
    { icon: Timer, title: "Then time and train", text: "Everything opens once it is solved" },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-3 sm:gap-3">
      {rows.map((r, i) => (
        <li key={r.title} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 sm:flex-col sm:items-start sm:gap-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <r.icon className="size-[18px]" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}</span>
              {said(r.title)}
            </span>
            <span className="truncate text-xs text-muted-foreground">{said(r.text)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A puzzle tile: its WCA glyph and name, ticked when chosen. */
function Tile({ label, checked, glyph, onClick }: { label: string; checked: boolean; glyph: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onClick} className={cn(CARD, "min-w-0 flex-col items-center justify-center gap-1.5 px-1 py-2.5 sm:gap-2 sm:py-4")}>
      <span className={cn("text-muted-foreground transition-colors", checked && "text-primary")}>{glyph}</span>
      <span className="max-w-full truncate text-[11px] font-medium tracking-tight sm:text-sm sm:tracking-normal">{said(label)}</span>
      {checked && <Check className="absolute top-1.5 right-1.5 size-3.5 text-primary" strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}

type MethodMap = Partial<Record<PuzzleId, string[]>>;

/** Puzzles as tiles, then the methods and the best single of each chosen one inline, in the order they were picked. */
function PuzzleStep({ value, methods, bests, onToggle, onNone, onMethod, onBest }: {
  value: PuzzleId[];
  methods: MethodMap;
  bests: Partial<Record<PuzzleId, string>>;
  onToggle: (puzzle: PuzzleId) => void;
  onNone: () => void;
  onMethod: (puzzle: PuzzleId, method: string) => void;
  onBest: (puzzle: PuzzleId, text: string) => void;
}) {
  const phone = usePhone();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:gap-6">
      <div role="group" aria-label={tr("Puzzles you can solve")} className="grid shrink-0 grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2.5">
        <Tile label={tr("None yet")} checked={!value.length} onClick={onNone} glyph={<Ban className="size-6 sm:size-[30px]" strokeWidth={1.5} />} />
        {PUZZLES.map((p) => (
          <Tile key={p.id} label={said(p.label)} checked={value.includes(p.id)} onClick={() => onToggle(p.id)} glyph={<Icon name={"Puzzle" + p.id} size={phone ? 24 : 30} />} />
        ))}
      </div>
      <section aria-label={tr("Methods")} className="flex min-h-0 flex-1 flex-col gap-1">
        <h2 className={cn(SECTION_LABEL, "flex justify-between")}>
          {tr("Methods you know")}{!!value.length && <span className="max-sm:hidden">{tr("Your best single, if you know it")}</span>}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {value.length ? (
            value.map((id) => {
              const p = puzzleInfo(id);
              return (
                <div key={id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-2.5 last:border-b-0">
                  <span className="flex w-36 shrink-0 items-center gap-2 text-sm font-medium">
                    <Icon name={"Puzzle" + id} size={18} className="text-muted-foreground" />
                    {said(p.label)}
                  </span>
                  <div role="group" aria-label={tr("{0} methods", { 0: p.label })} className="flex flex-wrap gap-1.5">
                    {METHODS[id].map((m) => {
                      const on = methods[id]?.includes(m.id) ?? false;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={`${p.label} ${m.name}`}
                          title={said(m.summary)}
                          onClick={() => onMethod(id, m.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-primary aria-checked:bg-primary/10 aria-checked:text-foreground"
                        >
                          {on ? <Check className="size-3.5 text-primary" strokeWidth={3} /> : <Plus className="size-3.5" />}
                          {said(m.name)}
                        </button>
                      );
                    })}
                  </div>
                  <PbInput puzzle={p.label} value={bests[id] ?? ""} onChange={(text) => onBest(id, text)} />
                </div>
              );
            })
          ) : (
            <p className="py-2.5 text-sm text-muted-foreground">{tr("Nothing yet? Cubix starts you on the 3×3 course.")}</p>
          )}
        </div>
      </section>
    </div>
  );
}

/** The best single on a puzzle, typed as 12.34 or 1:05.21; optional, and flagged while it does not read as a time. */
function PbInput({ puzzle, value, onChange }: { puzzle: string; value: string; onChange: (text: string) => void }) {
  const invalid = !!value.trim() && parseTypedTime(value) === null;
  return (
    <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
      <span className="sm:hidden">{tr("PB")}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={tr("PB · 12.34")}
        aria-label={tr("Your best {0} single", { 0: puzzle })}
        aria-invalid={invalid || undefined}
        data-action={"journey:best:" + puzzle}
        className={cn(NUMERIC, "h-8 w-28 text-right text-sm")}
      />
    </label>
  );
}

export function Onboarding() {
  const existing = journeyProfile(s.journey);
  const [[step, dir], setStepDir] = useState<[number, number]>([existing ? 1 : 0, 1]);
  const [known, setKnown] = useState<PuzzleId[]>(existing?.knownPuzzles ?? []), [knownMethods, setKnownMethods] = useState<MethodMap>(existing?.knownMethods ?? {});
  const [bests, setBests] = useState<Partial<Record<PuzzleId, string>>>(() => Object.fromEntries(Object.entries(existing?.bests ?? {}).map(([p, ms]) => [p, fmtTime(ms)])));
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const owner = s.user.id;
  const reduced = useReducedMotion();
  const goTo = (next: number) => {
    if (next < 0 || next > LAST || next === step) return;
    setStepDir([next, next > step ? 1 : -1]);
  };
  const finish = async (tour: boolean) => {
    if (saving) return;
    const typed = known.filter((p) => bests[p]?.trim()).map((p) => [p, parseTypedTime(bests[p]!)] as const);
    const wrong = typed.find(([, ms]) => ms === null);
    if (wrong) return setError(`${puzzleInfo(wrong[0]).label}: type your best like 12.34 or 1:05.21, or leave it empty.`);
    setSaving(true); setError("");
    try {
      // Only what can be solved is asked; any other puzzle opens on its course until it is learnt or skipped.
      await s.updateJourney({ [PROFILE_KEY]: { kind: "profile", knownPuzzles: known, knownMethods, priority: null, ...(typed.length ? { bests: Object.fromEntries(typed) } : {}), completedAt: existing?.completedAt ?? new Date().toISOString() } });
      if (s.user.id !== owner) return;
      const puzzle = known.includes(s.puzzle as PuzzleId) ? (s.puzzle as PuzzleId) : known[0] ?? (s.puzzle as PuzzleId);
      if (puzzle !== s.puzzle) { s.pref("cubix.puzzle", puzzle); s.puzzle = puzzle; s.loadContext(); }
      s.overlay = "";
      // An address opened before the introduction (a friend's link) comes next, without the tour.
      const next = new URLSearchParams(location.search).get("next");
      if (next?.startsWith("/") && !next.startsWith("//")) {
        go(next, true);
        return s.emit();
      }
      goPage(known.includes(puzzle) ? "playground" : "learn", { puzzle }, true);
      s.overlay = tour ? "tour" : ""; s.emit();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const advance = () => (step < LAST ? goTo(step + 1) : void finish(!existing));
  // Enter continues, as in a form: from the page, a heading, a choice card or a tile, never from a button or field.
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || saving) return;
    if (!event.currentTarget.contains(target) || target.closest("form, input, textarea, select, [role=combobox], [role=listbox]")) return;
    if (target.closest("button, a") && !target.matches("[role=radio], [role=checkbox]")) return;
    event.preventDefault();
    advance();
  };
  const toggle = (p: PuzzleId) => {
    setKnown((v) => (v.includes(p) ? v.filter((id) => id !== p) : [...v, p]));
    setKnownMethods((v) => Object.fromEntries(Object.entries(v).filter(([id]) => id !== p)));
    setBests((v) => Object.fromEntries(Object.entries(v).filter(([id]) => id !== p)));
  };
  const method = (p: PuzzleId, m: string) =>
    setKnownMethods((v) => ({ ...v, [p]: v[p]?.includes(m) ? v[p]!.filter((id) => id !== m) : [...(v[p] ?? []), m] }));
  const content = [
    <Welcome />,
    <PuzzleStep value={known} methods={knownMethods} bests={bests} onToggle={toggle} onNone={() => { setKnown([]); setKnownMethods({}); setBests({}); }} onMethod={method} onBest={(p, text) => setBests((v) => ({ ...v, [p]: text }))} />,
    // Imported puzzles are solved ones: they join the known puzzles.
    <ImportTimes onImported={(puzzles) => setKnown((v) => [...v, ...puzzles.filter((p) => !v.includes(p))])} />,
  ][step];
  const slide = reduced ? 0 : 56;
  return (
    <MotionConfig reducedMotion="user">
      <main className="journey-setup flex h-svh flex-col overflow-hidden bg-background text-foreground" aria-labelledby="journey-title" onKeyDown={onKeyDown}>
        <header className="flex h-14 shrink-0 items-center gap-4 px-4 md:h-16 md:px-8">
          <span className="flex items-center gap-2.5">
            <Logo size={20} />
            <Wordmark className="text-lg max-sm:hidden" />
          </span>
          <span className="flex-1" />
          {existing ? (
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => (history.length > 1 ? go(-1) : goPage("playground"))}>
              {tr("Cancel")}</Button>
          ) : (
            <span className="w-[54px] max-sm:hidden" aria-hidden="true" />
          )}
        </header>
        {/* On a wide screen the step and its buttons sit together in the middle, a short way for the mouse; phones keep
            the buttons at the foot, under the thumb. */}
        <div className="flex min-h-0 flex-1 flex-col md:justify-center md:pb-16">
        <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-4 md:flex-initial md:px-8" inert={saving}>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.section
              key={step}
              custom={dir}
              variants={{ enter: (d: number) => ({ x: d * slide, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: -d * slide, opacity: 0 }) }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ x: { type: "spring", stiffness: 520, damping: 42 }, opacity: { duration: 0.14 } }}
              className={cn("flex min-h-0 flex-1 flex-col gap-4 pt-2 pb-4 md:flex-initial md:gap-6 md:pt-6 md:pb-6", step === 0 && "max-md:justify-center max-md:pb-[8vh]")}
            >
              <StepHead title={said(STEPS[step].title)} sub={said(STEPS[step].sub)} />
              {content}
              {error && <p role="alert" className="text-sm text-destructive">{said(error)}</p>}
            </motion.section>
          </AnimatePresence>
        </div>
        <footer className="journey-footer shrink-0 max-md:border-t">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-3 md:px-8">
            <Button variant="ghost" disabled={saving || step === 0} onClick={() => goTo(step - 1)} className={cn(step === 0 && "invisible")}>
              <ArrowLeft />
              {tr("Back")}</Button>
            <div className="flex items-center gap-2">
              {step === LAST && !existing && (
                <Button variant="outline" disabled={saving} onClick={() => void finish(false)}>
                  <span className="max-sm:hidden">{tr("Skip the tour")}</span>
                  <span className="sm:hidden">{tr("Skip")}</span>
                </Button>
              )}
              <Button disabled={saving} onClick={advance}>
                {saving ? tr("Saving…") : step === 0 ? tr("Get started") : step === LAST ? (existing ? tr("Save") : tr("Start the tour")) : tr("Continue")}
                {!saving && <ArrowRight />}
                {!saving && (
                  <Kbd aria-hidden="true" className="ml-1 bg-primary-foreground/15 text-primary-foreground max-md:hidden">
                    <CornerDownLeft />
                  </Kbd>
                )}
              </Button>
            </div>
          </div>
        </footer>
        </div>
      </main>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------ Tour */

/** Focus stays in the tour, the app stays inert, and all listeners leave with it. */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null), dismiss = useRef(onClose);
  dismiss.current = onClose;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const shell = document.querySelector<HTMLElement>("[data-app-shell]");
    const inert = shell?.inert ?? false;
    if (shell) shell.inert = true;
    ref.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss.current(); }
      if (event.key !== "Tab") return;
      const buttons = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])].filter((e) => e.getClientRects().length);
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (!ref.current?.contains(document.activeElement) || document.activeElement === ref.current) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      if (shell) shell.inert = inert;
      if (previous?.isConnected && !previous.closest("[inert]")) previous.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

interface Box { x: number; y: number; width: number; height: number }
interface Spot { step: number; nav: Box | null; inner: Box[]; vw: number; vh: number }

const EDGE = 4, GAP = 16;
const grow = (r: DOMRect, by: number): Box => ({ x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by });
function clip(b: Box, vw: number, vh: number): Box | null {
  const x = Math.max(EDGE, b.x), y = Math.max(EDGE, b.y), right = Math.min(vw - EDGE, b.x + b.width), bottom = Math.min(vh - EDGE, b.y + b.height);
  return right - x > 8 && bottom - y > 8 ? { x, y, width: right - x, height: bottom - y } : null;
}
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
/** Parts of one element (the digits and their hint) close to each other read as one hole. */
function merge(boxes: Box[]): Box[] {
  const out = [...boxes];
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i]!, b = out[j]!;
      if (overlap({ x: a.x - 12, y: a.y - 12, width: a.width + 24, height: a.height + 24 }, b) > 0) {
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        out[i] = { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
        out.splice(j, 1);
        j = i;
      }
    }
  return out;
}
const shown = (e: Element) => e.getClientRects().length > 0 && !!e.closest("[data-app-shell]");
/** Brings an element hidden in a scrolled pane into view, without scrolling the window itself. */
function reveal(element: HTMLElement) {
  const r = element.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= innerHeight) return;
  for (let p = element.parentElement; p && p !== document.body; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (!/(auto|scroll)/.test(style.overflowY) || p.scrollHeight <= p.clientHeight) continue;
    const box = p.getBoundingClientRect();
    p.scrollTop += r.top < box.top ? r.top - box.top - 12 : Math.min(r.top - box.top - 12, r.bottom - box.bottom + 12);
    return;
  }
}
function read(step: number): Spot {
  const st = TOUR_STEPS[step]!, vw = innerWidth, vh = innerHeight;
  const nav = [...document.querySelectorAll<HTMLElement>(`[data-action="nav:${st.target}"]`)].find(shown);
  const inner = [...document.querySelectorAll<HTMLElement>(`[data-tour="${st.inner}"]`)].filter(shown);
  if (inner[0]) reveal(inner[0]);
  const navBox = nav ? clip(grow(nav.getBoundingClientRect(), 3), vw, vh) : null;
  const boxes = inner.map((e) => clip(grow(e.getBoundingClientRect(), 6), vw, vh)).filter((b): b is Box => !!b);
  return { step, nav: navBox, inner: merge(boxes), vw, vh };
}
const round = (spot: Spot) => JSON.stringify(spot, (_, v) => (typeof v === "number" ? Math.round(v) : v));

/** Beside the part of the page, never over it or the tab when there is room; docked top or bottom on phones. */
function place(spot: Spot, card: { width: number; height: number }, phone: boolean) {
  const { vw, vh } = spot, M = 12;
  const clamp = (p: { x: number; y: number }) => ({ x: Math.min(Math.max(M, p.x), vw - card.width - M), y: Math.min(Math.max(M, p.y), vh - card.height - M) });
  const avoid = [...spot.inner, ...(spot.nav ? [spot.nav] : [])];
  const cost = (p: { x: number; y: number }, i: number) => avoid.reduce((sum, b) => sum + overlap({ ...p, ...card }, b), 0) + i;
  const best = (list: { x: number; y: number }[]) => list.map(clamp).map((p, i) => [p, cost(p, i)] as const).sort((a, b) => a[1] - b[1])[0]![0];
  if (phone) {
    const bottomNav = spot.nav && spot.nav.y > vh / 2 ? spot.nav.y - GAP / 2 : vh - M;
    return best([{ x: M, y: bottomNav - card.height }, { x: M, y: M }]);
  }
  const a = spot.inner[0] ?? spot.nav;
  if (!a) return clamp({ x: (vw - card.width) / 2, y: (vh - card.height) / 2 });
  const cx = a.x + a.width / 2 - card.width / 2, cy = a.y + a.height / 2 - card.height / 2;
  return best([
    { x: a.x + a.width + GAP, y: a.y }, { x: a.x + a.width + GAP, y: cy },
    { x: a.x - card.width - GAP, y: a.y }, { x: a.x - card.width - GAP, y: cy },
    { x: a.x, y: a.y + a.height + GAP }, { x: cx, y: a.y + a.height + GAP },
    { x: a.x, y: a.y - card.height - GAP }, { x: cx, y: a.y - card.height - GAP },
    { x: vw - card.width - M, y: M }, { x: vw - card.width - M, y: vh - card.height - M }, { x: M, y: vh - card.height - M },
  ]);
}

function Tour() {
  const [step, setStep] = useState(0), [spot, setSpot] = useState<Spot | null>(null);
  const [card, setCard] = useState({ width: 360, height: 220 });
  const end = () => { s.overlay = ""; s.emit(); };
  const ref = useDialog(end), cardRef = useRef<HTMLDivElement>(null);
  const phone = usePhone(), reduced = useReducedMotion(), mask = useId();
  const last = TOUR_STEPS.length - 1;
  const next = () => (step === last ? end() : setStep(step + 1));
  const back = () => (step ? setStep(step - 1) : end());
  const keys = useRef({ next, back });
  keys.current = { next, back };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLButtonElement && (event.key === "Enter" || event.key === " ")) return;
      if (event.key === "ArrowRight") { event.preventDefault(); keys.current.next(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); keys.current.back(); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  // Open the step's page, wait for its transition to settle (no leaving page, rects still for a frame), then measure;
  // any later resize, scroll or change of the page measures again the same way.
  useEffect(() => {
    const st = TOUR_STEPS[step]!;
    if (location.pathname !== pageUrl(st.page)) goPage(st.page, { puzzle: s.puzzle as PuzzleId }, true);
    let frame = 0, previous = "", since = performance.now();
    const tick = () => {
      frame = 0;
      const now = read(step), key = round(now);
      const moving = location.pathname !== pageUrl(st.page) || s.page !== st.page;
      if ((!moving && key === previous) || performance.now() - since > 2500) {
        setSpot((old) => (old && round(old) === key ? old : now));
        document.querySelectorAll(`[data-tour="${st.inner}"]`).forEach((e) => observer.observe(e));
        return;
      }
      previous = key;
      frame = requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (frame) return;
      previous = ""; since = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(schedule), mutations = new MutationObserver(schedule);
    const shell = document.querySelector("[data-app-shell]");
    if (shell) { observer.observe(shell); mutations.observe(shell, { childList: true, subtree: true }); }
    schedule();
    addEventListener("resize", schedule);
    addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect();
      removeEventListener("resize", schedule); removeEventListener("scroll", schedule, true);
    };
  }, [step]);
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const measure = () => setCard((c) => (c.width === element.offsetWidth && c.height === element.offsetHeight ? c : { width: element.offsetWidth, height: element.offsetHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const shownStep = spot?.step ?? step, current = TOUR_STEPS[shownStep]!;
  const spring = reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 36 };
  const holes = spot ? [...(spot.nav ? [{ key: "nav", box: spot.nav }] : []), ...spot.inner.map((box, i) => ({ key: "inner-" + i, box }))] : [];
  const at = spot ? place(spot, card, phone) : { x: 12, y: 12 };
  const width = phone ? Math.max(0, (spot?.vw ?? innerWidth) - 24) : 360;
  return createPortal(
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" className="journey-tour fixed inset-0 z-[120] overscroll-contain outline-none">
      <svg aria-hidden="true" className="absolute inset-0 size-full">
        <defs>
          <mask id={mask}>
            <rect width="100%" height="100%" fill="white" />
            {holes.map((h) => (
              <motion.rect key={h.key} rx={10} fill="black" initial={false} animate={{ x: h.box.x, y: h.box.y, width: h.box.width, height: h.box.height }} transition={spring} />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgb(0 0 0 / 0.62)" mask={`url(#${mask})`} />
      </svg>
      {holes.map((h) => (
        <motion.div
          key={h.key}
          data-spotlight={h.key === "nav" ? "nav" : "inner"}
          aria-hidden="true"
          className={cn("pointer-events-none absolute top-0 left-0 rounded-[10px] border", h.key === "nav" ? "border-primary/50" : "border-2 border-primary")}
          initial={{ opacity: 0, x: h.box.x, y: h.box.y, width: h.box.width, height: h.box.height }}
          animate={{ opacity: 1, x: h.box.x, y: h.box.y, width: h.box.width, height: h.box.height }}
          transition={spring}
        />
      ))}
      <motion.div
        ref={cardRef}
        className="journey-tour-card absolute top-0 left-0 flex flex-col gap-4 rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg"
        style={{ width }}
        initial={false}
        animate={{ x: at.x, y: at.y, opacity: spot ? 1 : 0 }}
        transition={{ x: spring, y: spring, opacity: { duration: reduced ? 0 : 0.15 } }}
      >
        <header className="flex items-center gap-3">
          <span className="flex items-center gap-1" aria-hidden="true">
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-[2px] transition-all", i === shownStep ? "w-4 bg-primary" : i < shownStep ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted-foreground/25")} />
            ))}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums" aria-label={tr("Step {0} of {1}", { 0: shownStep + 1, 1: TOUR_STEPS.length })}>
            {shownStep + 1} / {TOUR_STEPS.length}
          </span>
          <Button size="icon-sm" variant="ghost" aria-label={tr("End tour")} className="-my-1 -mr-2 ml-auto text-muted-foreground" onClick={end}>
            <X />
          </Button>
        </header>
        <motion.div key={shownStep} className="flex flex-col gap-1.5" initial={reduced ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
          <h2 id="tour-title" className="text-lg font-semibold tracking-tight">{said(current.title)}</h2>
          <p id="tour-body" className="text-sm leading-relaxed text-muted-foreground">{current.body}</p>
        </motion.div>
        <footer className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="-ml-2.5" onClick={back}>
            {step ? <><ArrowLeft />{tr("Back")}</> : tr("Skip tour")}
          </Button>
          <Button onClick={next}>
            {step === last ? tr("Done") : tr("Next")}
            {step === last ? <Check /> : <ArrowRight />}
          </Button>
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}

export function Introduction() {
  return s.overlay === "tour" ? <Tour /> : null;
}
