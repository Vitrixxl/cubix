/**
 * The achievements, as a journal: the categories on the left filter it; in the middle the unlocked ones month by
 * month, or those still to do from the closest to the furthest; on the right the one chosen, its series and what to
 * do next. Phones keep the journal, the chosen one opening in a sheet.
 */
import { useState } from "react";
import { BookOpen, Eye, Share2, Target, Timer, Trophy, type LucideIcon } from "lucide-react";
import { store as s } from "../store";
import { goPage } from "../navigation";
import { Back, Bar, Choice, Empty, FOCUS, Modal, NUMERIC, PageHead, SelectMenu, Surface, Tip, plural } from "../ui";
import { Button as UiButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { achievementKind, achievementSeries, isTimeGoal } from "../../../src/client/lib/achievements";
import { fmtTime } from "../../../src/client/lib/format";
import { eventOf, type PuzzleId } from "../../../src/shared/puzzles";
import { sets } from "../../../src/client/local/catalog";
import type { AchievementDto } from "../../../src/shared/types";
import { locale, tr } from "../../../src/client/i18n";
import { said } from "../base";
import { AchievementBadge, CATEGORIES, categoryOf } from "./sections";

type A = AchievementDto;

/** The series' names, after what they count. */
const SERIES: Record<string, string> = {
  single: "Single",
  ao5: "Average of 5",
  oh: "One-handed",
  bld: "Blindfolded",
  solves: "Solves",
  sets: "Algorithm sets",
  algorithms: "Algorithms learned",
  times: "Times recorded",
  drills: "Drills",
  days: "Active days",
  streak: "Streaks",
};
/** What a count goal counts, one at a time. */
const NOUN: Record<string, string> = { solves: "solve", times: "solve", drills: "solve", bld: "solve", days: "day", streak: "day", sets: "case", algorithms: "case" };

/** What is left to unlock it: "0.061 to go", "3 solves to go"; none before a first solve. */
function left(a: A) {
  if (a.unlocked) return "";
  if (isTimeGoal(a)) return a.progress ? tr("{0} to go", { 0: fmtTime(a.progress - a.target + 1) }) : tr("No solve yet");
  return tr("{0} to go", { 0: plural(a.target - a.progress, NOUN[achievementKind(a)] ?? "solve") });
}

/** What moves it on: the timer of its event, the training, or the algorithms of its set. */
function next(a: A): { label: string; icon: LucideIcon; action: string; go: () => void } {
  const kind = achievementKind(a),
    puzzle = a.puzzle as PuzzleId | undefined;
  if (kind === "sets") {
    const set = sets.find((v) => `learn:${v.id}` === a.id);
    return {
      label: tr("Learn {0}", { 0: said(set?.label ?? a.group) }),
      icon: BookOpen,
      action: "achievementGo:algorithms",
      go: () => {
        if (set) void s.action("set:" + set.id).then(() => goPage("algorithms", { puzzle }));
      },
    };
  }
  if (kind === "algorithms") return { label: tr("Algorithms"), icon: BookOpen, action: "nav:algorithms", go: () => void s.action("nav:algorithms") };
  if (kind === "drills") return { label: tr("Train"), icon: Target, action: "nav:training", go: () => void s.action("nav:training") };
  if (!puzzle) return { label: tr("Timer"), icon: Timer, action: "nav:playground", go: () => void s.action("nav:playground") };
  const event = eventOf(puzzle, kind === "oh" ? "one-handed" : kind === "bld" ? "blindfolded" : "standard");
  return { label: `${tr("Timer")} · ${said(event?.label ?? a.group)}`, icon: Timer, action: "puzzle:" + event?.id, go: () => void s.action("puzzle:" + (event?.id ?? puzzle)) };
}

const closest = (list: A[]) => list.filter((a) => !a.unlocked && a.ratio > 0).sort((x, y) => y.ratio - x.ratio);

export function AchievementsPage({ phone }: { phone: boolean }) {
  const all: A[] = s.achievements?.achievements ?? [],
    [category, setCategory] = useState("all"),
    [picked, setPicked] = useState(""),
    [sheet, setSheet] = useState(false),
    mode = s.achievementFilter === "locked" ? "locked" : "unlocked",
    // The profile's puzzle first, then the others in their order.
    groups = ([...new Set(all.map((a) => a.group))] as string[]).sort(
      (a, b) => Number(all.find((v) => v.group === b)?.puzzle === s.profilePuzzle) - Number(all.find((v) => v.group === a)?.puzzle === s.profilePuzzle),
    ),
    inGroup = all.filter((a) => s.achievementGroup === "all" || a.group === s.achievementGroup),
    pool = inGroup.filter((a) => (category === "all" || a.category === category) && a.unlocked === (mode === "unlocked")),
    unlocked = inGroup.filter((a) => a.unlocked).length,
    chosen = all.find((a) => a.id === picked) ?? (mode === "unlocked" ? latestFirst(pool)[0] : closestFirst(pool)[0]),
    pick = (a: A) => {
      setPicked(a.id);
      if (phone) setSheet(true);
    };
  const head = (
    <PageHead
      title={tr("Achievements")}
      sub={tr("{0} of {1} unlocked", { 0: s.achievements?.unlocked ?? 0, 1: s.achievements?.total ?? 0 })}
      lead={!phone && <Back action="profileMode:overview" label="Back to the profile" />}
    >
      {!phone && <Filters groups={groups} unlocked={unlocked} locked={inGroup.length - unlocked} />}
    </PageHead>
  );
  if (!s.achievements)
    return (
      <>
        {head}
        <Skeleton className="min-h-0 flex-1 rounded-[26px]" />
      </>
    );
  const journal = <Journal pool={pool} mode={mode} chosen={chosen} pick={pick} phone={phone} />;
  if (phone)
    return (
      <>
        {head}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Filters groups={groups} unlocked={unlocked} locked={inGroup.length - unlocked} />
          <SelectMenu
            action="achievementCategory"
            label="Category"
            value={category}
            onChange={setCategory}
            align="start"
            options={[{ id: "all", label: "All categories" }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label }))]}
          />
        </div>
        {journal}
        {chosen && (
          <Modal open={sheet} onOpenChange={setSheet} title={said(chosen.title)} hideHeader tall>
            <Detail a={chosen} all={all} pick={(a) => setPicked(a.id)} />
          </Modal>
        )}
      </>
    );
  return (
    <>
      {head}
      <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)_21rem] gap-4 xl:grid-cols-[15.5rem_minmax(0,1fr)_23rem]">
        <Categories items={inGroup} category={category} onChange={setCategory} />
        {journal}
        <Surface aria-label={tr("Achievement")} className="overflow-y-auto p-6">
          {chosen ? <Detail a={chosen} all={all} pick={(a) => setPicked(a.id)} /> : <Empty icon={Trophy} />}
        </Surface>
      </div>
    </>
  );
}

