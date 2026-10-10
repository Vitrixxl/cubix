/** Cubix data engine, independent of its host: the web app runs it in a Web Worker on IndexedDB.
 * Reusing the shared client preserves its local-first synchronization and HTTP/WS protocol.
 */
import { cubeScene as cubePreview } from '../../src/shared/cubeScene';
import { createLocalClient } from '../../src/client/local/client';
import { createApiClient } from '../../src/client/api-client';
import { createLive, type LiveMessage } from '../../src/client/live';
import { applyAlg, combineAuf, compensateAuf, randomAuf, solved } from '../../src/shared/cube';
import { executableAlg, maskForStage } from '../../src/client/lib/caseState';
import { StaticCubeSvg } from '../../src/client/diagrams/StaticCubeSvg';
import { viewForStage } from '../../src/shared/cubeDiagram';
import { createElement } from 'react';
import { cases } from '../../src/client/local/catalog';
import { CATALOG_CACHE_PREFIX } from '../../src/client/local/catalog-cache';
import { EMPTY_TRAINING_HISTORY, previousIndex, trainingHistoryReducer, type TrainingHistory } from '../../src/client/lib/trainingHistory';
import { renderToStaticMarkup } from 'react-dom/server';
import { EVENTS, puzzleInfo, type PracticeContext, type PuzzleId } from '../../src/shared/puzzles';
import { fmtDate, joinedDate } from '../../src/client/lib/format';
import { recordMessage, solveRecords } from '../../src/client/lib/personalBest';
import { competitionEvent, generatePracticeScramble, type ScrambleEngine } from '../../src/client/lib/practiceScrambleCore';
import { createScramblePool, SCRAMBLE_POOL_KEY } from '../../src/client/lib/scramblePool';
import { dailyDay, dailyScramble, DAILY_EVENTS } from '../../src/client/lib/daily';
import { crossSolutions } from '../../src/shared/crossTraining';
import { analyseSolve, type CatalogCase } from '../../src/client/lib/solveAnalysis';
import { DUELS_KEY, keepRecord, levelOf } from '../../src/client/lib/duel';
import { createSmartDigests, SMART_DIGESTS_KEY } from './smartDigests';
import { isCaseSource, type CaseSource } from '../../src/client/lib/smartStats';
import type { CaseDto } from '../../src/shared/types';

export interface EngineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Every stored preference, sent to the renderer at start-up. */
  all(): Record<string, string>;
}
/** An answer already shaped for the renderer. */
class Shown { constructor(readonly value: unknown) {} }
export interface EngineRequest { id: number; method: string; args: any[] }
export type EngineMessage = { id: number; value?: unknown; error?: string } | { event: string; value?: unknown };

