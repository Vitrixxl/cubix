/**
 * Each page on its way, shaped like it: drawn while its code loads on first use (app.tsx), so the page fills in place
 * instead of jumping from a generic shape. Kept light: no page module is imported here.
 */
import { store as s } from "./store";
import { ListSkeleton, PAGE, PageSkeleton } from "./base";
import { tr } from "../../src/client/i18n";
import { cn } from "@/lib/utils";
import { Skeleton as Bone } from "@/components/ui/skeleton";

const BUSY = { "aria-busy": true } as const;
/** A surface of the page: the outline of a Card. */
const BOX = "flex min-h-0 flex-col rounded-xl bg-card ring-1 ring-foreground/10";
const times = (n: number) => Array.from({ length: n }, (_, i) => i);

function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(PAGE, className)} {...BUSY} aria-label={tr("Loading")}>
      {children}
    </div>
  );
}

/** The page header (base.tsx PageHead): the way back, the title and its line, the controls; the puzzle on phones. */
function Head({ back, title = "w-32", sub, puzzle, phone, children }: { back?: boolean; title?: string; sub?: string; puzzle?: boolean; phone: boolean; children?: React.ReactNode }) {
  return (
    <header className="flex min-h-10 shrink-0 items-center justify-between gap-x-2 md:justify-start md:gap-x-6">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        {back && <Bone className="size-8 shrink-0 max-md:size-10" />}
        <div className="flex min-w-0 items-baseline gap-2 md:gap-3">
          <Bone className={cn("h-7 shrink-0 md:h-8", title)} />
          {sub && <Bone className={cn("h-4 min-w-0", sub)} />}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {phone ? puzzle && <Bone className="h-9 w-20" /> : children}
      </div>
    </header>
  );
}

