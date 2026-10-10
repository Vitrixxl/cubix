/**
 * The landing page at the site's root. The build renders it to HTML (desktop/web.ts), so search engines and language
 * models read it whole without JavaScript; the browser then hydrates it for what needs the visitor's device: the
 * platform it runs on, the install command to copy, the APK's size, the cube that solves itself at the top
 * (HeroCube.tsx) and the live copies of the app's screens that show what it does (Demos.tsx).
 */
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Coffee, Copy, Download, Globe, MonitorSmartphone, Upload, Video, Heart, Code, Box } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Brand, Logo } from "../logo";
import { FAQ, FEATURES, IMPORTS, NAME, SITE, SOURCE, type Feature } from "./content";
import { CubeStill, HeroCube } from "./HeroCube";
import { AlgDemo, DuelDemo, LessonDemo, TimerDemo, TrainDemo } from "./Demos";
import { EVENTS } from "../../../src/shared/puzzles";
import { tr } from "../../../src/client/i18n";
import { LanguagePicker, Segmented, said, useLanguage } from "../base";
import { language, preferred, setLanguage } from "../../../src/client/i18n";
import { localePath } from "../../../src/client/lib/route";

export type Platform = "linux" | "windows" | "macos" | "android" | "ios" | "web";
/** The visitor's platform, from the browser's user agent; iPads present themselves as Macs with touch. */
export function detectPlatform(agent: string, touch = 0): Platform {
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && touch > 1)) return "ios";
  if (/Android/.test(agent)) return "android";
  if (/Windows/.test(agent)) return "windows";
  if (/Macintosh|Mac OS X/.test(agent)) return "macos";
  if (/Linux|X11|CrOS/.test(agent)) return "linux";
  return "web";
}

/** What the download button says once the visitor's platform is known, where there is something to install. */
const GET: Partial<Record<Platform, string>> = { windows: "Download for Windows", linux: "Install on Linux", macos: "Get it for macOS", android: "Download for Android" };
const COFFEE = "https://buymeacoffee.com/vitrixxl";

/** A link drawn as a button: navigation stays a real link, for people and search engines alike. */
function LinkButton({ href, size = "default", variant = "default", download, className, children }: { href: string; size?: "default" | "sm"; variant?: "default" | "outline" | "secondary" | "ghost"; download?: boolean; className?: string; children: React.ReactNode }) {
  // The app's pages in the page's language (/fr/timer).
  return (
    <a href={href.startsWith("/") && !href.startsWith("/api/") ? localePath(language(), href) : href} download={download} className={cn(buttonVariants({ size, variant }), className)}>
      {children}
    </a>
  );
}

/** A command to paste in a terminal, with a button that copies it. */
function Command({ lines, label }: { lines: string[]; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    // Concentric with the copy button: its 12px corners 8px in.
    <div className="flex items-start gap-3 rounded-[20px] bg-background p-2 pl-4">
      {/* A long command wraps rather than scrolls out of sight: the copy takes it whole. */}
      <pre aria-label={said(label)} className="min-w-0 flex-1 py-1.5 font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
        {lines.map((line) => (
          <div key={line}>
            <span className="text-primary select-none">$ </span>
            {said(line)}
          </div>
        ))}
      </pre>
      <Button
        variant="secondary"
        onClick={() => {
          void navigator.clipboard?.writeText(lines.join("\n")).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
        {copied ? tr("Copied") : tr("Copy")}
      </Button>
    </div>
  );
}

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "windows", label: "Windows" },
  { id: "linux", label: "Linux" },
  { id: "macos", label: "macOS" },
  { id: "android", label: "Android" },
  { id: "ios", label: "iPhone & iPad" },
  { id: "web", label: "Web" },
];
/** The two desktop apps, the same web app in its own window: Electron with its own Chromium, or Tauri (desktop/tauri)
 * with the system's webview. Each installer installs one or the other. */