const latestFirst = (list: A[]) => [...list].sort((x, y) => (y.unlockedAt ?? "").localeCompare(x.unlockedAt ?? ""));
const closestFirst = (list: A[]) => [...list].sort((x, y) => y.ratio - x.ratio);

/** The puzzle and whether to show the unlocked ones or those still to do. */
function Filters({ groups, unlocked, locked }: { groups: string[]; unlocked: number; locked: number }) {
  return (
    <>
      <SelectMenu action="achievementGroup" value={s.achievementGroup} align="end" options={[{ id: "all", label: "All puzzles" }, ...groups.map((id) => ({ id, label: id }))]} />
      <Choice
        prefix="achievementFilter:"
        label={tr("Show")}
        value={s.achievementFilter === "locked" ? "locked" : "unlocked"}
        options={[
          { id: "unlocked", label: tr("Unlocked"), count: unlocked },
          { id: "locked", label: tr("To do"), count: locked },
        ]}
      />
    </>
  );
}

/** The categories as cards that filter the journal: each one's count, and a dot per achievement, coloured once unlocked. */
function Categories({ items, category, onChange }: { items: A[]; category: string; onChange: (id: string) => void }) {
  const card = (id: string, label: string, Icon: LucideIcon, colour: string, list: A[]) => {
    const done = list.filter((a) => a.unlocked).length;
    return (
      <button
        key={id}
        type="button"
        aria-pressed={category === id}
        data-action={"achievementCategory:" + id}
        onClick={() => onChange(id)}
        className={cn("grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 rounded-[18px] bg-card px-4 py-3 text-left transition-colors hover:bg-muted aria-pressed:bg-accent", FOCUS)}
      >
        <span className="flex size-8 items-center justify-center rounded-full text-background [&_svg]:size-4" style={{ background: colour }}>
          <Icon />
        </span>
        <b className="truncate text-sm font-bold">{said(label)}</b>
        <span className={cn(NUMERIC, "text-xs font-bold text-muted-foreground")}>
          {done} / {list.length}
        </span>
        {id === "all" ? (
          <Bar ratio={list.length ? done / list.length : 0} fill="bg-foreground" className="col-span-full" />
        ) : (
          <span className="col-span-full flex flex-wrap gap-[3px]" aria-hidden="true">
            {list.map((a) => (
              <i key={a.id} className={cn("size-[7px] rounded-full", !a.unlocked && "bg-muted-foreground/30")} style={a.unlocked ? { background: colour } : undefined} />
            ))}
          </span>
        )}
      </button>
    );
  };
  return (
    <nav aria-label={tr("Category")} className="-m-1 flex min-h-0 flex-col gap-2 overflow-y-auto p-1">
      {card("all", "All", Trophy, "var(--foreground)", items)}
      {CATEGORIES.map((c) =>
        card(
          c.id,
          c.label,
          c.icon,
          c.colour,
          items.filter((a) => a.category === c.id),
        ),
      )}
    </nav>
  );
}

