/**
 * The landing page at the site's root: the native app's page, drawn in its look (design C, Feuille: one periwinkle hue,
 * liquid glass, Bricolage Grotesque; see html.landing in globals.css). It offers the app to download (native/package.sh
 * builds it into the site's download/ at each deployment) and shows it with its own screenshots (desktop/assets/landing).
 * The build renders it to HTML (desktop/web.ts), so search engines and language models read it whole without JavaScript.
 */
import { useEffect } from "react";
import { ArrowUpRight, Box, Code, Coffee, Download, Heart, Monitor, Smartphone, Trophy, Upload, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "../logo";
import { FAQ, FEATURES, IMPORTS, NAME, SOURCE, type Feature } from "./content";
import { HeroCube } from "./HeroCube";
import { EVENTS } from "../../../src/shared/puzzles";
import { tr } from "../../../src/client/i18n";
import { LanguagePicker, said, useLanguage } from "../base";
import { language, preferred, setLanguage } from "../../../src/client/i18n";
import { localePath } from "../../../src/client/lib/route";

const COFFEE = "https://buymeacoffee.com/vitrixxl";
/** The native apps (native/package.sh), built into the site's download/ at each deployment. */
const DOWNLOADS = { android: "/download/qbix.apk", linux: "/download/qbix-linux-x86_64.tar.gz" };
const SHOT = "/assets/landing/";

/** A part's title, as large as the app's own figures. */
const TITLE = "text-[clamp(2.25rem,5.2vw,3.75rem)] leading-[0.98] font-extrabold tracking-[-0.045em] text-balance";

/** The app's mark: its 3×3 grid, one sticker in the accent (the rail's logo). */
function Mark({ size = 26 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="grid shrink-0 grid-cols-3" style={{ width: size, height: size, gap: size * 0.1 }}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={cn("rounded-[30%]", i === 2 ? "bg-primary" : "bg-foreground")} />)}
    </span>
  );
}

/** A file to download, as the app's buttons are: the main one in accent glass, the other in clear glass. */
function DownloadButton({ href, main, icon: Icon = Download, children, className }: { href: string; main?: boolean; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} download className={cn(main ? "glass-accent" : "glass-soft", "inline-flex h-13 items-center gap-2.5 rounded-full px-6 text-[0.95rem] font-bold whitespace-nowrap", className)}>
      <Icon className="size-[1.1rem]" aria-hidden="true" />
      {children}
    </a>
  );
}

/** A screenshot of the app in a pane of glass: the desktop's window, or a phone. */
function Shot({ name, alt, phone, className }: { name: string; alt: string; phone?: boolean; className?: string }) {
  return (
    <figure className={cn("glass shrink-0 overflow-hidden", phone ? "rounded-[2.4rem] p-1.5" : "rounded-[1.75rem] p-2", className)}>
      <img src={SHOT + name + ".webp"} alt={said(alt)} width={phone ? 540 : 1600} height={phone ? 1200 : 1000} loading="lazy" decoding="async" className={cn("block h-auto w-full", phone ? "rounded-[2rem]" : "rounded-[1.25rem]")} />
    </figure>
  );
}

/** What the app does, one feature after the other: its few words beside the screen that does it. */
const TOUR: { id: string; label: string; shot: string; alt: string; phone?: boolean }[] = [
  { id: "timer", label: "Timer", shot: "desk-timer", alt: "The timer, its time and averages" },
  { id: "algorithms", label: "Algorithms", shot: "desk-case", alt: "The OLL cases, one played on the 3D cube" },
  { id: "learn", label: "Methods", shot: "phone-algs", alt: "The F2L cases on a phone", phone: true },
  { id: "stats", label: "Progress", shot: "desk-profile", alt: "The statistics: every solve and its average" },
  { id: "duel", label: "Duels", shot: "desk-challenges", alt: "A duel, ready to face off" },
];
const feature = (id: string) => FEATURES.find((f) => f.id === id) as Feature;

function Stop({ id, label, shot, alt, phone, flip }: (typeof TOUR)[number] & { flip: boolean }) {
  const f = feature(id);
  return (
    <section id={id} className={cn("landing-reveal grid scroll-mt-24 grid-cols-[minmax(0,1fr)] items-center gap-8 lg:gap-16", flip ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]" : "lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]")}>
      <div className={cn("flex flex-col items-start gap-4", flip && "lg:order-2")}>
        <span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground">{said(label)}</span>
        <h2 className={TITLE}>{said(f.hook)}</h2>
        <p className="max-w-[46ch] text-lg leading-relaxed text-muted-foreground">{said(f.summary)}</p>
        <ul className="flex max-w-[50ch] flex-col gap-2 pt-1">
          {f.points.slice(0, 3).map((point) => (
            <li key={point} className="flex gap-2.5 leading-relaxed text-foreground/85">
              <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-primary" />
              {said(point)}
            </li>
          ))}
        </ul>
      </div>
      <div className={cn("flex", phone ? "justify-center" : "")}>
        <Shot name={shot} alt={alt} phone={phone} className={phone ? "w-[min(19rem,80%)]" : "w-full"} />
      </div>
    </section>
  );
}