/** The large cards to pick from (picker.tsx), centred like them. */
function Picker({ count }: { count: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-4">
      <div className="my-auto flex w-full flex-col items-center md:pb-[6vh]">
        <div className={cn("grid w-full auto-rows-fr gap-3 md:gap-4", count === 2 || count === 4 ? "max-w-5xl md:grid-cols-2" : "max-w-7xl md:grid-cols-2 lg:grid-cols-3")}>
          {times(count).map((i) => (
            <div key={i} className="flex min-h-28 flex-col gap-3 rounded-xl border bg-card p-4 md:min-h-44 md:p-5">
              <div className="flex items-center gap-3">
                <Bone className="size-10 shrink-0 rounded-lg" />
                <Bone className="h-5 w-28" />
              </div>
              <Bone className="h-4 w-full" />
              <Bone className="h-4 w-2/3" />
              <Bone className="mt-auto h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A grid of case tiles (algorithms.tsx TILES). */
function Tiles({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5", className)}>
      {times(count).map((i) => (
        <Bone key={i} className="aspect-[1/0.95] rounded-lg" />
      ))}
    </div>
  );
}

/** A row of figures in their muted band (base.tsx Strip). */
function Strip({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cn("grid shrink-0 gap-x-6 gap-y-3 rounded-xl border bg-muted/45 px-4 py-3", className)}>
      {times(count).map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Bone className="h-3 w-16" />
          <Bone className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

function TrainingSkeleton({ phone }: { phone: boolean }) {
  if (s.setupMode)
    return (
      <Page>
        <Head back title="w-36" sub="w-56 max-md:w-24" puzzle phone={phone} />
        <div className={cn(BOX, "flex-1 items-center justify-center gap-6 p-6")}>
          <Bone className="h-4 w-80 max-w-full" />
          <div className="flex w-full max-w-md gap-3">
            {times(3).map((i) => <Bone key={i} className="h-24 flex-1 rounded-xl" />)}
          </div>
          <Bone className="h-11 w-40" />
        </div>
      </Page>
    );
  return (
    <Page>
      <Head title="w-28" sub="w-36 max-md:w-24" puzzle phone={phone} />
      <Picker count={3} />
    </Page>
  );
}

function AlgorithmsSkeleton({ phone }: { phone: boolean }) {
  const list = (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">{["w-16", "w-24", "w-20"].map((w) => <Bone key={w} className={cn("h-7", w)} />)}</div>
        <div className="flex gap-2">{["w-14", "w-24", "w-20"].map((w) => <Bone key={w} className={cn("h-7", w)} />)}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden border-t pt-3">
        {[4, 10].map((n, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Bone className="h-5 w-36" />
            <Tiles count={n} />
          </div>
        ))}
      </div>
    </>
  );
  if (phone)
    return (
      <Page>
        <Head title="w-32" sub="w-28" puzzle phone />
        <Bone className="h-10 w-full shrink-0" />
        <Bone className="h-9 w-60 shrink-0" />
        {list}
      </Page>
    );
  return (
    <Page>
      <Head title="w-36" sub="w-28" phone={false}>
        <Bone className="h-8 w-56 max-lg:w-10" />
        <Bone className="h-8 w-24" />
      </Head>
      <div className="flex min-h-0 flex-1 gap-6 xl:gap-8">
        <div className="flex min-h-0 w-[min(22rem,36%)] shrink-0 flex-col gap-3">
          <Bone className="h-9 w-full shrink-0" />
          <div className={cn(BOX, "min-h-0 flex-1 gap-3 p-3")}>{list}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 pt-1">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Bone className="h-7 w-24" />
              <Bone className="h-4 w-80 max-w-full" />
            </div>
            <Bone className="h-8 w-24" />
          </div>
          <Strip count={4} className="grid-cols-4" />
          <Bone className="mt-2 h-5 w-24" />
          {times(6).map((i) => (
            <div key={i} className="flex items-center gap-6">
              <Bone className="h-4 w-36" />
              <Bone className="h-1.5 w-48" />
              <Bone className="h-4 w-10" />
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}

function LearnSkeleton({ phone }: { phone: boolean }) {
  if (!s.learnMethod)
    return (
      <Page>
        <Head title="w-24" sub="w-80 max-md:w-28" puzzle phone={phone} />
        <Picker count={s.puzzle === "333" ? 4 : 2} />
      </Page>
    );
  if (phone)
    return (
      <Page>
        <Head back title="w-28" sub="w-32" phone>
          <Bone className="size-9" />
        </Head>
        <div className={cn(BOX, "flex-1")}>
          <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
            <Bone className="size-4 rounded-full" />
            <Bone className="h-5 w-32" />
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <Bone className="h-5 w-full" />
            <Bone className="h-5 w-4/5" />
            <Bone className="mt-3 h-3 w-12" />
            {times(3).map((i) => <Bone key={i} className="h-4 w-11/12" />)}
          </div>
          <div className="flex shrink-0 items-center justify-between border-t p-3">
            <Bone className="h-9 w-24" />
            <Bone className="h-10 w-52" />
          </div>
        </div>
      </Page>
    );
  return (
    <Page>
      <Head back title="w-36" sub="w-56" phone={false}>
        <Bone className="h-8 w-36" />
      </Head>
      <div className={cn(BOX, "shrink-0 flex-row items-center gap-3 px-3 py-3")}>
        <Bone className="h-8 w-56 shrink-0" />
        <div className="flex min-w-0 flex-1 gap-3 overflow-hidden">
          {times(6).map((i) => <Bone key={i} className="h-8 w-36 shrink-0" />)}
        </div>
        <Bone className="h-8 w-28 shrink-0" />
      </div>
      <div className="flex min-h-0 flex-1 gap-6">
        <div className={cn(BOX, "w-80 shrink-0 gap-3 self-start p-5 xl:w-96")}>
          <Bone className="h-5 w-full" />
          <Bone className="h-5 w-11/12" />
          <Bone className="h-5 w-1/3" />
          <Bone className="mt-3 h-3 w-10" />
          {times(4).map((i) => <Bone key={i} className="h-4 w-11/12" />)}
        </div>
        <div className="grid min-w-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] content-start gap-3">
          {times(6).map((i) => <Bone key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    </Page>
  );
}

function DuelSkeleton({ phone }: { phone: boolean }) {
  return (
    <Page>
      <Head title="w-20" puzzle phone={phone} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center pb-[6vh] max-md:justify-end max-md:pb-0">
        <div className={cn(BOX, "w-full max-w-lg items-center gap-6 p-6")}>
          <Bone className="mt-2 size-16 rounded-full" />
          <Bone className="h-7 w-44" />
          <div className="flex w-full flex-col items-center gap-2">
            <Bone className="h-4 w-64" />
            <Bone className="h-4 w-52" />
          </div>
          <Strip count={3} className="w-full grid-cols-3" />
          <Bone className="h-10 w-full max-md:h-11" />
        </div>
      </div>
    </Page>
  );
}

/** Conversations on the left, the open one beside: messages and coaching's messages. */
function Conversations({ phone, open, details }: { phone: boolean; open: boolean; details?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      {(!phone || !open) && (
        <div className={cn(BOX, "w-80 shrink-0 max-md:w-full")}>
          <div className="shrink-0 p-2 pb-1">
            <Bone className="h-9 w-full" />
          </div>
          <ListSkeleton rows={phone ? 8 : 5} />
        </div>
      )}
      {(!phone || open) && (
        <div className={cn(BOX, "min-w-0 flex-1 flex-row overflow-hidden")}>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
              <Bone className="size-8 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Bone className="h-4 w-28" />
                <Bone className="h-3 w-16" />
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-hidden p-4">
              {["w-56", "w-72", "w-44", "w-64"].map((w, i) => (
                <div key={i} className={cn("flex items-end gap-2", i % 2 && "flex-row-reverse")}>
                  {i % 2 === 0 && <Bone className="size-7 shrink-0 rounded-full" />}
                  <Bone className={cn("h-10 max-w-[70%] rounded-2xl", w)} />
                </div>
              ))}
            </div>
            <div className="shrink-0 p-3">
              <Bone className="h-10 w-full rounded-lg" />
            </div>
          </div>
          {details && (
            <div className="flex w-80 shrink-0 flex-col items-center gap-3 border-l p-5 max-xl:hidden">
              <Bone className="size-14 rounded-full" />
              <Bone className="h-6 w-32" />
              <Bone className="h-4 w-48" />
              <ListSkeleton rows={6} className="w-full p-0 pt-4" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommunitySkeleton({ phone }: { phone: boolean }) {
  const open = /^(messages|groups)\/./.test(s.view);
  return (
    <Page>
      <Head title="w-36" sub="w-32 max-md:hidden" phone={false}>
        <Bone className="size-8 max-md:size-9" />
        <Bone className="h-8 w-24 max-md:w-9" />
        <Bone className="h-8 w-28 max-md:w-9" />
      </Head>
      <Conversations phone={phone} open={open} details />
    </Page>
  );
}

function CoachingSkeleton({ phone }: { phone: boolean }) {
  const view = s.coachingView.split("/")[0];
  return (
    <Page>
      <Head title="w-36" phone={false}>
        {phone && <Bone className="h-8 w-32" />}
      </Head>
      {view === "messages" ? (
        <Conversations phone={phone} open={!!s.coachingView.split("/")[1]} />
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Bone className="h-8 w-72 max-md:w-full" />
            <Bone className="h-8 w-44" />
          </div>
          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3 overflow-hidden">
            {times(phone ? 3 : 8).map((i) => (
              <div key={i} className={cn(BOX, "gap-4 p-4")}>
                <div className="flex gap-3">
                  <Bone className="size-16 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2 pt-1">
                    <Bone className="h-5 w-28" />
                    <Bone className="h-3 w-24" />
                    <Bone className="h-3 w-32" />
                  </div>
                  <Bone className="h-5 w-10" />
                </div>
                <Bone className="h-4 w-4/5" />
                <Bone className="h-9 w-full rounded-lg" />
                <div className="flex justify-between">
                  <Bone className="h-4 w-16" />
                  <Bone className="h-4 w-28" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

function TournamentsSkeleton({ phone }: { phone: boolean }) {
  if (s.page === "match" || s.view)
    return (
      <Page>
        <Head back title="w-40" phone={phone} />
        <Bone className="h-18 shrink-0 rounded-xl" />
        <div className="flex min-h-0 flex-1 gap-4">
          <div className={cn(BOX, "min-w-0 flex-1 gap-3 p-4")}>
            <Bone className="h-5 w-24" />
            <div className="flex flex-1 gap-14">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-1 flex-col justify-around gap-3">
                  {times(4 >> i).map((k) => <Bone key={k} className="h-24 rounded-xl" />)}
                </div>
              ))}
            </div>
          </div>
          <div className={cn(BOX, "w-64 shrink-0 p-2 max-md:hidden")}>
            <ListSkeleton rows={6} className="p-0" />
          </div>
        </div>
      </Page>
    );
  return (
    <Page>
      <Head title="w-40" sub="w-56 max-md:w-24" phone={phone} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {[2, 2].map((n, g) => (
          <section key={g} className="flex flex-col gap-3 pb-2">
            <Bone className="mt-2 h-5 w-32" />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-4">
              {times(n).map((i) => (
                <div key={i} className={cn(BOX, "gap-3 p-4")}>
                  <div className="flex items-start gap-3">
                    <Bone className="size-10 shrink-0 rounded-lg" />
                    <div className="flex flex-1 flex-col gap-2">
                      <Bone className="h-5 w-36" />
                      <Bone className="h-4 w-52" />
                    </div>
                    <Bone className="h-5 w-24 rounded-full" />
                  </div>
                  <Bone className="h-4 w-64 max-w-full" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}

/** The profile's overview on its way (profile.tsx draws it too, until its figures arrive). */
export function ProfileSkeleton({ phone }: { phone: boolean }) {
  return phone ? (
    <div className="flex flex-col gap-3" {...BUSY} aria-label={tr("Loading")}>
      <Bone className="h-36 rounded-xl" />
      <Bone className="h-48 rounded-xl" />
      <Bone className="h-72 rounded-xl" />
    </div>
  ) : (
    <div className={cn(PAGE, "mx-auto w-full max-w-7xl")} {...BUSY} aria-label={tr("Loading")}>
      <div className="flex min-h-10 shrink-0 items-center gap-6">
        <Bone className="h-8 w-28" />
        <div className="flex gap-1">
          <Bone className="size-8" />
          <Bone className="size-8" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid shrink-0 grid-cols-[20rem_minmax(0,1fr)] gap-4 2xl:grid-cols-[22rem_minmax(0,1fr)]">
          <div className={cn(BOX, "gap-4 p-5")}>
            <div className="flex items-center gap-4">
              <Bone className="size-12 rounded-full" />
              <div className="flex flex-col gap-2">
                <Bone className="h-5 w-20" />
                <Bone className="h-4 w-28" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {times(6).map((i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Bone className="h-3 w-14" />
                  <Bone className="h-5 w-12" />
                </div>
              ))}
            </div>
          </div>
          <div className={cn(BOX, "gap-4 p-5")}>
            <Bone className="h-5 w-48" />
            <Bone className="h-24 w-full rounded-lg" />
            <Bone className="h-3 w-28" />
          </div>
        </div>
        <div className={cn(BOX, "min-h-64 flex-1 gap-4 p-5")}>
          <div className="flex items-center gap-4">
            <Bone className="h-6 w-16" />
            <Bone className="h-4 w-32" />
            <Bone className="ml-auto h-4 w-48" />
          </div>
          <div className="grid grid-cols-5 gap-4">
            {times(5).map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Bone className="h-3 w-16" />
                <Bone className="h-6 w-20" />
              </div>
            ))}
          </div>
          <Bone className="min-h-0 flex-1 rounded-lg" />
        </div>
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_19rem] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22rem]">
          {times(3).map((i) => (
            <div key={i} className={cn(BOX, "h-44 gap-4 p-5")}>
              <Bone className="h-5 w-40" />
              {times(3).map((k) => <Bone key={k} className="h-4 w-full" />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A section of the profile: its header, the timer's figures, then one card (a chart, tiles or a list). */
function ProfileSection({ phone }: { phone: boolean }) {
  const mode = s.profileMode,
    body = (
      <>
        {mode === "playground" && <Strip count={7} className="grid-cols-3 md:grid-cols-7" />}
        <div className={cn(BOX, "flex-1 gap-4 p-5")}>
          {mode !== "duels" && mode !== "analysis" && (
            <div className="flex shrink-0 items-center gap-2">
              {times(mode === "achievements" ? 3 : 4).map((i) => <Bone key={i} className="h-7 w-14" />)}
              {!phone && <Bone className="ml-auto h-8 w-60" />}
            </div>
          )}
          {mode === "training" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <Bone className="h-5 w-40" />
              <Tiles count={36} className="md:grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))]" />
            </div>
          ) : mode === "achievements" ? (
            <div className="grid min-h-0 flex-1 auto-rows-max gap-x-8 gap-y-5 overflow-hidden md:grid-cols-2">
              {times(20).map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Bone className="size-9 shrink-0 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Bone className="h-4 w-28" />
                    <Bone className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : mode === "playground" ? (
            <div className="flex min-h-0 flex-1 gap-3">
              <div className="flex flex-col justify-between py-2">{times(4).map((i) => <Bone key={i} className="h-3 w-10" />)}</div>
              <Bone className="flex-1 rounded-lg" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <Bone className="size-10 rounded-lg" />
              <Bone className="h-4 w-48" />
              <Bone className="h-4 w-72 max-w-full" />
            </div>
          )}
        </div>
      </>
    );
  return phone ? (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Head title="w-24" sub="w-20" phone={false}>
        <Bone className="h-8 w-36" />
      </Head>
      {body}
    </div>
  ) : (
    <Page className="mx-auto w-full max-w-7xl">
      <Head back title="w-36" sub="w-36" phone={false}>
        {mode !== "duels" && mode !== "achievements" && <Bone className="h-8 w-24" />}
        {mode === "playground" && <Bone className="h-8 w-40" />}
      </Head>
      {body}
    </Page>
  );
}

function ProfilePageSkeleton({ phone }: { phone: boolean }) {
  const section = ["playground", "training", "achievements", "duels", "analysis"].includes(s.profileMode);
  if (!phone) return section ? <ProfileSection phone={false} /> : <ProfileSkeleton phone={false} />;
  return (
    <Page>
      <Bone className="h-11 w-full shrink-0 rounded-lg" />
      {section ? <ProfileSection phone /> : <ProfileSkeleton phone />}
    </Page>
  );
}

/** The fallback of the page the route opens, while its code loads. */
export function PageFallback({ phone }: { phone: boolean }) {
  const page = s.page;
  return page === "training" && s.trainingStep === "setup" ? (
    <TrainingSkeleton phone={phone} />
  ) : page === "algorithms" ? (
    <AlgorithmsSkeleton phone={phone} />
  ) : page === "learn" ? (
    <LearnSkeleton phone={phone} />
  ) : page === "duel" ? (
    <DuelSkeleton phone={phone} />
  ) : page === "coaching" ? (
    <CoachingSkeleton phone={phone} />
  ) : page === "community" ? (
    <CommunitySkeleton phone={phone} />
  ) : page === "tournaments" || page === "match" ? (
    <TournamentsSkeleton phone={phone} />
  ) : page === "profile" ? (
    <ProfilePageSkeleton phone={phone} />
  ) : (
    <PageSkeleton side={!phone} />
  );
}
