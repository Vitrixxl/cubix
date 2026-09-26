import {appearanceFromStorage} from "../appearance";
import { orderedGroups, reviewCases, reviewStatus, reviewTrack, isReviewMode, learningTrackOf, learningModeForPuzzle, dailyAssignment, EMPTY_LEARNING_PLAN, isLearningTrack, learningCases, learningKey, learningStatus, localDay, type LearningPlan } from "../../src/client/lib/dailyLearning";
import { LaunchSessions } from "../../src/client/lib/launchSessions";
import { toggleSelection } from "../../src/client/lib/practiceCatalog";
import { practiceSummary } from "../../src/client/lib/practiceSummary";
import { call, openExternal } from "./bridge";
import catalogData from "../assets/catalog.json";
import { fmtTime } from "../../src/client/lib/format";
import { isPuzzle, normalizeScrambleType, type PuzzleId } from "../../src/shared/puzzles";
export const catalog = catalogData as any;
export const puzzleOf = (c: any) =>
  c.puzzle_id ?? String(c.cube_size ?? 3).repeat(3);
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
const PAGE_ORDER = ["playground", "algorithms", "training", "profile"];
/** Tabs slide toward their position in the bar; opening a case or a guide pushes forward. */
export function slideDirection(
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
  sync: any = null;
  error = "";
  saving = false;
  pendingSolve: any = null;
  scrollPositions = new Map<string, number>();
  generating = false;
  showTimes = false;
  showCases = innerWidth >= 1024;
  revealed = false;
  randomAuf = true;
  login = false;
  overlay = "";
  overlaySolve: any = null;
  anchor: DOMRect | null = null;
  search = "";
  query = "";
  learningFilter = "all";
  catalogStage = "";
  /** Puzzle and method shown by the solving methods guide, independent of the active puzzle. */
  guidePuzzle: PuzzleId = "333";
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
  /** Slide direction of the next page transition: 1 pushes in from the right, -1 from the left. */
  direction = 1;
  forward: any[] = [];
  revision = 0;
  request = 0;
  goal = new Set<string>();
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
  context = () => ({
    puzzle: this.puzzle,
    solveMode: this.solveMode,
    scrambleType: this.page === "training" ? "case" : this.scrambleType,
  });
  contextKey = () =>
    `${this.page}:${this.puzzle}:${this.solveMode}:${this.scrambleType}`;
  cases = (p = this.puzzle) =>
    catalog.cases.filter((c: any) => puzzleOf(c) === p);
  allSets = (p = this.puzzle) =>
    catalog.sets.filter((c: any) => puzzleOf(c) === p);
  find = (id: string) => catalog.cases.find((c: any) => c.id === id);
  info = (p = this.puzzle) =>
    catalog.puzzles.puzzles.find((v: any) => v.id === p);
  label = (kind: string, id: string) =>
    catalog.puzzles[kind]?.find((v: any) => v.id === id)?.label ?? id;
  pref(key: string, value: any) {
    this.prefs[key] = value;
    void call("preference", key, value).catch(this.fail);
  }
  per(key: string, value: any) {
    this.pref(key, { ...this.prefs[key], [this.puzzle]: value });
  }
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
      this.entry = this.prefs["cubix.timer.entry"] ?? "timer";
      this.learningFilter = this.prefs["cubix.algs.learningFilter"] ?? "all";
      this.statsView = this.prefs["cubix.profile.statsView"] ?? "chart";
      this.learned = new Set(v.learned);
      this.learningGroupOrder = v.learningGroupOrder ?? {};
      this.loadContext();
      this.ready = true;
      this.emit();
      await this.refresh();
      await Promise.all([
        this.scramble ? Promise.resolve() : this.nextScramble(),
        this.nextCase(),
      ]);
    } catch (e) {
      this.fail(e);
    }
  }
  loadContext() {
    const p = this.puzzle;
    this.catalogStage = this.prefs["cubix.algs.stageByCube"]?.[p] ?? "";
    this.collapsed = new Set(
      Object.keys(this.prefs["cubix.algs.collapsedGroups"] ?? {}),
    );
    this.solveMode =
      this.prefs["cubix.practice.modeByPuzzle"]?.[p] ?? "standard";
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
        page: this.page,
        caseId: this.caseId,
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
    this.generating = true;
    this.emit();
    try {
      const value = await call("scramble", context);
      if (revision !== this.revision) return;
      this.scramble = value;
      this.pref("cubix.playground.scrambleByContext", {
        ...this.prefs["cubix.playground.scrambleByContext"],
        [`${context.puzzle}:${context.solveMode}:${this.scrambleType}`]: value,
      });
      this.generating = false;
      this.replay++;
      this.emit();
    } catch (e) {
      if (revision === this.revision) this.fail(e);
    }
  }
  async nextCase(direction = "next") {
    this.reconcileLearning();
    const puzzle = this.puzzle,
      mode = this.learningMode,
      selected = [...this.practiceSelected];
    if (mode !== "practice") direction = "next";
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
    this.pendingSolve = {
      key: this.contextKey(),
      page: this.page,
      selected: [...this.practiceSelected],
      body: {
        ...this.context(),
        timeMs: Math.round(ms),
        scramble:
          this.page === "training" ? this.training?.setup : this.scramble,
        caseId: this.page === "training" ? this.training?.id : null,
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
      this.sync = await call("sync");
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
    };
  }
  navigate(page: string, caseId = "") {
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
    this.showTimes = this.showCases = page === "training" && innerWidth >= 1024;
    if (page === "profile") {
      this.profileMode = "overview";
      this.profilePuzzle = this.puzzle;
      this.profileSolveMode = this.solveMode;
      this.profileScramble = this.scrambleType;
    }
    void this.refresh();
  }
  travel(back = true) {
    const stack = back ? this.history : this.forward,
      other = back ? this.forward : this.history;
    const next = stack.pop();
    if (!next) return;
    this.direction = back ? -1 : 1;
    other.push(this.location());
    Object.assign(this, next);
    this.overlay = "";
    this.timerEpoch++;
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
  async action(action: string, element?: HTMLElement) {
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
        case "learningMode": {
          if (this.learningFrozen || learningModeForPuzzle(arg, this.puzzle) !== arg || this.pendingSolve) break;
          this.pref(learningKey(this.user.id ?? "guest"), { ...this.learningPlan, mode: arg });
          this.showCases = false;
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
                      kind === "selectSet"
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
          if (kind === "train") this.navigate("training");
          if (kind === "train" || !this.selected.has(this.training?.id))
            await this.nextCase();
          break;
        }
        case "next":
          this.timerEpoch++;
          if (this.page === "training") await this.nextCase();
          else await this.nextScramble();
          break;
        case "previous":
          this.timerEpoch++;
          await this.nextCase("previous");
          break;
        case "replayCube":
          this.replay++;
          break;
        case "solution":
          this.revealed = !this.revealed;
          break;
        case "auf":
          this.randomAuf = !this.randomAuf;
          this.pref("cubix.training.randomAuf", this.randomAuf);
          break;
        case "times":
          this.showTimes = !this.showTimes;
          break;
        case "cases":
          this.showCases = !this.showCases;
          break;
        case "menu":
          this.overlay = this.overlay === arg ? "" : arg;
          this.anchor = element?.getBoundingClientRect() ?? null;
          break;
        case "puzzle":
          this.puzzle = arg;
          this.pref("cubix.puzzle", arg);
          this.loadContext();
          this.overlay = "";
          this.caseId = "";
          this.timerEpoch++;
          await this.nextCase();
          if (!this.scramble) await this.nextScramble();
          await this.refresh();
          break;
        case "mode":
        case "scrambleType":
          this.timerEpoch++;
          if (kind === "mode") {
            this.solveMode = arg;
            this.per("cubix.practice.modeByPuzzle", arg);
          } else {
            this.scrambleType = arg;
            this.per("cubix.practice.typeByPuzzle", arg);
          }
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
        case "authMode":
          this.login = arg === "login";
          break;
        case "account":
          this.login = arg === "login";
          this.overlay = "settings";
          break;
        case "settings":
          this.overlay = this.overlay === "settings" ? "" : "settings";
          break;
        case "logout":
          await call("logout");
          this.user = { isGuest: true, username: "Guest" };
          this.sessions.clear();
          this.profileMode = "overview";
          await this.refresh();
          break;
        case "profilePuzzle":
          this.profilePuzzle = arg;
          if (!this.info(arg).scrambles.includes(this.profileScramble))
            this.profileScramble = this.info(arg).scrambles[0];
          this.overlay = "";
          await this.refresh();
          break;
        case "profileSolveMode":
          this.profileSolveMode = arg;
          this.overlay = "";
          await this.refresh();
          break;
        case "profileScramble":
          this.profileScramble = arg;
          this.overlay = "";
          await this.refresh();
          break;
        case "profileMode":
          // Profile sections are pages of their own: they slide in and join the back/forward history.
          if (arg === this.profileMode) break;
          this.direction = arg === "overview" ? -1 : 1;
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
          document
            .getElementById("stage-" + arg)
            ?.scrollIntoView({ block: "start" });
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
          this.navigate(
            this.page === "training"
              ? "trainingGuide"
              : this.page === "algorithms"
                ? "algorithmsGuide"
                : "overviewGuide",
          );
          break;
        case "search":
          this.search = "";
          this.overlay = "search";
          break;
        case "sync":
          this.sync = await call("sync");
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
  metrics() {
    const summary = practiceSummary(this.solves);
    return [
      ["Solves", String(summary.count)],
      ["Best", fmtTime(summary.best)],
      ["Mean", fmtTime(summary.mean)],
      ...(this.page === "training" ? [] : [
        ["Ao5", fmtTime(summary.ao5)], ["Ao12", fmtTime(summary.ao12)],
      ]),
    ];
  }
}
export const store = new Store();
