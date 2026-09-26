/** Cubix data engine, independent of its host: the web app runs it in a Web Worker,
 * the archived GPUI reference in a Bun process (engine/main.ts).
 * Reusing the shared client preserves its local-first synchronization and HTTP/WS protocol.
 */
import { cubePreview } from './cubePreview';
import { createLocalClient } from '../../src/client/local/client';
import { createApiClient } from '../../src/client/api-client';
import { applyAlg, combineAuf, compensateAuf, randomAuf, solved } from '../../src/shared/cube';
import { executableAlg, maskForStage } from '../../src/client/lib/caseState';
import { StaticCubeSvg } from '../../src/client/diagrams/StaticCubeSvg';
import { viewForStage } from '../../src/shared/cubeDiagram';
import { createElement } from 'react';
import { cases } from '../../src/client/local/catalog';
import { EMPTY_TRAINING_HISTORY, trainingHistoryReducer, type TrainingHistory } from '../../src/client/lib/trainingHistory';
import { renderToStaticMarkup } from 'react-dom/server';
import { puzzleInfo, type PracticeContext, type PuzzleId } from '../../src/shared/puzzles';
import { fmtDate } from '../../src/client/lib/format';
import { recordMessage, solveRecords } from '../../src/client/lib/personalBest';
import { generatePracticeScramble, type ScrambleEngine } from '../../src/client/lib/practiceScrambleCore';
import type { CaseDto } from '../../src/shared/types';

