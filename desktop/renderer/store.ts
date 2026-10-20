import { appearanceFromStorage, cachedAppearance, systemLight, type ColorMode } from "../../src/client/lib/appearance";
import { isLearningTrack, type LearningPlan } from "../../src/client/lib/dailyLearning";
import { dueCases, nextRecognition, recognitionCases, recognitionTurn, recommend, trainingPool, type Recommendation } from "../../src/client/lib/trainingPicks";
import { LaunchSessions } from "../../src/client/lib/launchSessions";
import { resumedSession, type SessionSummary } from "../../src/client/lib/sessions";
import { exportFile } from "../../src/client/lib/exportData";
import { matches, toggleSelection } from "../../src/client/lib/practiceCatalog";
import { cleanFigures, DEFAULT_FIGURES, FIGURE_LIMIT, parseFigure, sessionFigures, sessionMetrics, shownFigures, type Metric } from "../../src/client/lib/practiceSummary";
import { isPhone } from "../../src/client/lib/viewport";
import { call, openExternal } from "./bridge";
import catalogData from "../assets/catalog.json";
import { attemptMode, EVENTS, eventInfo, eventLabel, eventOf, isPuzzle, normalizeScrambleType, puzzleOf, roundFormat, scrambleTypesOf, type PuzzleId, type RoundFormat, type SolveMode } from "../../src/shared/puzzles";
import { CROSS_MOVES, crossMovesFor, crossScrambleType, crossSolveMode, crossTrainingType, hasSolutions, isCrossTarget, type CrossTarget } from "../../src/shared/crossTraining";
import { courseEntry, courseStorageKey, goToStep, methodOf, methodSetIds, openCourse, readCourseProgress, recommendedMethod, toggleAlgLearned, type CourseProgress } from "../../src/client/lib/course";
import { duel } from "./duelClient";
import type { CubeMask } from "../../src/shared/cubeAppearance";
import type { PolyPuzzle } from "../../src/shared/puzzleScene";
import { PROFILE_KEY, journeyProfile, puzzleLocked, withKnownPuzzle, type Journey } from "../../src/client/lib/journey";
import { go, goPage, pageUrl, readRoute, type AppRoute } from "./navigation";
import { ACCOUNT_PAGES } from "../../src/client/lib/route";
import { sharedSolveUrl } from "../../src/client/lib/sharedSolve";
import { smartCube } from "../../src/client/lib/smartCube";
import { stackmat } from "../../src/client/lib/stackmat";
import { smartTimer } from "../../src/client/lib/bluetooth/timers";
import { announceDevice, webBluetooth, type DeviceNotice } from "../../src/client/lib/bluetooth/link";
import { bluetoothCube } from "../../src/client/lib/bluetooth/cubes";
import { effective, INSPECTIONS, type Inspection } from "../../src/client/lib/format";
import { metronomeBpm } from "../../src/client/lib/metronome";
import { mbldCubes, mbldValue, numberedScrambles, scrambleList, wcaUrl } from "../../src/client/lib/wca";
import { takeWcaTicket, type WcaReturn } from "../../src/client/lib/wcaAuth";
import type { AddSolveBody } from "../../src/client/api-client";
import { compSimName, roundRecord } from "../../src/client/lib/compSim";
import type { Penalty, SolveDto } from "../../src/shared/types";
import "./dev/devTools";
import { toast } from "sonner";
import { REMINDED_KEY, REMINDERS_KEY, remindersDue } from "../../src/client/lib/reminders";
import { dayKey } from "../../src/client/lib/profile";
import { tn, tr } from "../../src/client/i18n";
import { ask } from "./confirm";
import { msg } from "../../src/client/i18n/msg";
import { isCaseSource, type CaseSource } from "../../src/client/lib/smartStats";
import { cancelDaily, dailyDay, fetchDaily, isDailyEvent, DailyError, type DailyBoard } from "../../src/client/lib/daily";
import { appReady } from "../../src/client/lib/firstLaunch";

