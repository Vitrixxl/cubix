/**
 * The landing page at the site's root. The build renders it to HTML (desktop/web.ts), so search engines and language
 * models read it whole without JavaScript; the browser then hydrates it for what needs the visitor's device: the cube
 * that solves itself at the top (HeroCube.tsx) and the live copies of the app's screens that show what it does (Demos.tsx).
 */
import { useEffect } from "react";
import { ArrowRight, ArrowUpRight, Coffee, MonitorSmartphone, Upload, Video, Heart, Code, Box } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Brand, Logo } from "../logo";
import { FAQ, FEATURES, IMPORTS, NAME, SOURCE, type Feature } from "./content";
import { CubeStill, HeroCube } from "./HeroCube";
import { AlgDemo, DuelDemo, LessonDemo, TimerDemo, TrainDemo } from "./Demos";
import { EVENTS } from "../../../src/shared/puzzles";
import { tr } from "../../../src/client/i18n";
import { LanguagePicker, said, useLanguage } from "../base";
import { language, preferred, setLanguage } from "../../../src/client/i18n";
import { localePath } from "../../../src/client/lib/route";

const COFFEE = "https://buymeacoffee.com/vitrixxl";

/** A link drawn as a button: navigation stays a real link, for people and search engines alike. */
function LinkButton({ href, size = "default", variant = "default", className, children }: { href: string; size?: "default" | "sm"; variant?: "default" | "outline" | "secondary" | "ghost"; className?: string; children: React.ReactNode }) {
  // The app's pages in the page's language (/fr/timer).
  return (
    <a href={href.startsWith("/") ? localePath(language(), href) : href} className={cn(buttonVariants({ size, variant }), className)}>
      {children}
    </a>
  );
}

/** A part of the page in its column. */
function Section({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("mx-auto w-full max-w-7xl scroll-mt-20 px-5 py-16 md:px-8 md:py-24", className)}>
      {children}
    </section>
  );
}
/** A part's title, as large as the app's own figures. */
const TITLE = "text-[clamp(2.25rem,5.5vw,4rem)] leading-[0.95] font-extrabold tracking-[-0.045em] text-balance";

/**
 * What the app does, one feature after the other: its few words and what it lets you do beside a live copy of its
 * screen. The order is a cuber's: time, learn the first solve, the algorithms, drill them, race.
 */
const TOUR: { id: string; label: string; dot: string; demo: () => React.ReactNode; open?: [string, string] }[] = [
  { id: "timer", label: "Timer", dot: "bg-primary", demo: TimerDemo, open: ["/timer?puzzle=333", "Open the timer"] },
  { id: "learn", label: "First solve", dot: "bg-success", demo: LessonDemo, open: ["/learn?puzzle=333", "Start the course"] },
  { id: "algorithms", label: "Algorithms", dot: "bg-lilac", demo: AlgDemo, open: ["/algorithms?puzzle=333", "Browse the algorithms"] },
  { id: "training", label: "Training", dot: "bg-warning", demo: TrainDemo },
  { id: "duel", label: "Duels", dot: "bg-destructive", demo: DuelDemo, open: ["/duel", "Find an opponent"] },
];
const feature = (id: string) => FEATURES.find((f) => f.id === id) as Feature;

function Stop({ id, label, dot, demo: Demo, open, flip }: (typeof TOUR)[number] & { flip: boolean }) {
  const f = feature(id);
  return (
    <section id={id} className="landing-reveal grid scroll-mt-20 grid-cols-[minmax(0,1fr)] items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <div className={cn("flex flex-col items-start gap-5", flip && "lg:order-2")}>
        <span className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <span className={cn("size-2 rounded-full", dot)} />
          {said(label)}
        </span>
        <h2 className={TITLE}>{said(f.hook)}</h2>
        <p className="max-w-[46ch] text-lg leading-relaxed text-muted-foreground">{said(f.summary)}</p>
        {open && (
          <LinkButton href={open[0]} variant="secondary">
            {said(open[1])}
            <ArrowRight data-icon="inline-end" />
          </LinkButton>
        )}
      </div>
      <Demo />
    </section>
  );
}

