import {appearanceFromStorage} from "../appearance";
import { DEFAULT_THEME } from "../../src/client/lib/theme";
import { orderedGroups, reviewCases, reviewStatus, reviewTrack, isReviewMode, learningTrackOf, learningModeForPuzzle, dailyAssignment, EMPTY_LEARNING_PLAN, isLearningTrack, learningCases, learningKey, learningStatus, localDay, type LearningPlan } from "../../src/client/lib/dailyLearning";
import { LaunchSessions } from "../../src/client/lib/launchSessions";
import { toggleSelection } from "../../src/client/lib/practiceCatalog";
import { sessionMetrics, type Metric } from "../../src/client/lib/practiceSummary";
import { isPhone } from "../../src/client/lib/viewport";
import { call, openExternal } from "./bridge";
import catalogData from "../assets/catalog.json";
import { eventInfo, eventLabel, eventOf, isPuzzle, normalizeScrambleType, puzzleOf, type PuzzleId, type SolveMode } from "../../src/shared/puzzles";
import { CROSS_PLUS_ONE_MOVES } from "../../src/shared/crossPlusOne";
import { completeStep, completeStepsBefore, courseEntry, courseStorageKey, finishCourse, goToStep, methodOf, openCourse, readCourseProgress, recommendedMethod, toggleAlgLearned, toggleStepDone, type CourseProgress } from "../../src/client/lib/course";
import { duel } from "./duelClient";
import type { CubeMask } from "../../src/shared/cubeAppearance";
import { LOCKED_PAGES, PROFILE_KEY, journeyProfile, puzzleLocked, withKnownPuzzle, type Journey } from "../../src/client/lib/journey";
import { go, goPage, readRoute, type AppRoute } from "./navigation";
export const catalog = catalogData as any;
/** An algorithm the 3D player can show: its name, its ways to play it (the first one first), and the cube it is on. */
export interface PlayItem { key: string; name: string; detail?: string; context?: string; algs: string[]; note?: string; size: number; mask: CubeMask; setup?: string }
export const matches = (c: any, q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .every((word) =>
      [c.id, c.name, c.setLabel, c.stage, c.group, c.subgroup]
        .join(" ")
        .toLowerCase()
        .includes(word),
    );
const PAGE_ORDER = ["playground", "algorithms", "training", "duel", "learn", "coaching", "profile"];
/** From this width a training opens with its times shown, and Escape no longer folds them away. */
export const TIMES_OPEN_WIDTH = 1024;
const timesOpenAtStart = (page: string) => page === "training" && innerWidth >= TIMES_OPEN_WIDTH;
/** Whether a window this wide keeps the session's times beside the stage, with no button to fold them away. */
export const timesAlwaysShown = (width: number, training: boolean) => !isPhone(width) && width >= (training ? 1200 : 980);
/** Tabs slide toward their position in the bar; opening a case or a guide pushes forward. */
function slideDirection(
  from: { page: string; caseId: string },
  to: { page: string; caseId: string },
): 1 | -1 {
  if (from.page === to.page) return to.caseId && !from.caseId ? 1 : !to.caseId && from.caseId ? -1 : 1;
  const a = PAGE_ORDER.indexOf(from.page), b = PAGE_ORDER.indexOf(to.page);
  if (b < 0) return 1;
  if (a < 0) return -1;
  return b > a ? 1 : -1;
}
export class Store {
  listeners = new Set<() => void>();
  version = 0;
  ready = false;
  prefs: Record<string, any> = {};
  learningGroupOrder: NonNullable<LearningPlan["groupOrder"]> = {};
  page = "playground";
  caseId = "";
  puzzle = "333";
  solveMode = "standard";
  scrambleType = "normal";
  entry = "timer";
  themeName: string = DEFAULT_THEME;
  light = false;
  user: any = { isGuest: true, username: "Guest" };
  learned = new Set<string>();
  journey: Journey = {};
  /** Where the player was before picking a puzzle they cannot solve yet, for "Not now". */
  lockedFrom: { event: string; page: string } | undefined;
  /** The section a locked button leads to once the tutorial is skipped. */
  skipTarget = "";
  private quietPuzzle = false;
  private introducedAccount = "";
  introductionReady = false;
  selected = new Set<string>();
  reviewIds: string[] = [];
  sets: Record<string, string> = {};
  collapsed = new Set<string>();
  selectorOpen: Record<string, boolean> = {};
  scramble = "";
  training: any = null;
  solves: any[] = [];
  profile: any = null;
  achievements: any = null;
  caseHistory: any = null;
  stats: any[] = [];
  error = "";
  saving = false;
  pendingSolve: any = null;
  scrollPositions = new Map<string, number>();
  generating = false;
  showTimes = false;
  revealed = false;
  randomAuf = true;
  showCube = true;
  /** The account's session ended on the server (401): the login page asks to sign in again. */
  expired = false;
  /** Times or learned cases of this device outside any account: signing in or creating an account keeps them. */
  localData = false;
  overlay = "";
  overlaySolve: any = null;
  search = "";
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
  sessions = new LaunchSessions();
  lastSolve = 0;
  notice = "";
  replay = 0;
  timerEpoch = 0;
  running = false;
  learningFrozen = false;
  /** Slide direction of the next page transition: 1 pushes in from the right (or below), -1 from the left (or above). */
  direction = 1;
  /**
   * Axis of the next transition on the desktop: pages of the rail slide vertically, going deeper into a page
   * (a profile section, training started from its setup, a case) slides sideways.
   */
  axis: "x" | "y" = "y";
  revision = 0;
  request = 0;
  goal = new Set<string>();
  /** Training opens on the choice of what to practise, then shows the timer for it. */
  trainingStep: "setup" | "practice" = "setup";
  /** Cases of the catalogue, or first-block scrambles (cross and one pair) on the 3×3. */
  trainingKind: "cases" | "cross1" = "cases";
  crossMoves = 4;
  /** Optimal cross + 1 solutions of the shown scramble, computed by the engine when revealed. */
  crossSolutions: { scramble: string; list: { moves: string; slot: string }[] | null } | null = null;
  /** Mode highlighted on the training setup screen, before it starts. */
  setupMode = "";
  /** The method whose course the Learn page shows; empty, the list of methods or the choice above it. */
  learnMethod = "";
  /** Without a method: "methods" for their list (/learn/methods), empty for the choice between methods and algorithms. */
  learnSection = "";
  /** The coaching view and its argument, as in /coaching/<view>/<id>. */
  coachingView = "";
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
    this.version++;
    this.listeners.forEach((fn) => fn());
  };
  /** First-block training: timer solves on scrambles whose cross and one pair take `crossMoves` turns. */
  get crossTraining() {
    return this.page === "training" && this.trainingKind === "cross1" && this.puzzle === "333";
  }
  /** Where solves are recorded: cross+1 scrambles are timer solves of their own scramble type. */
  practicePage = () => (this.crossTraining ? "playground" : this.page);
  context = () => ({
    puzzle: this.puzzle,
    solveMode: this.solveMode,
    scrambleType: this.crossTraining
      ? `cross1-${this.crossMoves}`
      : this.page === "training" ? "case" : this.scrambleType,
  });
  contextKey = () =>
    `${this.page}:${this.puzzle}:${this.solveMode}:${this.context().scrambleType}`;
  cases = (p = this.puzzle) =>
    catalog.cases.filter((c: any) => puzzleOf(c) === p);
  allSets = (p = this.puzzle) =>
    catalog.sets.filter((c: any) => puzzleOf(c) === p);
  find = (id: string) => catalog.cases.find((c: any) => c.id === id);
  info = (p = this.puzzle) =>
    catalog.puzzles.puzzles.find((v: any) => v.id === p);
  label = (kind: string, id: string) =>
    catalog.puzzles[kind]?.find((v: any) => v.id === id)?.label ?? id;
  /** The WCA event of a puzzle and solve mode: what the puzzle pickers list, with its glyph. */
  event = (p = this.puzzle, mode = this.solveMode) => ({
    id: eventOf(p as PuzzleId, mode as SolveMode)?.id ?? p,
    label: eventLabel(p as PuzzleId, mode as SolveMode),
  });
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
  /** The current puzzle cannot be solved yet: only Learn (and the account) are open on it. */
  get locked() {
    return puzzleLocked(journeyProfile(this.journey), this.puzzle as PuzzleId);
  }
  /** Whether `page` waits for the course of `puzzle` (the current one by default). */
  lockedPage(page: string, puzzle = this.puzzle as PuzzleId) {
    return puzzleLocked(journeyProfile(this.journey), puzzle) && (LOCKED_PAGES as readonly string[]).includes(page);
  }
  /** The current puzzle can be solved from now on: after its course, or with the tutorial skipped. */
  async unlockPuzzle(method?: string) {
    const profile = journeyProfile(this.journey);
    if (profile && this.locked) await this.updateJourney({ [PROFILE_KEY]: withKnownPuzzle(profile, this.puzzle as PuzzleId, method) });
  }
  /** Shows a step of the course, the page back at its top. */
  learnStep(index: number) {
    const course = this.learning;
    this.learnFinished = false;
    if (!course) return;
    this.direction = index < course.entry.step ? -1 : 1;
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
    this.overlay = "";
    this.emit();
  };
  fail = (e: any) => {
    this.error = e.message ?? String(e);
    this.saving = false;
    this.generating = false;
    this.emit();
  };
  get learningPlan(): LearningPlan { return { ...(this.prefs[learningKey(this.user.id ?? "guest")] ?? EMPTY_LEARNING_PLAN), groupOrder: this.learningGroupOrder }; }
  get learningMode() { return learningModeForPuzzle(this.learningPlan.mode, this.puzzle); }
  get learningGroups() { const mode = this.learningMode; return isLearningTrack(mode) ? orderedGroups(learningCases(catalog.cases, mode), this.learningPlan.groupOrder?.[mode]) : []; }
  async reorderLearningGroups(groups: string[]) {
    const mode = this.learningMode;
    if (this.running || this.learningFrozen || this.saving || this.pendingSolve || !isLearningTrack(mode)) return;
    const order = orderedGroups(learningCases(catalog.cases, mode), groups);
    const previousOrder = this.learningGroups;
    if (order.every((group, index) => group === previousOrder[index])) return;
    await call("setLearningGroupOrder", mode, order);
    this.learningGroupOrder = { ...this.learningGroupOrder, [mode]: order };
    const plan = this.learningPlan;
    // An explicit priority change also updates today's case; ordinary refreshes keep it pinned.
    const assignment = dailyAssignment(undefined, learningCases(catalog.cases, mode, order), this.learned, localDay()) ?? plan.tracks[mode];
    this.pref(learningKey(this.user.id ?? "guest"), { ...plan, groupOrder: { ...plan.groupOrder, [mode]: order }, tracks: { ...plan.tracks, [mode]: assignment } });
    await this.refreshLearning();
  }
  /** Learned cases of the track being learned or reviewed, the pool of "Train learned". */
  get trackLearnedCount() { const track = learningTrackOf(this.learningMode); return track ? learningCases(catalog.cases, track).filter(c => this.learned.has(c.id)).length : 0; }
  get daily() { const mode = this.learningMode; return isLearningTrack(mode) ? this.learningPlan.tracks[mode] : undefined; }
  get practiceSelected(): Set<string> { return this.learningMode === "practice" ? this.selected : new Set(isReviewMode(this.learningMode) ? this.reviewIds : this.daily ? [this.daily.caseId] : []); }
  get dailyStatus() { if (isReviewMode(this.learningMode)) return reviewStatus(this.learningMode, this.reviewIds.length); return isLearningTrack(this.learningMode) ? learningStatus(learningCases(catalog.cases, this.learningMode), this.learned) : ""; }
  reconcileLearning() {
    const mode = this.learningMode;
    if (this.learningFrozen || this.pendingSolve) return;
    this.reviewIds = reviewCases(catalog.cases, this.learned, this.puzzle, reviewTrack(mode)).map(c => c.id);
    if (!isLearningTrack(mode)) return;
    const plan = this.learningPlan;
    const assignment = dailyAssignment(plan.tracks[mode], learningCases(catalog.cases, mode, plan.groupOrder?.[mode]), this.learned, localDay());
    if (assignment !== plan.tracks[mode]) this.pref(learningKey(this.user.id ?? "guest"), { ...plan, tracks: { ...plan.tracks, [mode]: assignment } });
  }
  async refreshLearning() {
    if (this.learningFrozen || this.saving || this.pendingSolve) return;
    this.reconcileLearning();
    if (this.learningMode !== "practice" && !this.practiceSelected.has(this.training?.id) && (this.training || this.practiceSelected.size)) { this.timerEpoch++; await this.nextCase(); }
    this.emit();
  }
  async init() {
    try {
      const v = await call("init");
      if (v.protocol !== 2) throw Error("Incompatible data engine");
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
      this.light = appearance.light;
      this.puzzle = this.prefs["cubix.puzzle"] ?? "333";
      this.randomAuf = this.prefs["cubix.training.randomAuf"] ?? true;
      this.showCube = this.prefs["cubix.practice.showCube"] ?? true;
      this.entry = this.prefs["cubix.timer.entry"] ?? "timer";
      this.learningFilter = this.prefs["cubix.algs.learningFilter"] ?? "all";
      this.statsView = this.prefs["cubix.profile.statsView"] ?? "chart";
      this.trainingKind = this.prefs["cubix.training.kind"] === "cross1" ? "cross1" : "cases";
      this.crossMoves = CROSS_PLUS_ONE_MOVES.includes(this.prefs["cubix.training.crossMoves"]) ? this.prefs["cubix.training.crossMoves"] : 4;
      this.learned = new Set(v.learned);
      this.learningGroupOrder = v.learningGroupOrder ?? {};
      this.loadContext();
      const route = readRoute(window.location.pathname, window.location.search);
      if (route && route.page !== "onboarding") this.applyRoute(route);
      this.ready = true;
      this.emit();
      await this.refresh();
      await Promise.all([
        this.scramble ? Promise.resolve() : this.nextScramble(),
        this.nextCase(),
      ]);
      this.prefetchCrossSolutions();
    } catch (e) {
      this.fail(e);
    }
  }
  /** Only an account uses the app; a guest (or an expired session) gets the login page. */
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
    this.emit();
  }
  /** Signs in or creates the account; this device's times join it. Throws the API's message. */
  async authenticate(mode: "login" | "register", username: string, password: string) {
    const v = await call(mode, username, password);
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
    this.goal = new Set(
      [...this.selected].filter((id) => !this.learned.has(id)),
    );
  }
  async refresh() {
    const request = ++this.request,
      context = this.context(),
      key = this.contextKey();
    try {
      const v = await call("snapshot", {
        revision: request,
        context,
        caseId: this.caseId,
        page: this.practicePage(),
        profilePuzzle: this.profilePuzzle,
        profileFilter: {
          solveMode: this.profileSolveMode,
          scrambleType: this.profileScramble,
        },
        advance: false,
        selected: [...this.practiceSelected],
        randomAuf: this.randomAuf,
      });
      if (request !== this.request) return;
      this.solves = v.solves
        .filter((s: any) => s.session_id === this.sessions.get(key))
        .reverse();
      this.stats = v.stats;
      this.prefs["cubix.duels"] = v.duels;
      this.learned = new Set(v.learned);
      this.learningGroupOrder = v.learningGroupOrder ?? {};
      this.journey = v.journey ?? {};
      this.checkIntroduction();
      await this.refreshLearning();
      if (v.profile) this.profile = v.profile;
      if (v.achievements) this.achievements = v.achievements;
      if (v.caseHistory) this.caseHistory = v.caseHistory;
      if (
        this.goal.size &&
        [...this.goal].every((id) => this.learned.has(id))
      ) {
        this.announce("Well done! Every selected case is learned.");
        this.goal.clear();
      }
      this.emit();
    } catch (e) {
      this.fail(e);
    }
  }
  async nextScramble() {
    const revision = ++this.revision,
      context = { ...this.context(), scrambleType: this.scrambleType };
    if (this.crossTraining) context.scrambleType = this.context().scrambleType;
    this.generating = true;
    this.emit();
    try {
      const value = await call("scramble", context);
      if (revision !== this.revision) return;
      this.scramble = value;
      this.pref("cubix.playground.scrambleByContext", {
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
  /** Cross + 1 solutions are worked out as soon as a scramble is shown, so revealing them is instant. */
  prefetchCrossSolutions() {
    if (this.crossTraining && this.scramble) void this.loadCrossSolutions();
  }
  async nextCase(direction = "next") {
    this.reconcileLearning();
    const puzzle = this.puzzle,
      mode = this.learningMode,
      selected = [...this.practiceSelected];
    const value = await call(
      "training",
      direction,
      puzzle,
      selected,
      this.randomAuf,
      this.solveMode,
    );
    if (puzzle !== this.puzzle || mode !== this.learningMode || selected.join() !== [...this.practiceSelected].join())
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
      const list = await call("crossSolutions", scramble);
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
  async save(ms: number) {
    if (this.saving || this.generating || this.pendingSolve) return;
    if (this.page === "playground" && this.entry === "casual") {
      this.lastSolve = 0;
      await this.nextScramble();
      return;
    }
    const page = this.practicePage();
    this.pendingSolve = {
      key: this.contextKey(),
      page,
      selected: page === "training" ? [...this.practiceSelected] : [],
      body: {
        ...this.context(),
        timeMs: Math.round(ms),
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
      const solve = await call("addSolve", { ...pending.body, sessionId });
      this.pendingSolve = null;
      this.lastSolve = solve.id;
      if (solve.record) this.announce(solve.record);
      await this.refresh();
      if (this.contextKey() === pending.key) {
        if (pending.page === "training") await this.nextCase();
        else await this.nextScramble();
      }
    } catch (e) {
      this.fail(e);
    } finally {
      this.saving = false;
      this.emit();
    }
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
  applyRoute(route: AppRoute) {
    if (route.page === "onboarding") return;
    const { page } = route;
    if (route.puzzle && route.puzzle !== this.puzzle) { this.puzzle = route.puzzle; this.pref("cubix.puzzle", this.puzzle); this.loadContext(); }
    const caseId = route.caseId && this.find(route.caseId) ? route.caseId : "";
    const method = methodOf(this.puzzle as PuzzleId, route.learnMethod) ? route.learnMethod : "";
    this.axis = page === this.page ? "x" : "y";
    this.direction = slideDirection(this.location(), { page, caseId });
    const section = !method && route.learnMethod === "methods" ? "methods" : "";
    // Learn goes deeper from the choice to the methods, then to a course; within a course, with its steps.
    const depth = (m: string, sec: string) => (m ? 2 : sec ? 1 : 0);
    if (page === this.page && page === "learn")
      this.direction = method && method === this.learnMethod && route.learnStep !== undefined ? Math.sign(route.learnStep - (this.learning?.entry.step ?? 0)) || 1 : Math.sign(depth(method, section) - depth(this.learnMethod, this.learnSection)) || 1;
    if (page === this.page && page === "profile") this.direction = route.profileMode === "overview" ? -1 : 1;
    // Deeper into coaching (a coach, a call) pushes forward; back to a list comes back.
    if (page === this.page && page === "coaching") this.direction = (route.coaching ?? "").split("/").length >= this.coachingView.split("/").length ? 1 : -1;
    this.coachingView = route.coaching ?? "";
    if (page === "profile" && this.page !== "profile") {
      this.profilePuzzle = this.puzzle; this.profileSolveMode = this.solveMode; this.profileScramble = this.scrambleType;
    }
    this.page = page; this.caseId = caseId; this.profileMode = route.profileMode;
    this.trainingStep = route.trainingStep; this.learnMethod = method; this.learnSection = section;
    if (method && route.learnStep !== undefined) this.saveCourse(goToStep(this.course, this.puzzle as PuzzleId, method, route.learnStep));
    if (method) this.learnPick = method;
    this.learnFinished = false;
    if (this.overlay !== "tour" && this.overlay !== "learnPuzzle") this.overlay = "";
    this.timerEpoch++; this.showTimes = timesOpenAtStart(page);
    void this.syncScramble(); void this.refresh(); this.emit();
  }
  /** The timer and the cross+1 training each keep their own scramble: show the one of the current context. */
  async syncScramble() {
    if (this.practicePage() !== "playground") return;
    const { puzzle, solveMode, scrambleType } = this.context(),
      stored = this.prefs["cubix.playground.scrambleByContext"]?.[`${puzzle}:${solveMode}:${scrambleType}`];
    if (stored === this.scramble && stored) return this.prefetchCrossSolutions();
    this.revision++;
    this.generating = false;
    this.scramble = stored ?? "";
    this.revealed = false;
    this.replay++;
    this.emit();
    if (!this.scramble) await this.nextScramble();
    else this.prefetchCrossSolutions();
  }
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
          if (this.lockedPage(arg)) {
            this.skipTarget = arg;
            this.overlay = "skipLearning";
            break;
          }
          goPage(arg, { puzzle: this.puzzle as PuzzleId });
          break;
        case "learnPuzzle": {
          // The answer to "Learn to solve this puzzle?": start a course, skip it, or go back to the previous puzzle.
          const from = this.lockedFrom;
          this.lockedFrom = undefined;
          this.overlay = "";
          if (arg === "skip") {
            await this.unlockPuzzle();
            goPage("playground", { puzzle: this.puzzle as PuzzleId }, true);
          } else if (arg === "cancel" && from) {
            this.quietPuzzle = true;
            await this.action("puzzle:" + from.event).finally(() => (this.quietPuzzle = false));
            goPage(from.page, { puzzle: this.puzzle as PuzzleId }, true);
          } else {
            const method = this.course.methods[this.puzzle as PuzzleId] ?? recommendedMethod(this.puzzle as PuzzleId);
            if (method && methodOf(this.puzzle as PuzzleId, method)) {
              this.saveCourse(openCourse(this.course, this.puzzle as PuzzleId, method));
              goPage("learn", { puzzle: this.puzzle as PuzzleId, learnMethod: method });
            }
          }
          break;
        }
        case "skipLearning": {
          const page = this.skipTarget;
          this.skipTarget = "";
          this.overlay = "";
          await this.unlockPuzzle();
          if (page) goPage(page, { puzzle: this.puzzle as PuzzleId });
          break;
        }
        case "case":
          goPage("algorithms", { caseId: arg, puzzle: this.puzzle as PuzzleId });
          break;
        case "back":
        case "historyBack":
          go(-1);
          break;
        case "historyForward":
          go(1);
          break;
        case "setupMode":
          this.setupMode = arg;
          break;
        case "trainingSetup":
          this.setupMode = "";
          this.direction = -1;
          this.axis = "x";
          goPage("training", { puzzle: this.puzzle as PuzzleId });
          this.timerEpoch++;
          break;
        case "trainingStart": {
          if (this.learningFrozen || this.pendingSolve) break;
          this.trainingKind = arg === "cross1" && this.puzzle === "333" ? "cross1" : "cases";
          this.pref("cubix.training.kind", this.trainingKind);
          if (this.trainingKind === "cases") {
            const mode = arg.startsWith("cases:") ? arg.slice(6) : "practice";
            if (learningModeForPuzzle(mode, this.puzzle) === mode)
              this.pref(learningKey(this.user.id ?? "guest"), { ...this.learningPlan, mode });
          }
          goPage("training", { trainingStep: "practice", puzzle: this.puzzle as PuzzleId });
          this.direction = 1;
          this.axis = "x";
          this.timerEpoch++;
          this.emit();
          if (this.trainingKind === "cross1") await this.syncScramble();
          else await this.nextCase();
          await this.refresh();
          break;
        }
        case "crossMoves": {
          const moves = Number(arg);
          if (!CROSS_PLUS_ONE_MOVES.includes(moves as 3) || moves === this.crossMoves) break;
          this.crossMoves = moves;
          this.pref("cubix.training.crossMoves", moves);
          this.timerEpoch++;
          if (this.crossTraining) {
            await this.syncScramble();
            await this.refresh();
          }
          break;
        }
        case "learningMode": {
          if (this.learningFrozen || learningModeForPuzzle(arg, this.puzzle) !== arg || this.pendingSolve) break;
          this.pref(learningKey(this.user.id ?? "guest"), { ...this.learningPlan, mode: arg });
          this.overlay = "";
          this.timerEpoch++;
          await this.nextCase();
          break;
        }
        case "learn": {
          const learned = !this.learned.has(arg);
          learned ? this.learned.add(arg) : this.learned.delete(arg);
          await call("setLearned", arg, learned);
          await this.refresh();
          break;
        }
        case "set":
          this.sets = {
            ...this.sets,
            [catalog.sets.find((s: any) => s.id === arg).stage]: arg,
          };
          this.per("cubix.algs.setByCube", this.sets);
          break;
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
        case "train": {
          if (kind === "train" && this.learningMode !== "practice") this.pref(learningKey(this.user.id ?? "guest"), { ...this.learningPlan, mode: "practice" });
          const ids =
            kind === "select"
              ? [arg]
              : kind === "train" && !arg
                ? [this.caseId]
                : this.cases()
                    .filter((c: any) =>
                      kind === "selectSet" || (kind === "train" && !arg.includes(":"))
                        ? c.set === arg
                        : `${c.set}:${c.group}` === arg,
                    )
                    .map((c: any) => c.id);
          if (kind === "clear") this.selected.clear();
          else if (kind === "train") this.selected = new Set(ids);
          else this.selected = toggleSelection(this.selected, ids);
          this.per("cubix.training.selectionByCube", [...this.selected]);
          this.goal = new Set(
            [...this.selected].filter((id) => !this.learned.has(id)),
          );
          if (kind === "train") {
            // Training a group or a case from the catalogue skips the setup screen.
            this.trainingKind = "cases";
            this.pref("cubix.training.kind", "cases");
            goPage("training", { trainingStep: "practice", puzzle: this.puzzle as PuzzleId });
          }
          if (kind === "train" || !this.selected.has(this.training?.id))
            await this.nextCase();
          break;
        }
        case "next":
          if (this.page === "learn") {
            if (this.learning) this.learnStep(this.learning.entry.step + 1);
            break;
          }
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
        case "solution":
          this.revealed = !this.revealed;
          if (this.revealed && this.crossTraining) void this.loadCrossSolutions();
          break;
        case "auf":
          this.randomAuf = !this.randomAuf;
          this.pref("cubix.training.randomAuf", this.randomAuf);
          break;
        case "times":
          this.showTimes = !this.showTimes;
          break;
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
          const from = { event: this.event().id, page: this.page }, previous = this.puzzle;
          this.puzzle = event.puzzle;
          this.pref("cubix.puzzle", event.puzzle);
          this.per("cubix.practice.modeByPuzzle", event.solveMode);
          this.loadContext();
          this.overlay = "";
          // A new puzzle opens on the timer, wherever the player was; one they cannot solve yet on its course, with the
          // question first: learn it, or unlock everything at once.
          if (this.locked && previous !== event.puzzle && !this.quietPuzzle) {
            this.lockedFrom = from;
            this.overlay = "learnPuzzle";
          }
          goPage(this.quietPuzzle ? this.page : this.locked ? "learn" : "playground", { puzzle: event.puzzle, trainingStep: this.trainingStep, profileMode: this.profileMode }, true);
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
        case "scrambleType":
          this.timerEpoch++;
          this.scrambleType = arg;
          this.per("cubix.practice.typeByPuzzle", arg);
          this.overlay = "";
          await this.nextScramble();
          await this.refresh();
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
          this.light = arg === "light";
          this.pref("cubix.ui.colorMode", arg);
          break;
        case "settings":
          this.overlay = this.overlay === "settings" ? "" : "settings";
          break;
        case "logout":
          await call("logout");
          this.user = { isGuest: true, username: "Guest" };
          this.expired = false;
          this.overlay = "";
          this.sessions.clear();
          this.profileMode = "overview";
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
        case "caseStep": {
          const c = this.find(this.caseId),
            ids = this.cases()
              .filter((v: any) => v.set === c.set)
              .map((v: any) => v.id),
            next =
              ids[ids.indexOf(this.caseId) + (arg === "previous" ? -1 : 1)];
          if (next) {
            goPage("algorithms", { caseId: next, puzzle: this.puzzle as PuzzleId }, true);
          }
          break;
        }
        case "selectorToggle": {
          const count = this.cases().filter(
            (c: any) => c.set === arg && this.selected.has(c.id),
          ).length;
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
        case "profileCase":
          this.caseId = arg;
          this.overlay = "profileCase";
          await this.refresh();
          break;
        case "penalty": {
          const [id, penalty] = arg.split(":");
          const solve = this.findSolve(Number(id));
          await call(
            "setPenalty",
            Number(id),
            solve?.penalty === penalty ? "none" : penalty,
          );
          // Rows of a case's history edit in place, keeping its dialog open.
          if (this.overlay !== "profileCase") this.overlay = "";
          await this.refresh();
          break;
        }
        case "delete":
          await call("deleteSolve", Number(arg));
          if (this.overlay !== "profileCase") this.overlay = "";
          await this.refresh();
          break;
        case "undo":
          if (this.solves.length) {
            await call("deleteSolve", this.solves.at(-1).id);
            await this.refresh();
          }
          break;
        case "comment":
          this.overlaySolve = this.findSolve(Number(arg));
          this.overlay = "comment";
          break;
        case "solve":
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
            ).find((v: any) => v.id === Number(arg));
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
          goPage("learn", { puzzle: this.puzzle as PuzzleId, learnMethod: "methods" });
          break;
        case "learnHome":
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
        case "learnJump": {
          // A step further on, once asked whether the steps before it are finished ("<step>:done" if they are).
          const [index, answer] = arg.split(":"), course = this.learning;
          if (course && answer === "done") this.saveCourse(completeStepsBefore(this.course, course.puzzle, course.method.id, Number(index)));
          this.learnStep(Number(index));
          break;
        }
        case "learnNext": {
          const course = this.learning;
          if (!course) break;
          this.saveCourse(completeStep(this.course, course.puzzle, course.method.id, course.entry.step));
          goPage("learn", { puzzle: course.puzzle, learnMethod: course.method.id, learnStep: courseEntry(this.course, course.puzzle, course.method.id).step });
          this.learnFinished = false;
          this.direction = 1;
          break;
        }
        case "learnFinish": {
          const course = this.learning;
          if (!course) break;
          this.saveCourse(finishCourse(this.course, course.puzzle, course.method.id));
          await this.unlockPuzzle(course.method.id);
          this.learnFinished = true;
          this.direction = 1;
          break;
        }
        case "learnDone": {
          const course = this.learning;
          if (course) this.saveCourse(toggleStepDone(this.course, course.puzzle, course.method.id, course.entry.step));
          break;
        }
        case "learnAlg": {
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
            this.page === "learn" ? "methodsGuide" : this.page === "training" ? "trainingGuide" : this.page === "duel" ? "duelGuide" : this.page === "coaching" ? "coachingGuide" : this.page === "algorithms" ? "algorithmsGuide" : this.page === "playground" ? "timerGuide" : "overviewGuide";
          this.overlay = "guides";
          break;
        case "guidePage":
          this.guidePage = arg;
          if (arg === "methodsGuide") this.guidePuzzle = isPuzzle(this.puzzle) ? this.puzzle : "333";
          if (arg === "notationGuide") this.notationPuzzle = isPuzzle(this.puzzle) ? this.puzzle : "333";
          document.querySelector(".guides-body")?.scrollTo({ top: 0 });
          break;
        case "search":
          this.search = "";
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
  /** Session figures under the timer: label, value and the tone it is drawn in; a training keeps three. */
  metrics(): Metric[] {
    const all = sessionMetrics(this.solves);
    if (this.practicePage() === "training") return all.filter(([label]) => ["Best", "Mean", "Solves"].includes(label));
    return all;
  }
  /** The scramble types the timer offers for the puzzle (cross + 1 has its own page). */
  scrambleOptions = () =>
    this.info().scrambles.filter((id: string) => !id.startsWith("cross1-")).map((id: string) => ({ id, label: this.label("scrambles", id) }));
}
export const store = new Store();

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