/** A card of glass, as the app's sheets are. */
function Card({ id, icon: Icon, title, children, className }: { id?: string; icon: LucideIcon; title: string; children: React.ReactNode; className?: string }) {
  return (
    <article id={id} className={cn("glass landing-reveal flex scroll-mt-24 flex-col gap-3 rounded-[1.75rem] p-6 md:p-7", className)}>
      <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="text-xl font-bold tracking-tight text-balance">{said(title)}</h3>
      <div className="flex flex-1 flex-col gap-4 leading-relaxed text-muted-foreground">{children}</div>
    </article>
  );
}

/** Where to get the app: a phone, a computer; the rest to come. */
function Downloads() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card id="android" icon={Smartphone} title={tr("Android")}>
        <p>{tr("Open the file on your phone and allow installing from your browser when Android asks.")}</p>
        <DownloadButton main href={DOWNLOADS.android} className="mt-auto self-start">{tr("Download for Android")}</DownloadButton>
      </Card>
      <Card id="linux" icon={Monitor} title={tr("Linux")}>
        <p>{tr("Unpack the archive and run its install script: Qbix joins your applications.")}</p>
        <code className="rounded-2xl bg-muted px-3.5 py-2.5 font-mono text-xs break-all text-foreground">tar xf qbix-linux-x86_64.tar.gz && qbix/install.sh</code>
        <DownloadButton main href={DOWNLOADS.linux} className="mt-auto self-start">{tr("Download for Linux")}</DownloadButton>
      </Card>
    </div>
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
    nav = "rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";
  // The features without a screenshot, in cards; where it runs has its own part (#download).
  const others = FEATURES.filter((f) => f.id !== "everywhere" && !TOUR.some((stop) => stop.id === f.id));
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip text-foreground">
      <header className="sticky top-3 z-40 mx-auto w-full max-w-7xl px-3 md:top-4 md:px-6">
        <div className="glass flex h-16 items-center gap-3 rounded-full pr-2 pl-5 md:gap-5">
          <a href={localePath(language(), "/")} className="flex items-center gap-2.5 rounded-xl" aria-label={tr("{0} home", { 0: NAME })}>
            <Mark />
            <span className="text-xl font-extrabold tracking-[-0.04em]">{NAME}</span>
          </a>
          <nav aria-label={tr("Sections")} className="flex items-center gap-1 max-md:hidden">
            <a href="#tour" className={nav}>{tr("What it does")}</a>
            <a href="#download" className={nav}>{tr("Download")}</a>
            <a href="#faq" className={nav}>{tr("Questions")}</a>
          </nav>
          <span className="flex-1" />
          <LanguagePicker className="glass-soft h-11 w-auto rounded-full border-0 max-sm:hidden" />
          <a href="#download" className="glass-accent inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-bold">
            <Download className="size-4" aria-hidden="true" />
            {tr("Download")}
          </a>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-7xl items-center gap-x-10 gap-y-14 px-5 pt-14 pb-20 md:px-8 lg:min-h-[calc(100svh-6rem)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-10">
          <div className="flex flex-col items-start gap-6">
            <h1 className="landing-in flex flex-col gap-4">
              <span className="text-sm font-bold text-primary md:text-base">{tr("The free speedcubing app")}</span>{" "}
              <span className="text-[clamp(2.9rem,5.6vw,4.75rem)] leading-[0.92] font-extrabold tracking-[-0.05em] text-balance">
                {tr("From your first solve")}{" "}<span className="text-primary">{tr("to your next PB.")}</span>
              </span>
            </h1>
            <p className="landing-in max-w-[46ch] text-lg leading-relaxed text-muted-foreground [--i:1]">{tr("Time your solves, learn your first one step by step, play every algorithm in 3D, drill what you learned and race your friends. Free, without ads or premium tier.")}</p>
            <div className="landing-in flex flex-wrap items-center gap-3 [--i:2]">
              <DownloadButton main href={DOWNLOADS.android} icon={Smartphone}>{tr("Download for Android")}</DownloadButton>
              <DownloadButton href={DOWNLOADS.linux} icon={Monitor}>{tr("Download for Linux")}</DownloadButton>
            </div>
            <p className="landing-in text-sm font-medium text-muted-foreground [--i:3]">{tr("No account needed · works offline")}</p>
          </div>
          <div className="landing-in relative [--i:2] max-lg:mx-auto max-lg:w-full max-lg:max-w-2xl">
            <Shot name="desk-case" alt="Qbix on a computer: the OLL cases, one played on the 3D cube" className="w-full" />
            <Shot name="phone-timer" alt="Qbix on a phone: the timer" phone className="absolute -bottom-10 -left-4 w-[28%] md:-left-10" />
          </div>
        </section>

        <div id="tour" className="mx-auto flex w-full max-w-7xl scroll-mt-24 flex-col gap-24 px-5 py-16 md:gap-32 md:px-8 md:py-24">
          {TOUR.map((stop, i) => (
            <Stop key={stop.id} {...stop} flip={i % 2 === 1} />
          ))}
        </div>

        <section id="more" className="mx-auto flex w-full max-w-7xl scroll-mt-24 flex-col gap-10 px-5 py-16 md:px-8 md:py-24">
          <h2 className={TITLE}>{tr("And everything around it")}</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {others.map((f) => (
              <Card key={f.id} id={f.id} icon={f.id === "challenges" ? Trophy : Box} title={f.hook}>
                <p>{said(f.summary)}</p>
              </Card>
            ))}
            <Card id="free" icon={Heart} title={tr("Free. Really.")}>
              <p>{tr("No ads, ever. No premium tier: every feature for everyone, from the first solve to competition. No subscription, no trial.")}</p>
            </Card>
            <Card id="puzzles" icon={Box} title={tr("Every WCA event")}>
              <ul aria-label={tr("Puzzles")} className="flex flex-wrap gap-2">
                {EVENTS.map((e) => (
                  <li key={e.id} title={said(e.label)} aria-label={said(e.label)} className="flex size-10 items-center justify-center rounded-2xl bg-muted">
                    <Logo size={22} puzzle={e.id} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card id="import" icon={Upload} title={tr("Switch from your timer in a minute")}>
              <p>{tr("Export your times from your current timer and drop the file in Qbix, with their dates, penalties, scrambles and sessions.")}</p>
              <ul aria-label={tr("Timers you can import from")} className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-foreground">
                {IMPORTS.map((name) => <li key={name}>{said(name)}</li>)}
              </ul>
            </Card>
            <Card id="source" icon={Code} title={tr("Open source")}>
              <p>
                {said(NAME)} {" "}{tr("is an independent project, and its code is public.")}{" "}
                <a href={SOURCE} className="inline-flex items-center gap-1 rounded-sm font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-primary">
                  {tr("Read it on GitHub")}<ArrowUpRight className="size-4" />
                </a>
              </p>
            </Card>
          </div>
        </section>

        <section id="download" className="mx-auto flex w-full max-w-7xl scroll-mt-24 flex-col gap-10 px-5 py-16 md:px-8 md:py-24">
          <div className="flex flex-col gap-4">
            <h2 className={TITLE}>{tr("Take Qbix with you")}</h2>
            <p className="max-w-[56ch] text-lg leading-relaxed text-muted-foreground">{tr("The app, drawn by your graphics card: the timer, the algorithms and the training, even without a connection.")}</p>
          </div>
          <Downloads />
          <p className="text-sm font-medium text-muted-foreground">{tr("Windows, macOS and iPhone are on their way.")}</p>
        </section>

        <section id="faq" className="mx-auto flex w-full max-w-7xl scroll-mt-24 flex-col gap-10 px-5 py-16 md:px-8 md:py-24">
          <h2 className={TITLE}>{tr("Questions")}</h2>
          <dl className="glass grid gap-x-12 gap-y-9 rounded-[1.75rem] p-7 md:grid-cols-2 md:p-10">
            {FAQ.map((item) => (
              <div key={item.question} className="flex flex-col gap-2">
                <dt className="text-lg font-bold tracking-tight">{said(item.question)}</dt>
                <dd className="max-w-[60ch] leading-relaxed text-muted-foreground">{said(item.answer)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto grid w-full max-w-7xl items-center gap-x-16 gap-y-10 px-5 pt-16 pb-24 md:px-8 md:pb-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col items-start gap-8">
            <h2 className={cn(TITLE, "max-w-[12ch]")}>{tr("Ready for your next PB?")}</h2>
            <div className="flex flex-wrap gap-3">
              <DownloadButton main href={DOWNLOADS.android} icon={Smartphone}>{tr("Download for Android")}</DownloadButton>
              <DownloadButton href={DOWNLOADS.linux} icon={Monitor}>{tr("Download for Linux")}</DownloadButton>
            </div>
          </div>
          <div className="glass rounded-[1.75rem] p-6 md:p-8">
            <HeroCube />
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-7xl px-3 pb-4 md:px-6">
        <div className="glass flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[1.75rem] px-6 py-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2 text-foreground">
            <Mark size={20} />
            <span className="text-lg font-extrabold tracking-[-0.04em]">{NAME}</span>
          </span>
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
          <LanguagePicker className="glass-soft w-auto rounded-full border-0 sm:hidden" />
          <span className="w-full text-xs">{tr("Not affiliated with Rubik's Brand Ltd or the World Cube Association.")}</span>
        </div>
      </footer>
    </div>
  );
}
