/**
 * The profile's sidebar on the desktop: who they are, the profile's pages, and under the open one its tree.
 * Statistics: the events played, the open one with each scramble type played on it; Training: the puzzles with sets,
 * the open one with its sets; Awards: the categories; Analysis: the scramble types turned on a connected cube. The
 * account's actions at its foot.
 */
import type React from "react";
import { Bluetooth, ChartLine, ChevronDown, ChevronRight, Ellipsis, FileJson, LogOut, Plus, Settings, Sheet, Swords, Target, Trophy, Upload, UserRound, type LucideIcon } from "lucide-react";
import { store as s } from "../store";
import { Avatar, Icon, MenuAction, NUMERIC, PuzzlePicker, ROW, SelectMenu, Surface, run } from "../ui";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EVENTS, PUZZLES, eventInfo, scrambleTypesOf } from "../../../src/shared/puzzles";
import { fmtResult } from "../../../src/client/lib/format";
import { level } from "../../../src/client/lib/achievements";
import type { EventRecordDto } from "../../../src/shared/types";
import { CATEGORIES } from "./sections";
import { MainCube } from "./journal";
import { WcaButton } from "./wca";
import { analysedScramble } from "./analysis";
import { battles, type ProfileData } from "./data";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

const PAGES: [mode: string, label: string, icon: LucideIcon][] = [
  ["overview", "Overview", UserRound],
  ["playground", "Statistics", ChartLine],
  ["training", "Training", Target],
  ["achievements", "Awards", Trophy],
  ["duels", "Battles", Swords],
  ["analysis", "Analysis", Bluetooth],
];

