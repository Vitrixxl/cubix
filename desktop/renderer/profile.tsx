/**
 * The account page: who they are beside their year of practice, the chosen event's figures and curve,
 * then training, achievements and battles, the whole overview inside the window. Each section opens its own page.
 */
import { Activity, BookA, BookOpen, CalendarDays, Dumbbell, Flame, Layers, LogOut, Medal, Settings, type LucideIcon } from "lucide-react";
import { store as s } from "./store";
import { Avatar, Button, InHead, MenuAction, MoreMenu, NUMERIC, PuzzleButton, SelectMenu, plural, usePhone } from "./ui";
import { TimerStats } from "./stats";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button as UiButton } from "@/components/ui/button";
import { SubPageHead } from "./profile/card";
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

/** Who they are and how much they practise, every event together: the avatar and name, then three figures. */
function Identity({ d, phone }: { d: ProfileData; phone: boolean }) {
  const user = s.user,
    facts: [LucideIcon, string, string, string?, string?][] = [
      [Layers, "Solves", d.activity.length.toLocaleString()],
      [CalendarDays, "Active days", d.days.toLocaleString()],
      [Flame, "Streak", String(d.streak.current), d.streak.current ? "text-warning" : undefined],
      [Medal, "Best streak", String(d.streak.longest)],
      [Activity, "This week", d.week.toLocaleString()],
      [Dumbbell, "Trained", d.trainingSolves.toLocaleString()],
    ];
  return (
    <Card className={cn("min-w-0 justify-between gap-3 p-5", phone && "p-4")}>
      <div className="flex min-w-0 items-center gap-4">
        <Avatar name={user?.username} size={48} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="truncate text-xl font-semibold tracking-tight">{user?.username}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {user?.joined ? `Joined ${user.joined}` : null}
          </p>
        </div>
        {phone && (
          <InHead.Provider value={true}>
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
          </InHead.Provider>
        )}
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-3" aria-label="Summary">
        {facts.map(([I, label, value, tone, sub]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <I className="size-3.5 shrink-0" />
              {label}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className={cn(NUMERIC, "text-xl font-medium tracking-tight", value === "0" ? "text-muted-foreground/60" : tone)}>{value}</span>
              {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * The overview fills the window without scrolling it, as cards with room between them: who they are beside their year
 * of practice; the chosen event's figures and curve, its event picked in its title; training, achievements
 * and battles along the bottom.
 */
function Overview() {
  const d = useProfileData();
  return (
    /* A short window scrolls the overview inside the page rather than squeezing the curve. */
    <div data-tour="profile-overview" className="flex h-full min-h-[42rem] flex-col gap-4">
      <div className="grid shrink-0 grid-cols-[20rem_minmax(0,1fr)] gap-4 2xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Identity d={d} phone={false} />
        <Heatmap solves={d.activity} latest={d.latest} phone={false} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <TimerSection d={d} phone={false} fill />
      </div>
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_19rem] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22rem]">
        <TrainingSection d={d} compact />
        <AchievementsSection d={d} compact />
        <BattlesSection compact />
      </div>
    </div>
  );
}

/** Phones: the same cards one under the other, scrolling inside the page; signing out closes the list, centred. */
function PhoneOverview() {
  const d = useProfileData();
  return (
    <div data-tour="profile-overview" className="flex flex-col gap-3">
      <Identity d={d} phone />
      <TimerSection d={d} phone />
      <Heatmap solves={d.activity} latest={d.latest} phone />
      <TrainingSection d={d} />
      <AchievementsSection d={d} />
      <BattlesSection />
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

/** The page on its way, shaped like it: who they are beside the activity, the records beside the curve, three cards under them. */
function ProfileSkeleton({ phone }: { phone: boolean }) {
  return phone ? (
    <div className="flex flex-col gap-3 px-4 pt-1" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  ) : (
    <div className={cn(COLUMN, "flex h-full flex-col gap-4 py-5")} aria-busy="true" aria-label="Loading">
      <div className="grid shrink-0 grid-cols-[20rem_minmax(0,1fr)] gap-4 2xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <Skeleton className="rounded-xl" />
        <Skeleton className="rounded-xl" />
      </div>
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_19rem] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22rem]">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
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
    <section className={cn(COLUMN, "h-full min-h-0 overflow-x-hidden overflow-y-auto py-5")} aria-label="Profile">
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
