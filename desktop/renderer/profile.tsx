/**
 * The account page, laid out like a GitHub profile: the user on top, the year of practice under it, then the timer,
 * training, achievements and battles as cards built the same way. Each card opens its own page.
 */
import type { ReactNode } from "react";
import { BookA, BookOpen, CalendarDays, Flame, Layers, LogOut, Settings, Trophy, type LucideIcon } from "lucide-react";
import { store as s } from "./store";
import { fmtTime } from "../../src/client/lib/format";
import { Avatar, Button, InHead, MenuAction, MoreMenu, PuzzleButton, SelectMenu, plural, usePhone } from "./ui";
import { TimerStats } from "./stats";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Num, SubPageHead } from "./profile/card";
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

/** One fact of the header: an icon, the figure, its noun. */
function Fact({ icon: I, value, children }: { icon: LucideIcon; value: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <I className="size-4" />
      <Num>{value}</Num>
      {children}
    </span>
  );
}

/** The user: a large avatar, the name, when they joined, and the few figures that sum up their practice. */
function ProfileHeader({ d, phone }: { d: ProfileData; phone: boolean }) {
  const user = d.user,
    event = s.event(s.profilePuzzle, s.profileSolveMode);
  const facts = (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
      <Fact icon={Layers} value={d.totalSolves.toLocaleString()}>
        {d.totalSolves === 1 ? "solve" : "solves"}
      </Fact>
      <Fact icon={CalendarDays} value={d.activeDays.toLocaleString()}>
        active {d.activeDays === 1 ? "day" : "days"}
      </Fact>
      <Fact icon={Flame} value={d.streak.current}>
        day streak
      </Fact>
      <Fact icon={BookOpen} value={d.learned}>
        cases learned
      </Fact>
      <Fact icon={Trophy} value={d.timer.count ? fmtTime(d.timer.best) : "–"}>
        best single
      </Fact>
    </div>
  );
  const actions = (
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
            <DropdownMenuSeparator />
            <MenuAction action="logout" icon={LogOut}>
              Sign out
            </MenuAction>
          </MoreMenu>
        ) : (
          <Button action="settings" icon={Settings} tip="Settings" />
        )}
      </div>
    </InHead.Provider>
  );
  const joined = !user?.isGuest && user?.joined ? `Joined ${user.joined}` : null;
  return phone ? (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={user?.username} size={56} />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="max-w-full shrink-0 truncate text-xl font-semibold tracking-tight">{user?.username}</h1>
          <p className="truncate text-sm text-muted-foreground">{joined ?? event.label}</p>
        </div>
        {actions}
      </div>
      {facts}
    </header>
  ) : (
    <header className="flex items-center gap-6">
      <Avatar name={user?.username} size={88} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="max-w-full shrink-0 truncate text-2xl font-semibold tracking-tight">{user?.username}</h1>
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {joined && <>{joined} · </>}
            {event.label}
          </p>
        </div>
        {facts}
      </div>
      <div className="self-start pt-1">{actions}</div>
    </header>
  );
}

/** The overview: the user, the year of practice, then the timer beside training, achievements and battles. */
function Overview({ phone }: { phone: boolean }) {
  const d = useProfileData();
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ProfileHeader d={d} phone={phone} />
      <Heatmap solves={d.activity} latest={d.latest} phone={phone} />
      {phone ? (
        <>
          <TimerSection d={d} phone />
          <TrainingSection d={d} />
          <AchievementsSection d={d} />
          <BattlesSection />
        </>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <TimerSection d={d} phone={false} />
            <div className="flex min-w-0 flex-col gap-6 *:last:flex-1">
              <TrainingSection d={d} />
              <BattlesSection />
            </div>
          </div>
          <AchievementsSection d={d} wide />
        </>
      )}
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
    <div className="h-full min-h-0 overflow-y-auto">
      <div className={cn(COLUMN, "py-6")}>
        <Overview phone={false} />
      </div>
    </div>
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
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4">
          <Overview phone />
        </div>
      ) : (
        <section className="profile-main flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3" aria-label={SECTIONS[mode]}>
          <SubPage mode={mode} phone />
        </section>
      )}
    </div>
  );
}