/** A row of the sidebar: a page, a puzzle of its tree, or a leaf (a scramble, a set, a category). */
function Row({ action, depth = 0, current, open, icon, label, value, count }: { action: string; depth?: 0 | 1 | 2; current?: boolean; open?: boolean; icon?: React.ReactNode; label: string; value?: string; count?: string | number }) {
  return (
    <button
      type="button"
      data-action={action}
      onClick={run(action)}
      aria-current={current ? "page" : undefined}
      className={cn(
        ROW,
        "relative flex w-full shrink-0 items-center gap-2.5 px-2.5 whitespace-nowrap",
        depth === 0 ? "h-10 text-[15px] font-bold text-muted-foreground aria-[current=page]:text-foreground [&>svg]:size-[18px]" : depth === 1 ? "h-9 pl-5 text-sm font-bold" : "h-8 pl-11 text-[13px] font-semibold text-muted-foreground aria-[current=page]:text-foreground",
        depth === 2 && current && "before:absolute before:left-8 before:h-4 before:w-1 before:rounded-full before:bg-primary",
        // An open page with a tree keeps its tint on the leaf chosen, not on itself.
        depth === 0 && open && "aria-[current=page]:bg-transparent [&>svg]:text-primary",
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{said(label)}</span>
      {value && <span className={cn(NUMERIC, "ml-auto text-foreground")}>{value}</span>}
      {count !== undefined && count !== "" && <span className={cn(NUMERIC, "min-w-10 shrink-0 text-right text-xs font-semibold text-muted-foreground", !value && "ml-auto")}>{typeof count === "number" ? count.toLocaleString() : count}</span>}
      {depth === 1 && open !== undefined && (open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />)}
    </button>
  );
}

/** The scramble types first by their place: normal (the WCA's) first, then the most played. */
const byPlay = (a: EventRecordDto, b: EventRecordDto) => Number(b.scrambleType === "normal") - Number(a.scrambleType === "normal") || b.count - a.count;

/** Statistics: every event with a solve (and the open one), the open one unfolded into its scramble types. */
function StatsTree({ d }: { d: ProfileData }) {
  const records = d.records,
    current = s.event(s.profilePuzzle, s.profileSolveMode).id,
    events = EVENTS.filter((e) => e.id === current || records.some((r) => r.event === e.id && r.count > 0)),
    types = scrambleTypesOf(s.profilePuzzle as any, s.profileSolveMode) as string[];
  return (
    <>
      {events.map((e) => {
        const own = records.filter((r) => r.event === e.id && r.count > 0),
          open = e.id === current,
          shown = open ? [...own].sort(byPlay) : [];
        // The scramble type chosen shows even before its first solve.
        if (open && !shown.some((r) => r.scrambleType === s.profileScramble)) shown.push({ event: e.id, scrambleType: s.profileScramble, count: 0, best: null } as EventRecordDto);
        return (
          <div key={e.id} className="contents">
            <Row action={`profileView:playground|${e.id}`} depth={1} open={open} icon={<Icon name={"Puzzle" + e.id} size={18} />} label={e.label} count={own.reduce((sum, r) => sum + r.count, 0)} />
            {shown.map((r) => (
              <Row
                key={r.scrambleType}
                action={`profileView:playground|${e.id}|${r.scrambleType}`}
                depth={2}
                current={s.profileMode === "playground" && r.scrambleType === s.profileScramble}
                label={s.label("scrambles", r.scrambleType)}
                value={r.best != null ? fmtResult(r.best, e.solveMode) : undefined}
                count={r.count}
              />
            ))}
          </div>
        );
      })}
      {/* An event or a scramble type never played yet. */}
      <div className="flex shrink-0 gap-1 pt-1 pl-4">
        <PuzzlePicker
          profile
          trigger={
            <UiButton variant="ghost" size="sm" className="text-muted-foreground">
              <Plus />
              {tr("Event")}
            </UiButton>
          }
        />
        {types.length > 1 && <SelectMenu action="profileScramble" value={s.profileScramble} variant="ghost" icon={<Plus />} label="Scramble" className="h-8 min-w-0 text-muted-foreground" options={types.map((id) => ({ id, label: s.label("scrambles", id) }))} />}
      </div>
    </>
  );
}

/** Training: the puzzles with sets, the open one unfolded into its sets with how many of their cases are trained. */
function TrainingTree() {
  const trained = new Set<string>((s.profile?.cases ?? []).map((c: any) => c.summary?.caseId));
  return (
    <>
      {PUZZLES.filter((p) => s.allSets(p.id).length).map((p) => {
        const open = p.id === s.profilePuzzle;
        return (
          <div key={p.id} className="contents">
            <Row action={open ? "profileSet:" : `profileView:training|${p.id}`} depth={1} open={open} current={open && !s.profileSet} icon={<Icon name={"Puzzle" + p.id} size={18} />} label={p.label} />
            {open &&
              s.allSets(p.id).map((set: any) => {
                const cases = s.setCases(set.id);
                return <Row key={set.id} action={"profileSet:" + set.id} depth={2} current={s.profileSet === set.id} label={set.label} count={`${cases.filter((c) => trained.has(c.id)).length} / ${cases.length}`} />;
              })}
          </div>
        );
      })}
    </>
  );
}

/** Awards: every category with how many of its achievements are unlocked. */
function AwardsTree() {
  const all: any[] = s.achievements?.achievements ?? [],
    count = (list: any[]) => `${list.filter((a) => a.unlocked).length} / ${list.length}`;
  return (
    <>
      {[{ id: "all", label: "All" }, ...CATEGORIES].map((c) => (
        <Row key={c.id} action={"achievementCategory:" + c.id} depth={2} current={s.achievementCategory === c.id} label={c.label} count={count(c.id === "all" ? all : all.filter((a) => a.category === c.id))} />
      ))}
    </>
  );
}

/** Analysis: the 3×3 scramble types turned on a connected cube, with how many solves each. */
function AnalysisTree() {
  const event = s.event("333", s.profileSolveMode).id,
    played: [string, number][] = s.smartAnalysis?.scrambles ?? [],
    chosen = analysedScramble(),
    shown = played.some(([id]) => id === chosen) ? played : [...played, [chosen, 0] as [string, number]];
  return (
    <>
      <Row action={`profileView:analysis|${event}`} depth={1} open icon={<Icon name={"Puzzle" + event} size={18} />} label={eventInfo(event)?.label ?? "3×3"} />
      {shown.map(([id, n]) => (
        <Row key={id} action={`profileView:analysis|${event}|${id}`} depth={2} current={id === chosen} label={s.label("scrambles", id)} count={n} />
      ))}
    </>
  );
}

const TREES: Record<string, (props: { d: ProfileData }) => React.ReactNode> = { playground: StatsTree, training: TrainingTree, achievements: AwardsTree, analysis: AnalysisTree };

/** Who they are: the face, the name with the WCA ID, the level and the streak, the main cube. */
function Identity({ streak }: { streak: number }) {
  const xp = s.xp ?? s.achievements?.xp ?? 0;
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border px-1 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={s.user?.username} size={44} className="rounded-[14px]" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate text-lg font-extrabold tracking-[-0.02em]">{s.user?.username}</p>
            <WcaButton />
          </div>
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {[tr("Level {0}", { 0: level(xp).level }), streak > 0 && tr("{0}-day streak", { 0: streak })].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <MainCube />
    </div>
  );
}

/** The account's actions: import, export, its settings, signing out. */
function AccountMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<UiButton variant="ghost" className="w-full shrink-0 justify-start text-muted-foreground" data-action="menu:profileAccount" />}>
        <Ellipsis />
        {tr("Import, export, account")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-auto min-w-60">
        <MenuAction action="importTimes" icon={Upload}>
          {tr("Import")}
        </MenuAction>
        <MenuAction action="exportSolves" icon={Sheet}>
          {tr("My solves, as a table (CSV)")}
        </MenuAction>
        <MenuAction action="exportData" icon={FileJson}>
          {tr("All my profile's data (JSON)")}
        </MenuAction>
        <DropdownMenuSeparator />
        <MenuAction action="settings" icon={Settings}>
          {tr("Account")}
        </MenuAction>
        <MenuAction action="logout" icon={LogOut}>
          {tr("Log out")}
        </MenuAction>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProfileNav({ d }: { d: ProfileData }) {
  const mode = s.profileMode,
    counts: Record<string, string | number> = {
      playground: d.records.reduce((sum, r) => sum + r.count, 0),
      achievements: s.achievements ? `${s.achievements.unlocked} / ${s.achievements.total}` : "",
      duels: battles().length,
      analysis: s.smartAnalysis?.count ?? "",
    },
    Tree = TREES[mode];
  return (
    <Surface className="flex w-52 shrink-0 flex-col gap-1 p-3 lg:w-64 xl:w-[17rem]">
      <Identity streak={d.streak.current} />
      <nav aria-label={tr("Profile pages")} className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pt-2">
        {PAGES.map(([id, label, I]) => (
          <div key={id} className="contents">
            <Row action={"profileMode:" + id} current={mode === id} open={mode === id && !!Tree} icon={<I />} label={label} count={counts[id]} />
            {mode === id && Tree && <Tree d={d} />}
          </div>
        ))}
      </nav>
      <AccountMenu />
    </Surface>
  );
}