const MONTH = () => new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }),
  DAY = () => new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" }),
  DATE = () => new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" });
/** How far from unlocked, the bands of the list still to do. */
const BANDS: [string, (a: A) => boolean][] = [
  ["Almost", (a) => a.ratio >= 0.9],
  ["On the way", (a) => a.ratio >= 0.5 && a.ratio < 0.9],
  ["Further", (a) => a.ratio > 0 && a.ratio < 0.5],
  ["Not started", (a) => a.ratio === 0],
];

/** The unlocked ones month by month, latest first (the sets learned, which keep no date, last); or those to do by distance. */
function Journal({ pool, mode, chosen, pick, phone }: { pool: A[]; mode: "locked" | "unlocked"; chosen: A | undefined; pick: (a: A) => void; phone: boolean }) {
  const sections: [string, A[]][] = [];
  if (mode === "unlocked") {
    const month = MONTH();
    for (const a of latestFirst(pool)) {
      const key = a.unlockedAt ? month.format(new Date(a.unlockedAt)) : tr("Without a date");
      const last = sections.at(-1);
      if (last?.[0] === key) last[1].push(a);
      else sections.push([key, [a]]);
    }
  } else {
    const sorted = closestFirst(pool);
    for (const [name, test] of BANDS) {
      const items = sorted.filter(test);
      if (items.length) sections.push([tr(name), items]);
    }
  }
  const day = DAY();
  return (
    <Surface aria-label={mode === "unlocked" ? tr("Your journal") : tr("To unlock")} className="flex flex-col pt-5 pl-6 max-md:pt-4 max-md:pl-4">
      <header className="flex shrink-0 items-baseline gap-3 pr-6 max-md:pr-4">
        <h2 className="text-lg font-extrabold tracking-tight">{mode === "unlocked" ? tr("Your journal") : tr("To unlock")}</h2>
        <span className={cn(NUMERIC, "truncate text-sm font-semibold text-muted-foreground")}>
          {mode === "unlocked" ? tr("{0} achievements, latest first", { 0: pool.length }) : tr("{0} achievements, closest first", { 0: pool.length })}
        </span>
      </header>
      {!pool.length ? (
        <Empty icon={Trophy} title={mode === "unlocked" ? tr("Nothing unlocked here yet. Keep practising!") : tr("Everything here is unlocked.")} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-6 pb-5 max-md:pr-4">
          {sections.map(([name, items]) => (
            <section key={name} className="pt-4 first:pt-3">
              <h3 className="flex items-baseline gap-2.5 pb-2.5 text-[15px] font-extrabold first-letter:uppercase">
                {name}
                <span className={cn(NUMERIC, "text-[13px] font-semibold text-muted-foreground")}>{plural(items.length, "achievement")}</span>
              </h3>
              <div className={cn("grid gap-2", phone ? "grid-cols-3" : "grid-cols-[repeat(auto-fill,minmax(8.25rem,1fr))]")}>
                {items.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={!phone && chosen?.id === a.id}
                    data-action={"achievement:" + a.id}
                    onClick={() => pick(a)}
                    className={cn(
                      "flex min-w-0 flex-col items-center gap-1 rounded-[18px] bg-background px-2 pt-3.5 pb-3 text-center transition-colors hover:bg-muted aria-pressed:bg-accent",
                      FOCUS,
                    )}
                  >
                    <AchievementBadge a={a} size={phone ? 48 : 56} className="mb-1" />
                    <b className="line-clamp-2 text-sm leading-tight font-bold max-md:text-[13px]">{said(a.title)}</b>
                    <small className="text-xs font-semibold text-muted-foreground">{said(a.group)}</small>
                    <small className={cn(NUMERIC, "text-xs font-semibold", a.unlocked ? "text-muted-foreground" : "text-primary")}>
                      {a.unlocked ? (a.unlockedAt ? day.format(new Date(a.unlockedAt)) : tr("Unlocked")) : left(a)}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Surface>
  );
}

/** One achievement in full: its badge, what it asks, where it stands, its whole series and the closest ones of its category. */
function Detail({ a, all, pick }: { a: A; all: A[]; pick: (a: A) => void }) {
  const category = categoryOf(a),
    series = all.filter((x) => achievementSeries(x) === achievementSeries(a)),
    following = series.find((x) => !x.unlocked),
    go = next(a),
    time = isTimeGoal(a),
    count = a.detail.split(" / ")[0],
    facts: [string, string][] = a.unlocked
      ? [
          ...(a.unlockedAt ? [[tr("Unlocked on"), DATE().format(new Date(a.unlockedAt))] as [string, string]] : []),
          [time ? tr("Your best") : tr("Your count"), time ? fmtTime(a.progress) : `${count} / ${a.target.toLocaleString()}`],
        ]
      : [
          [tr("Where you are"), time ? fmtTime(a.progress, { blank: "–" }) : `${count} / ${a.target.toLocaleString()}`],
          [tr("Still to go"), time ? (a.progress ? fmtTime(a.progress - a.target + 1) : "–") : plural(a.target - a.progress, NOUN[achievementKind(a)] ?? "solve")],
        ],
    nearby = closest(all.filter((x) => x.category === a.category && x.id !== a.id && x.id !== following?.id)).slice(0, 2);
  return (
    <div className="flex flex-col">
      <div className="flex justify-center pt-1 pb-4">
        <AchievementBadge a={a} size={120} />
      </div>
      <h2 className="text-center text-[28px] leading-tight font-extrabold tracking-[-0.03em]">{said(a.title)}</h2>
      <p className="mt-0.5 text-center text-sm font-semibold text-muted-foreground">
        {said(a.group)} · {said(category.label)}
      </p>
      <p className="mx-2 mt-3 text-center text-[15px] text-balance text-muted-foreground">{said(a.description)}</p>
      <dl className={cn("mt-5 grid gap-2", facts.length > 1 && "grid-cols-2")}>
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-background px-3.5 py-2.5">
            <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
            <dd className={cn(NUMERIC, "text-lg font-extrabold")}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2.5 flex gap-2 [&>*]:flex-1">
        {a.unlocked ? (
          a.solveId != null && (
            <>
              <UiButton variant="outline" data-action={"solve:" + a.solveId} onClick={() => void s.action("solve:" + a.solveId)}>
                <Eye />
                {tr("View the solve")}
              </UiButton>
              <UiButton variant="outline" data-action={"share:" + a.solveId} onClick={() => void s.action("share:" + a.solveId)}>
                <Share2 />
                {tr("Share")}
              </UiButton>
            </>
          )
        ) : (
          <UiButton data-action={go.action} onClick={go.go}>
            <go.icon />
            {go.label}
          </UiButton>
        )}
      </div>
      {series.length > 1 && (
        <section className="mt-6 flex flex-col gap-3">
          <h3 className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">{tr("The series · {0}", { 0: `${said(SERIES[achievementKind(a)] ?? "")} ${said(a.group)}` })}</h3>
          <div className="-mx-1 flex flex-wrap gap-1">
            {series.map((x) => (
              <Tip
                key={x.id}
                content={
                  <span className="flex flex-col gap-0.5">
                    <b>{said(x.title)}</b>
                    <span>{x.unlocked ? (x.unlockedAt ? tr("Unlocked on") + " " + DATE().format(new Date(x.unlockedAt)) : tr("Unlocked")) : `${said(x.detail)} · ${left(x)}`}</span>
                  </span>
                }
              >
                <UiButton variant="ghost" size="icon" aria-label={said(x.title)} aria-pressed={x.id === a.id} data-action={"achievement:" + x.id} onClick={() => pick(x)} className="aria-pressed:bg-accent">
                  <AchievementBadge a={x} size={38} />
                </UiButton>
              </Tip>
            ))}
          </div>
          {following && following.id !== a.id && <NextRow a={following} title={tr("Next: {0}", { 0: said(following.title) })} pick={pick} />}
        </section>
      )}
      {!!nearby.length && (
        <section className="mt-6 flex flex-col gap-2.5">
          <h3 className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">{tr("Closest in {0}", { 0: said(category.label) })}</h3>
          {nearby.map((x) => (
            <NextRow key={x.id} a={x} title={`${said(x.title)} · ${said(x.group)}`} pick={pick} />
          ))}
        </section>
      )}
    </div>
  );
}

/** A locked achievement to work on: its badge and what is left, which open it, and the way to move it on beside. */
function NextRow({ a, title, pick }: { a: A; title: string; pick: (a: A) => void }) {
  const go = next(a);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        data-action={"achievement:" + a.id}
        onClick={() => pick(a)}
        className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-background px-3.5 py-3 text-left transition-colors hover:bg-muted", FOCUS)}
      >
        <AchievementBadge a={a} size={40} />
        <span className="flex min-w-0 flex-col">
          <b className="truncate text-sm font-bold">{title}</b>
          <small className={cn(NUMERIC, "truncate text-[13px] font-bold text-primary")}>{left(a)}</small>
        </span>
      </button>
      <UiButton variant="outline" data-action={go.action} onClick={go.go} aria-label={go.label}>
        <go.icon />
        {go.label.split(" · ")[0]}
      </UiButton>
    </div>
  );
}