const SHOWN_SCRAMBLE = "cubix.shownScramble";
/** Saves a file made on the page (an export) to the downloads. */
export function download(body: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
/** The timer's competition simulation (`Store.compSim`), kept over a reload. */
const COMP_SIM = "cubix.compSim";
/** The next scrambles drawn ahead, by context (`Store.ahead`). */
const AHEAD = "cubix.scramblesAhead";
/** The scramble shown last and its puzzle, kept on the device: the timer drawn while the app starts shows it already. */
export const lastScramble: { puzzle?: string; scramble?: string } = (() => { try { return JSON.parse(localStorage.getItem(SHOWN_SCRAMBLE) ?? "{}") ?? {}; } catch { return {}; } })();
/** The ways of training the setup page offers, in its order. */
export const TRAINING_MODES = ["cross", "recognition", "review", "learned", "sets", "free", "bld"] as const;
export type TrainingMode = (typeof TRAINING_MODES)[number];
// Bluetooth devices coming, going out of reach, back, gone, or failing to connect (told in the open Devices dialog already).
const notice = ({ title, description, tone }: DeviceNotice) => {
  if (tone !== "error" || store.overlay !== "devices") (tone === "success" ? toast.success : tone === "error" ? toast.error : toast)(title, { description });
};
announceDevice(() => ({ ...smartCube.snapshot, link: smartCube.snapshot.status }), smartCube.subscribe, notice);
announceDevice(() => smartTimer.snapshot, smartTimer.subscribe, notice);
// The Stackmat's signal coming and going.
let stackmatLink = stackmat.snapshot.link;
stackmat.subscribe(() => {
  const { link } = stackmat.snapshot;
  if (link === stackmatLink) return;
  if (link === "on") toast.success(tr("Stackmat connected"));
  else if (stackmatLink === "on") toast(tr("Stackmat signal lost"));
  stackmatLink = link;
});
export const catalog = catalogData as any;
/** The catalogue never changes while the app runs: its cases by id, and by puzzle once asked for (never to be modified). */
const caseById = new Map<string, any>(catalog.cases.map((c: any) => [c.id, c]));
const casesByPuzzle = new Map<string, any[]>();
/** Its cases by set, in its order: a set belongs to one puzzle, so a set's cases are its puzzle's too. */
const casesBySet = new Map<string, any[]>();
for (const c of catalog.cases) {
  const list = casesBySet.get(c.set);
  if (list) list.push(c);
  else casesBySet.set(c.set, [c]);
}
let details: Promise<void> | undefined;
/** The cases' algorithms, other setups and notes, outside the start-up bundle (desktop/web.ts `catalogSplit`): fetched
 * by the pages that read them (app.tsx), the page in view drawn again once they are there (a trained case's video). */
export const catalogDetails = () =>
  (details ??= import("../../src/client/local/catalogDetails").then(({ addDetails }) => {
    addDetails(catalog.cases);
    store.emit();
  }));
/** An algorithm the 3D player can show: its name, its ways to play it (the first one first), and the cube it is on. */
export interface PlayItem { key: string; name: string; detail?: string; context?: string; algs: string[]; note?: string; size: number; mask: CubeMask; hints?: boolean; setup?: string; puzzle?: PolyPuzzle }
/** Whether every word typed starts a word of the case (shared with the phone app). */
export { matches };
/** From this width a training opens with its times shown, and Escape no longer folds them away. */
export const TIMES_OPEN_WIDTH = 1024;
/** The order of the groups of the sets that are no learning track, set by set (see `groupOrder`). */
const GROUP_ORDER_KEY = "cubix.learn.groupOrder";
const timesOpenAtStart = (page: string) => page === "training" && innerWidth >= TIMES_OPEN_WIDTH;
/** Whether a window this wide keeps the session's times beside the stage, with no button to fold them away. */
export const timesAlwaysShown = (width: number, training: boolean) => !isPhone(width) && width >= (training ? 1200 : 980);
/** The catalogue's sets, by id. */
const KNOWN_SETS = new Set<string>(catalog.sets.map((set: any) => set.id));
/** The catalogue sets a method's steps teach, in order, once each; none for "all" or a method without any. */
export const methodSets = (puzzle: PuzzleId, method: string) => methodSetIds(methodOf(puzzle, method)).filter((id) => KNOWN_SETS.has(id));
/** Set once a guest has closed the first visit's sign-in offer. */
const WELCOMED = "cubix.welcomed";

export class Store {
  listeners = new Set<() => void>();
  version = 0;
  ready = false;
  prefs: Record<string, any> = {};
  learningGroupOrder: NonNullable<LearningPlan["groupOrder"]> = {};
  page = "playground";
  caseId = "";
  /** A case opened in a dialog over its page (Learn's catalogue cases), without leaving it. */
  caseDialog = "";
  /** The case dialog's side: its algorithms or its statistics. */
  caseView: "algorithms" | "statistics" = "algorithms";
  /** The assisted solve of the 3×3 course shown is open (AssistedSolve). */
  assisted = false;
  puzzle = "333";
  solveMode = "standard";
  scrambleType = "normal";
  /** The timer shows the daily scramble (its button beside the scramble); its solves stay normal scrambles. */
  dailyOn = false;
  /** The daily scramble shown: its day and event. */
  dailyShown: { day: string; event: string } | null = null;
  /**
   * The daily attempt in the "daily" dialog and where it stands; `board` null while offline. `fresh`: just solved, so it
   * may be cancelled (a false start, a stop missed).
   */
  dailyResult: { day: string; event: string; timeMs: number; penalty: string; ranked: boolean; fresh?: boolean; board: DailyBoard | null; error?: string } | null = null;
  entry = "timer";
  /** The WCA inspection before a timer solve: off, announced aloud, counted down on screen, or both. */
  inspection: Inspection = "off";
  /** The phases a timer solve is timed in (lib/phases): off, a method's steps or a number of them. */
  phases = "off";
  /** A metronome's beats per minute while a solve runs, 0 when off. */
  metronome = 0;
  /** Multi-Blind: the cubes of an attempt. */
  mbldCubes = 3;
  /** Multi-Blind: the attempt stopped, waiting for the cubes solved. */
  mbldPending: { ms: number; cubes: number } | null = null;
  themeName: string = cachedAppearance().themeName;
  light = cachedAppearance().light;
  /** What the player chose: `light` follows it, the system's look when "system". */
  colorMode: ColorMode = cachedAppearance().mode;
  user: any = { isGuest: true, username: msg("Guest") };
  learned = new Set<string>();
  /** The algorithm each learned case was learned with, when one was chosen. */
  learnedAlgs: Record<string, string[]> = {};
  journey: Journey = {};
  private introducedAccount = "";
  introductionReady = false;
  /** The cases picked by hand for the training, per puzzle (see `practiceSelected`). */
  selected = new Set<string>();
  sets: Record<string, string> = {};
  collapsed = new Set<string>();
  selectorOpen: Record<string, boolean> = {};
  scramble = "";
  private savedScramble = lastScramble.scramble;
  /** Whether the start-up is done: the snapshots read the profile ahead from then on (engine/core.ts). */
  private profileAhead = false;
  training: any = null;
  solves: any[] = [];
  profile: any = null;
  achievements: any = null;
  /** The account's XP and achievements unlocked, and the latest gain while its bar shows (`at` tells two gains apart). */
  xp: number | null = null;
  unlocked = { count: 0, total: 0 };
  xpOwner = "";
  /** The last gain of XP, with the achievements unlocked that brought it: [title, XP]. */
  xpGain: { from: number; to: number; at: number; because: [string, number][] } | null = null;
  /** The achievements unlocked at the last snapshot, by id. */
  earned = new Set<string>();
  caseHistory: any = null;
  /** The engine's tokens of the figures held: unchanged ones are not sent again. */
  known: Record<string, number> = {};
  stats: any[] = [];
  error = "";
  saving = false;
  pendingSolve: any = null;
  scrollPositions = new Map<string, number>();
  generating = false;
  showTimes = false;
  /** Wide windows keep the session's times beside the timer unless the player closed them (kept on this device). */
  timesHidden = false;
  revealed = false;
  randomAuf = true;
  showCube = true;
  /** The figures of the timer's band, chosen by the player (see `sessionFigures`). */
  figures: string[] = DEFAULT_FIGURES;
  /** The account's session ended on the server (401): the sign-in dialog asks to sign in again. */
  expired = false;
  /** Where the sign-in dialog goes once signed in: a page that asked for an account, else "" (it stays). */
  signInNext = "";
  /** Times or learned cases of this device outside any account: signing in or creating an account keeps them. */
  localData = false;
  overlay = "";
  overlaySolve: any = null;
  /** Whether the solve dialog opens on its comment field. */
  commenting = false;
  query = "";
  learningFilter = "all";
  catalogStage = "";
  /** Puzzle and method shown by the solving methods guide, independent of the active puzzle. */
  guidePuzzle: PuzzleId = "333";
  /** Guide shown in the guides dialog. */
  guidePage = "overviewGuide";
  guideMethod = "";
  profileMode = "overview";
  profileStage = "all";
  profilePuzzle = "333";
  profileSolveMode = "standard";
  profileScramble = "normal";
  achievementGroup = "all";
  achievementFilter = "all";
  /** Whether solve statistics show the progress chart or the solves table. */
  statsView = "chart";
  /** Where a 3×3 case's times come from: its training, the smart cube solves it was done in, or both. */
  caseSource: CaseSource = "all";
  /** The analysis of the smart cube solves, while the profile shows it. */
  smartAnalysis: any = null;
  sessions = new LaunchSessions();
  /** The timer's sessions of the current context, newest first (`lib/sessions`), while the timer is shown. */
  sessionList: SessionSummary[] = [];
  /** Statistics per solve, or one point per session. */
  statsBy = "solve";
  /** Contexts whose last session was looked for since launch (it resumes on the same day, or when named). */
  private resumed = new Set<string>();
  /**
   * A competition simulation on the timer (lib/compSim): its event and session, its format, the record it is compared
   * with, the session to go back to, and the attempt stopped and waiting for its judge (OK, +2 or DNF). Its attempts
   * are the solves of its session. Kept on this device (written at each change, see `emit`): the round goes on whenever
   * the timer shows its session, after a reload too.
   */
  compSim: { event: string; session: number; format: RoundFormat; record: number | null; previous?: number; pending: { ms: number; penalty: Penalty; solution?: string | null; memo?: number } | null } | null =
    (() => { try { return JSON.parse(localStorage.getItem(COMP_SIM) ?? "null"); } catch { return null; } })();
  private savedCompSim = JSON.stringify(this.compSim);
  lastSolve = 0;
  notice = "";
  replay = 0;
  timerEpoch = 0;
  #running = false;
  /**
   * A solve is running: everything but its digits fades out, by the `data-running` of the app's root (see `FADE`),
   * set here at once rather than by drawing the whole app again.
   */
  get running() {
    return this.#running;
  }
  set running(running: boolean) {
    this.#running = running;
    globalThis.document?.querySelector("[data-app-shell]")?.toggleAttribute("data-running", running);
  }
  learningFrozen = false;
  revision = 0;
  request = 0;
  /** Training opens on the choice of what to practise, then shows the timer for it. */
  trainingStep: "setup" | "practice" = "setup";
  /**
   * Learned cases of the catalogue, step scrambles (cross, EOLine, blocks…) on the 3×3, a recognition run through
   * a set, or free practice on any case.
   */
  trainingKind: "cases" | "cross" | "recognition" | "review" | "free" = "cases";
  /** The recognition run under way: the learned cases of a set it draws from at random, the one shown, how many were
   * shown, and whether it was closed (its count then shows). */
  recognition: { set: string; ids: string[]; current?: string; turn: number; done: number; closed: boolean } | null = null;
  crossTarget: CrossTarget = "cross";
  crossMoves = 5;
  /** Optimal cross solutions of the shown scramble, computed by the engine when revealed. */
  crossSolutions: { scramble: string; list: { moves: string; slot: string }[] | null } | null = null;
  /** The method whose course the Learn page shows; empty, the list of methods. */
  learnMethod = "";
  /** The coaching view and its argument, as in /coaching/<view>/<id>. */
  coachingView = "";
  /** The view under the community, tournaments and match pages, as in /community/groups/<id>. */
  view = "";
  /** Method highlighted in the list of methods, before it is opened. */
  learnPick = "";
  /** The set shown by each step that teaches several, by `puzzle:method:step`. */
  learnSets: Record<string, string> = {};
  /** The algorithms the 3D player steps through (a Learn step's), the one shown and its alternative played. */
  algView: { items: PlayItem[]; index: number; choice: number } | null = null;
  /** The course just finished: its page says so until another step is opened. */
  learnFinished = false;
  /** The puzzle and the move shown by the notation guide. */
  notationPuzzle: PuzzleId = "333";
  notationMove = "R";
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  emit = () => {
    if (this.scramble && this.scramble !== this.savedScramble) try { localStorage.setItem(SHOWN_SCRAMBLE, JSON.stringify({ puzzle: this.puzzle, scramble: (this.savedScramble = this.scramble) })); } catch {}
    if (JSON.stringify(this.compSim) !== this.savedCompSim) try { localStorage.setItem(COMP_SIM, (this.savedCompSim = JSON.stringify(this.compSim))); } catch {}
    this.version++;
    this.notify();
  };
  /**
   * Draws the change: at once within an event of the page (a key, a click, a field typed in, as a controlled field
   * needs), else once a frame, the answers of the data engine and of the server coming in bursts (6 to 8 a solve).
   */
  private held = false;
  private notify() {
    if (!this.listeners.size) return;
    const event = window.event;
    if (event && !(event instanceof MessageEvent)) return this.listeners.forEach((fn) => fn());
    if (this.held) return;
    this.held = true;
    const flush = () => {
      if (!this.held) return;
      this.held = false;
      this.listeners.forEach((fn) => fn());
    };
    // The next frame, or 50 ms at most: a hidden tab draws no frame, and a frame asked for may never come.
    requestAnimationFrame(flush);
    setTimeout(flush, 50);
  }
  /** Cross training: timer solves on scrambles whose `crossTarget` takes `crossMoves` turns. */
  get crossTraining() {
    return this.page === "training" && this.trainingKind === "cross" && this.puzzle === "333";
  }
  /** Where solves are recorded: cross scrambles are timer solves of their own scramble type. */
  practicePage = () => (this.crossTraining ? "playground" : this.page);
  context = () => ({
    puzzle: this.puzzle,
    solveMode: this.crossTraining ? crossSolveMode(this.solveMode) : this.solveMode,
    scrambleType: this.crossTraining
      ? crossScrambleType(this.crossTarget, this.crossMoves)
      : this.page === "training" ? "case" : this.scrambleType,
  });
  contextKey = () =>
    `${this.page}:${this.puzzle}:${this.context().solveMode}:${this.context().scrambleType}`;
  cases = (p = this.puzzle) => {
    let cases = casesByPuzzle.get(p);
    if (!cases) casesByPuzzle.set(p, (cases = catalog.cases.filter((c: any) => puzzleOf(c) === p)));
    return cases!;
  };
  /** A set's cases, in the catalogue's order (`casesBySet`): never to be modified. */
  setCases = (set: string): any[] => casesBySet.get(set) ?? [];
  /** A case's statistics among `stats`, by its id: indexed once for each list read. */
  private statsIndex: { of: any[]; byId: Map<string, any> } | null = null;
  stat = (id: string) => {
    if (this.statsIndex?.of !== this.stats) {
      // The first one of a case, as `find` would.
      const byId = new Map<string, any>();
      for (const v of this.stats) if (!byId.has(v.caseId)) byId.set(v.caseId, v);
      this.statsIndex = { of: this.stats, byId };
    }
    return this.statsIndex.byId.get(id);
  };
  /** How many of a set's cases are learned: counted once for each `learned`, which is replaced, never changed. */
  private learnedIndex: { of: Set<string>; bySet: Map<string, number> } | null = null;
  learnedIn = (set: string) => {
    if (this.learnedIndex?.of !== this.learned) this.learnedIndex = { of: this.learned, bySet: new Map() };
    let n = this.learnedIndex.bySet.get(set);
    if (n === undefined) this.learnedIndex.bySet.set(set, (n = this.setCases(set).filter((c: any) => this.learned.has(c.id)).length));
    return n;
  };
  allSets = (p = this.puzzle) =>
    catalog.sets.filter((c: any) => puzzleOf(c) === p);
  find = (id: string) => caseById.get(id);
  info = (p = this.puzzle) =>
    catalog.puzzles.puzzles.find((v: any) => v.id === p);
  label = (kind: string, id: string) =>
    catalog.puzzles[kind]?.find((v: any) => v.id === id)?.label ?? id;
  /** The WCA event of a puzzle and solve mode: what the puzzle pickers list, with its glyph. */
  event = (p = this.puzzle, mode = this.solveMode) => ({
    id: eventOf(p as PuzzleId, mode as SolveMode)?.id ?? p,
    label: eventLabel(p as PuzzleId, mode as SolveMode),
  });
  /** Today's reminders (`lib/reminders`) as one notice, once a day: its button opens the first one. Looked at with each
   * snapshot's figures until shown, so that a sign-in or the first sync brings them. */
  remind(streak: { current: number; today: boolean }) {
    if (!this.ready || this.overlay || this.running) return;
    const [first, second] = remindersDue(this.reminders, this.prefs[REMINDED_KEY], { due: this.dueCases().length, streak });
    if (!first) return;
    this.pref(REMINDED_KEY, dayKey(new Date()));
    toast(tr(first.title), {
      description: second && tr(second.title),
      duration: 15000,
      action: { label: tr(first.action), onClick: () => void this.action(first.id === "review" ? "trainingStart:review" : "nav:playground") },
    });
  }
  /** Whether the app reminds of the day's review and of a streak at stake (the settings). */
  get reminders(): boolean {
    return this.prefs[REMINDERS_KEY] ?? true;
  }
  pref(key: string, value: any) {
    this.prefs[key] = value;
    void call("preference", key, value).catch(this.fail);
  }
  per(key: string, value: any) {
    this.pref(key, { ...this.prefs[key], [this.puzzle]: value });
  }
  /** The account's progress in the Learn section, a preference like its learning plan. */
  get course(): CourseProgress {
    return readCourseProgress(this.prefs[courseStorageKey(this.user.id ?? "guest")]);
  }
  saveCourse(progress: CourseProgress) {
    this.pref(courseStorageKey(this.user.id ?? "guest"), progress);
  }
  /** The course shown, its method and where it stands. */
  get learning() {
    const puzzle = this.puzzle as PuzzleId, method = methodOf(puzzle, this.learnMethod);
    return method ? { puzzle, method, entry: courseEntry(this.course, puzzle, method.id) } : undefined;
  }
  /** A finished course makes its puzzle one the player knows, with its method. */
  async unlockPuzzle(method?: string) {
    const profile = journeyProfile(this.journey);
    if (profile && puzzleLocked(profile, this.puzzle as PuzzleId)) await this.updateJourney({ [PROFILE_KEY]: withKnownPuzzle(profile, this.puzzle as PuzzleId, method) });
  }
  /** Shows a step of the course, the page back at its top. */
  learnStep(index: number) {
    const course = this.learning;
    this.learnFinished = false;
    if (!course) return;
    goPage("learn", { puzzle: course.puzzle, learnMethod: course.method.id, learnStep: Math.max(0, Math.min(course.method.steps.length - 1, index)) });
  }
  /** Opens the 3D player on one of a list of algorithms. */
  openAlg(items: PlayItem[], index: number) {
    this.algView = { items, index, choice: 0 };
    this.overlay = "algPlayer";
    this.emit();
  }
  /** Closes the dialog or sheet open over the app. */
  closeOverlay = () => {
    // The first visit's offer closed without an account: not offered again on this device.
    if (this.overlay === "signin" && this.user.isGuest && !this.prefs[WELCOMED]) this.pref(WELCOMED, true);
    this.overlay = "";
    this.emit();
  };
  fail = (e: any) => {
    this.error = e.message ?? String(e);
    this.saving = false;
    this.generating = false;
    this.emit();
  };
  /** The order of a set's groups on Learn: a learning track's as the account keeps it, any other set's a preference. */
  groupOrder(setId: string): string[] | undefined {
    const track = setId.toUpperCase();
    return isLearningTrack(track) ? this.learningGroupOrder[track] : this.prefs[GROUP_ORDER_KEY]?.[setId];
  }
  /** Whole sets the training drills (their learned cases), per puzzle. */
  get trainSets(): string[] { return this.prefs["cubix.training.setsByCube"]?.[this.puzzle] ?? []; }
  /** The way of training chosen on the setup page. */
  get trainingMode(): TrainingMode { return TRAINING_MODES.includes(this.prefs["cubix.training.mode"]) ? this.prefs["cubix.training.mode"] : "learned"; }
  /** The set the recognition goes through, per puzzle, and the seconds each case is shown without a connected cube. */
  get recognitionSet(): string {
    const learned = (set: string) => this.learnedIn(set) > 0,
      chosen = this.prefs["cubix.training.recognitionByCube"]?.[this.puzzle];
    return chosen && learned(chosen) ? chosen : (this.allSets().find((set: any) => learned(set.id))?.id ?? "");
  }
  /** The method the algorithms page shows its sets by, per puzzle ("all": every set by its stage). */
  /** Whether a last layer case shows its algorithms for the left hand (`leftHandAlgs`). */
  get leftHand(): boolean { return this.prefs["cubix.algs.leftHand"] ?? false; }
  get algsMethod(): string { return this.prefs["cubix.algs.methodByCube"]?.[this.puzzle] ?? "all"; }
  get recognitionSeconds(): number { return this.prefs["cubix.training.recognitionSeconds"] ?? 3; }
  /** Whether the recognition draws the top layer's stickers hidden at the back (`cubeShapes` hints). */
  get recognitionBack(): boolean { return this.prefs["cubix.training.recognitionBack"] ?? true; }
  /** The cases free practice drills, learned or not, per puzzle. */
  get freePicks(): string[] { return this.prefs["cubix.training.freeByCube"]?.[this.puzzle] ?? []; }
  /** The recommended cases picked, per puzzle; until the player picks, the four first recommended. */
  get trainPicks(): string[] { return this.prefs["cubix.training.picksByCube"]?.[this.puzzle] ?? this.recommended().slice(0, 4).map((r) => r.id); }
  private recommendation: { key: unknown[]; value: Recommendation[] } = { key: [], value: [] };
  /** The learned cases slower than usual, in training and in the smart cube solves (`trainingPicks`). */
  recommended(): Recommendation[] {
    const key = [this.puzzle, this.stats, this.smartAnalysis, this.learned, this.learned.size];
    if (key.some((v, i) => v !== this.recommendation.key[i]))
      this.recommendation = { key, value: recommend(this.cases(), this.learned, this.stats ?? [], this.puzzle === "333" ? (this.smartAnalysis?.methods?.[0]?.cases ?? []) : []) };
    return this.recommendation.value;
  }
  /** The learned cases due for review now (`dueCases`). */
  dueCases(): string[] { return dueCases(this.cases(), this.learned, this.stats ?? []); }
  /** The learned cases of the recommended picked, the whole sets and the cases picked by hand. */
  get casesPool(): Set<string> { return new Set(trainingPool(this.cases(), this.learned, { picks: this.trainPicks, sets: this.trainSets, hand: [...this.selected] })); }
  /** The cases a training drills: the cases' pool, the recognition's case shown, or the cases picked for free practice. */
  get practiceSelected(): Set<string> {
    if (this.trainingKind === "recognition") return new Set(this.recognition?.current ? [this.recognition.current] : []);
    if (this.trainingKind === "free") return new Set(this.freePicks.filter((id) => this.find(id)));
    if (this.trainingKind === "review") return new Set(this.dueCases());
    return this.casesPool;
  }
  /** What a training drills, in short: its recommended cases, its whole sets (their learned cases) and its cases picked by hand, else every learned case. */
  trainingParts(kind = this.trainingKind) {
    const run = this.recognition;
    if (kind === "recognition") return run ? [tr(this.allSets().find((set: any) => set.id === run.set)?.label ?? ""), tn(run.ids.length, "{n} case")] : [];
    if (kind === "free") return [tr("Free practice")];
    if (kind === "review") return [tr("Revision")];
    const learned = (ids: Iterable<string>) => [...ids].filter((id) => this.learned.has(id)).length,
      picks = learned(this.trainPicks),
      hand = learned(this.selected);
    const parts = [
      ...(picks ? [tr("{0} recommended", { 0: picks })] : []),
      ...this.allSets().flatMap((set: any) => {
        const n = this.trainSets.includes(set.id) ? this.learnedIn(set.id) : 0;
        return n ? [tr("{0} · {1} learned", { 0: tr(set.label), 1: n })] : [];
      }),
      ...(hand ? [tr("{0} by hand", { 0: hand })] : []),
    ];
    return parts.length || !this.casesPool.size ? parts : [tr("All learned cases")];
  }
  /** A training whose case left its cases (no longer learned, or unpicked) moves on to another. */
  async refreshLearning(quiet = false) {
    if (this.learningFrozen || this.saving || this.pendingSolve || this.page !== "training" || this.crossTraining) return;
    const pool = this.practiceSelected;
    if (pool.has(this.training?.id) || (!this.training && !pool.size)) return;
    this.timerEpoch++;
    await this.nextCase();
    if (!quiet) this.emit();
  }
  async init() {
    try {
      const v = await call("init");
      if (v.protocol !== 2) throw Error(msg("Incompatible data engine"));
      this.user = v.user;
      this.journey = v.journey ?? {};
      this.localData = !!v.localData;
      this.syncStatus(v.status);
      for (const [k, raw] of Object.entries(v.storage)) {
        try {
          this.prefs[k] = JSON.parse(raw as string);
        } catch {}
      }
      const appearance = appearanceFromStorage(v.storage);
      this.themeName = appearance.themeName;
      this.colorMode = appearance.mode;
      this.light = appearance.light;
      this.puzzle = this.prefs["cubix.puzzle"] ?? "333";
      this.randomAuf = this.prefs["cubix.training.randomAuf"] ?? true;
      this.showCube = this.prefs["cubix.practice.showCube"] ?? true;
      this.timesHidden = this.prefs["cubix.practice.timesHidden"] ?? false;
      this.figures = cleanFigures(this.prefs["cubix.practice.figures"] ?? DEFAULT_FIGURES);
      this.entry = this.prefs["cubix.timer.entry"] ?? "timer";
      this.inspection = INSPECTIONS.some((i) => i.id === this.prefs["cubix.timer.inspection"]) ? this.prefs["cubix.timer.inspection"] : "off";
      this.phases = this.prefs["cubix.timer.phases"] ?? "off";
      this.metronome = metronomeBpm(this.prefs["cubix.timer.metronome"]);
      this.mbldCubes = mbldCubes(this.prefs["cubix.timer.mbldCubes"]);
      this.learningFilter = this.prefs["cubix.algs.learningFilter"] ?? "all";
      this.statsView = this.prefs["cubix.profile.statsView"] ?? "chart";
      this.statsBy = this.prefs["cubix.profile.statsBy"] ?? "solve";
      this.caseSource = isCaseSource(this.prefs["cubix.algs.caseSource"]) ? this.prefs["cubix.algs.caseSource"] : "all";
      // "cross1" was the first-block training (a pair and two cross edges): its nearest is the XCross.
      const kind = this.prefs["cubix.training.kind"], target = this.prefs["cubix.training.crossTarget"];
      this.trainingKind = kind === "cross" || kind === "cross1" ? "cross" : kind === "recognition" || kind === "review" || kind === "free" ? kind : "cases";
      this.crossTarget = isCrossTarget(target) ? target : kind === "cross1" ? "xcross" : "cross";
      this.crossMoves = crossMovesFor(this.crossTarget, this.prefs["cubix.training.crossMoves"]);
      this.learned = new Set(v.learned);
      this.learnedAlgs = v.learnedAlgs ?? {};
      this.learningGroupOrder = v.learningGroupOrder ?? {};
      this.loadContext();
      const wcaTicket = takeWcaTicket();
      const route = readRoute(window.location.pathname, window.location.search);
      if (route) this.applyRoute(route);
      // The account's setup is in `init` already: the app shows without waiting for its first snapshot.
      this.checkIntroduction();
      // A person's first visit without an account offers to sign in, as the phone app's welcome does (never to the tests).
      if (this.user.isGuest && !this.prefs[WELCOMED] && !this.overlay && document.documentElement.hasAttribute("data-direct")) this.overlay = "signin";
      this.ready = true;
      this.emit();
      if (wcaTicket) void this.finishWca(wcaTicket);
      // The scramble is asked with the first snapshot, not after it; once shown, one ahead for every event and type.
      // The first scramble shown, the app is ready: a first launch's screen goes (firstLaunch.ts).
      const scrambled = (this.scramble ? Promise.resolve() : this.nextScramble()).finally(() => { this.drawAllAhead(); appReady(); });
      await this.refresh();
      await Promise.all([scrambled, this.nextCase()]);
      this.prefetchCrossSolutions();
      // The profile, read ahead once the timer is up rather than with its first snapshots.
      this.profileAhead = true;
      if (!this.profile) void this.refresh();
    } catch (e) {
      // Nothing to wait for: the error shows.
      appReady();
      this.fail(e);
    }
  }
  /** An account whose session holds. A guest uses the app on this device alone, but for the pages of an account
   * (`ACCOUNT_PAGES`); an expired session gets the sign-in dialog. */
  get signedIn() {
    return !this.user.isGuest && !this.expired;
  }
  checkIntroduction() {
    if (!this.signedIn || this.introducedAccount === this.user.id) return;
    this.introducedAccount = this.user.id;
    if (journeyProfile(this.journey)) { this.introductionReady = true; return; }
    this.introductionReady = false;
    const owner = this.user.id;
    // A new device first pulls the account's existing setup; offline accounts still reach setup.
    void call("sync").then(() => this.refresh()).then(() => {
      if (this.user.id === owner && this.signedIn) { this.introductionReady = true; this.emit(); }
    }).catch(this.fail);
  }
  async updateJourney(changes: Journey) {
    const owner = this.user.id;
    const saved = await call("updateJourney", changes);
    if (owner !== this.user.id) return;
    this.journey = saved;
    this.emit();
    await this.refresh();
  }
  /** The engine's sync state: "signin" once the server has refused the account's token. */
  syncStatus(status: { state?: string } | undefined) {
    const expired = status?.state === "signin" && !this.user.isGuest;
    if (expired === this.expired) return;
    this.expired = expired;
    if (expired) this.overlay = "signin";
    this.emit();
  }
  /** The sign-in dialog, over the page; `next`, the page to open once signed in (else this one). */
  askSignIn(next = "") {
    this.signInNext = next;
    this.overlay = "signin";
    this.emit();
  }
  /** The account's new username (the settings, the introduction). Throws the server's message. */
  async rename(name: string) {
    const user = await call("setUsername", name.trim());
    this.user = { ...this.user, ...user };
    this.emit();
  }
  /** Signs in with Google's credential (`google`) or a username on a dev server (`devLogin`), the account created the
   * first time; this device's times join it. Throws the API's message. */
  async authenticate(method: "google" | "devLogin", value: string) {
    await this.opened(await call(method, value));
  }
  /** Back from the WCA's sign-in (lib/wcaAuth.ts): signed in with it, or the WCA ID it vouches for put on the profile,
   * whose page opens. */
  async finishWca(back: WcaReturn) {
    try {
      const v = await call("wcaFinish", back);
      if (v.token) return await this.opened(v);
      this.user = v.user;
      const profile = journeyProfile(this.journey);
      if (!v.wcaId) return void toast(tr("Your WCA account has no WCA ID yet: it comes with a first competition."));
      if (profile) await this.updateJourney({ [PROFILE_KEY]: { ...profile, wcaId: v.wcaId } });
      go(wcaUrl("persons/" + v.wcaId));
    } catch (e) {
      this.fail(e);
    }
  }
  /** An account opened on this device: the guest's state left behind. */
  private async opened(v: { user: any }) {
    this.user = v.user;
    this.journey = {};
    this.introducedAccount = "";
    this.introductionReady = false;
    this.expired = false;
    this.localData = false;
    this.sessions.clear();
    this.overlay = "";
    this.profileMode = "overview";
    this.emit();
    await this.refresh();
  }
  loadContext() {
    const p = this.puzzle;
    this.catalogStage = this.prefs["cubix.algs.stageByCube"]?.[p] ?? "";
    this.collapsed = new Set(
      Object.keys(this.prefs["cubix.algs.collapsedGroups"] ?? {}),
    );
    const mode = this.prefs["cubix.practice.modeByPuzzle"]?.[p] ?? "standard";
    this.solveMode = eventOf(p as PuzzleId, mode) ? mode : "standard";
    this.scrambleType = normalizeScrambleType(
      this.prefs["cubix.practice.typeByPuzzle"]?.[p] ??
      "normal");
    // Fewest Moves and Multi-Blind keep to WCA scrambles, whatever the puzzle's other events use.
    if (!scrambleTypesOf(p as PuzzleId, this.solveMode).includes(this.scrambleType as never)) this.scrambleType = "normal";
    this.dailyOn = false;
    this.selected = new Set(
      this.prefs["cubix.training.selectionByCube"]?.[p] ?? [],
    );
    this.sets = this.prefs["cubix.algs.setByCube"]?.[p] ?? {
      F2L: "f2l",
      OLL: "oll",
      PLL: "pll",
    };
    this.scramble =
      this.prefs["cubix.playground.scrambleByContext"]?.[
        `${p}:${this.solveMode}:${this.scrambleType}`
      ] ?? "";
  }
  /** What a snapshot asks the engine for, but the figures held and the request's number. */
  snapshotQuery() {
    return {
      context: this.context(),
      caseId: this.caseDialog || this.caseId,
      page: this.practicePage(),
      // Only this session's solves: the engine sends no others, and only those added to the ones held (`known.solves`).
      session: this.sessions.get(this.contextKey()) ?? null,
      profilePuzzle: this.profilePuzzle,
      profileFilter: {
        solveMode: this.profileSolveMode,
        scrambleType: this.profileScramble,
      },
      advance: false,
      profileAhead: this.profileAhead,
      caseSource: this.caseSource,
      // The training's recommendations read the smart cube solves too.
      analysis: (this.page === "profile" && this.profileMode === "analysis") || (this.page === "training" && this.trainingStep === "setup" && this.puzzle === "333"),
      selected: [...this.practiceSelected],
      randomAuf: this.randomAuf,
    };
  }
  /** The snapshot asked for and not answered yet, and the one asked for once it is (for every caller meanwhile). */
  private loading: { query: string; done: Promise<void> } | null = null;
  private queued: Promise<void> | null = null;
  /**
   * Reads the data shown again. One snapshot at a time: calls meanwhile share one more, asked once it is answered.
   * The one under way is dropped if it asks for something else than now (another account, page, puzzle, case…).
   */
  refresh(): Promise<void> {
    const query = this.snapshotQuery(),
      key = JSON.stringify([this.user.id, query]);
    if (!this.loading) {
      const loading = { query: key, done: this.load(query) };
      this.loading = loading;
      void loading.done.then(() => {
        if (this.loading === loading) this.loading = null;
      });
      return loading.done;
    }
    if (this.loading.query !== key) this.request++;
    return (this.queued ??= this.loading.done.then(() => {
      this.queued = null;
      return this.refresh();
    }));
  }
  private async load(query: ReturnType<Store["snapshotQuery"]>): Promise<void> {
    const request = ++this.request,
      key = this.contextKey();
    try {
      const v = await call("snapshot", {
        ...query,
        revision: request,
        // Figures held already are not sent again while unchanged.
        known: this.known,
      });
      if (request !== this.request) return;
      this.sessionList = v.sessions ?? [];
      // The timer opens on the session it showed last, if it resumes (named, or used today), else on the account's
      // latest of today (another device's or app's): read again with it.
      if (query.page === "playground" && this.page === "playground" && this.sessions.get(key) === undefined && !this.resumed.has(this.user.id + key)) {
        this.resumed.add(this.user.id + key);
        const last = resumedSession(this.sessionList, this.prefs["cubix.timer.session"]?.[this.user.id + key]);
        if (last) {
          this.sessions.set(key, last!.id!);
          return this.load(this.snapshotQuery());
        }
      }
      // The session's solves, oldest first: all of them, the ones added to those held, or none when unchanged.
      const solves = v.solves ?? (v.solvesAdded?.length ? [...this.solves, ...v.solvesAdded] : this.solves);
      this.solves = query.session === (this.sessions.get(key) ?? null) ? solves : [];
      if (this.solves === solves && v.tokens?.solves) this.known.solves = v.tokens.solves;
      else delete this.known.solves;
      this.stats = v.stats;
      this.prefs["cubix.duels"] = v.duels;
      this.learned = new Set(v.learned);
      this.learnedAlgs = v.learnedAlgs ?? {};
      this.learningGroupOrder = v.learningGroupOrder ?? {};
      this.journey = v.journey ?? {};
      this.checkIntroduction();
      // Drawn once, below.
      await this.refreshLearning(true);
      if (v.profile) this.profile = v.profile;
      if (v.achievements) this.achievements = v.achievements;
      if (v.progress) {
        const { xp, unlocked, total, earned } = v.progress as { xp: number; unlocked: number; total: number; earned: [string, string, number][] };
        // A gain of the same account only: signing in to another one is no gain.
        if (this.xp !== null && this.xpOwner === String(this.user.id) && xp > this.xp)
          this.xpGain = { from: this.xp, to: xp, at: Date.now(), because: earned.filter(([id]) => !this.earned.has(id)).map(([, title, gained]) => [title, gained]) };
        this.earned = new Set(earned.map(([id]) => id));
        this.xp = xp;
        this.unlocked = { count: unlocked, total };
        this.xpOwner = String(this.user.id);
        this.remind(v.progress.streak);
      }
      if (v.caseHistory) this.caseHistory = v.caseHistory;
      this.smartAnalysis = v.analysis ?? (this.page === "profile" || this.page === "training" ? this.smartAnalysis : null);
      this.known = {
        // Kept from an earlier snapshot when this one did not read them (another page than the profile).
        ...(this.profile && (v.tokens?.profile ?? this.known.profile) ? { profile: v.tokens?.profile ?? this.known.profile } : {}),
        ...(this.achievements && (v.tokens?.achievements ?? this.known.achievements) ? { achievements: v.tokens?.achievements ?? this.known.achievements } : {}),
        ...(this.caseHistory && v.tokens?.caseHistory ? { caseHistory: v.tokens.caseHistory } : {}),
        ...(this.known.solves ? { solves: this.known.solves } : {}),
      };
      this.emit();
    } catch (e) {
      this.fail(e);
    }
  }
  /**
   * The next scramble of each context (puzzle, solve mode, scramble type), drawn ahead and kept on the device: a new
   * one shows at once, even while the app starts. Read again from the device at each use, a tab never takes one
   * another tab took.
   */
  private ahead(change?: (scrambles: Record<string, string>) => void): Record<string, string> {
    let scrambles: Record<string, string> = {};
    try { scrambles = JSON.parse(localStorage.getItem(AHEAD) ?? "{}") ?? {}; } catch {}
    if (change) {
      change(scrambles);
      try { localStorage.setItem(AHEAD, JSON.stringify(scrambles)); } catch {}
    }
    return scrambles;
  }
  private drawing = new Set<string>();
  drawAhead(context: { puzzle: string; solveMode: string; scrambleType: string }) {
    const key = `${context.puzzle}:${context.solveMode}:${context.scrambleType}`;
    if (this.ahead()[key] || this.drawing.has(key)) return;
    this.drawing.add(key);
    void call("scramble", context).then((v: string) => void this.ahead((a) => void (a[key] ??= v)), () => {}).finally(() => this.drawing.delete(key));
  }
  /** Every event's scramble, every scramble type of the puzzle in use, and the step training's (its step's alone). */
  drawAllAhead() {
    for (const e of EVENTS) if (e.solveMode !== "multi-blind") this.drawAhead({ puzzle: e.puzzle, solveMode: e.solveMode, scrambleType: "normal" });
    if (this.solveMode === "multi-blind") return;
    const counts = CROSS_MOVES[this.crossTarget],
      cross = this.puzzle === "333" ? (counts.length ? counts : [0]).map((n) => crossScrambleType(this.crossTarget, n)) : [];
    for (const type of scrambleTypesOf(this.puzzle as PuzzleId, this.solveMode)) this.drawAhead({ puzzle: this.puzzle, solveMode: this.solveMode, scrambleType: type });
    for (const type of cross) this.drawAhead({ puzzle: this.puzzle, solveMode: crossSolveMode(this.solveMode), scrambleType: type });
  }
  async nextScramble() {
    const revision = ++this.revision,
      context = { ...this.context(), scrambleType: this.scrambleType },
      daily = this.dailyEvent(),
      day = dailyDay();
    if (this.crossTraining) context.scrambleType = this.context().scrambleType;
    const key = `${context.puzzle}:${context.solveMode}:${context.scrambleType}`,
      // A Multi-Blind attempt: a 3×3 blindfolded scramble for each of its cubes, numbered.
      multi = !daily && context.solveMode === "multi-blind";
    let ready: string | undefined;
    if (!daily && !multi) this.ahead((a) => void ((ready = a[key]), delete a[key]));
    if (ready === undefined) {
      this.generating = true;
      this.emit();
    }
    try {
      const value = multi
        ? numberedScrambles(await Promise.all(Array.from({ length: this.mbldCubes }, () => call("scramble", context) as Promise<string>)))
        : ready ?? (await (daily ? call("dailyScramble", day, daily) : call("scramble", context)));
      if (!daily && !multi) this.drawAhead(context);
      if (revision !== this.revision) return;
      this.scramble = value;
      this.dailyShown = daily ? { day, event: daily } : null;
      if (!daily) this.pref("cubix.playground.scrambleByContext", {
        ...this.prefs["cubix.playground.scrambleByContext"],
        [`${context.puzzle}:${context.solveMode}:${context.scrambleType}`]: value,
      });
      this.generating = false;
      this.revealed = false;
      this.replay++;
      this.emit();
      this.prefetchCrossSolutions();
    } catch (e) {
      if (revision === this.revision) this.fail(e);
    }
  }
  /** Cross solutions are worked out as soon as a scramble is shown, so revealing them is instant. */
  prefetchCrossSolutions() {
    if (this.crossTraining && this.scramble && hasSolutions(this.crossTarget)) void this.loadCrossSolutions();
  }
  async nextCase(direction = "next") {
    // A recognition run draws another of its cases once one is done, until it is closed.
    const run = this.recognition;
    if (direction === "next" && this.trainingKind === "recognition" && run && !run.closed && this.training?.id === run.current) {
      run.done++;
      run.current = nextRecognition(run.ids, run.current);
      run.turn = recognitionTurn();
    }
    const puzzle = this.puzzle,
      selected = [...this.practiceSelected];
    const value = await call(
      "training",
      direction,
      puzzle,
      selected,
      this.randomAuf,
      this.solveMode,
    );
    if (puzzle !== this.puzzle || selected.join() !== [...this.practiceSelected].join())
      return;
    this.training = value;
    this.revealed = false;
    this.replay++;
    this.emit();
  }
  async loadCrossSolutions() {
    const scramble = this.scramble;
    if (!scramble || this.crossSolutions?.scramble === scramble) return;
    this.crossSolutions = { scramble, list: null };
    this.emit();
    try {
      const list = await call("crossSolutions", scramble, this.crossTarget);
      if (this.crossSolutions?.scramble !== scramble) return;
      this.crossSolutions = { scramble, list };
      this.emit();
    } catch (e) {
      this.crossSolutions = null;
      this.fail(e);
    }
  }
  announce(message: string) {
    this.notice = message;
    setTimeout(() => {
      if (this.notice === message) {
        this.notice = "";
        this.emit();
      }
    }, 5000);
  }
  /**
   * `penalty`: given with the time, as a smart cube solve stopped before the cube is solved. `solution`: the turns
   * made, when a smart cube recorded them. `memo`: blindfolded, when the memorisation ended. `splits`: timed in
   * phases, when each phase ended.
   */
  async save(ms: number, penalty?: "none" | "+2" | "dnf", solution?: string | null, memo?: number, judged = false, result?: Pick<AddSolveBody, "moves" | "cubesSolved" | "cubesAttempted" | "splits">) {
    if (this.saving || this.generating || this.pendingSolve) return;
    const round = this.compRound();
    // A round's attempt waits for its judge before it is saved, whatever the time entry; a DNF has nothing to sign.
    if (round && !judged && penalty !== "dnf") {
      round.pending = { ms, penalty: penalty ?? "none", solution, memo };
      this.emit();
      return;
    }
    if (!round && this.page === "playground" && this.entry === "casual") {
      this.lastSolve = 0;
      await this.nextScramble();
      return;
    }
    // A Multi-Blind attempt waits for the cubes solved (`saveMultiBlind`).
    if (!result && this.solveMode === "multi-blind" && this.practicePage() === "playground") {
      this.mbldPending = { ms, cubes: scrambleList(this.scramble).length };
      this.emit();
      return;
    }
    const page = this.practicePage();
    this.pendingSolve = {
      key: this.contextKey(),
      page,
      selected: page === "training" ? [...this.practiceSelected] : [],
      daily: this.dailyEvent() && this.dailyShown?.event === this.dailyEvent() && this.scramble ? { ...this.dailyShown, solution } : null,
      body: {
        ...this.context(),
        timeMs: Math.round(ms),
        ...(penalty && penalty !== "none" ? { penalty } : {}),
        ...(solution ? { solution } : {}),
        ...(memo !== undefined ? { memoMs: Math.round(memo) } : {}),
        ...result,
        scramble: page === "training" ? this.training?.setup : this.scramble,
        caseId: page === "training" ? this.training?.id : null,
      },
    };
    await this.savePending();
  }
  async savePending() {
    const pending = this.pendingSolve;
    if (!pending || this.saving) return;
    this.saving = true;
    this.emit();
    try {
      const sessionId = await this.sessions.ensure(pending.key, () => call(
        "createSession", pending.page, pending.selected, pending.body.puzzle, pending.body,
      ));
      if (pending.page === "playground") this.keepSession(pending.key, sessionId);
      const solve = await call("addSolve", { ...pending.body, sessionId });
      this.pendingSolve = null;
      this.lastSolve = solve.id;
      if (pending.daily) void this.dailyAttempt(pending.daily, solve.id, pending.body.timeMs, pending.body.penalty ?? "none");
      if (solve.record) this.announce(solve.record);
      // The next scramble or case is drawn while the figures are read again, not after.
      const next = this.contextKey() !== pending.key ? null : pending.page === "training" ? this.nextCase() : this.nextScramble();
      await Promise.all([this.refresh(), next]);
    } catch (e) {
      this.fail(e);
    } finally {
      this.saving = false;
      this.emit();
    }
  }
  /** Saves the Multi-Blind attempt waiting with its cubes solved (`null`: given up, nothing saved); DNF as the WCA ranks it. */
  async saveMultiBlind(solved: number | null) {
    const pending = this.mbldPending;
    if (!pending) return;
    this.mbldPending = null;
    this.timerEpoch++;
    if (solved === null) return void this.emit();
    const penalty = mbldValue(solved, pending.cubes, pending.ms) === null ? "dnf" : "none";
    await this.save(pending.ms, penalty, null, undefined, true, { cubesSolved: solved, cubesAttempted: pending.cubes });
  }
  /** The competition simulation, while the timer shows its event and its session. */
  compRound() {
    const round = this.compSim;
    return round && this.practicePage() === "playground" && !this.crossTraining && round.event === this.event().id && this.sessions.get(this.contextKey()) === round.session ? round : null;
  }
  /** Starts a round of the event: random scrambles, a session of its own, the record of the event's earlier solves. */
  async startCompSim() {
    if (attemptMode(this.solveMode)) return;
    if (this.scrambleType !== "normal" || this.dailyEvent()) await this.action("scrambleType:normal");
    const event = this.event().id, format = roundFormat(event),
      previous = this.compRound() ? this.compSim!.previous : this.sessions.get(this.contextKey()),
      earlier: SolveDto[] = await call("solves", "playground", Infinity, this.puzzle, this.context());
    await this.useSession("new", tr(compSimName()));
    this.compSim = {
      event, format, previous, pending: null, session: this.sessions.get(this.contextKey())!,
      record: roundRecord(format, [...earlier].reverse().map((v) => effective(v.time_ms, v.penalty))),
    };
    this.timerEpoch++;
    await this.nextScramble();
  }
  /** Leaves the round, asked first until it is over: its attempts stay in its session, the timer goes back to the one before. */
  async endCompSim(over: boolean) {
    const round = this.compRound();
    if (round && !over && !(await ask({ title: tr("Leave the round?"), text: tr("Its attempts stay in its session."), action: tr("Leave"), destructive: false }))) return;
    this.compSim = null;
    // The round's PB notice stays with it.
    this.notice = "";
    this.timerEpoch++;
    if (round) await this.useSession(round.previous ?? "new");
  }
  /** The judge signs the attempt waiting: as timed (with its inspection's penalty), +2 or DNF. */
  async judge(penalty: Penalty) {
    const round = this.compRound(), pending = round?.pending;
    if (!pending) return;
    round.pending = null;
    await this.save(pending.ms, penalty, pending.solution, pending.memo, true);
  }
  /** The timer's current session, or none before its first solve. */
  currentSession() {
    const id = this.sessions.get(this.contextKey());
    return this.sessionList.find((x) => x.id === id);
  }
  /** Remembers the timer's session of a context, to resume it on the next launch. */
  private keepSession(key: string, id: number) {
    if (this.prefs["cubix.timer.session"]?.[this.user.id + key] !== id)
      this.pref("cubix.timer.session", { ...this.prefs["cubix.timer.session"], [this.user.id + key]: id });
  }
  /** Starts a new session of the timer (named `name`, if given), or goes back to session `id`. */
  async useSession(id: number | "new", name?: string) {
    const key = this.contextKey();
    if (id === "new") id = (await call("createSession", "playground", [], this.puzzle, this.context(), name)).id as number;
    this.sessions.set(key, id);
    this.keepSession(key, id);
    this.lastSolve = 0;
    await this.refresh();
  }
  /** Names the timer's session; one not started yet starts with the name. Blank gives back its day and event. */
  async renameSession(name: string) {
    const session = this.currentSession();
    if (!session?.id) {
      if (name.trim()) await this.useSession("new", name);
      return;
    }
    if ((session.name ?? "") === name.trim()) return;
    await call("renameSession", session.id, name);
    await this.refresh();
  }
  async retry() {
    this.error = "";
    this.emit();
    if (!this.ready) return this.init();
    if (this.pendingSolve) await this.savePending();
    try {
      await call("sync");
      await this.refresh();
    } catch (e) {
      this.fail(e);
    }
    this.emit();
  }
  location() {
    return {
      page: this.page,
      caseId: this.caseId,
      profileMode: this.profileMode,
      learnMethod: this.learnMethod,
    };
  }
  /** Applies a URL supplied by React Router; this never changes browser history. */
  /** Makes `puzzle` the active puzzle, with its own selection and scrambles. */
  usePuzzle(puzzle: PuzzleId) {
    if (puzzle === this.puzzle) return;
    this.puzzle = puzzle;
    this.pref("cubix.puzzle", puzzle);
    this.loadContext();
  }
  applyRoute(route: AppRoute) {
    if (route.page === "onboarding" || route.page === "login") return;
    const { page } = route;
    // A case's address names its puzzle: the list beside it opens on its step and its set.
    const shown = page === "algorithms" ? this.find(route.caseId) : undefined, puzzle = shown ? puzzleOf(shown) : route.puzzle;
    if (puzzle && puzzle !== this.puzzle) this.usePuzzle(puzzle);
    const caseId = shown ? route.caseId : "";
    if (shown) {
      this.catalogStage = shown.stage;
      if (this.sets[shown.stage] !== shown.set) this.sets = { ...this.sets, [shown.stage]: shown.set };
    }
    const method = methodOf(this.puzzle as PuzzleId, route.learnMethod) ? route.learnMethod : "";
    this.coachingView = route.coaching ?? "";
    this.view = route.view ?? "";
    if (page === "profile" && this.page !== "profile") {
      this.profilePuzzle = this.puzzle; this.profileSolveMode = this.solveMode; this.profileScramble = this.scrambleType;
    }
    if (caseId !== this.caseId) {
      this.caseHistory = null;
      delete this.known.caseHistory;
    }
    this.page = page; this.caseId = caseId; this.caseDialog = ""; this.assisted = false; this.profileMode = route.profileMode;
    this.trainingStep = route.trainingStep; this.learnMethod = method;
    if (method && route.learnStep !== undefined) this.saveCourse(goToStep(this.course, this.puzzle as PuzzleId, method, route.learnStep));
    if (method) this.learnPick = method;
    this.learnFinished = false;
    if (this.overlay !== "tour" && this.overlay !== "signin") this.overlay = "";
    this.timerEpoch++; this.showTimes = timesOpenAtStart(page);
    void this.syncScramble(); void this.refresh(); this.emit();
  }
  /** The timer and the cross training each keep their own scramble: show the one of the current context. */
  async syncScramble() {
    if (this.practicePage() !== "playground") return;
    if (this.dailyEvent()) return this.nextScramble();
    const { puzzle, solveMode, scrambleType } = this.context(),
      stored = this.prefs["cubix.playground.scrambleByContext"]?.[`${puzzle}:${solveMode}:${scrambleType}`];
    if (stored === this.scramble && stored && !this.otherCubes(stored)) return this.prefetchCrossSolutions();
    this.revision++;
    this.generating = false;
    this.scramble = stored && !this.otherCubes(stored) ? stored : "";
    this.revealed = false;
    this.replay++;
    this.emit();
    if (!this.scramble) await this.nextScramble();
    else this.prefetchCrossSolutions();
    // This puzzle's other scramble types, ahead (before the app is ready, `init` does it once the first is shown).
    if (this.ready) this.drawAllAhead();
  }
  /** A Multi-Blind attempt's scrambles kept for another count of cubes than the one chosen now. */
  private otherCubes = (scramble: string) => this.solveMode === "multi-blind" && scrambleList(scramble).length !== this.mbldCubes;
  /** A solve of the timer session or of a profile history, shaped like a timer solve. */
  findSolve(id: number) {
    const row = [
      ...(this.profile?.playground?.history ?? []),
      ...(this.caseHistory?.history ?? []),
    ].find((v: any) => v.id === id);
    return (
      this.solves.find((v) => v.id === id) ??
      (row ? { ...row, time_ms: row.timeMs } : this.overlaySolve)
    );
  }
  async action(action: string) {
    if (this.running || this.saving) return;
    this.error = "";
    const ix = action.indexOf(":"),
      kind = ix < 0 ? action : action.slice(0, ix),
      arg = ix < 0 ? "" : action.slice(ix + 1);
    try {
      switch (kind) {
        case "onboarding":
          goPage("onboarding");
          break;
        case "tour":
          this.overlay = kind;
          break;
        case "nav":
          // The analysis is a section of the profile.
          if (arg === "analysis") goPage("profile", { profileMode: "analysis", puzzle: this.puzzle as PuzzleId });
          // A guest is asked to sign in over the page in view, for a page of an account.
          else if (this.user.isGuest && ACCOUNT_PAGES.includes(arg)) {
            this.signInNext = pageUrl(arg, { puzzle: this.puzzle as PuzzleId });
            this.overlay = "signin";
          }
          else goPage(arg, { puzzle: this.puzzle as PuzzleId });
          break;
        case "case":
        case "caseDialog":
        case "profileCase":
          // A case opens in its dialog over the page; on the algorithms page it has its address (closed: the catalogue's).
          this.caseView = kind === "profileCase" ? "statistics" : "algorithms";
          // A case found by the search replaces it.
          if (this.overlay === "search") this.overlay = "";
          if (this.page === "algorithms" && !this.caseDialog) {
            goPage("algorithms", { caseId: arg, puzzle: this.puzzle as PuzzleId }, !arg);
            break;
          }
          // The statistics shown are the case's own: none until they arrive.
          if (arg !== this.caseDialog) {
            this.caseHistory = null;
            delete this.known.caseHistory;
          }
          this.caseDialog = arg;
          await this.refresh();
          break;
        case "back":
        case "historyBack":
          go(-1);
          break;
        case "historyForward":
          go(1);
          break;
        case "trainingSetup":
          goPage("training", { puzzle: this.puzzle as PuzzleId });
          this.timerEpoch++;
          break;
        case "trainingStart": {
          if (this.learningFrozen || this.pendingSolve) break;
          this.trainingKind = arg === "cross" && this.puzzle === "333" ? "cross" : arg === "recognition" || arg === "review" || arg === "free" ? arg : "cases";
          this.pref("cubix.training.kind", this.trainingKind);
          if (this.trainingKind === "recognition") {
            const ids = recognitionCases(this.cases(), this.learned, this.recognitionSet);
            this.recognition = { set: this.recognitionSet, ids, current: nextRecognition(ids, undefined), turn: recognitionTurn(), done: 0, closed: false };
            this.training = null;
          }
          // The recommended cases picked stay those of this start, whatever is recommended later.
          if (this.trainingKind === "cases") this.per("cubix.training.picksByCube", this.trainPicks);
          goPage("training", { trainingStep: "practice", puzzle: this.puzzle as PuzzleId });
          this.timerEpoch++;
          this.emit();
          if (this.trainingKind === "cross") await this.syncScramble();
          else await this.nextCase();
          await this.refresh();
          break;
        }
        case "trainingMode":
          if (TRAINING_MODES.includes(arg as TrainingMode)) this.pref("cubix.training.mode", arg);
          break;
        case "recognitionClose":
          if (this.recognition) this.recognition.closed = true;
          break;
        case "recognitionSet":
          this.per("cubix.training.recognitionByCube", arg);
          break;
        case "recognitionSeconds":
          this.pref("cubix.training.recognitionSeconds", Number(arg));
          break;
        case "recognitionBack":
          this.pref("cubix.training.recognitionBack", !this.recognitionBack);
          break;
        case "trainSet":
          this.per("cubix.training.setsByCube", [...toggleSelection(new Set(this.trainSets), [arg])]);
          await this.refreshLearning(true);
          break;
        case "trainPick":
          this.per("cubix.training.picksByCube", [...toggleSelection(new Set(this.trainPicks), [arg])]);
          await this.refreshLearning(true);
          break;
        case "crossTarget":
        case "crossMoves": {
          const target = kind === "crossTarget" ? arg : this.crossTarget,
            moves = kind === "crossTarget" ? crossMovesFor(target as CrossTarget, this.crossMoves) : Number(arg);
          if (!isCrossTarget(target) || crossMovesFor(target, moves) !== moves || (target === this.crossTarget && moves === this.crossMoves)) break;
          this.crossTarget = target;
          this.crossMoves = moves;
          this.pref("cubix.training.crossTarget", target);
          this.pref("cubix.training.crossMoves", moves);
          this.timerEpoch++;
          if (this.crossTraining) {
            await this.syncScramble();
            await this.refresh();
          }
          break;
        }
        case "learn": {
          const learned = !this.learned.has(arg);
          this.learned = new Set(this.learned);
          learned ? this.learned.add(arg) : this.learned.delete(arg);
          await call("setLearned", arg, learned);
          await this.refresh();
          break;
        }
        case "learnAlg": {
          // `<case>:<index>`: that algorithm learned or not; the case is learned while one of them is.
          const sep = arg.lastIndexOf(":"),
            id = arg.slice(0, sep),
            alg = this.find(id)?.algorithms[Number(arg.slice(sep + 1))]?.alg;
          if (!alg) break;
          const had = this.learned.has(id) ? (this.learnedAlgs[id] ?? []) : [],
            algs = had.includes(alg) ? had.filter((a) => a !== alg) : [...had, alg],
            learned = algs.length > 0;
          this.learned = new Set(this.learned);
          learned ? this.learned.add(id) : this.learned.delete(id);
          this.learnedAlgs = { ...this.learnedAlgs, [id]: algs };
          await call("setLearned", id, learned, algs);
          await this.refresh();
          break;
        }
        case "set":
          this.sets = {
            ...this.sets,
            [catalog.sets.find((s: any) => s.id === arg).stage]: arg,
          };
          this.per("cubix.algs.setByCube", this.sets);
          // The algorithms page lists every set: choosing one shows its step too.
          this.catalogStage = catalog.sets.find((s: any) => s.id === arg).stage;
          this.per("cubix.algs.stageByCube", this.catalogStage);
          break;
        // The algorithms page by method: its steps' sets on the left (algorithms.tsx), the chosen set one of them.
        case "algsMethod": {
          this.per("cubix.algs.methodByCube", arg);
          const sets = methodSets(this.puzzle as PuzzleId, arg);
          if (sets.length && !sets.includes(this.sets[this.catalogStage] ?? "")) void this.action("set:" + sets[0]);
          break;
        }
        case "collapse":
          this.collapsed.has(arg)
            ? this.collapsed.delete(arg)
            : this.collapsed.add(arg);
          this.pref(
            "cubix.algs.collapsedGroups",
            Object.fromEntries([...this.collapsed].map((k) => [k, true])),
          );
          break;
        case "learningFilter":
          this.learningFilter = this.learningFilter === arg ? "all" : arg;
          this.pref("cubix.algs.learningFilter", this.learningFilter);
          break;
        case "select":
        case "selectSet":
        case "selectGroup":
        case "clear":
        case "trainCases":
        case "train": {
          // Cases picked elsewhere, by their ids: the analysis of the smart cube solves, whose cases are 3×3 ones.
          const picked = kind === "trainCases" ? arg.split(",") : null,
            train = kind === "train" || !!picked,
            // The setup's picker of free practice picks among every case, into a selection of its own.
            free = !train && this.page === "training" && this.trainingMode === "free";
          // The smart cube analysis picks 3×3 cases whatever the puzzle shown; the algorithms page picks its own.
          if (picked && !this.cases().some((c: any) => c.id === picked[0])) this.usePuzzle("333");
          // Training cases from elsewhere drills those alone (their learned ones).
          if (train) {
            this.per("cubix.training.setsByCube", []);
            this.per("cubix.training.picksByCube", []);
          }
          const ids = picked
            ? picked.filter((id) => this.find(id))
            : kind === "select"
              ? [arg]
              : kind === "train" && !arg
                ? [this.caseDialog || this.caseId]
                : this.cases()
                    .filter((c: any) =>
                      kind === "selectSet" || (kind === "train" && !arg.includes(":"))
                        ? c.set === arg
                        : `${c.set}:${c.group}` === arg,
                    )
                    // The training's picker lists learned cases only (but for free practice): a whole set or group is its learned ones.
                    .filter((c: any) => train || free || this.learned.has(c.id))
                    .map((c: any) => c.id);
          const chosen = kind === "clear" ? new Set<string>() : train ? new Set(ids) : toggleSelection(free ? new Set(this.freePicks) : this.selected, ids);
          if (free) this.per("cubix.training.freeByCube", [...chosen]);
          else {
            this.selected = chosen;
            this.per("cubix.training.selectionByCube", [...this.selected]);
          }
          if (train) {
            this.caseDialog = "";
            // Training a group or a case from the catalogue skips the setup screen.
            this.trainingKind = "cases";
            this.pref("cubix.training.kind", "cases");
            goPage("training", { trainingStep: "practice", puzzle: this.puzzle as PuzzleId });
          }
          if (train) await this.nextCase();
          else await this.refreshLearning(true);
          break;
        }
        case "next":
          if (this.page === "learn") {
            if (this.learning) this.learnStep(this.learning.entry.step + 1);
            break;
          }
          // A round's scramble is never skipped.
          if (this.compRound()) break;
          this.timerEpoch++;
          if (this.practicePage() === "training") await this.nextCase();
          else await this.nextScramble();
          break;
        case "previous":
          if (this.page === "learn") {
            if (this.learning) this.learnStep(this.learning.entry.step - 1);
            break;
          }
          this.timerEpoch++;
          await this.nextCase("previous");
          break;
        case "replayCube":
          this.replay++;
          break;
        case "devices":
          this.overlay = this.overlay === "devices" ? "" : "devices";
          break;
        case "smartCube":
          // A Bluetooth cube (bluetooth/cubes.ts), or the virtual cube of development (`smartCube:virtual`).
          if (smartCube.snapshot.status !== "off") smartCube.disconnect();
          else if (arg === "virtual" && typeof CUBIX_DEV !== "undefined" && CUBIX_DEV) void smartCube.connect((await import("./dev/virtualSmartCube")).virtualSmartCube);
          else void smartCube.connect(bluetoothCube(webBluetooth, smartCube.askMac));
          break;
        case "smartTimer":
          if (smartTimer.snapshot.link !== "off") smartTimer.disconnect();
          else void smartTimer.connect(webBluetooth);
          break;
        case "solution":
          // A case's solution is its dialog (every algorithm, the 3D player, the times); the cross's is shown in place.
          if (this.page === "training" && !this.crossTraining) {
            if (this.training?.id) await this.action("caseDialog:" + this.training.id);
            break;
          }
          this.revealed = !this.revealed;
          if (this.revealed && this.crossTraining && hasSolutions(this.crossTarget)) void this.loadCrossSolutions();
          break;
        case "reminders":
          this.pref(REMINDERS_KEY, arg === "on");
          break;
        case "leftHand":
          this.pref("cubix.algs.leftHand", !this.leftHand);
          break;
        case "auf":
          this.randomAuf = !this.randomAuf;
          this.pref("cubix.training.randomAuf", this.randomAuf);
          break;
        case "times":
          if (timesAlwaysShown(innerWidth, this.practicePage() === "training")) {
            this.timesHidden = !this.timesHidden;
            this.pref("cubix.practice.timesHidden", this.timesHidden);
          } else this.showTimes = !this.showTimes;
          break;
        case "figures": {
          // figures:add:<id>, figures:set:<index>:<id>, figures:order:<id>,<id>…, figures:remove:<id>, figures:reset
          const [verb, id = ""] = arg.split(/:(.*)/);
          if (verb === "reset") this.figures = DEFAULT_FIGURES;
          else if (verb === "order") {
            const order = id.split(",");
            // Only the same figures, in another order.
            if (order.length === this.figures.length && [...order].sort().join() === [...this.figures].sort().join()) this.figures = order;
          } else if (verb === "set") {
            const [at, figure = ""] = id.split(/:(.*)/), index = Number(at);
            if (parseFigure(figure) && this.figures[index] !== undefined && !this.figures.some((f, i) => f === figure && i !== index))
              this.figures = this.figures.map((f, i) => (i === index ? figure : f));
          }
          else if (verb === "remove") this.figures = this.figures.filter((f) => f !== id);
          else if (verb === "add" && parseFigure(id) && !this.figures.includes(id) && this.figures.length < FIGURE_LIMIT) this.figures = [...this.figures, id];
          this.pref("cubix.practice.figures", this.figures);
          break;
        }
        case "cube":
          this.showCube = !this.showCube;
          this.pref("cubix.practice.showCube", this.showCube);
          break;
        case "menu":
          this.overlay = this.overlay === arg ? "" : arg;
          break;
        case "puzzle": {
          const event = eventInfo(arg);
          if (!event) break;
          // The step and set the algorithms show, kept on the new puzzle when it has them (OLL stays OLL).
          const stage = this.catalogStage, shown = this.allSets().find((v: any) => v.stage === stage && v.id === this.sets[stage]) ?? this.allSets().find((v: any) => v.stage === stage);
          this.puzzle = event.puzzle;
          this.pref("cubix.puzzle", event.puzzle);
          this.per("cubix.practice.modeByPuzzle", event.solveMode);
          this.loadContext();
          this.overlay = "";
          if (shown && this.allSets().some((v: any) => v.stage === shown.stage)) {
            const same = this.allSets().find((v: any) => v.stage === shown.stage && v.label === shown.label);
            if (same) this.per("cubix.algs.setByCube", (this.sets = { ...this.sets, [shown.stage]: same.id }));
            this.per("cubix.algs.stageByCube", (this.catalogStage = shown.stage));
          }
          if (this.page === "profile") {
            this.profilePuzzle = event.puzzle; this.profileSolveMode = event.solveMode;
            if (!this.info(event.puzzle).scrambles.includes(this.profileScramble)) this.profileScramble = this.info(event.puzzle).scrambles[0];
          }
          // The page stays, on the same view of the new puzzle: a case's list, the course of the same method (else
          // the courses), the training's setup, the profile's page.
          const here = readRoute(window.location.pathname, window.location.search);
          if (here && here.page !== "onboarding" && here.page !== "login")
            goPage(here.page, { ...here, puzzle: event.puzzle, caseId: "", trainingStep: "setup", learnStep: undefined, learnMethod: methodOf(event.puzzle, here.learnMethod, event.solveMode) ? here.learnMethod : "" }, true);
          this.learnPick = "";
          this.timerEpoch++;
          await this.nextCase();
          if (this.crossTraining) await this.syncScramble();
          else if (!this.scramble) await this.nextScramble();
          // A search follows the puzzle: it starts again on the new event.
          if (duel.status === "searching") void duel.search(this.event().id);
          await this.refresh();
          break;
        }
        case "duel":
          await duel.action(arg);
          break;
        case "daily": {
          // The timer on the daily scramble of `arg` (an event, from the Challenges), or on and off from its button.
          // Once the day's ranked attempt is made, its standing instead.
          if ((!arg || arg === "off") && this.dailyEvent()) {
            this.dailyOn = false;
            await this.nextScramble();
            break;
          }
          const event = arg || this.event().id, day = dailyDay();
          if (!isDailyEvent(event)) break;
          let done = this.dailyDone[`${day}:${event}`];
          if (!done && this.signedIn) {
            // Made on another device: the API knows.
            const mine = await fetchDaily(location.origin, await call("apiToken"), event, day).then((b) => b.mine, () => null);
            if (mine) this.saveDailyDone({ ...this.dailyDone, [`${day}:${event}`]: (done = { solveId: 0, timeMs: mine.timeMs, penalty: mine.penalty, verified: mine.verified, sent: true }) });
          }
          if (done) {
            this.dailyResult = { day, event, timeMs: done.timeMs, penalty: done.penalty, ranked: true, board: null };
            this.overlay = "daily";
            this.emit();
            await this.dailyShow();
            break;
          }
          if (event !== this.event().id) await this.action("puzzle:" + event);
          if (this.page !== "playground") goPage("playground", { puzzle: this.puzzle as PuzzleId });
          this.dailyOn = true;
          await this.nextScramble();
          break;
        }
        case "scrambleType":
          this.timerEpoch++;
          this.dailyOn = arg === "daily";
          if (!this.dailyOn) {
            this.scrambleType = arg;
            this.per("cubix.practice.typeByPuzzle", arg);
          }
          this.overlay = "";
          await this.nextScramble();
          await this.refresh();
          break;
        case "metronome":
          this.metronome = metronomeBpm(Number(arg));
          this.pref("cubix.timer.metronome", this.metronome);
          break;
        case "mbldCubes":
          this.mbldCubes = mbldCubes(Number(arg));
          this.pref("cubix.timer.mbldCubes", this.mbldCubes);
          this.timerEpoch++;
          await this.nextScramble();
          break;
        case "mbld":
          await this.saveMultiBlind(arg === "cancel" ? null : Number(arg));
          break;
        case "inspection":
          this.inspection = arg as Inspection;
          this.timerEpoch++;
          this.pref("cubix.timer.inspection", arg);
          break;
        case "stackmat":
          if (stackmat.snapshot.link !== "off") stackmat.disconnect();
          else
            void stackmat.connect().then(() => {
              if (stackmat.snapshot.error) toast.error(tr("The audio input could not be opened: {0}", { 0: stackmat.snapshot.error }));
            });
          break;
        case "phases":
          this.phases = arg;
          this.timerEpoch++;
          this.pref("cubix.timer.phases", arg);
          break;
        case "entry":
          this.entry = arg;
          this.timerEpoch++;
          this.pref("cubix.timer.entry", arg);
          this.overlay = "";
          break;
        case "theme":
          this.themeName = arg;
          this.pref("cubix.ui.theme", arg);
          break;
        case "light":
          this.colorMode = arg === "light" || arg === "system" ? arg : "dark";
          this.light = this.colorMode === "system" ? systemLight() : this.colorMode === "light";
          this.pref("cubix.ui.colorMode", this.colorMode);
          break;
        case "settings":
          this.overlay = this.overlay === "settings" ? "" : "settings";
          break;
        // Times from another timer, or from a Qbix export.
        case "importTimes":
          this.overlay = "importTimes";
          break;
        // The account's data as a file to keep, which Import reads back (timerImport.ts); or only the solves, as a
        // table for a spreadsheet.
        case "exportData":
        case "exportSolves": {
          const { body, type, name } = exportFile(kind === "exportSolves" ? "csv" : "json", await call("exportData"), this.user.username);
          download(body, type, name);
          break;
        }
        // The account was deleted (Settings): this device goes back to a guest, as after signing out, the sign-in dialog open;
        // `guest`, from the dialog of an ended session, signs out to the page in view.
        case "accountDeleted":
        case "logout":
        case "guest":
          // A page of an account would ask a guest for one again: leave it first.
          if (kind === "guest" && ACCOUNT_PAGES.includes(this.page)) go("/timer", true);
          if (kind !== "accountDeleted") await call("logout");
          this.user = { isGuest: true, username: msg("Guest") };
          this.expired = false;
          this.overlay = "";
          this.sessions.clear();
          this.profileMode = "overview";
          if (kind !== "guest") go("/login", true);
          await this.refresh();
          break;
        case "profilePuzzle": {
          const event = eventInfo(arg);
          if (!event) break;
          this.profilePuzzle = event.puzzle;
          this.profileSolveMode = event.solveMode;
          if (!this.info(event.puzzle).scrambles.includes(this.profileScramble))
            this.profileScramble = this.info(event.puzzle).scrambles[0];
          this.overlay = "";
          await this.refresh();
          break;
        }
        case "profileScramble":
          this.profileScramble = arg;
          this.overlay = "";
          await this.refresh();
          break;
        case "profileMode":
          goPage("profile", { profileMode: arg, puzzle: this.puzzle as PuzzleId });
          break;
        case "profileStage":
          this.profileStage = arg;
          break;
        case "achievementGroup":
          this.achievementGroup = arg;
          this.overlay = "";
          break;
        case "achievementFilter":
          this.achievementFilter = arg;
          break;
        case "statsView":
          this.statsView = arg;
          this.pref("cubix.profile.statsView", arg);
          break;
        case "statsBy":
          this.statsBy = arg;
          this.pref("cubix.profile.statsBy", arg);
          break;
        // A competition simulation: started, left ("end", asked first; "done" once over), or an attempt judged.
        case "compSim":
          if (!arg) await this.startCompSim();
          else if (arg === "end" || arg === "done") await this.endCompSim(arg === "done");
          else await this.judge(arg as Penalty);
          break;
        // The timer's sessions: a new one, or back to an earlier one.
        case "session":
          await this.useSession(arg === "new" ? "new" : Number(arg));
          break;
        // A training the analysis of the smart cube solves suggests: on the 3×3, whatever the puzzle shown.
        case "smartTrain":
          this.usePuzzle("333");
          await this.action(arg);
          return;
        case "caseSource":
          if (!isCaseSource(arg) || arg === this.caseSource) break;
          this.caseSource = arg;
          this.pref("cubix.algs.caseSource", arg);
          // Another source's history: the one held is not it.
          this.caseHistory = null;
          this.known = {};
          await this.refresh();
          break;
        case "caseStep": {
          const current = this.caseDialog || this.caseId,
            c = this.find(current),
            ids = this.setCases(c.set).map((v: any) => v.id),
            next =
              ids[ids.indexOf(current) + (arg === "previous" ? -1 : 1)];
          if (next && this.caseDialog) await this.action("caseDialog:" + next);
          else if (next) {
            goPage("algorithms", { caseId: next, puzzle: this.puzzle as PuzzleId }, true);
          }
          break;
        }
        case "selectorToggle": {
          const count = this.setCases(arg).filter((c: any) => this.selected.has(c.id)).length;
          this.selectorOpen[arg] = !(
            this.selectorOpen[arg] ??
            (count > 0 || !!this.query)
          );
          break;
        }
        case "stage":
          this.catalogStage = arg;
          this.per("cubix.algs.stageByCube", arg);
          break;
        case "penalty": {
          const [id, penalty] = arg.split(":");
          const solve = this.findSolve(Number(id));
          await call(
            "setPenalty",
            Number(id),
            solve?.penalty === penalty ? "none" : penalty,
          );
          this.dailyPenalty(Number(id), solve?.penalty === penalty ? "none" : penalty);
          this.overlay = "";
          await this.refresh();
          break;
        }
        case "delete":
          if (!(await ask({ title: tr("Delete this solve?"), text: tr("It goes from your times and your statistics, on every device."), action: tr("Delete") }))) break;
          await call("deleteSolve", Number(arg));
          this.overlay = "";
          await this.refresh();
          break;
        case "undo":
          if (this.solves.length && (await ask({ title: tr("Delete your last solve?"), text: tr("It goes from your times and your statistics, on every device."), action: tr("Delete") }))) {
            await call("deleteSolve", this.solves.at(-1).id);
            await this.refresh();
          }
          break;
        case "share": {
          if (this.user.isGuest) {
            this.askSignIn();
            break;
          }
          const url = sharedSolveUrl(location.origin, await call("shareSolve", Number(arg)));
          if (isPhone(innerWidth) && navigator.share) await navigator.share({ url }).catch((e) => {
            if (e.name !== "AbortError") throw e;
          });
          else {
            await navigator.clipboard.writeText(url);
            toast.success(tr("Link copied"), { description: url });
          }
          break;
        }
        // The comment is written in the solve's dialog, its field open and focused.
        case "comment":
        case "solve":
          this.commenting = kind === "comment";
          this.overlaySolve =
            this.solves.find((s) => s.id === Number(arg)) ??
            (
              await call(
                "solves",
                this.caseId ? "training" : "playground",
                10000,
                this.profilePuzzle,
                {
                  solveMode: this.profileSolveMode,
                  scrambleType: this.caseId ? "case" : this.profileScramble,
                },
              )
            ).find((v: any) => v.id === Number(arg)) ??
            // A smart cube solve opened from a case it went through, or from its analysis.
            (await call("solveById", Number(arg)));
          this.overlay = "solve";
          break;
        case "close":
          this.overlay = "";
          break;
        case "learnPick":
          this.learnPick = arg;
          break;
        case "learnMethod": {
          if (!methodOf(this.puzzle as PuzzleId, arg)) break;
          this.saveCourse(openCourse(this.course, this.puzzle as PuzzleId, arg));
          goPage("learn", { learnMethod: arg, puzzle: this.puzzle as PuzzleId });
          break;
        }
        case "learnMethods":
          goPage("learn", { puzzle: this.puzzle as PuzzleId });
          break;
        case "learnFrom": {
          const [puzzle, method] = arg.split(":");
          if (!isPuzzle(puzzle) || !methodOf(puzzle, method)) break;
          this.saveCourse(openCourse(this.course, puzzle, method!));
          goPage("learn", { puzzle, learnMethod: method });
          break;
        }
        case "learnStep":
          this.learnStep(Number(arg));
          break;
        case "assisted":
          this.assisted = arg !== "off";
          break;
        case "learnFinish": {
          const course = this.learning;
          if (!course) break;
          await this.unlockPuzzle(course.method.id);
          this.learnFinished = true;
          break;
        }
        case "courseAlg": {
          // An inline algorithm of the course learned, or an intuitive step mastered (by `stepId`); `learnAlg` is a catalogue case's.
          const course = this.learning;
          if (course) this.saveCourse(toggleAlgLearned(this.course, course.puzzle, course.method.id, arg));
          break;
        }
        case "learnSet": {
          const course = this.learning;
          if (course) this.learnSets = { ...this.learnSets, [`${course.puzzle}:${course.method.id}:${course.entry.step}`]: arg };
          break;
        }
        case "algView": {
          const view = this.algView;
          if (!view) break;
          const index = Math.max(0, Math.min(view.items.length - 1, view.index + (arg === "previous" ? -1 : 1)));
          this.algView = { ...view, index, choice: 0 };
          break;
        }
        case "algChoice":
          if (this.algView) this.algView = { ...this.algView, choice: Number(arg) || 0 };
          break;
        case "notation":
          this.notationPuzzle = isPuzzle(this.puzzle) ? this.puzzle : "333";
          this.notationMove = "R";
          this.overlay = "notation";
          break;
        case "notationPuzzle":
          if (isPuzzle(arg)) this.notationPuzzle = arg;
          this.notationMove = "R";
          break;
        case "notationMove":
          this.notationMove = arg;
          break;
        case "methods":
          this.guidePuzzle = isPuzzle(this.puzzle) ? this.puzzle : "333";
          this.guideMethod = "";
          this.overlay = "methods";
          break;
        case "guidePuzzle":
          if (isPuzzle(arg)) this.guidePuzzle = arg;
          this.guideMethod = "";
          break;
        case "guideMethod":
          this.guideMethod = arg;
          break;
        case "help":
          if (this.page === "learn") this.guidePuzzle = isPuzzle(this.puzzle) ? this.puzzle : "333";
          if (this.page === "learn") this.guideMethod = this.learnMethod || this.learnPick || (recommendedMethod(this.guidePuzzle) ?? "");
          this.guidePage =
            this.page === "learn" ? "methodsGuide" : this.page === "training" ? "trainingGuide" : this.page === "duel" ? "duelGuide" : this.page === "coaching" ? "coachingGuide" : ["community", "tournaments", "match"].includes(this.page) ? "communityGuide" : this.page === "algorithms" ? "algorithmsGuide" : this.page === "playground" || this.page === "daily" ? "timerGuide" : "overviewGuide";
          this.overlay = "guides";
          break;
        case "guidePage":
          this.guidePage = arg;
          if (arg === "methodsGuide") this.guidePuzzle = isPuzzle(this.puzzle) ? this.puzzle : "333";
          if (arg === "notationGuide") this.notationPuzzle = isPuzzle(this.puzzle) ? this.puzzle : "333";
          document.querySelector(".guides-body")?.scrollTo({ top: 0 });
          break;
        case "search":
          this.overlay = "search";
          break;
        case "url":
          await openExternal(arg);
          break;
      }
      this.emit();
    } catch (e) {
      this.fail(e);
    }
  }
  /** The timer's band on the desktop: the figures the player chose. */
  figuresShown(): Metric[] {
    const mode = this.context().solveMode;
    return sessionFigures(this.solves, shownFigures(mode, this.figures), mode);
  }
  /** Session figures under the timer: label, value and the tone it is drawn in; a training keeps three. */
  metrics(): Metric[] {
    const all = sessionMetrics(this.solves, this.context().solveMode);
    if (this.practicePage() === "training") return all.filter(([label]) => [msg("Best"), msg("Mean"), "Ao5", "Ao12"].includes(label));
    return all;
  }
  /** The scramble types the timer offers for the puzzle (cross training has its own page; cross1 is kept for history). */
  scrambleOptions = () => scrambleTypesOf(this.puzzle as PuzzleId, this.solveMode).filter((id: string) => !id.startsWith("cross1-") && !crossTrainingType(id)).map((id: string) => ({ id, label: this.label("scrambles", id) }));
  /** The scramble menu's choice (the daily scramble has its own button). */
  scrambleChoice = () => this.scrambleType;
  /** The event whose daily scramble the timer shows, if it shows one. */
  dailyEvent = () => {
    const id = this.event().id;
    return this.dailyOn && this.page === "playground" && isDailyEvent(id) ? id : null;
  };
  /**
   * The ranked attempts of this device, by day and event: the first solve of a daily scramble, sent once online
   * (`sent`). Later attempts are placed among the others, not ranked.
   */
  get dailyDone(): Record<string, { solveId: number; timeMs: number; penalty: string; verified?: boolean; solution?: string; sent: boolean }> {
    return this.prefs["cubix.daily.done"] ?? {};
  }
  private saveDailyDone(done: Store["dailyDone"]) {
    // Only today's and yesterday's matter: the API ranks no older attempt.
    const oldest = dailyDay(Date.now() - 86_400_000);
    this.pref("cubix.daily.done", Object.fromEntries(Object.entries(done).filter(([key]) => key >= oldest)));
  }
  /**
   * A solve of the daily scramble: the day's ranked attempt if it is the first, then the field in its dialog. One a day:
   * the timer leaves the daily scramble. `solution`: a connected cube's turns, which make it verified.
   */
  async dailyAttempt({ day, event, solution }: { day: string; event: string; solution?: string | null }, solveId: number, timeMs: number, penalty: string) {
    const key = `${day}:${event}`, done = this.dailyDone, ranked = !done[key];
    if (ranked) this.saveDailyDone({ ...done, [key]: { solveId, timeMs, penalty, verified: !!solution, ...(solution ? { solution } : {}), sent: false } });
    this.dailyOn = false;
    this.dailyResult = { day, event, timeMs, penalty, ranked, fresh: ranked, board: null };
    this.overlay = "daily";
    this.emit();
    await this.dailyShow();
  }
  /** A penalty given to the ranked attempt afterwards goes to the API too. */
  dailyPenalty(solveId: number, penalty: string) {
    const entry = Object.entries(this.dailyDone).find(([, v]) => v.solveId === solveId);
    if (!entry) return;
    this.saveDailyDone({ ...this.dailyDone, [entry[0]]: { ...entry[1], penalty, sent: false } });
    const result = this.dailyResult;
    if (result?.ranked && `${result.day}:${result.event}` === entry[0]) {
      this.dailyResult = { ...result, penalty };
      void this.dailyShow();
    } else void this.dailyFlush();
  }
  /** Sends the ranked attempts not sent yet (made offline, or whose penalty changed). */
  async dailyFlush() {
    const token = this.signedIn ? await call("apiToken") : null;
    if (!token) return;
    for (const [key, v] of Object.entries(this.dailyDone)) {
      if (v.sent) continue;
      const [day, event] = key.split(":") as [string, string];
      try {
        await fetchDaily(location.origin, token, event, day, { timeMs: v.timeMs, penalty: v.penalty, ...(v.solution ? { solution: v.solution } : {}) }, true);
      } catch (e) {
        // Offline: sent next time. Refused (a time too fast, a day gone): not sent again.
        if (!(e instanceof DailyError)) continue;
      }
      this.saveDailyDone({ ...this.dailyDone, [key]: { ...v, sent: true } });
    }
  }
  /** The daily fields show only verified results (made on a connected cube). */
  get dailyVerified(): boolean {
    return !!this.prefs["cubix.daily.verified"];
  }
  setDailyVerified(on: boolean) {
    this.pref("cubix.daily.verified", on);
    void this.dailyShow();
  }
  /**
   * Cancels the dialog's ranked attempt (a false start, a stop missed): its solve goes and the daily scramble is back on
   * the timer. The API allows it once a day, within two minutes of the solve.
   */
  async dailyCancel() {
    const result = this.dailyResult;
    if (!result?.ranked) return;
    const key = `${result.day}:${result.event}`, entry = this.dailyDone[key];
    if (!(await ask({ title: tr("Cancel this time?"), text: tr("Your ranked attempt goes, and you may solve the daily scramble again. Once a day, within two minutes of the solve."), action: tr("Cancel"), cancel: tr("Keep it") }))) return;
    try {
      if (this.signedIn) {
        await this.dailyFlush();
        await cancelDaily(location.origin, await call("apiToken"), result.event, result.day);
      }
    } catch (e) {
      this.dailyResult = { ...result, fresh: false, error: e instanceof DailyError ? e.message : msg("Offline: your time is kept, the ranking comes once you are online.") };
      this.emit();
      return;
    }
    const { [key]: _, ...rest } = this.dailyDone;
    this.saveDailyDone(rest);
    if (entry?.solveId) await call("deleteSolve", entry.solveId).catch(() => {});
    this.overlay = "";
    this.dailyResult = null;
    await this.refresh();
    await this.action("daily:" + result.event);
  }
  /** The field of the dialog's attempt, once the ranked attempts are sent. */
  async dailyShow() {
    const result = this.dailyResult;
    if (!result) return;
    const same = () => this.dailyResult?.day === result.day && this.dailyResult.event === result.event && this.dailyResult.timeMs === result.timeMs;
    await this.dailyFlush();
    try {
      const board = await fetchDaily(location.origin, this.signedIn ? await call("apiToken") : null, result.event, result.day, { timeMs: result.timeMs, penalty: this.dailyResult!.penalty }, false, this.dailyVerified);
      if (same()) this.dailyResult = { ...this.dailyResult!, board, error: undefined };
    } catch (e) {
      if (same()) this.dailyResult = { ...this.dailyResult!, error: e instanceof DailyError ? e.message : msg("Offline: your time is kept, the ranking comes once you are online.") };
    }
    this.emit();
  }
}
export const store = new Store();
// The system's look, followed as it changes while the theme says "System".
if (typeof matchMedia === "function")
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
    if (store.colorMode !== "system") return;
    store.light = e.matches;
    store.emit();
  });

/**
 * A click handler running store actions one after the other. The element pressed loses the focus: Space starts the
 * timer and must not press it again.
 */
export const run = (...actions: string[]) => (e: { currentTarget: HTMLElement }) => {
  e.currentTarget.blur();
  void (async () => {
    for (const action of actions) await store.action(action);
  })();
};