/** Names side by side, as a sentence would list them. */
function Names({ label, names }: { label: string; names: string[] }) {
  return (
    <ul aria-label={said(label)} className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-foreground">
      {names.map((name) => (
        <li key={name}>{said(name)}</li>
      ))}
    </ul>
  );
}

/** One of the things around the features, in a card of its own. */
function Extra({ id, icon: Icon, title, children }: { id?: string; icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <article id={id} className="landing-reveal flex scroll-mt-20 flex-col gap-3 rounded-3xl bg-card p-6 md:p-7">
      <Icon className="size-5 text-primary" />
      <h3 className="text-xl font-bold tracking-tight text-balance">{said(title)}</h3>
      <div className="flex flex-col gap-4 leading-relaxed text-muted-foreground">{children}</div>
    </article>
  );
}

export function Landing() {
  // The root arrives in English for every visitor; once React has taken it over, it takes the device's language. A
  // page of its own language (/fr/…) keeps it: that is the page a search engine shows for it.
  useLanguage();
  useEffect(() => {
    if (location.pathname !== "/") return;
    const chosen = preferred();
    if (chosen !== "en") void setLanguage(chosen, false);
  }, []);
  const link = "rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground",
    nav = "rounded-lg px-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground";
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-5 md:px-8">
          <a href={localePath(language(), "/")} className="rounded-xl" aria-label={tr("{0} home", { 0: NAME })}>
            <Brand size={30} className="text-2xl" />
          </a>
          <nav aria-label={tr("Sections")} className="flex items-center gap-5 max-md:hidden">
            <a href="#tour" className={nav}>{tr("What it does")}</a>
            <a href="#faq" className={nav}>{tr("Questions")}</a>
          </nav>
          <span className="flex-1" />
          <LanguagePicker className="h-10 w-auto max-sm:hidden" />
          <LinkButton href="/timer?puzzle=333">{tr("Open Qbix")}</LinkButton>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-7xl items-center gap-x-12 gap-y-10 px-5 pt-8 pb-16 md:px-8 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-8">
          <div className="flex flex-col items-start gap-5">
            <h1 className="landing-in flex flex-col gap-4">
              <span className="text-sm font-bold text-primary md:text-base">{tr("The free speedcubing app")}</span>
              <span className="text-[clamp(2.9rem,5.6vw,4.75rem)] leading-[0.9] font-extrabold tracking-[-0.05em] text-balance">
                {tr("From your first solve")}{" "}<span className="text-primary">{tr("to your next PB.")}</span>
              </span>
            </h1>
            <p className="landing-in max-w-[48ch] text-lg leading-relaxed text-muted-foreground [--i:1]">{tr("Time your solves, learn your first one step by step, play every algorithm in 3D, drill what you learned and race your friends. Free, without ads or premium tier.")}</p>
            <div className="landing-in flex w-full flex-wrap items-center gap-x-5 gap-y-3 [--i:2]">
              <LinkButton href="/timer?puzzle=333">
                {tr("Open Qbix in your browser")}
                <ArrowRight data-icon="inline-end" />
              </LinkButton>
              <p className="max-w-[30ch] text-sm font-medium text-muted-foreground">{tr("No account needed · works offline")}</p>
            </div>
          </div>
          <HeroCube />
        </section>

        <div id="tour" className="mx-auto flex w-full max-w-7xl scroll-mt-16 flex-col gap-24 px-5 py-16 md:gap-36 md:px-8 md:py-24">
          {TOUR.map((stop, i) => (
            <Stop key={stop.id} {...stop} flip={i % 2 === 1} />
          ))}
        </div>

        <Section id="more" className="flex flex-col gap-10">
          <h2 className={TITLE}>{tr("And everything around it")}</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Extra id="free" icon={Heart} title={tr("Free. Really.")}>
              <p>{tr("No ads, ever. No premium tier: every feature for everyone, from the first solve to competition. No subscription, no trial.")}</p>
            </Extra>
            <Extra id="puzzles" icon={Box} title={tr("Every WCA event")}>
              <ul aria-label={tr("Puzzles")} className="flex flex-wrap gap-2">
                {EVENTS.map((e) => (
                  <li key={e.id} title={said(e.label)} aria-label={said(e.label)} className="flex size-10 items-center justify-center rounded-xl bg-muted">
                    <Logo size={22} puzzle={e.id} />
                  </li>
                ))}
              </ul>
            </Extra>
            <Extra id="coaching" icon={Video} title={feature("coaching").title}>
              <p>{said(feature("coaching").summary)}</p>
              <p>{tr("Only a coaching session has a price, and its coach sets it.")}</p>
            </Extra>
            <Extra id="everywhere" icon={MonitorSmartphone} title={feature("everywhere").title}>
              <p>{tr("Every solve is saved on your device first, then synced to your other devices. The timer, the algorithms and the training work without a connection.")}</p>
            </Extra>
            <Extra id="import" icon={Upload} title={tr("Switch from your timer in a minute")}>
              <p>{tr("Export your times from your current timer and drop the file in Qbix, with their dates, penalties, scrambles and sessions.")}</p>
              <Names label={tr("Timers you can import from")} names={IMPORTS} />
            </Extra>
            <Extra id="source" icon={Code} title={tr("Open source")}>
              <p>
                {said(NAME)} {" "}{tr("is an independent project, and its code is public.")}{" "}
                <a href={SOURCE} className="inline-flex items-center gap-1 rounded-sm font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-primary">
                  {tr("Read it on GitHub")}<ArrowUpRight className="size-4" />
                </a>
              </p>
            </Extra>
          </div>
        </Section>

        <Section id="faq" className="flex flex-col gap-10">
          <h2 className={TITLE}>{tr("Questions")}</h2>
          <dl className="grid gap-x-12 gap-y-9 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.question} className="flex flex-col gap-2">
                <dt className="text-lg font-bold tracking-tight">{said(item.question)}</dt>
                <dd className="max-w-[60ch] leading-relaxed text-muted-foreground">{said(item.answer)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section className="grid items-center gap-x-16 gap-y-9 pb-24 md:pb-32 lg:grid-cols-[minmax(0,1fr)_auto]">
          {/* Where the page began scrambled, it ends solved. */}
          <CubeStill solved className="size-72 max-lg:hidden lg:order-2 xl:size-80" />
          <div className="flex flex-col items-start gap-8">
            <h2 className={cn(TITLE, "max-w-[12ch]")}>{tr("Ready for your next PB?")}</h2>
            <LinkButton href="/timer?puzzle=333">
              {tr("Open Qbix in your browser")}
              <ArrowRight data-icon="inline-end" />
            </LinkButton>
          </div>
        </Section>
      </main>

      <footer className="bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-8 text-sm text-muted-foreground md:px-8">
          <Brand size={22} className="text-lg text-foreground" />
          <span>{tr("The free speedcubing app")}</span>
          <span className="flex-1" />
          <a href={COFFEE} target="_blank" rel="noreferrer" className={cn(link, "inline-flex items-center gap-1.5 font-semibold text-primary hover:text-primary/80")}>
            <Coffee className="size-4" />
            {tr("Buy me a coffee")}</a>
          <a href={SOURCE} className={link}>
            {tr("Source code")}</a>
          <a href="/llms.txt" className={link}>
            {tr("llms.txt")}</a>
          <a href="/legal" className={link}>
            {tr("Legal notice")}</a>
          <a href="/privacy" className={link}>
            {tr("Privacy policy")}</a>
          <a href="/terms" className={link}>
            {tr("Terms of use")}</a>
          <a href="/privacy#cookies" className={link}>
            {tr("Cookies")}</a>
          <LanguagePicker className="w-auto sm:hidden" />
          <span className="w-full text-xs">{tr("Not affiliated with Rubik's Brand Ltd or the World Cube Association.")}</span>
        </div>
      </footer>
    </div>
  );
}