export function createEngine({ origin, storage, emit, scrambles, lock }: {
  origin: string;
  storage: EngineStorage;
  emit: (message: EngineMessage) => void;
  scrambles: ScrambleEngine;
  lock?: <T>(name: string, action: () => Promise<T>) => Promise<T>;
}) {
  const tokenKey = `cubix.auth:${origin}`;
  const local = createLocalClient({
    storage, lock,
    getToken: () => storage.getItem(tokenKey), setToken: t => storage.setItem(tokenKey, t), clearToken: () => storage.removeItem(tokenKey),
    remote: token => createApiClient(origin, { getToken: () => token }),
    changed: () => emit({ event: 'changed' }), status: status => emit({ event: 'sync', value: status }),
  });
  // The app's one socket, signed in with the account's token (without one for a guest): its sync stays here, every
  // other channel goes to the tabs as `socket` events, and the tabs send on it through `send`.
  const live = createLive(local, () => local.current().isGuest ? null : storage.getItem(tokenKey));
  live.on('*', value => emit({ event: 'socket', value }));
  const connect = () => live.ensure();
  let lastAdvance: { key: string; promise: Promise<Record<string, unknown>> } | undefined;
  // Competition scrambles come from a reserve kept on the device for every event (scramblePool.ts), filled in the
  // background from the launch; the other scramble types keep one scramble generated ahead per context.
  const reserve = createScramblePool({ storage, events: EVENTS.map(e => e.id), generate: event => scrambles.randomScrambleForEvent(event) });
  const nextScrambles = new Map<string, Promise<string>>();
  const dailies = new Map<string, Promise<string>>();
  // The day's scramble of an event (src/client/lib/daily.ts), searched once per day.
  function daily(day: string, event: string) {
    const key = `${day}:${event}`;
    if (!dailies.has(key)) dailies.set(key, dailyScramble(day, event, scrambles).catch(error => { dailies.delete(key); throw error; }));
    return dailies.get(key)!;
  }
  const scrambleKey = (context: PracticeContext) => `${context.puzzle}:${context.solveMode}:${context.scrambleType}`;
  function prefetchScramble(context: PracticeContext) {
    if (context.scrambleType === 'normal') return void reserve.fill(competitionEvent(context));
    const key = scrambleKey(context);
    if (nextScrambles.has(key)) return;
    const promise = generatePracticeScramble(context, scrambles);
    promise.catch(() => { if (nextScrambles.get(key) === promise) nextScrambles.delete(key); });
    nextScrambles.set(key, promise);
  }
  function takeScramble(context: PracticeContext) {
    if (context.scrambleType === 'normal') {
      const event = competitionEvent(context), ready = reserve.take(event);
      if (ready !== undefined) return Promise.resolve(ready);
      // The reserve is empty (a first launch): this one is searched now, the reserve filled after it.
      const searched = generatePracticeScramble(context, scrambles);
      void searched.finally(() => void reserve.fill(event)).catch(() => {});
      return searched;
    }
    const key = scrambleKey(context), ready = nextScrambles.get(key) ?? generatePracticeScramble(context, scrambles);
    nextScrambles.delete(key);
    prefetchScramble(context);
    return ready;
  }
  // Smart cube solves, analysed once each: the analysis page, and the cases they went through as attempts of those cases.
  const smart = createSmartDigests({ storage, cases: cases as unknown as CatalogCase[], changed: () => emit({ event: 'changed' }) });
  const caseSvg = (size: number, setup: string, stage: CaseDto['stage']) =>
    renderToStaticMarkup(createElement(StaticCubeSvg, { state: applyAlg(solved(size), setup), size: 300, mask: maskForStage(stage), view: viewForStage(stage) }));
  const trainingHistories = new Map<string, TrainingHistory>();
  function training(action: string, puzzle: PuzzleId, ids: string[], useAuf: boolean, solveMode: string) {
    const key = `${puzzle}:${solveMode}`;
    const pool = cases.filter(c => ids.includes(c.id));
    const before = trainingHistories.get(key) ?? EMPTY_TRAINING_HISTORY;
    const size = puzzleInfo(puzzle).cubeSize;
    const history = trainingHistoryReducer(before, action === 'previous' ? { type: 'previous', pool } : { type: 'next', pool, sample: Math.random(), auf: useAuf && size ? randomAuf() : '' });
    trainingHistories.set(key, history);
    const entry = history.entries[history.index];
    if (!entry) return null;
    const { c, auf } = entry, setup = size ? combineAuf(c.setup, auf) : c.setup;
    return { id: c.id, canPrevious: previousIndex(history, pool) !== -1, setup, algorithm: size ? compensateAuf(executableAlg(c.algorithms[0]), auf) : executableAlg(c.algorithms[0]), svg: size ? caseSvg(size, setup, c.stage) : null };
  }
  const unlocked = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  // A solve's date never changes: each is formatted once, not at every refresh of a long history.
  const dates = new Map<string, string>();
  const dateOf = (iso: string) => { let text = dates.get(iso); if (text === undefined) dates.set(iso, (text = fmtDate(iso))); return text; };
  function display(v: any): any {
    if (Array.isArray(v)) return v.map(display);
    if (v && typeof v === 'object') {
      const out = Object.fromEntries(Object.entries(v).map(([k, v]) => [k, display(v)]));
      if (typeof v.at === 'string') out.displayDate = dateOf(v.at);
      if (typeof v.createdAt === 'string') out.displayDate = dateOf(v.createdAt);
      if (typeof v.createdAt === 'string' && v.username) out.joined = joinedDate(v.createdAt);
      if (typeof v.unlockedAt === 'string') out.unlockedDate = unlocked.format(new Date(v.unlockedAt));
      return out;
    }
    return v;
  }
  /** Reads the client keeps until the data changes come back as the same objects: shown once, sent again as is. */
  const shown = new WeakMap<object, { token: number; value: unknown }>();
  let tokens = 0;
  function shownOf<T extends object>(value: T, shape: (value: T) => any = display) {
    let out = shown.get(value);
    if (!out) shown.set(value, (out = { token: ++tokens, value: shape(value) }));
    return out;
  }
  /** A tab that already holds this very figure (`known`, its token) is not sent it again. */
  function displayed<T extends object>(value: T, shape?: (value: T) => any, known?: number) {
    const out = shownOf(value, shape);
    return out.token === known ? { token: out.token } : out;
  }
  /** The profile as the renderer uses it: a case's summary, not its whole history, and the activity without dates
   * to show, a year of solves weighing megabytes otherwise. */
  const profileView = ({ cases, activity, ...rest }: any) => ({
    ...display(rest),
    cases: cases.map(({ summary, name, stage }: any) => ({ summary, name, stage })),
    activity,
  });
  /** Whether this device holds times or learned cases outside any account (or a former server guest's token, whose
   * data is being brought here): signing in or creating an account imports them. */
  function localData() {
    if (!local.current().isGuest) return false;
    if (storage.getItem(tokenKey)) return true;
    try {
      const guest = JSON.parse(storage.getItem('cubix.local.v1:workspace:guest') ?? 'null');
      return Object.values(guest?.solves ?? {}).some((solve: any) => !solve.deleted) || Object.values(guest?.learned ?? {}).some(Boolean);
    } catch { return false; }
  }
  /** The preferences the renderer reads at start-up, without the workspace and catalogue: megabytes it never uses. */
  const preferences = () => Object.fromEntries(Object.entries(storage.all()).filter(([key]) => !key.startsWith('cubix.local.v1:workspace:') && !key.startsWith(CATALOG_CACHE_PREFIX) && key !== SCRAMBLE_POOL_KEY && key !== SMART_DIGESTS_KEY));
  const methods = new Set(Object.keys(local.api).filter(k => !['connectLive'].includes(k)));
  async function run(req: EngineRequest): Promise<unknown> {
    // The reserve of scrambles fills from the launch, while the pages load: its search runs in a worker of its own.
    if (req.method === 'init') void reserve.fill();
    // Today's daily scrambles, searched from the launch too: their page never waits on them.
    if (req.method === 'init') for (const event of DAILY_EVENTS) void daily(dailyDay(), event).catch(() => {});
    if (req.method === 'init') return { protocol: 2, user: local.current(), status: local.status(), localData: localData(), storage: preferences(), origin, learned: local.learned(), learnedAlgs: local.learnedAlgs(), learningGroupOrder: local.learningGroupOrder(), journey: local.read.journey() };
    if (req.method === 'snapshot') {
      const q = req.args[0], context = q.context;
      const trainingMode = q.page === 'training';
      const filter = { solveMode: context.solveMode };
      // A 3×3 case's times come from its training, from the smart cube solves it was done in, or from both; the
      // timer itself shows no case figures. The solves are analysed once for the whole snapshot.
      // The training's own figures (its recommendations) are the training's alone.
      const source: CaseSource = isCaseSource(q.caseSource) && context.puzzle === '333' && (!['playground', 'training'].includes(q.page) || q.caseId) ? q.caseSource : 'training';
      const inSolves = source === 'training' ? null : Promise.all([
        local.api.solves('playground', Infinity, '333', { solveMode: context.solveMode }).then(timer => smart.digests(timer, context.solveMode)),
        local.api.solves('training', Infinity, '333', { solveMode: context.solveMode }),
      ]);
      const jobs: Record<string, Promise<unknown>> = {
        // The latest thousand solves, or only those of the session the client shows (`session`, null before its first).
        solves: 'session' in q && q.session == null ? Promise.resolve([])
          : local.api.solves(trainingMode ? 'training' : 'playground', 'session' in q ? Infinity : 1000, context.puzzle, context).then(rows => 'session' in q ? rows.filter((row: any) => row.session_id === q.session) : rows),
        stats: inSolves && source !== 'training'
          ? inSolves.then(([digests, training]) => shownOf(smart.caseStats(source, digests, training, local.read.stats(context.puzzle, filter), context.solveMode)).value)
          : Promise.resolve(shownOf(local.read.stats(context.puzzle, filter)).value),
      };
      // The timer's sessions, to name the current one and go back to another.
      if (q.page === 'playground') jobs.sessions = Promise.resolve(local.read.sessions(context.puzzle, context));
      // The profile is read on its page, and once ahead from any other so that its first opening has it already: with
      // the puzzle and filters it opens on, those of the timer.
      const onProfile = q.page === 'profile';
      if (onProfile || !q.known?.profile) jobs.profile = Promise.resolve(displayed(onProfile ? local.read.profile(q.profilePuzzle, q.profileFilter) : local.read.profile(context.puzzle, { solveMode: context.solveMode, scrambleType: context.scrambleType }), profileView, q.known?.profile));
      if (onProfile || !q.known?.achievements) jobs.achievements = Promise.resolve(displayed(local.read.achievements(), undefined, q.known?.achievements));
      if (q.analysis) {
        const mode = trainingMode ? context.solveMode : q.profileFilter?.solveMode ?? 'standard';
        jobs.analysis = (inSolves && mode === context.solveMode ? inSolves.then(([digests]) => digests) : local.api.solves('playground', Infinity, '333', { solveMode: mode }).then(timer => smart.digests(timer, mode)))
          .then(digests => smart.analysis(digests, mode));
      }
      if (q.caseId) {
        const training = local.read.caseHistory(q.caseId, filter);
        jobs.caseHistory = inSolves && source !== 'training'
          ? inSolves.then(([digests, rows]) => displayed(smart.caseHistory(q.caseId, source, digests, rows, training, context.solveMode), undefined, q.known?.caseHistory))
          : Promise.resolve(displayed(training, undefined, q.known?.caseHistory));
      }
      if (q.advance) {
        if (!lastAdvance || lastAdvance.key !== q.advanceKey) lastAdvance = { key: q.advanceKey, promise: trainingMode ? Promise.resolve({ training: training('next', context.puzzle, q.selected, q.randomAuf, context.solveMode) }) : takeScramble(context).then(scramble => ({ scramble })) };
        jobs[trainingMode ? 'training' : 'scramble'] = lastAdvance.promise.then(v => v[trainingMode ? 'training' : 'scramble']);
      }
      if (!trainingMode) prefetchScramble(context);
      // The figures kept by the client are already shown (`displayed`); only the rest is shaped here.
      // Those come with their token, and without their value when the tab already holds it.
      const kept = new Set(['stats', 'profile', 'achievements', 'caseHistory']), tokens: Record<string, number> = {};
      const values = await Promise.all(Object.entries(jobs).map(async ([key, promise]) => [key, await promise] as const));
      const figures = Object.fromEntries(values.filter(([key]) => kept.has(key) && key !== 'stats').flatMap(([key, v]: readonly [string, any]) => { tokens[key] = v.token; return 'value' in v ? [[key, v.value]] : []; }));
      return new Shown({ ...display({ revision: q.revision, duels: JSON.parse(storage.getItem(DUELS_KEY) ?? '[]'), learned: local.learned(), learnedAlgs: local.learnedAlgs(), learningGroupOrder: local.learningGroupOrder(), journey: local.read.journey(), ...Object.fromEntries(values.filter(([key]) => !kept.has(key))) }), stats: values.find(([key]) => key === 'stats')![1], ...figures, tokens });
    }
    if (req.method === 'preference') { storage.setItem(req.args[0], JSON.stringify(req.args[1])); return true; }
    if (req.method === 'cubePreview') return cubePreview(req.args[0], req.args[1], req.args[2], true, req.args[3]);
    if (req.method === 'scramble') return await takeScramble(req.args[0]);
    if (req.method === 'dailyScramble') return await daily(req.args[0], req.args[1]);
    if (req.method === 'crossSolutions') return crossSolutions(req.args[0], req.args[1]);
    // A smart cube solve, split into its steps and its cases: here, off the page, after the solve was saved.
    if (req.method === 'analyseSolve') return analyseSolve(req.args[0], cases as unknown as CatalogCase[]);
    if (req.method === 'training') return training(req.args[0], req.args[1], req.args[2], req.args[3], req.args[4]);
    if (req.method === 'trainingCase') {
      const [c, useAuf] = req.args, size = puzzleInfo(c.puzzle_id ?? String(c.cube_size ?? 3).repeat(3)).cubeSize;
      const auf = useAuf && size ? randomAuf() : '';
      const setup = size ? combineAuf(c.setup, auf) : c.setup;
      return { setup, algorithm: size ? compensateAuf(executableAlg(c.algorithms[0]), auf) : executableAlg(c.algorithms[0]), svg: size ? caseSvg(size, setup, c.stage) : null };
    }
    if (req.method === 'addSolve') {
      // A timer solve that beats the all-time single, Ao5 or Ao12 of its context comes back with its praise.
      const body = req.args[0], solve = await local.api.addSolve(body);
      const record = body.caseId ? null : recordMessage(solveRecords((await local.api.solves('playground', Infinity, body.puzzle, body)).reverse(), solve.id));
      return { ...solve, record };
    }
    // One-on-one races: the account's token names the player, recent timer solves place them among the others.
    if (req.method === 'apiToken') return local.current().isGuest ? null : storage.getItem(tokenKey);
    if (req.method === 'duelLevel') {
      const [puzzle, solveMode] = req.args;
      return levelOf(await local.api.solves('playground', 12, puzzle, { solveMode, scrambleType: 'normal' }));
    }
    // Battles of this device, newest first: a race is kept once, updated if a penalty changes afterwards.
    if (req.method === 'duelRecord') {
      const next = keepRecord(JSON.parse(storage.getItem(DUELS_KEY) ?? '[]'), req.args[0]);
      storage.setItem(DUELS_KEY, JSON.stringify(next));
      return next;
    }
    if (req.method === 'sync') { await local.retry(); return local.status(); }
    // A solve of any session, by its id: a smart cube solve opened from a case it went through.
    if (req.method === 'solveById') return local.read.solve(req.args[0]);
    if (methods.has(req.method)) return await (local.api as any)[req.method](...req.args);
    throw new Error('Unknown engine method');
  }
  async function handle(req: EngineRequest) {
    try {
      const value = await run(req);
      emit({ id: req.id, value: value instanceof Shown ? value.value : display(value ?? null) }); connect();
    } catch (error) { emit({ id: req.id, error: (error as Error).message }); }
  }
  // Requests are handled one after another, like the solves they record.
  let queue = Promise.resolve();
  const retry = setInterval(() => { void local.restore(); connect(); }, 30000);
  void local.restore().then(connect);
  return {
    request: (req: EngineRequest) => { queue = queue.then(() => handle(req)); },
    stop() { clearInterval(retry); local.stop(); live.stop(); },
    /** A tab's message for the socket, past the queue of requests: a timer's phase cannot wait for a statistic. */
    send: (message: LiveMessage) => live.send(message),
    online: () => live.connected(),
  };
}
