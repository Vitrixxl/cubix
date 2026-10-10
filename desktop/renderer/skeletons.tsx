/**
 * Each page on its way, shaped like it: drawn while its code or its data loads (app.tsx, profile.tsx), so the page fills
 * in place instead of jumping from a generic shape. Every block keeps the page's own sizes (its columns, its cards, its
 * bars of controls), in the page's surfaces. Kept light: no page module is imported here.
 */
import { store as s } from "./store";
import { PAGE } from "./base";
import { coaching } from "./coaching/client";
import { tr } from "../../src/client/i18n";
import { cn } from "@/lib/utils";
import { Skeleton as Bone } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header, NarrowSectionTabs, PhoneTop, shownRoute, TabBar, TIP_DELAY } from "./shell";

const BUSY = { "aria-busy": true } as const;
/** A surface of the page (base.tsx Surface). */
const CARD = "flex min-h-0 flex-col rounded-[26px] bg-card";
/** A control's height: a button, a field, a segmented choice (larger on phones). */
const H = "h-9 max-md:h-11";
const ICON = "size-9 max-md:size-11";
const times = (n: number) => Array.from({ length: n }, (_, i) => i);

function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(PAGE, className)} {...BUSY} aria-label={tr("Loading")}>
      {children}
    </div>
  );
}

/** The page header (base.tsx PageHead): the way back, the title and its line, the controls. */
function Head({ back, title = "w-32", sub, children }: { back?: boolean; title?: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="flex min-h-10 shrink-0 items-center justify-between gap-x-2 md:justify-start md:gap-x-6">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        {back && <Bone className={cn(ICON, "shrink-0")} />}
        <div className="flex min-w-0 items-baseline gap-2 md:gap-3">
          <Bone className={cn("h-7 shrink-0 md:h-8", title)} />
          {sub && <Bone className={cn("h-4 min-w-0", sub)} />}
        </div>
      </div>
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </header>
  );
}

/** The puzzle's pill, in the phone's page header. */
const Puzzle = () => <Bone className={cn(H, "w-[6.4rem]")} />;