type Shell = "electron" | "tauri";
const SHELLS: { id: Shell; label: string; hint: string }[] = [
  { id: "electron", label: "Electron", hint: "Brings its own Chromium: the same on every computer." },
  { id: "tauri", label: "Tauri", hint: "Lighter: draws with the webview your system already has." },
];
function ShellChoice({ shell, onChange }: { shell: Shell; onChange: (shell: Shell) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Segmented label={tr("Desktop app")} value={shell} options={SHELLS} onChange={(id) => onChange(id as Shell)} className="bg-muted inset-ring-0" />
      <p className="text-xs text-muted-foreground">{said(SHELLS.find((s) => s.id === shell)!.hint)}</p>
    </div>
  );
}
const megabytes = (bytes?: number) => (bytes ? ` · ${Math.round(bytes / 1048576)} MB` : "");

/** How to get Qbix on each platform, the visitor's own selected once known. */
function Install({ detected }: { detected?: Platform }) {
  const [chosen, setPlatform] = useState<Platform>(),
    platform = chosen ?? detected ?? "web",
    [origin, setOrigin] = useState(SITE),
    [shell, setShell] = useState<Shell>("electron"),
    tauri = shell === "tauri",
    [apk, setApk] = useState<number>();
  useEffect(() => {
    setOrigin(location.origin);
    void fetch("/api/mobile/release")
      .then((r) => (r.ok ? r.json() : null))
      .then((release) => release?.apkSize && setApk(release.apkSize))
      .catch(() => {});
  }, []);
  const note = "text-sm leading-relaxed text-muted-foreground";
  return (
    <Tabs value={platform} onValueChange={(value) => setPlatform(value as Platform)} className="gap-4 [&>[data-slot=tabs-content]]:px-2 [&>[data-slot=tabs-content]]:pb-2">
      {/* The chosen platform on the accent fill, its 8px corners concentric with the list's 12px around 4px of padding. */}
      <TabsList className="h-auto! w-full flex-wrap justify-start gap-0.5 bg-muted inset-ring-0">
        {PLATFORMS.map((p) => (
          <TabsTrigger key={p.id} value={p.id} className="h-8 flex-none px-3">
            {said(p.label)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent keepMounted value="windows" className="flex flex-col gap-3">
        <ShellChoice shell={shell} onChange={setShell} />
        <p className={note}>{tr("Open PowerShell and paste this line: it installs Qbix for you, with a Start menu shortcut. No administrator rights needed.")}</p>
        <Command label={tr("Install on Windows")} lines={[`${tauri ? "$env:CUBIX_SHELL='tauri'; " : ""}irm ${origin}/install.ps1 | iex`]} />
        <p className="text-xs text-muted-foreground">{tr("Windows 10 and 11, 64-bit. Run it again to update.")}</p>
      </TabsContent>
      <TabsContent keepMounted value="linux" className="flex flex-col gap-3">
        <ShellChoice shell={shell} onChange={setShell} />
        <p className={note}>{tr("Paste this in a terminal: Qbix goes to your applications menu and the")}{" "}<code className="font-mono">{tr("cubix")}</code> {" "}{tr("command. No sudo needed.")}</p>
        <Command label={tr("Install on Linux")} lines={[`curl -fsSL ${origin}/install.sh | sh${tauri ? " -s -- --tauri" : ""}`]} />
        <p className="text-xs text-muted-foreground">
          {tauri && <>{tr("Needs WebKitGTK 4.1, there on most Linux desktops.")}{" "}</>}
          {tr("Linux x64. Run it again to update; add")}{" "}<code className="font-mono">-s -- --uninstall</code> {" "}{tr("after")}{" "}<code className="font-mono">sh</code> {" "}{tr("to remove it.")}</p>
      </TabsContent>
      <TabsContent keepMounted value="macos" className="flex flex-col gap-3">
        <ShellChoice shell={shell} onChange={setShell} />
        <p className={note}>
          {tr("The macOS app is built on your Mac from the source code, with")}{" "}
          <a className="text-foreground underline underline-offset-4" href={tauri ? "https://rustup.rs" : "https://bun.sh"}>{tauri ? tr("Rust") : tr("Bun")}</a> {" "}
          {tr("installed. Or use Qbix in Safari or Chrome, nothing to install.")}</p>
        <Command
          label={tr("Build on macOS")}
          lines={tauri
            ? [`git clone ${SOURCE}.git && cd cubix/desktop/tauri`, `cargo install tauri-cli --version "^2" --locked`, "cargo tauri build --bundles app && cp -R target/release/bundle/macos/Qbix.app /Applications/"]
            : [`git clone ${SOURCE}.git && cd cubix`, "bun install --frozen-lockfile && bun run build:desktop", "cp -R artifacts/electron/Cubix-darwin-*/Cubix.app /Applications/"]}
        />
      </TabsContent>
      <TabsContent keepMounted value="android" className="flex flex-col items-start gap-3">
        <p className={note}>{tr("Download the app and open the file to install it; your phone may ask you to allow installs from your browser once. It updates itself afterwards.")}</p>
        <LinkButton href="/api/mobile/apk" download>
          <Download data-icon="inline-start" />
          {tr("Download the APK")}{megabytes(apk)}
        </LinkButton>
        <p className="text-xs text-muted-foreground">{tr("Android 7 and later, 64-bit ARM phones.")}</p>
      </TabsContent>
      <TabsContent keepMounted value="ios" className="flex flex-col items-start gap-3">
        <p className={note}>
          {tr("There is no iPhone or iPad app yet. Qbix runs in Safari: open it, then")}{" "}<strong className="font-semibold text-foreground">{tr("Share → Add to Home Screen")}</strong>{tr(". It opens full screen like an app and works offline.")}</p>
        <LinkButton href="/timer">
          <Globe data-icon="inline-start" />
          {tr("Open Qbix in Safari")}</LinkButton>
      </TabsContent>
      <TabsContent keepMounted value="web" className="flex flex-col items-start gap-3">
        <p className={note}>{tr("Nothing to install: Qbix runs in any recent browser and works offline. Chrome and Edge also offer to install it as an app.")}</p>
        <LinkButton href="/timer">
          <Globe data-icon="inline-start" />
          {tr("Open Qbix in your browser")}</LinkButton>
      </TabsContent>
    </Tabs>
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
  { id: "timer", label: "Timer", dot: "bg-primary", demo: TimerDemo, open: ["/timer", "Open the timer"] },
  { id: "learn", label: "First solve", dot: "bg-success", demo: LessonDemo, open: ["/learn", "Start the course"] },
  { id: "algorithms", label: "Algorithms", dot: "bg-lilac", demo: AlgDemo, open: ["/algorithms", "Browse the algorithms"] },
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
  const [platform, setPlatform] = useState<Platform>();
  useEffect(() => setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints)), []);
  const get = said((platform && GET[platform]) ?? tr("Download {0}", { 0: NAME })),
    link = "rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground",
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
            <a href="#download" className={nav}>{tr("Download")}</a>
            <a href="#faq" className={nav}>{tr("Questions")}</a>
          </nav>
          <span className="flex-1" />
          <LanguagePicker className="h-10 w-auto max-sm:hidden" />
          <LinkButton href="/timer">{tr("Open Qbix")}</LinkButton>
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
              <LinkButton href="/timer">
                {tr("Open Qbix in your browser")}
                <ArrowRight data-icon="inline-end" />
              </LinkButton>
              <p className="max-w-[30ch] text-sm font-medium text-muted-foreground">{tr("No account needed · works offline · Web, Windows, Linux, macOS and Android")}</p>
            </div>
            {/* Or install it right here, the visitor's platform chosen for them. */}
            <div id="download" className="landing-in w-full scroll-mt-20 rounded-3xl bg-card p-3 [--i:3]">
              <Install detected={platform} />
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
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/timer">
                {tr("Open Qbix in your browser")}
                <ArrowRight data-icon="inline-end" />
              </LinkButton>
              <LinkButton href="#download" variant="secondary">
                <Download data-icon="inline-start" />
                {get}
              </LinkButton>
            </div>
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
