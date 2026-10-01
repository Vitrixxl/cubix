import {appearanceFromStorage} from "../appearance";
import { orderedGroups, reviewCases, reviewStatus, reviewTrack, isReviewMode, learningTrackOf, learningModeForPuzzle, dailyAssignment, EMPTY_LEARNING_PLAN, isLearningTrack, learningCases, learningKey, learningStatus, localDay, type LearningPlan } from "../../src/client/lib/dailyLearning";
import { LaunchSessions } from "../../src/client/lib/launchSessions";
import { toggleSelection } from "../../src/client/lib/practiceCatalog";
import { sessionMetrics, type Metric } from "../../src/client/lib/practiceSummary";
import { isPhone } from "../../src/client/lib/viewport";
import { call, openExternal } from "./bridge";
import catalogData from "../assets/catalog.json";
import { eventInfo, eventLabel, eventOf, isPuzzle, normalizeScrambleType, puzzleOf, type PuzzleId, type SolveMode } from "../../src/shared/puzzles";
import { CROSS_PLUS_ONE_MOVES } from "../../src/shared/crossPlusOne";
import { courseEntry, courseStorageKey, goToStep, methodOf, openCourse, readCourseProgress, recommendedMethod, toggleAlgLearned, toggleStepDone, type CourseProgress } from "../../src/client/lib/course";
import { duel } from "./duelClient";
export const catalog = catalogData as any;
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
const PAGE_ORDER = ["playground", "learn", "algorithms", "training", "duel", "profile"];
/** From this width a training opens with its times shown, and Escape no longer folds them away. */
export const TIMES_OPEN_WIDTH = 1024;
const timesOpenAtStart = (page: string) => page === "training" && innerWidth >= TIMES_OPEN_WIDTH;
/** Whether a window this wide keeps the session's times beside the stage, with no button to fold them away. */
export const timesAlwaysShown = (width: number, training: boolean) => !isPhone(width) && width >= (training ? 1200 : 980);
const LOCATION_KEY = "cubix.location";
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
  themeName = "t3-code";
  light = false;
  user: any = { isGuest: true, username: "Guest" };
  learned = new Set<string>();
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
  history: any[] = [];
  /** Slide direction of the next page transition: 1 pushes in from the right (or below), -1 from the left (or above). */
  direction = 1;
  /**
   * Axis of the next transition on the desktop: pages of the rail slide vertically, going deeper into a page
   * (a profile section, training started from its setup, a case) slides sideways.
   */
  axis: "x" | "y" = "y";
  forward: any[] = [];
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
  /** The method whose course the Learn page shows; empty, the list of methods. */
  learnMethod = "";
  /** Method highlighted in the list of methods, before it is opened. */
  learnPick = "";
  /** The set shown by each step that teaches several, by `puzzle:method:step`. */
  learnSets: Record<string, string> = {};
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  emit = () => {
    this.version++;
    this.saveLocation();
    this.listeners.forEach((fn) => fn());
  };
  /** Where the app stood, kept on this device so a relaunch opens there again. */
  savedLocation = "";
  saveLocation() {
    if (!this.ready) return;
    const value = JSON.stringify({
      page: this.page,
      caseId: this.caseId,
      profileMode: this.profileMode,
      trainingStep: this.trainingStep,
      setupMode: this.setupMode,
      learnMethod: this.learnMethod,
    });
    if (value === this.savedLocation) return;
    this.savedLocation = value;
    try {
      localStorage.setItem(LOCATION_KEY, value);
    } catch {}
  }
  restoreLocation() {
    let saved: any;
    try {
      saved = JSON.parse(localStorage.getItem(LOCATION_KEY) ?? "null");
    } catch {}
    if (!saved || !PAGE_ORDER.includes(saved.page)) return;
    this.page = saved.page;
    this.caseId = typeof saved.caseId === "string" && this.find(saved.caseId) ? saved.caseId : "";
    if (typeof saved.profileMode === "string") this.profileMode = saved.profileMode;
    if (saved.trainingStep === "setup" || saved.trainingStep === "practice") this.trainingStep = saved.trainingStep;
    if (typeof saved.setupMode === "string") this.setupMode = saved.setupMode;
    if (methodOf(this.puzzle as PuzzleId, saved.learnMethod)) this.learnMethod = saved.learnMethod;
    this.showTimes = timesOpenAtStart(this.page);
    this.profilePuzzle = this.puzzle;
    this.profileSolveMode = this.solveMode;
    this.profileScramble = this.scrambleType;
  }
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
  /** Shows a step of the course, the page back at its top. */
  learnStep(index: number) {
    const course = this.learning;
    if (!course) return;
    this.saveCourse(goToStep(this.course, course.puzzle, course.method.id, index));
    this.direction = index < course.entry.step ? -1 : 1;
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
      this.restoreLocation();
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
  navigate(page: string, caseId = "") {
    this.axis = page === this.page ? "x" : "y";
    this.direction =
      page === "profile" && this.page === "profile" && this.profileMode !== "overview"
        ? -1
        : slideDirection(this.location(), { page, caseId });
    this.history.push(this.location());
    this.forward = [];
    this.page = page;
    this.caseId = caseId;
    this.overlay = "";
    this.timerEpoch++;
    this.showTimes = timesOpenAtStart(page);
    if (page === "profile") {
      this.profileMode = "overview";
      this.profilePuzzle = this.puzzle;
      this.profileSolveMode = this.solveMode;
      this.profileScramble = this.scrambleType;
    }
    void this.syncScramble();
    void this.refresh();
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
  travel(back = true) {
    const stack = back ? this.history : this.forward,
      other = back ? this.forward : this.history;
    const next = stack.pop();
    if (!next) return;
    this.direction = back ? -1 : 1;
    this.axis = next.page === this.page ? "x" : "y";
    other.push(this.location());
    Object.assign(this, next);
    this.overlay = "";
    this.timerEpoch++;
    void this.syncScramble();
    void this.refresh();
    this.emit();
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
        case "nav":
          this.navigate(arg);
          break;
        case "case":
          this.navigate("algorithms", arg);
          break;
        case "back":
        case "historyBack":
          this.travel();
          break;
        case "historyForward":
          this.travel(false);
          break;
        case "setupMode":
          this.setupMode = arg;
          break;
        case "trainingSetup":
          this.setupMode = "";
          this.direction = -1;
          this.axis = "x";
          this.trainingStep = "setup";
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
          this.trainingStep = "practice";
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
            this.trainingStep = "practice";
            this.navigate("training");
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
          this.puzzle = event.puzzle;
          this.pref("cubix.puzzle", event.puzzle);
          this.per("cubix.practice.modeByPuzzle", event.solveMode);
          this.loadContext();
          this.overlay = "";
          this.caseId = "";
          this.learnMethod = "";
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
          // Profile sections are pages of their own: they slide in and join the back/forward history.
          if (arg === this.profileMode) break;
          this.direction = arg === "overview" ? -1 : 1;
          this.axis = "x";
          this.history.push(this.location());
          this.forward = [];
          this.profileMode = arg;
          this.overlay = "";
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
            this.caseId = next;
            await this.refresh();
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
          // A course is a page of its own: it slides in and joins the back/forward history.
          if (!methodOf(this.puzzle as PuzzleId, arg)) break;
          this.saveCourse(openCourse(this.course, this.puzzle as PuzzleId, arg));
          if (this.page !== "learn") {
            this.learnMethod = arg;
            this.navigate("learn");
            break;
          }
          this.direction = 1;
          this.axis = "x";
          this.history.push(this.location());
          this.forward = [];
          this.learnMethod = arg;
          this.learnPick = arg;
          break;
        }
        case "learnMethods":
          if (!this.learnMethod) break;
          this.direction = -1;
          this.axis = "x";
          this.history.push(this.location());
          this.forward = [];
          this.learnPick = this.learnMethod;
          this.learnMethod = "";
          break;
        case "learnFrom": {
          // From the solving methods guide: its puzzle becomes the app's, then the method's course opens.
          const [puzzle, method] = arg.split(":");
          if (!isPuzzle(puzzle) || !methodOf(puzzle, method)) break;
          if (puzzle !== this.puzzle) await this.action("puzzle:" + (eventOf(puzzle, "standard")?.id ?? puzzle));
          this.saveCourse(openCourse(this.course, puzzle, method!));
          this.learnMethod = method!;
          this.learnPick = method!;
          this.navigate("learn");
          break;
        }
        case "learnStep":
          this.learnStep(Number(arg));
          break;
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
            this.page === "learn" ? "methodsGuide" : this.page === "training" ? "trainingGuide" : this.page === "duel" ? "duelGuide" : this.page === "algorithms" ? "algorithmsGuide" : this.page === "playground" ? "timerGuide" : "overviewGuide";
          this.overlay = "guides";
          break;
        case "guidePage":
          this.guidePage = arg;
          if (arg === "methodsGuide") this.guidePuzzle = isPuzzle(this.puzzle) ? this.puzzle : "333";
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