/** A pane's head (tournaments/format.tsx PanelHead, base.tsx SectionHead): its title, its count. */
function PaneHead({ w = "w-28", children, className }: { w?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-8 shrink-0 items-center gap-2", className)}>
      <Bone className={cn("h-6", w)} />
      {children && <div className="ml-auto flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  );
}

/** Rows of a list: a round avatar and two lines (base.tsx ListSkeleton's rows, without its own padding). */
function Rows({ n, avatar = "size-8", className }: { n: number; avatar?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {times(n).map((i) => (
        <div key={i} className="flex items-center gap-3 px-2.5 py-2.5">
          <Bone className={cn("shrink-0 rounded-full", avatar)} />
          <div className="flex flex-1 flex-col gap-1.5">
            <Bone className="h-4 w-1/3" />
            <Bone className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Figures in a row: a caption over a value (StatCard, StageFigure). */
function Figure({ center, value = "h-7 w-20", className }: { center?: boolean; value?: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", center && "items-center", className)}>
      {!center && <Bone className="h-3.5 w-14" />}
      <Bone className={value} />
      {center && <Bone className="h-3.5 w-14" />}
    </div>
  );
}

/** The middle of the Challenges (tournaments/format.tsx Stage): its action, a line, its figures. */
function Stage({ figures = 3, kicker, className }: { figures?: number; kicker?: boolean; className?: string }) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col items-center justify-center gap-5 md:gap-8", className)}>
      <div className="flex flex-col items-center gap-3 md:gap-4">
        {kicker && <Bone className="h-4 w-48" />}
        {kicker && <Bone className="h-9 w-[min(100%,30rem)]" />}
        <Bone className="h-[61px] w-56 rounded-xl" />
      </div>
      <Bone className="h-4 w-80 max-w-full" />
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 md:gap-x-12">
        {times(figures).map((i) => <Figure key={i} center value="h-8 w-20" />)}
      </div>
    </section>
  );
}

/**
 * The timer (practice.tsx): on the desktop the scramble with its pills and buttons on the right, the digits, the last
 * five, the penalties and the four figures along the foot, the session beside; on a phone the title and the puzzle,
 * the stage as one card with its tools under it, the figures in a bar.
 */
export function TimerSkeleton({ phone, training }: { phone: boolean; training?: boolean }) {
  const digits = (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
      <Bone className="h-36 w-[min(19rem,80%)] rounded-[26px] max-md:h-24" />
      <Bone className="mt-5 h-5 w-56" />
      {!training && <div className="mt-7 flex gap-1.5 max-md:mt-5">{times(5).map((i) => <Bone key={i} className="h-9 w-20 rounded-[10px] max-md:w-14" />)}</div>}
    </div>
  );
  if (phone)
    return (
      <Page>
        <Head back={training} title="w-24">
          {training ? <Bone className={ICON} /> : <Puzzle />}
          <Bone className={cn(H, "w-12")} />
        </Head>
        <div className={cn(CARD, "flex-1 overflow-hidden")}>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-4">
            {training && <Bone className="size-16 rounded-[18px]" />}
            <Bone className="h-7 w-11/12" />
            <Bone className="h-7 w-3/5" />
            {digits}
          </div>
          <div className="grid shrink-0 grid-cols-5 gap-1 px-2 pt-1 pb-2">
            {times(5).map((i) => (
              <div key={i} className="flex h-[52px] flex-col items-center justify-center gap-1.5">
                <Bone className="size-5" />
                <Bone className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex h-16 shrink-0 items-center gap-4 rounded-[20px] bg-card px-5">
          {times(3).map((i) => <Figure key={i} value="h-4 w-10" className="flex-1 gap-1.5" />)}
          <Bone className="h-5 w-20" />
        </div>
      </Page>
    );
  return (
    <Page>
      <div className="flex min-h-0 flex-1 gap-6 xl:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:gap-5">
          <div className="flex min-h-0 flex-1 flex-col pb-1">
            {training ? (
              <>
                <div className="flex shrink-0 items-center gap-3">
                  <Bone className="size-9" />
                  <Bone className="h-8 w-28" />
                  <Bone className="h-4 w-40" />
                  <Bone className="ml-2 h-9 w-32" />
                  {times(3).map((i) => <Bone key={i} className="size-9" />)}
                </div>
                <div className="mt-5 flex shrink-0 items-start gap-5">
                  <Bone className="size-28 shrink-0 rounded-[22px]" />
                  <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">
                    <Bone className="h-7 w-64" />
                    <Bone className="h-8 w-80" />
                    <div className="flex gap-1.5">{["w-36", "w-24", "w-28", "w-28"].map((w, i) => <Bone key={i} className={cn("h-9", w)} />)}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex shrink-0 items-start gap-6">
                <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                  <Bone className="h-9 w-11/12" />
                  <Bone className="h-9 w-2/3" />
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {["w-[151px]", "w-28", "w-36", "w-9", "w-11", "w-9", "w-9", "w-11"].map((w, i) => <Bone key={i} className={cn("h-9", w)} />)}
                </div>
              </div>
            )}
            {digits}
          </div>
          <div className="flex shrink-0 flex-col gap-3">
            <div className="flex gap-2">
              {times(4).map((i) => <Bone key={i} className="h-9 flex-1" />)}
              {training ? ["w-36", "w-32"].map((w) => <Bone key={w} className={cn("h-9", w)} />) : <Bone className="size-9" />}
            </div>
            {training ? (
              <div className="flex h-[104px] items-center gap-4 rounded-[20px] bg-card px-5">
                <Bone className="h-4 w-16" />
                <Bone className="size-[72px] rounded-[16px]" />
                <div className="ml-auto flex flex-col items-end gap-2">
                  <Bone className="h-5 w-24" />
                  <Bone className="h-3.5 w-16" />
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                {times(4).map((i) => (
                  <div key={i} className="flex h-[104px] min-w-0 flex-1 flex-col justify-between rounded-[20px] bg-card px-5 py-4">
                    <Bone className="h-3.5 w-14" />
                    <Bone className="h-6 w-20" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <aside className={cn(CARD, "w-64 shrink-0 overflow-hidden xl:w-68")}>
          <div className="flex shrink-0 items-center gap-2 px-5 pt-5 pb-3">
            <Bone className="h-6 w-28" />
            <Bone className="ml-auto size-9" />
            <Bone className="size-9" />
          </div>
          {training && (
            <div className="grid shrink-0 grid-cols-4 gap-1.5 px-3 pb-3">{times(4).map((i) => <Bone key={i} className="h-12 rounded-[14px]" />)}</div>
          )}
          <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-5 pb-5">
            {times(training ? 4 : 12).map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Bone className="h-4 w-8" />
                <Bone className="h-4 w-16" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Page>
  );
}

/** The shell on its way (before the introduction is known): the app's own header and tab bar over the page's shape. */
export function AppSkeleton({ phone }: { phone: boolean }) {
  return (
    <TooltipProvider delay={TIP_DELAY}>
      <div className="flex h-svh flex-col overflow-hidden">
        {phone ? <PhoneTop /> : <><Header /><NarrowSectionTabs /></>}
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 flex flex-col">
            <PageFallback phone={phone} />
          </div>
        </div>
        {phone && <TabBar />}
      </div>
    </TooltipProvider>
  );
}

/** The settings (overlays.tsx) asked for before their code is there: the dialog with its account and its groups. */
export function SettingsSkeleton({ phone }: { phone: boolean }) {
  return (
    <div className={cn("fixed inset-0 z-50 flex bg-black/45", phone ? "items-end" : "items-center justify-center p-6")} {...BUSY} aria-label={tr("Loading")}>
      <div className={cn("flex w-full flex-col gap-6 bg-card p-6", phone ? "h-[calc(100dvh-5rem)] rounded-t-[26px]" : "max-w-lg rounded-[26px]")}>
        <Bone className="h-7 w-28" />
        <div className="flex items-center gap-3 rounded-[20px] bg-muted p-3"><Bone className="size-11 rounded-full bg-card" /><div className="flex flex-1 flex-col gap-2"><Bone className="h-5 w-24 bg-card" /><Bone className="h-3 w-32 bg-card" /></div><Bone className="h-9 w-24 bg-card" /></div>
        {times(3).map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <Bone className="h-3.5 w-24" />
            <div className="flex items-center justify-between"><Bone className="h-4 w-28" /><Bone className={cn(H, "w-48")} /></div>
          </div>
        ))}
        <div className="flex gap-4">{times(4).map((i) => <Bone key={i} className="h-3 w-16" />)}</div>
      </div>
    </div>
  );
}

/** Courses and the drills: the training's choice (setup.tsx). */
function TrainingSkeleton({ phone }: { phone: boolean }) {
  const row = (i: number) => (
    <div key={i} className="flex h-[72px] shrink-0 items-center gap-3 rounded-[18px] bg-muted/50 px-3">
      <Bone className="size-4 shrink-0 rounded-[5px]" />
      <Bone className="size-10 shrink-0 rounded-[10px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Bone className="h-4 w-40" />
        <Bone className="h-3 w-56 max-w-full" />
      </div>
      {!phone && (
        <div className="flex w-36 flex-col gap-2">
          <Bone className="h-1.5 w-full" />
          <Bone className="h-3 w-16" />
        </div>
      )}
    </div>
  );
  if (phone)
    return (
      <Page>
        <Head title="w-24">
          <Puzzle />
          <Bone className={ICON} />
        </Head>
        <div className={cn(CARD, "flex-1 gap-3 overflow-hidden p-5")}>
          <PaneHead w="w-40" />
          <Bone className="h-11 w-60 shrink-0" />
          {times(7).map(row)}
        </div>
        <div className="flex h-[52px] shrink-0 items-center gap-3 rounded-[20px] bg-card px-4"><Bone className="h-5 w-6" /><Bone className="h-4 w-24" /><Bone className="ml-auto h-11 w-20" /></div>
      </Page>
    );
  return (
    <Page>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-5 gap-y-4">
        <div className={cn(CARD, "gap-3.5 overflow-hidden p-6 pt-5")}>
          <PaneHead w="w-56">
            <Bone className="h-9 w-60" />
          </PaneHead>
          {times(8).map(row)}
        </div>
        <div className="row-span-2 flex min-h-0 flex-col gap-4">
          <div className={cn(CARD, "h-[360px] shrink-0 gap-3.5 overflow-hidden p-6 pt-5")}>
            <PaneHead w="w-44" />
            {times(5).map((i) => (
              <div key={i} className="flex flex-col gap-2 rounded-[14px] bg-muted/50 px-3 py-2.5">
                <div className="flex justify-between"><Bone className="h-4 w-20" /><Bone className="h-3 w-24" /></div>
                <Bone className="h-1.5 w-full" />
              </div>
            ))}
          </div>
          <div className={cn(CARD, "h-[122px] shrink-0 gap-3.5 p-6 pt-5")}>
            <PaneHead w="w-52" />
            <div className="flex items-center justify-between"><Bone className="h-4 w-36" /><Bone className="h-9 w-16" /></div>
          </div>
          <div className={cn(CARD, "flex-1 gap-3.5 p-6 pt-5")}>
            <PaneHead w="w-40" />
            <div className="grid grid-cols-[4.5rem_repeat(5,minmax(0,1fr))] items-center gap-1">
              {times(24).map((i) => (i % 6 ? <Bone key={i} className="h-5" /> : <Bone key={i} className="h-3.5 w-12" />))}
            </div>
            <div className="mt-auto flex items-center justify-between"><Bone className="h-4 w-28" /><Bone className="h-9 w-28" /></div>
          </div>
        </div>
        <div className="flex h-[60px] items-center gap-3 rounded-[22px] bg-card px-6">
          <Bone className="h-8 w-6" />
          <Bone className="h-4 w-12" />
          <Bone className="h-7 w-28" />
          <Bone className="ml-auto h-9 w-28" />
          <Bone className="h-9 w-20" />
        </div>
      </div>
    </Page>
  );
}

/** A case tile (algorithms.tsx CaseTile): the cube, its name, its time. */
function Tile({ size = "size-[84px]" }: { size?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-1.5">
      <Bone className={cn("rounded-[20px]", size)} />
      <Bone className="h-4 w-10" />
      <Bone className="h-3 w-12" />
    </div>
  );
}

/** The catalogue (algorithms.tsx): the sets on the left, the chosen one's groups of tiles beside. */
function AlgorithmsSkeleton({ phone }: { phone: boolean }) {
  const groups = (wide: boolean) =>
    [4, 10, 6].map((n, g) => (
      <section key={g} className={cn("border-t border-border/60 first:border-t-0", wide ? "grid grid-cols-[9.5rem_minmax(0,1fr)] gap-4 py-3" : "flex flex-col gap-2 py-3")}>
        <div className={cn("flex", wide ? "flex-col items-start gap-2 pt-2" : "items-center gap-2")}>
          <Bone className="h-5 w-28" />
          <Bone className="h-3.5 w-20" />
          {wide && <Bone className="h-2 w-16" />}
          <Bone className={cn(H, "w-20", wide ? "mt-1" : "ml-auto")} />
        </div>
        <div className={cn("grid gap-x-1.5 gap-y-2", wide ? "grid-cols-6" : "grid-cols-3")}>
          {times(n).map((i) => <Tile key={i} size={wide ? "size-24" : "size-[72px]"} />)}
        </div>
      </section>
    ));
  if (phone)
    return (
      <Page>
        <Head title="w-28" sub="w-16">
          <Puzzle />
          <Bone className={ICON} />
          <Bone className={ICON} />
        </Head>
        <div className="flex shrink-0 flex-col items-start gap-2">
          <Bone className="h-11 w-[138px]" />
          <Bone className="h-11 w-[249px]" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{groups(false)}</div>
      </Page>
    );
  return (
    <Page>
      <div className="flex min-h-0 flex-1 gap-6 xl:gap-8">
        <div className={cn(CARD, "w-76 shrink-0 gap-3 overflow-hidden p-3")}>
          <Bone className="h-9 w-full shrink-0" />
          <div className="flex shrink-0 justify-between px-2.5"><Bone className="h-5 w-10" /><Bone className="h-4 w-28" /></div>
          {[[4, 6], [2, 0], [2, 0], [7, 0]].map(([n, sub], g) => (
            <div key={g} className="flex flex-col gap-0.5 pb-2">
              <Bone className="mx-2.5 my-2 h-3 w-10" />
              {times(n!).map((i) => (
                <div key={i} className="flex h-10 items-center gap-2.5 px-2.5">
                  <Bone className="size-4 rounded-full" />
                  <Bone className="h-4 w-24" />
                  <Bone className="ml-auto h-3.5 w-10" />
                </div>
              ))}
              {g === 0 && times(sub!).map((i) => <div key={i} className="flex h-6 items-center justify-between pr-2.5 pl-9"><Bone className="h-3.5 w-28" /><Bone className="h-3 w-4" /></div>)}
            </div>
          ))}
        </div>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <header className="flex shrink-0 items-end gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bone className="h-4 w-36" />
              <Bone className="h-8 w-24" />
              <Bone className="h-4 w-96 max-w-full" />
            </div>
            <div className="flex w-[min(26rem,42%)] shrink-0 flex-col gap-3 pb-1 max-lg:hidden">
              <Bone className="h-4 w-72" />
              <Bone className="h-2 w-full" />
            </div>
          </header>
          <div className="flex shrink-0 items-center gap-2.5">
            <Bone className="h-9 w-[249px]" />
            <Bone className="h-9 w-[86px]" />
            <Bone className="h-9 w-24" />
            <Bone className="ml-auto h-9 w-32" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{groups(true)}</div>
        </section>
      </div>
    </Page>
  );
}

/** A case's dialog (algorithms.tsx CaseDialog) while its code loads: the case's head, its algorithms, the player. */
export function CaseDialogSkeleton({ phone }: { phone: boolean }) {
  const list = (
    <div className="flex flex-col gap-1">
      {times(6).map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-[14px] px-4 py-3">
          <Bone className="h-5 w-40" />
          <Bone className="h-3 w-56" />
        </div>
      ))}
    </div>
  );
  const player = (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 rounded-[20px] bg-muted/50 p-6">
      <Bone className="size-40 rounded-[28px] md:size-52" />
      <Bone className="h-9 w-32" />
      <Bone className="h-5 w-24" />
      <div className="flex items-center gap-2">{times(4).map((i) => <Bone key={i} className="size-9" />)}<Bone className="ml-6 h-9 w-36 max-md:hidden" /></div>
      <Bone className="h-1.5 w-full max-w-[19rem]" />
    </div>
  );
  if (phone)
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-4 bg-card px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-4" {...BUSY} aria-label={tr("Loading")}>
        <div className="flex items-center gap-2"><Bone className="size-11" /><Bone className="h-4 w-12" /><Bone className="size-11" /><Bone className="ml-auto size-11" /></div>
        <div className="flex items-center gap-4"><Bone className="size-16 rounded-[16px]" /><div className="flex flex-col gap-2"><Bone className="h-3 w-24" /><Bone className="h-7 w-20" /><Bone className="h-4 w-28" /></div></div>
        <div className="grid grid-cols-2 gap-2"><Bone className="h-11" /><Bone className="h-11" /></div>
        <Bone className="h-11 w-48" />
        {player}
      </div>
    );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6" {...BUSY} aria-label={tr("Loading")}>
      <div className="flex h-[min(50rem,calc(100svh-3rem))] w-full max-w-[78rem] flex-col gap-5 overflow-hidden rounded-[28px] bg-card p-6">
        <div className="flex shrink-0 items-start gap-5">
          <Bone className="size-16 rounded-[16px]" />
          <div className="flex flex-col gap-2"><Bone className="h-3 w-24" /><Bone className="h-7 w-20" /><Bone className="h-4 w-28" /></div>
          <div className="ml-auto flex flex-col items-end gap-3 pr-8">
            <Bone className="h-4 w-20" />
            <div className="flex gap-2"><Bone className="h-9 w-20" /><Bone className="h-9 w-32" /></div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2"><Bone className="h-8 w-28" /><Bone className="h-8 w-24" /><Bone className="h-4 w-56 self-center" /></div>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="w-[40%] shrink-0">{list}</div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {player}
            <div className="flex shrink-0 items-center justify-between px-3"><div className="flex flex-col gap-2"><Bone className="h-3 w-28" /><Bone className="h-3.5 w-80" /></div><Bone className="h-9 w-24" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Learning: the choice of a course (the one advised large, the others listed), or a course's step. */
function LearnSkeleton({ phone, method }: { phone: boolean; method: string }) {
  if (!method)
    return (
      <Page>
        <Head title="w-20" sub="w-80 max-md:w-28">{phone && <Puzzle />}</Head>
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-5">
          <div className={cn(CARD, "shrink-0 justify-between gap-5 p-5 md:p-8")}>
            <div className="flex flex-col gap-3">
              <Bone className="h-4 w-24" />
              <Bone className="h-9 w-56 md:h-14 md:w-72" />
              <Bone className="h-4 w-full max-w-md max-md:hidden" />
              <Bone className="h-4 w-2/3 max-md:hidden" />
            </div>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3 max-md:hidden">{times(3).map((i) => <div key={i} className="flex h-[75px] flex-col justify-center gap-2 rounded-[20px] bg-muted px-4"><Bone className="h-3 w-14 bg-card" /><Bone className="h-5 w-12 bg-card" /></div>)}</div>
              <div className="grid grid-cols-6 gap-1.5">{times(6).map((i) => <Bone key={i} className="h-2" />)}</div>
              <Bone className="h-4 w-44" />
              <Bone className={cn(H, "w-full")} />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden md:gap-3">
            {times(4).map((i) => (
              <div key={i} className="flex h-[100px] shrink-0 flex-col justify-center gap-3 rounded-[20px] bg-card px-5 md:h-[163px]">
                <div className="flex items-center gap-3 md:gap-4">
                  <Bone className="size-11 shrink-0 rounded-[14px]" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2"><Bone className="h-5 w-32" /><Bone className="h-4 w-4/5 max-md:w-24" /></div>
                  <div className="flex flex-col items-end gap-2"><Bone className="h-7 w-16" /><Bone className="h-3 w-20 max-md:hidden" /></div>
                </div>
                <Bone className="h-1.5 w-full" />
              </div>
            ))}
          </div>
        </div>
      </Page>
    );
  if (phone)
    return (
      <Page>
        <Head back title="w-28" sub="w-28"><Bone className={ICON} /></Head>
        <div className={cn(CARD, "flex-1 overflow-hidden")}>
          <div className="flex h-14 shrink-0 items-center gap-3 px-4"><Bone className="size-5 rounded-full" /><Bone className="h-6 w-48" /></div>
          <div className="flex min-h-0 flex-1 flex-col gap-5 px-4 pt-4">
            <div className="flex gap-2"><Bone className="h-11 w-36" /><Bone className="h-11 w-32" /></div>
            <div className="flex items-center gap-3"><div className="flex flex-1 flex-col gap-2"><Bone className="h-3 w-24" /><Bone className="h-9 w-40" /></div><Bone className="size-28 rounded-[22px]" /></div>
            <Bone className="h-4 w-11/12" />
            <Bone className="h-4 w-3/4" />
          </div>
          <div className="flex shrink-0 flex-col gap-3 p-3">
            <div className="flex flex-col gap-3 rounded-[20px] bg-muted/50 p-3"><div className="flex justify-between"><Bone className="h-4 w-16" /><Bone className="h-11 w-24" /></div><div className="grid grid-cols-3 gap-2">{times(3).map((i) => <Bone key={i} className="h-11" />)}</div></div>
            <div className="flex gap-2"><Bone className="size-11" /><Bone className="h-11 flex-1" /></div>
          </div>
        </div>
      </Page>
    );
  return (
    <Page>
      <header className="flex min-h-12 shrink-0 items-center gap-5">
        <div className="flex shrink-0 items-center gap-2">
          <Bone className="size-9" />
          <div className="flex flex-col gap-1.5"><Bone className="h-5 w-24" /><Bone className="h-3 w-20" /></div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-7 overflow-hidden">{["w-28", "w-36", "w-44", "w-28", "w-28", "w-40"].map((w, i) => <Bone key={i} className={cn("h-9 shrink-0", w)} />)}</div>
        <Bone className="h-9 w-36 shrink-0" />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[21rem_minmax(0,1fr)_17.5rem] gap-4 min-[1400px]:grid-cols-[24rem_minmax(0,1fr)_19rem]">
        <div className={cn(CARD, "gap-3 overflow-hidden p-3 pt-4")}>
          <Bone className="mx-2 h-5 w-32" />
          {times(3).map((i) => (
            <div key={i} className="flex h-16 items-center gap-3 px-2">
              <Bone className="size-[52px] rounded-[12px]" />
              <div className="flex flex-col gap-2"><Bone className="h-4 w-28" /><Bone className="h-3 w-14" /></div>
            </div>
          ))}
        </div>
        <div className={cn(CARD, "gap-4 p-6")}>
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-3"><Bone className="h-3 w-24" /><Bone className="h-14 w-80" /></div>
            <div className="flex flex-col items-end gap-3"><Bone className="h-9 w-36" /><Bone className="h-4 w-24" /></div>
          </div>
          <Bone className="h-4 w-11/12" />
          <div className="flex min-h-0 flex-1 items-center justify-center"><Bone className="size-56 rounded-[40px]" /></div>
          <div className="flex shrink-0 flex-col gap-4 rounded-[20px] bg-muted/50 p-4">
            <div className="flex items-center justify-between"><Bone className="h-5 w-48" /><Bone className="h-9 w-36" /></div>
            <div className="grid grid-cols-3 gap-2">{times(3).map((i) => <Bone key={i} className="h-9" />)}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2"><Bone className="mr-auto h-4 w-14" /><Bone className="h-9 w-36" /><Bone className="h-9 w-36" /></div>
        </div>
        <div className={cn(CARD, "gap-4 p-5")}>
          <Bone className="h-3 w-16" />
          <Bone className="h-6 w-40" />
          <Bone className="h-24 w-full rounded-[18px]" />
          {times(5).map((i) => <Bone key={i} className="h-3.5 w-11/12" />)}
          <div className="mt-auto flex flex-col gap-2"><Bone className="h-9 w-full" /><div className="flex gap-2"><Bone className="size-9" /><Bone className="h-9 flex-1" /></div></div>
        </div>
      </div>
    </Page>
  );
}

/** The duel's lobby: the friends, the stage, the races played. */
function DuelSkeleton({ phone }: { phone: boolean }) {
  if (phone)
    return (
      <Page>
        <Head title="w-14"><Puzzle /><Bone className={ICON} /><Bone className={ICON} /></Head>
        <Stage className="flex-1" />
      </Page>
    );
  return (
    <Page>
      <div className="grid min-h-0 flex-1 gap-5 md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <div className={cn(CARD, "gap-3.5 p-4 max-xl:hidden")}>
          <PaneHead className="px-1" />
          <div className="grid grid-cols-3 gap-x-1.5 gap-y-2.5 pt-1.5">
            {times(5).map((i) => <div key={i} className="flex flex-col items-center gap-2 py-1"><Bone className="size-12 rounded-full" /><Bone className="h-3 w-14" /></div>)}
          </div>
          <Bone className="mt-auto h-[103px] rounded-[18px]" />
        </div>
        <Stage />
        <div className={cn(CARD, "gap-3 p-4")}>
          <PaneHead w="w-32" className="px-1" />
          <Rows n={5} />
        </div>
      </div>
    </Page>
  );
}

/** The daily scramble: the player's results, the stage, the day's field. */
function DailySkeleton({ phone }: { phone: boolean }) {
  const field = (
    <div className={cn(CARD, "gap-3 p-4")}>
      <PaneHead w="w-36" className="px-1" />
      <Bone className={cn(H, "w-36")} />
      <Rows n={phone ? 3 : 6} />
    </div>
  );
  if (phone)
    return (
      <Page>
        <Head title="w-36"><Bone className="h-11 w-44" /></Head>
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-5">
          <section className="flex flex-col items-center gap-3">
            <Bone className="h-6 w-full" />
            <Bone className="h-6 w-2/3 self-start" />
            <Bone className="h-[52px] w-full rounded-xl" />
            <Bone className="h-9 w-32" />
            <Bone className="h-4 w-56" />
          </section>
          {field}
        </div>
      </Page>
    );
  return (
    <Page>
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_360px] gap-5">
        <div className={cn(CARD, "gap-3.5 p-4")}>
          <PaneHead className="px-1" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-1">{times(4).map((i) => <Figure key={i} value="h-5 w-12" />)}</div>
          <Bone className="h-[57px] rounded-[14px]" />
        </div>
        <Stage kicker figures={4} />
        {field}
      </div>
    </Page>
  );
}

/** Tournaments: the list, the one chosen as the stage, its players; a tournament (its bracket) or a battle. */
function TournamentsSkeleton({ phone, page, view }: { phone: boolean; page: string; view: string }) {
  if (page === "match")
    return (
      <Page>
        <div className="flex min-h-9 shrink-0 items-center gap-2"><Bone className={ICON} /><Bone className="h-4 w-80 max-md:w-48" /></div>
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 md:gap-8">
          <div className="flex items-center gap-5 md:gap-10">
            <div className="flex flex-col items-center gap-2"><Bone className="size-20 rounded-full md:size-24" /><Bone className="h-4 w-24" /><Bone className="h-3 w-20" /></div>
            <Bone className="h-4 w-6" />
            <div className="flex flex-col items-center gap-2"><Bone className="size-20 rounded-full md:size-24" /><Bone className="h-4 w-24" /><Bone className="h-3 w-20" /></div>
          </div>
          <div className="flex flex-col items-center gap-2"><Bone className="h-4 w-20" /><Bone className="h-9 w-72 max-w-full" /><Bone className="h-4 w-64 max-w-full" /></div>
          <div className="flex gap-12"><Figure center value="h-8 w-16" /><Figure center value="h-8 w-72 max-md:w-40" /></div>
        </section>
      </Page>
    );
  if (view)
    return (
      <Page>
        <div className="flex min-h-9 shrink-0 items-center gap-2"><Bone className={ICON} /><Bone className="mr-auto h-4 w-96 max-md:hidden" /><Bone className="h-9 w-24 max-md:hidden" /></div>
        <header className="flex shrink-0 flex-wrap items-end gap-x-10 gap-y-3">
          <div className="flex flex-col gap-2"><Bone className="h-4 w-24" /><Bone className="h-8 w-48 md:h-9" /></div>
          <div className="flex gap-8">{times(2).map((i) => <Figure key={i} center value="h-8 w-16" />)}</div>
        </header>
        <div className="flex min-h-0 flex-1 gap-5">
          <div className={cn(CARD, "min-w-0 flex-1 gap-3 p-4")}>
            <PaneHead className="px-1" />
            <div className="flex min-h-0 flex-1 gap-14 overflow-hidden">
              {[4, 2, 1].map((n, i) => (
                <div key={i} className="flex w-[202px] shrink-0 flex-col gap-3">
                  <Bone className="h-4 w-full" />
                  <div className="flex flex-1 flex-col justify-around">{times(n).map((k) => <Bone key={k} className="h-[68px] rounded-[14px]" />)}</div>
                </div>
              ))}
            </div>
          </div>
          {!phone && (
            <div className={cn(CARD, "w-80 shrink-0 gap-3 p-4")}>
              <PaneHead w="w-24" className="px-1" />
              <Rows n={5} />
            </div>
          )}
        </div>
      </Page>
    );
  const list = (
    <div className={cn(CARD, "gap-3 p-4")}>
      {!phone && <PaneHead w="w-36" className="px-1" />}
      {[2, 2].map((n, g) => (
        <div key={g} className="flex flex-col gap-0.5 pb-3">
          <Bone className="mx-2 my-2 h-3 w-24" />
          {times(n).map((i) => (
            <div key={i} className="flex flex-col gap-2 px-2 py-2.5">
              <div className="flex justify-between"><Bone className="h-4 w-28" /><Bone className="h-3.5 w-20" /></div>
              <Bone className="h-3 w-44" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
  if (phone)
    return (
      <Page>
        <Head title="w-36" sub="w-40" />
        <div className="grid min-h-0 flex-1">{list}</div>
      </Page>
    );
  return (
    <Page>
      <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)_320px] gap-5">
        {list}
        <section className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-5 md:gap-8">
          <div className="flex flex-col items-center gap-3"><Bone className="h-3 w-44" /><Bone className="h-9 w-48" /><Bone className="h-4 w-40" /><Bone className="h-[65px] w-[min(100%,10rem)] rounded-xl" /></div>
          <div className="flex gap-2"><Bone className="h-9 w-32" /><Bone className="h-9 w-40" /></div>
          <div className="flex gap-12">{times(3).map((i) => <Figure key={i} center value="h-8 w-20" />)}</div>
        </section>
        <div className={cn(CARD, "gap-3 p-4")}>
          <PaneHead w="w-24" className="px-1" />
          <Rows n={7} />
        </div>
      </div>
    </Page>
  );
}

/** The list of conversations or contacts (community/messages.tsx, people.tsx). */
function ConversationList({ phone, title = "w-32", tabs = "w-[265px]", requests, wide }: { phone: boolean; title?: string; tabs?: string; requests?: boolean; wide?: boolean }) {
  return (
    <div className={cn(CARD, "shrink-0 gap-3 overflow-hidden pt-3 max-md:flex-1", wide ? "md:w-[380px]" : "md:w-[340px]")}>
      <div className="flex shrink-0 items-center gap-1.5 px-4 pt-1">
        <Bone className={cn("mr-auto h-7", title)} />
        <Bone className={ICON} />
        {!phone && <Bone className={ICON} />}
      </div>
      <div className="flex flex-col gap-3 px-3">
        <Bone className="h-10 w-full" />
        <Bone className={cn(H, tabs)} />
        {requests && <Bone className="h-[90px] w-full rounded-2xl" />}
      </div>
      <Rows n={phone ? 6 : 5} className="p-2 pt-0" />
    </div>
  );
}

/** A conversation open beside the list: its head, the messages, the field. */
function Conversation() {
  return (
    <div className={cn(CARD, "min-w-0 flex-1 overflow-hidden")}>
      <div className="flex min-h-18 shrink-0 items-center gap-3 px-4 pt-2 pb-1">
        <Bone className="size-10 rounded-full" />
        <div className="flex flex-col gap-1.5"><Bone className="h-5 w-32" /><Bone className="h-3 w-40" /></div>
        <Bone className="ml-auto h-9 w-24" />
        <Bone className="size-9" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-5 overflow-hidden px-6 py-4">
        {["w-3/5", "w-2/5", "w-1/2", "w-1/3"].map((w, i) => (
          <div key={i} className="flex items-start gap-4">
            <div className="flex w-14 flex-col items-end gap-1.5"><Bone className="h-3.5 w-10" /><Bone className="h-3 w-8" /></div>
            <Bone className={cn("h-4", w)} />
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-end gap-2 px-4 pt-1 pb-4"><Bone className="h-10 flex-1" /><Bone className="size-10" /></div>
    </div>
  );
}

function CommunitySkeleton({ phone, view }: { phone: boolean; view: string }) {
  const people = view.startsWith("people"),
    open = /^(messages|groups|people)\/./.test(view);
  return (
    <Page>
      <div className="flex min-h-0 flex-1 gap-5">
        {(!phone || !open) && <ConversationList phone={phone} title={people ? "w-28" : "w-32"} tabs={people ? "w-[312px]" : "w-[265px]"} requests wide={people} />}
        {(!phone || open) &&
          (people ? (
            <div className={cn(CARD, "min-w-0 flex-1 gap-3 px-6 pt-5 pb-6")}>
              <div className="flex items-center gap-4"><Bone className="size-[52px] rounded-full" /><div className="flex flex-col gap-2"><Bone className="h-7 w-40" /><Bone className="h-3 w-36" /></div><Bone className="ml-auto h-9 w-28" /><Bone className="h-9 w-16" /></div>
              <div className="grid gap-8 lg:grid-cols-2">
                <div className="flex flex-col gap-3"><Bone className="h-3.5 w-24" /><Bone className="h-[76px] rounded-[18px]" /><Bone className="h-3.5 w-40" /></div>
                <div className="flex flex-col gap-3"><Bone className="h-3.5 w-24" /><Bone className="h-3.5 w-64" /></div>
              </div>
            </div>
          ) : (
            <Conversation />
          ))}
      </div>
    </Page>
  );
}

/** Coaching: its sections over the page, then the view: a dashboard, lists with their detail, the calendar, forms. */
function CoachingSkeleton({ phone, coaching }: { phone: boolean; coaching: string }) {
  const view = coaching.split("/")[0] || "",
    split = (list: React.ReactNode, detail: React.ReactNode, side = "w-[340px]") => (
      <div className="flex min-h-0 flex-1 gap-4">
        <div className={cn(CARD, "shrink-0 overflow-hidden pt-3 max-md:flex-1", phone ? "" : side)}>{list}</div>
        {!phone && detail}
      </div>
    );
  const body =
    view === "messages" || view === "students"
      ? split(<Rows n={5} avatar="size-10" className="p-2" />, <Conversation />)
      : view === "schedule"
        ? (
          <section className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2"><Bone className="h-6 w-36" /><Bone className={ICON} /><Bone className={ICON} /><Bone className={cn(H, "w-16")} /></div>
            <div className={cn(CARD, "flex-1 gap-1 overflow-hidden p-2")}>
              <div className="grid grid-cols-7 gap-1 px-2 py-1.5">{times(7).map((i) => <Bone key={i} className="h-3.5 w-8" />)}</div>
              <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-1">{times(42).map((i) => <Bone key={i} className="rounded-[14px] bg-muted/50" />)}</div>
            </div>
          </section>
        )
        : view === "profile" || view === "apply"
          ? (
            <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]">
              <div className={cn(CARD, "gap-6 p-6 max-md:p-4")}>
                <div className="flex items-center gap-4"><Bone className="size-[72px] rounded-full" /><div className="flex flex-col gap-2"><Bone className="h-9 w-36" /><Bone className="h-4 w-64" /></div></div>
                <div className="grid grid-cols-2 gap-5">{times(2).map((i) => <div key={i} className="flex flex-col gap-2"><Bone className="h-4 w-20" /><Bone className="h-9 w-40" /></div>)}</div>
                {times(2).map((i) => <div key={i} className="flex flex-col gap-2"><Bone className="h-4 w-20" /><Bone className={cn("w-full", i ? "h-20" : "h-9")} /></div>)}
                <div className="flex gap-1.5">{times(12).map((i) => <Bone key={i} className="size-9" />)}</div>
                <div className="mt-auto flex gap-2"><Bone className="h-9 w-32" /><Bone className="h-9 flex-1" /></div>
              </div>
              {!phone && <div className={cn(CARD, "h-[188px] gap-3 p-4")}><Bone className="h-3 w-44" /><div className="flex items-center gap-4 px-3.5 py-3"><Bone className="size-[52px] rounded-full" /><div className="flex flex-1 flex-col gap-2"><Bone className="h-5 w-32" /><Bone className="h-3.5 w-11/12" /></div><Bone className="h-7 w-12" /></div></div>}
            </div>
          )
          : view === "sessions" || view === "coaches" || (!view && !coaching.length && !isCoach())
            ? (
              <div className={cn("grid min-h-0 flex-1 gap-5", !phone && (view === "sessions" ? "grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]" : "grid-cols-[minmax(0,1fr)_minmax(26rem,32rem)]"))}>
                <div className={cn(CARD, "gap-2 overflow-hidden p-2.5 pt-4")}>
                  <div className="flex items-center gap-3 px-2.5 pb-1"><Bone className="h-6 w-32" /><Bone className="ml-auto h-4 w-28" /></div>
                  {times(6).map((i) => (
                    <div key={i} className="flex gap-4 rounded-[18px] px-2.5 py-3">
                      <Bone className="size-12 shrink-0 rounded-full" />
                      <div className="flex flex-1 flex-col gap-2"><Bone className="h-4 w-40" /><Bone className="h-3.5 w-3/4" /><Bone className="h-7 w-36" /></div>
                      <div className="flex flex-col items-end gap-2"><Bone className="h-6 w-12" /><Bone className="h-3 w-10" /></div>
                    </div>
                  ))}
                </div>
                {!phone && (
                  <div className={cn(CARD, "gap-5 p-6")}>
                    <div className="flex items-center gap-4"><Bone className="size-16 rounded-full" /><div className="flex flex-col gap-2"><Bone className="h-6 w-36" /><Bone className="h-3.5 w-56" /></div></div>
                    <div className="flex gap-8">{times(4).map((i) => <Figure key={i} value="h-5 w-12" className="flex-col-reverse" />)}</div>
                    <Bone className="h-4 w-11/12" />
                    <Bone className="h-4 w-3/4" />
                    <Bone className="h-6 w-40" />
                    <div className="grid grid-cols-7 gap-2">{times(7).map((i) => <Bone key={i} className="h-16 rounded-[14px]" />)}</div>
                  </div>
                )}
              </div>
            )
            : (
              // A coach's dashboard: the week's figures, the four weeks, the next sessions.
              <section className="flex min-h-0 flex-1 flex-col gap-4">
                <div className={cn(CARD, "shrink-0 px-6 py-4")}>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">{times(6).map((i) => <Figure key={i} value="h-7 w-14" className="flex-col-reverse" />)}</div>
                </div>
                <div className="flex min-h-0 flex-1 gap-4 max-lg:flex-col-reverse">
                  <div className={cn(CARD, "gap-5 p-4 lg:w-96")}>
                    <Bone className="h-5 w-40" />
                    {times(4).map((i) => <div key={i} className="flex flex-col gap-2"><div className="flex justify-between"><Bone className="h-4 w-20" /><Bone className="h-3 w-28" /></div><Bone className="h-1.5 w-full" /><Bone className="h-3 w-32" /></div>)}
                  </div>
                  <div className={cn(CARD, "min-w-0 flex-1 gap-2 p-4")}>
                    <PaneHead w="w-36" />
                    <Rows n={4} className="-mx-2.5" />
                  </div>
                </div>
              </section>
            );
  return (
    <Page>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {phone ? <Bone className="h-11 w-44" /> : <Bone className="h-9 w-[311px]" />}
        {!phone && <Bone className={cn("h-9", isCoach() ? "w-56" : "w-40")} />}
      </div>
      {body}
    </Page>
  );
}
/** Whether the account coaches: its own sections come first in coaching (coaching/sections.ts). */
const isCoach = () => coaching.isCoach;

/** The profile's overview: who they are and their records, the journal of their days, the month and the weeks. */
function ProfileOverview({ phone }: { phone: boolean }) {
  const identity = (
    <div className={cn(CARD, "h-[190px] shrink-0 gap-4 p-4 max-md:h-[206px]")}>
      <div className="flex items-center gap-3.5"><Bone className="size-14 rounded-[18px]" /><div className="flex flex-col gap-2"><Bone className="h-6 w-24" /><Bone className="h-3.5 w-36" /></div></div>
      <div className="grid grid-cols-2 gap-2">{times(4).map((i) => <Bone key={i} className="h-9" />)}</div>
    </div>
  );
  const month = (
    <div className={cn(CARD, "h-[414px] shrink-0 gap-3 p-4 max-md:h-[422px]")}>
      <div className="flex items-center justify-between"><Bone className="h-6 w-32" /><div className="flex gap-1"><Bone className="size-8" /><Bone className="size-8" /></div></div>
      <div className="grid grid-cols-7 gap-x-2 gap-y-3">{times(42).map((i) => <Bone key={i} className="mx-auto size-6 rounded-full" />)}</div>
      <div className="mt-auto grid grid-cols-3 gap-3">{times(6).map((i) => <Figure key={i} value="h-5 w-12" className="flex-col-reverse gap-1.5" />)}</div>
    </div>
  );
  const journal = (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex min-h-[39px] shrink-0 items-center gap-3"><Bone className="h-8 w-28" /><Bone className="h-6 w-16" /><Bone className="ml-auto h-9 w-52 max-md:hidden" /></div>
      <div className="flex min-h-0 flex-col overflow-hidden">
        {times(8).map((i) => (
          <div key={i} className="flex gap-4 border-b border-border/60 py-3">
            <div className="flex w-14 shrink-0 flex-col items-center gap-1.5"><Bone className="h-7 w-8" /><Bone className="h-3 w-12" /></div>
            <div className="flex flex-1 flex-col gap-2.5"><Bone className="h-4 w-2/3" />{i < 3 && <Bone className="h-7 w-72 max-w-full rounded-[10px]" />}</div>
          </div>
        ))}
      </div>
    </section>
  );
  if (phone)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden" {...BUSY} aria-label={tr("Loading")}>
        {identity}
        {month}
      </div>
    );
  return (
    <Page>
      <div className="grid min-h-0 flex-1 grid-cols-[16rem_minmax(0,1fr)_19rem] gap-5 xl:grid-cols-[18.75rem_minmax(0,1fr)_22.5rem] xl:gap-[22px]">
        <div className="flex min-h-0 flex-col gap-4">
          {identity}
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
            <div className="flex justify-between py-1"><Bone className="h-3.5 w-36" /><Bone className="h-3.5 w-16" /></div>
            <div className="grid grid-cols-2 gap-2">{times(10).map((i) => <div key={i} className="flex h-[78px] flex-col justify-center gap-2 rounded-[18px] bg-card px-3"><Bone className="h-3 w-10" /><Bone className="h-5 w-16" /><Bone className="h-3 w-14" /></div>)}</div>
          </div>
        </div>
        {journal}
        <div className="flex min-h-0 flex-col gap-4">
          {month}
          <div className={cn(CARD, "min-h-0 flex-1 gap-3 p-4")}>
            <Bone className="h-3.5 w-40" />
            <div className="flex flex-1 items-end gap-1.5">{times(10).map((i) => <Bone key={i} className="h-10 flex-1 rounded-[6px]" />)}</div>
            <div className="grid grid-cols-2 gap-2">{times(4).map((i) => <Bone key={i} className="h-9" />)}</div>
          </div>
        </div>
      </div>
    </Page>
  );
}

/** A section of the profile: its header, then the statistics, the cases, the achievements, the analysis or the battles. */
function ProfileSection({ phone, mode }: { phone: boolean; mode: string }) {
  const body =
    mode === "playground" ? (
      <div className={cn("grid min-h-0 flex-1 gap-4", !phone && "grid-cols-[minmax(0,1fr)_22rem]")}>
        <div className="grid min-h-0 grid-rows-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4">
          <div className={cn(CARD, "gap-3 p-5 pt-4")}>
            <PaneHead><Bone className="h-4 w-56" /></PaneHead>
            <div className="flex min-h-0 flex-1 gap-3"><div className="flex flex-col justify-between py-2">{times(4).map((i) => <Bone key={i} className="h-3 w-5" />)}</div><Bone className="flex-1 rounded-[14px] bg-muted/50" /></div>
            <div className="flex items-center gap-3"><Bone className="h-9 w-72" /><Bone className="h-11 w-48 max-md:hidden" /><Bone className="ml-auto h-4 w-32" /></div>
          </div>
          <div className={cn(CARD, "gap-3 overflow-hidden p-5 pt-4")}>
            <PaneHead w="w-36"><Bone className="h-9 w-32" /><Bone className="h-9 w-28" /></PaneHead>
            {times(6).map((i) => <div key={i} className="flex items-center gap-6 px-2"><Bone className="h-3 w-8" /><Bone className="h-5 w-14" /><Bone className="h-3.5 w-12" /><Bone className="ml-auto h-3.5 w-20" /><Bone className="h-3.5 w-16" /></div>)}
          </div>
        </div>
        {!phone && (
          <div className="flex min-h-0 flex-col gap-4">
            <div className={cn(CARD, "h-[428px] gap-4 p-5 pt-4")}>
              <PaneHead w="w-20" />
              {times(7).map((i) => <div key={i} className="flex items-center justify-between"><Bone className="h-4 w-12" /><Bone className="h-5 w-14" /><Bone className="h-4 w-12" /><Bone className="h-5 w-12" /></div>)}
            </div>
            <div className={cn(CARD, "flex-1 gap-4 p-5 pt-4")}>
              <PaneHead w="w-36" />
              {times(4).map((i) => <div key={i} className="flex items-center justify-between"><Bone className="h-5 w-14" /><Bone className="h-4 w-12" /><Bone className="h-3.5 w-12" /></div>)}
            </div>
          </div>
        )}
      </div>
    ) : mode === "achievements" ? (
      <div className={cn("grid min-h-0 flex-1 gap-4", !phone && "grid-cols-[14rem_minmax(0,1fr)_21rem] xl:grid-cols-[15.5rem_minmax(0,1fr)_23rem]")}>
        {!phone && <div className="flex flex-col gap-2">{[72, 93, 83, 93, 93, 73].map((h, i) => <div key={i} className="flex flex-col gap-2.5 rounded-[18px] bg-card px-4 py-3" style={{ height: h }}><div className="flex items-center gap-3"><Bone className="size-7 rounded-full" /><Bone className="h-4 w-20" /><Bone className="ml-auto h-3.5 w-12" /></div><Bone className="h-2 w-full" /></div>)}</div>}
        <div className={cn(CARD, "gap-4 overflow-hidden p-6 pt-5")}>
          <Bone className="h-6 w-56" />
          {[1, 2, 2].map((n, g) => (
            <div key={g} className="flex flex-col gap-3">
              <Bone className="h-4 w-40" />
              <div className="flex gap-2">{times(n).map((i) => <Bone key={i} className="h-[138px] w-[114px] rounded-[18px] bg-muted/50" />)}</div>
            </div>
          ))}
        </div>
        {!phone && (
          <div className={cn(CARD, "items-center gap-3 p-6")}>
            <Bone className="size-28 rounded-full" />
            <Bone className="h-7 w-28" />
            <Bone className="h-4 w-32" />
            <Bone className="h-4 w-48" />
            <div className="grid w-full grid-cols-2 gap-2">{times(4).map((i) => <Bone key={i} className={i < 2 ? "h-14 rounded-[14px]" : "h-9"} />)}</div>
          </div>
        )}
      </div>
    ) : mode === "analysis" ? (
      <div className={cn("grid min-h-0 flex-1 gap-4", !phone && "grid-cols-[minmax(0,1fr)_22rem] grid-rows-[auto_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_26rem]")}>
        <div className={cn(CARD, "h-[216px] gap-4 p-5 pt-4")}>
          <div className="flex gap-5"><Bone className="h-6 w-14" />{times(5).map((i) => <Bone key={i} className="h-4 w-16 self-end" />)}</div>
          {times(4).map((i) => <div key={i} className="flex items-center gap-3"><Bone className="h-4 w-20" /><Bone className="h-5 w-1/3" /><Bone className="ml-auto h-4 w-14" /><Bone className="h-4 w-14" /><Bone className="h-4 w-20" /></div>)}
        </div>
        {!phone && <div className={cn(CARD, "row-span-2 gap-4 p-5")}><div className="flex gap-4"><Bone className="size-16 rounded-[14px]" /><div className="flex flex-col gap-2"><Bone className="h-6 w-24" /><Bone className="h-3.5 w-44" /></div></div><div className="grid grid-cols-2 gap-2">{times(6).map((i) => <Bone key={i} className={i < 2 ? "h-9" : "h-[60px] rounded-[14px]"} />)}</div><Bone className="h-3.5 w-20" /><Bone className="h-5 w-56" /></div>}
        <div className={cn(CARD, "gap-3 overflow-hidden p-5 pt-4")}>
          <div className="flex gap-2"><Bone className="h-9 w-52" /><Bone className="h-9 w-48" /><Bone className="ml-auto size-9" /></div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 max-md:grid-cols-2">{times(12).map((i) => <Bone key={i} className="h-[74px] rounded-[18px] bg-muted/50" />)}</div>
        </div>
        {!phone && <div className="col-span-2 flex gap-2">{times(4).map((i) => <div key={i} className="flex h-24 flex-1 flex-col gap-3 rounded-[20px] bg-card p-3"><div className="flex justify-between"><Bone className="h-4 w-32" /><Bone className="h-9 w-20" /></div><Bone className="h-3 w-11/12" /></div>)}</div>}
      </div>
    ) : (
      // The cases trained, the battles: one card of a list or of tiles.
      <div className={cn(CARD, "flex-1 gap-4 overflow-hidden p-5")}>
        <div className="flex gap-2">{times(4).map((i) => <Bone key={i} className="h-8 w-16" />)}</div>
        {mode === "training" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-1.5">{times(36).map((i) => <Tile key={i} size="size-16" />)}</div>
        ) : (
          <Rows n={8} />
        )}
      </div>
    );
  const head =
    mode === "analysis" ? (
      <Head title="w-28" sub="w-36">{!phone && <><Bone className="h-9 w-36" /><Bone className="h-9 w-[592px] max-xl:w-80" /></>}</Head>
    ) : mode === "playground" ? (
      <header className="flex min-h-10 shrink-0 items-center gap-3">
        {!phone && <Bone className="size-9" />}
        <Bone className="h-8 w-32 max-md:mr-auto" />
        {phone ? <><Puzzle /><Bone className={ICON} /></> : <><Bone className="h-9 w-36" /><Bone className="size-9" /><Bone className="ml-auto h-9 w-[151px]" /><Bone className="h-9 w-[188px]" /></>}
      </header>
    ) : (
      <Head back={!phone} title="w-40" sub="w-32">{!phone && <><Bone className="h-9 w-32" /><Bone className="h-9 w-48" /></>}</Head>
    );
  return phone ? (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {head}
      {mode === "achievements" && <div className="flex shrink-0 flex-wrap gap-2"><Bone className="h-11 w-32" /><Bone className="h-11 w-48" /><Bone className="h-11 w-36" /></div>}
      {body}
    </div>
  ) : (
    <Page className="mx-auto w-full max-w-7xl">
      {head}
      {body}
    </Page>
  );
}

/** The profile on its way: the overview or a section (profile.tsx draws it too, until the profile's figures arrive). */
export function ProfileSkeleton({ phone, mode = s.profileMode }: { phone: boolean; mode?: string }) {
  const section = ["playground", "training", "achievements", "duels", "analysis"].includes(mode);
  if (!phone) return section ? <ProfileSection phone={false} mode={mode} /> : <ProfileOverview phone={false} />;
  return section ? <ProfileSection phone mode={mode} /> : <ProfileOverview phone />;
}

/** The profile's page on a phone: its tabs over the section (profile.tsx PhoneProfile). */
function PhoneProfileSkeleton({ mode }: { mode: string }) {
  return (
    <Page>
      <Bone className="h-11 w-full shrink-0" />
      <ProfileSkeleton phone mode={mode} />
    </Page>
  );
}

/** The fallback of the page the route opens, while its code (or, before the app starts, its data) loads. */
export function PageFallback({ phone }: { phone: boolean }) {
  const r = shownRoute(),
    page = r.page;
  return page === "training" && r.trainingStep === "setup" ? (
    <TrainingSkeleton phone={phone} />
  ) : page === "training" ? (
    <TimerSkeleton phone={phone} training />
  ) : page === "algorithms" ? (
    <AlgorithmsSkeleton phone={phone} />
  ) : page === "learn" ? (
    <LearnSkeleton phone={phone} method={r.learnMethod} />
  ) : page === "duel" ? (
    <DuelSkeleton phone={phone} />
  ) : page === "daily" ? (
    <DailySkeleton phone={phone} />
  ) : page === "coaching" ? (
    <CoachingSkeleton phone={phone} coaching={r.coaching} />
  ) : page === "community" ? (
    <CommunitySkeleton phone={phone} view={r.view} />
  ) : page === "tournaments" || page === "match" ? (
    <TournamentsSkeleton phone={phone} page={page} view={r.view} />
  ) : page === "profile" ? (
    phone ? <PhoneProfileSkeleton mode={r.profileMode} /> : <ProfileSkeleton phone={false} mode={r.profileMode} />
  ) : (
    <TimerSkeleton phone={phone} />
  );
}