export interface EngineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Every stored preference, sent to the renderer at start-up. */
  all(): Record<string, string>;
}
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
  let live: ReturnType<typeof local.api.connectLive> | undefined;
  let liveToken: string | null = null, reconnect: ReturnType<typeof setTimeout> | undefined;
  function connect() {
    const token = storage.getItem(tokenKey); if (token === liveToken && live) return;
    live?.close(); live = undefined; liveToken = token;
    if (!token || local.current().isGuest) return;
    live = local.api.connectLive(); const current = live;
    current.on('open', () => current.send({ type: 'auth', token }));
    current.on('message', ({ data }) => {
      if (live !== current) return;
      if (data.type === 'ready') { emit({ event: 'live', value: 'online' }); void local.reconnected(); }
      // Another device of this account changed practice data; pull it before the next periodic restore.
      if (data.type === 'sync') void local.remoteChanged(data.cursor);
    });
    current.on('close', () => { if (live !== current) return; live = undefined; emit({ event: 'live', value: 'connecting' }); reconnect = setTimeout(connect, 3000); });
    current.on('error', () => {});
  }
  let lastAdvance: { key: string; promise: Promise<Record<string, unknown>> } | undefined;
  // One scramble per context is generated ahead, so asking for a new one answers without waiting for the search.
  const nextScrambles = new Map<string, Promise<string>>();
  const scrambleKey = (context: PracticeContext) => `${context.puzzle}:${context.solveMode}:${context.scrambleType}`;
  function prefetchScramble(context: PracticeContext) {
    const key = scrambleKey(context);
    if (nextScrambles.has(key)) return;
    const promise = generatePracticeScramble(context, scrambles);
    promise.catch(() => { if (nextScrambles.get(key) === promise) nextScrambles.delete(key); });
    nextScrambles.set(key, promise);
  }
  function takeScramble(context: PracticeContext) {
    const key = scrambleKey(context), ready = nextScrambles.get(key) ?? generatePracticeScramble(context, scrambles);
    nextScrambles.delete(key);
    prefetchScramble(context);
    return ready;
  }
  const caseSvg = (size: number, setup: string, stage: CaseDto['stage']) =>
    renderToStaticMarkup(createElement(StaticCubeSvg, { state: applyAlg(solved(size), setup), size: 300, mask: maskForStage(stage), view: viewForStage(stage) }));
  const trainingHistories = new Map<string, TrainingHistory>();
  function training(action: string, puzzle: PuzzleId, ids: string[], useAuf: boolean, solveMode: string) {
    const key = `${puzzle}:${solveMode}`;
    const pool = cases.filter(c => ids.includes(c.id));
    const before = trainingHistories.get(key) ?? EMPTY_TRAINING_HISTORY;
    const size = puzzleInfo(puzzle).cubeSize;
    const history = trainingHistoryReducer(before, action === 'previous' ? { type: 'previous' } : { type: 'next', pool, sample: Math.random(), auf: useAuf && size ? randomAuf() : '' });
    trainingHistories.set(key, history);
    const entry = history.entries[history.index];
    if (!entry) return null;
    const { c, auf } = entry, setup = size ? combineAuf(c.setup, auf) : c.setup;
    return { id: c.id, canPrevious: history.index > 0, setup, algorithm: size ? compensateAuf(executableAlg(c.algorithms[0]), auf) : executableAlg(c.algorithms[0]), svg: size ? caseSvg(size, setup, c.stage) : null };
  }
  function display(v: any): any {
    if (Array.isArray(v)) return v.map(display);
    if (v && typeof v === 'object') {
      const out = Object.fromEntries(Object.entries(v).map(([k, v]) => [k, display(v)]));
      if (typeof v.at === 'string') out.displayDate = fmtDate(v.at);
      if (typeof v.createdAt === 'string') out.displayDate = fmtDate(v.createdAt);
      if (typeof v.createdAt === 'string' && v.username) out.joined = new Date(v.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      if (typeof v.unlockedAt === 'string') out.unlockedDate = new Date(v.unlockedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      return out;
    }
    return v;
  }
  const methods = new Set(Object.keys(local.api).filter(k => !['connectLive'].includes(k)));
  async function run(req: EngineRequest): Promise<unknown> {
    if (req.method === 'init') return { protocol: 2, user: local.current(), storage: storage.all(), origin, learned: local.learned(), learningGroupOrder: local.learningGroupOrder() };
    if (req.method === 'snapshot') {
      const q = req.args[0], context = q.context;
      const trainingMode = q.page === 'training';
      const filter = { solveMode: context.solveMode };
      const jobs: Record<string, Promise<unknown>> = {
        solves: local.api.solves(trainingMode ? 'training' : 'playground', 1000, context.puzzle, context),
        stats: local.api.stats(context.puzzle, filter),
      };
      if (q.page === 'profile') { jobs.profile = local.api.profile(undefined, undefined, q.profilePuzzle, q.profileFilter); jobs.achievements = local.api.achievements(); }
      if (q.caseId) jobs.caseHistory = local.api.caseHistory(q.caseId, filter);
      if (q.advance) {
        if (!lastAdvance || lastAdvance.key !== q.advanceKey) lastAdvance = { key: q.advanceKey, promise: trainingMode ? Promise.resolve({ training: training('next', context.puzzle, q.selected, q.randomAuf, context.solveMode) }) : takeScramble(context).then(scramble => ({ scramble })) };
        jobs[trainingMode ? 'training' : 'scramble'] = lastAdvance.promise.then(v => v[trainingMode ? 'training' : 'scramble']);
      }
      if (!trainingMode) prefetchScramble(context);
      return { revision: q.revision, learned: local.learned(), learningGroupOrder: local.learningGroupOrder(), ...Object.fromEntries(await Promise.all(Object.entries(jobs).map(async ([key, promise]) => [key, await promise]))) };
    }
    if (req.method === 'preference') { storage.setItem(req.args[0], JSON.stringify(req.args[1])); return true; }
    if (req.method === 'cubePreview') return cubePreview(req.args[0], req.args[1], req.args[2]);
    if (req.method === 'scramble') return await takeScramble(req.args[0]);
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
    if (req.method === 'sync') { await local.retry(); return local.status(); }
    if (methods.has(req.method)) return await (local.api as any)[req.method](...req.args);
    throw new Error('Unknown engine method');
  }
  async function handle(req: EngineRequest) {
    try {
      const value = await run(req);
      emit({ id: req.id, value: display(value ?? null) }); connect();
    } catch (error) { emit({ id: req.id, error: (error as Error).message }); }
  }
  // Requests are handled one after another, like the solves they record.
  let queue = Promise.resolve();
  const retry = setInterval(() => { void local.restore(); connect(); if (live?.ws.readyState === WebSocket.OPEN) live.send({ type: 'ping' }); }, 30000);
  void local.restore().then(connect);
  return {
    request: (req: EngineRequest) => { queue = queue.then(() => handle(req)); },
    stop() { clearInterval(retry); clearTimeout(reconnect); local.stop(); live?.close(); },
  };
}
