/**
 * The account page: the user and their figures, then the practice cards, the whole overview inside the window.
 * Each practice card opens its own page.
 */
import { Award, BookA, BookOpen, CalendarDays, Flame, Layers, LogOut, Settings, Trophy, type LucideIcon } from "lucide-react";
import { store as s } from "./store";
import { fmtTime } from "../../src/client/lib/format";
import { Avatar, Button, InHead, MenuAction, MoreMenu, NUMERIC, PuzzleButton, SelectMenu, plural, usePhone } from "./ui";
import { TimerStats } from "./stats";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button as UiButton } from "@/components/ui/button";
import { Joined, SubPageHead } from "./profile/card";
import { Heatmap } from "./profile/heatmap";
import { AchievementsSection, BattlesSection, TimerSection, TrainingSection } from "./profile/sections";
import { AchievementsPage, BattlesPage, TrainingPage } from "./profile/pages";
import { useProfileData, type ProfileData } from "./profile/data";

const SECTIONS: Record<string, string> = {
  playground: "Timer",
  training: "Training",
  achievements: "Achievements",
  duels: "Battles",
};

/** The reading column: centred and capped like GitHub's, the page's padding around it. */
const COLUMN = "mx-auto w-full max-w-7xl px-6 xl:px-8";

/** The figures that sum up the practice, one line of equal cells. */
function Facts({ d, className }: { d: ProfileData; className?: string }) {
  const facts: [LucideIcon, string, string, string?][] = [
    [Layers, "Solves", d.totalSolves.toLocaleString()],
    [CalendarDays, "Active days", d.activeDays.toLocaleString()],
    [Flame, "Day streak", String(d.streak.current), d.streak.current ? "text-warning" : undefined],
    [BookOpen, "Cases learned", d.learned.toLocaleString(), "text-primary"],
    [Trophy, "Best single", d.timer.count ? fmtTime(d.timer.best) : "–", "text-success"],
    [Award, "Achievements", `${d.unlocked} / ${d.totalAchievements}`],
  ];
  return (
    <div className={cn("grid shrink-0 grid-cols-3 md:grid-cols-6", className)} aria-label="Summary">
      {facts.map(([I, label, value, tone], i) => (
        <div key={label} className={cn("flex min-w-0 flex-col gap-1.5 px-4 py-3 max-md:px-3", i % 3 && "border-l", i >= 3 && "max-md:border-t md:border-l")}>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <I className="size-3.5 shrink-0 max-md:hidden" />
            {label}
          </span>
          <span className={cn(NUMERIC, "truncate text-xl font-medium tracking-tight", value === "–" ? "text-muted-foreground/60" : tone)}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/** One line: the avatar, the name and when they joined (the level is in the journey); the profile's puzzle and settings on the right. */
function ProfileHeader({ phone }: { phone: boolean }) {
  const user = s.user;
  const joined = user?.joined ? `Joined ${user.joined}` : null;
  return (
    <header className="flex min-h-10 shrink-0 items-center gap-3">
      <Avatar name={user?.username} size={phone ? 44 : 40} />
      <div className={cn("flex min-w-0 flex-1 gap-x-3", phone ? "flex-col gap-y-0.5" : "items-baseline")}>
        <h1 className="min-w-0 shrink-0 truncate text-xl font-semibold tracking-tight">{user?.username}</h1>
        <p className="min-w-0 truncate text-sm text-muted-foreground">{joined}</p>
      </div>
      <InHead.Provider value={true}>
        <div className="flex shrink-0 items-center gap-2">
          <PuzzleButton profile />
          {phone ? (
            <MoreMenu>
              <MenuAction action="notation" icon={BookA}>
                Notation
              </MenuAction>
              <MenuAction action="help" icon={BookOpen}>
                Guides
              </MenuAction>
              <MenuAction action="settings" icon={Settings}>
                Settings
              </MenuAction>
            </MoreMenu>
          ) : (
            <Button action="settings" icon={Settings} tip="Settings" />
          )}
        </div>
      </InHead.Provider>
    </header>
  );
}

/** The joined panel: one frame, its sections split by shared lines like the figures along its top. */
const PANEL = "flex flex-col overflow-hidden rounded-xl border bg-card text-sm text-card-foreground";

/**
 * The overview fills the window without scrolling it: the user, then one panel: their figures; the year of practice
 * over the timer's curve; training, achievements and battles along the bottom.
 */
function Overview() {
  const d = useProfileData();
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-x-hidden overflow-y-auto">
      <ProfileHeader phone={false} />
      <Joined.Provider value={true}>
        {/* A short window scrolls the overview inside the page rather than squeezing the curve. */}
        <div data-tour="profile-overview" className={cn(PANEL, "min-h-[38rem] flex-1")}>
          <Facts d={d} className="border-b" />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b">
            <Heatmap solves={d.activity} latest={d.latest} phone={false} className="border-b" />
            <TimerSection d={d} phone={false} fill />
          </div>
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22rem] [&>*+*]:border-l">
            <TrainingSection d={d} compact />
            <AchievementsSection d={d} compact />
            <BattlesSection compact />
          </div>
        </div>
      </Joined.Provider>
    </div>
  );
}

/** Phones: the same sections one under the other in one panel, scrolling inside the page; signing out closes the list, centred. */
function PhoneOverview() {
  const d = useProfileData();
  return (
    <div className="flex flex-col gap-4">
      <ProfileHeader phone />
      <Joined.Provider value={true}>
        <div data-tour="profile-overview" className={cn(PANEL, "[&>*+*]:border-t")}>
          <Facts d={d} />
          <Heatmap solves={d.activity} latest={d.latest} phone />
          <TimerSection d={d} phone />
          <TrainingSection d={d} />
          <AchievementsSection d={d} />
          <BattlesSection />
        </div>
      </Joined.Provider>
      <div className="flex justify-center pb-2">
        <UiButton variant="ghost" data-action="logout" onClick={() => void s.action("logout")} className="text-muted-foreground hover:text-destructive">
          <LogOut />
          Log out
        </UiButton>
      </div>
    </div>
  );
}

function TimerPage({ phone }: { phone: boolean }) {
  const p = s.profile,
    count = p.playground?.summary?.count ?? 0;
  return (
    <>
      <SubPageHead title="Timer" meta={count ? plural(count, "solve") : undefined} back={!phone}>
        {!phone && <PuzzleButton profile />}
        <SelectMenu
          action="profileScramble"
          caption="Scramble"
          value={s.profileScramble}
          options={s.info(s.profilePuzzle).scrambles.map((id: string) => ({ id, label: s.label("scrambles", id) }))}
        />
      </SubPageHead>
      <TimerStats
        data={p.playground}
        empty={
          <>
            <span>No times in this selection yet.</span>
            <Button action="nav:playground" variant="outline">
              Open the timer
            </Button>
          </>
        }
      />
    </>
  );
}

function SubPage({ mode, phone }: { mode: string; phone: boolean }) {
  return mode === "playground" ? (
    <TimerPage phone={phone} />
  ) : mode === "training" ? (
    <TrainingPage phone={phone} />
  ) : mode === "achievements" ? (
    <AchievementsPage phone={phone} />
  ) : (
    <BattlesPage phone={phone} />
  );
}

/** The page on its way, shaped like it: the header, the graph and two columns of cards. */
function ProfileSkeleton({ phone }: { phone: boolean }) {
  return (
    <div className={cn(COLUMN, "flex flex-col gap-6 py-6", phone && "px-4 py-4")} aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-6">
        <Skeleton className="size-22 rounded-full max-md:size-14" />
        <div className="flex flex-1 flex-col gap-2.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
      </div>
      <Skeleton className="h-52 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl max-lg:hidden" />
      </div>
    </div>
  );
}

/** Account page: the overview, or one of its sections opened from it as a page of its own. */
export function Profile() {
  const phone = usePhone(),
    p = s.profile,
    mode = s.profileMode in SECTIONS ? s.profileMode : "overview";
  if (phone) return <PhoneProfile mode={mode} />;
  if (!p) return <ProfileSkeleton phone={false} />;
  return mode === "overview" ? (
    <section className={cn(COLUMN, "h-full min-h-0 py-5")} aria-label="Profile">
      <Overview />
    </section>
  ) : (
    <section className={cn(COLUMN, "profile-main flex h-full min-h-0 flex-col gap-4 py-5")} aria-label={SECTIONS[mode]}>
      <SubPage mode={mode} phone={false} />
    </section>
  );
}

/**
 * Phones: the sections as a segmented control on top; the overview scrolls under it, the other sections keep the
 * screen's height and scroll inside their card.
 */
function PhoneProfile({ mode }: { mode: string }) {
  const p = s.profile;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <Tabs value={mode} onValueChange={(v: string) => void s.action("profileMode:" + v)}>
          <TabsList className="h-10! w-full">
            {Object.entries({ overview: "Overview", ...SECTIONS, achievements: "Awards" }).map(([id, label]) => (
              <TabsTrigger key={id} value={id} data-action={"profileMode:" + id} className="px-1 text-[13px]">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {!p ? (
        <ProfileSkeleton phone />
      ) : mode === "overview" ? (
        <section className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-1 pb-4" aria-label="Profile">
          <PhoneOverview />
        </section>
      ) : (
        <section className="profile-main flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3" aria-label={SECTIONS[mode]}>
          <SubPage mode={mode} phone />
        </section>
      )}
    </div>
  );
}
