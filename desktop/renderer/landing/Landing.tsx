/**
 * The landing page at the site's root. The build renders it to HTML (desktop/web.ts), so search engines and language
 * models read it whole without JavaScript; the browser then hydrates it for what needs the visitor's device: the
 * platform it runs on, the install command to copy, the APK's size, and the cube that solves as the page scrolls
 * (SolveStage.tsx), one step for each feature read, whose words come in with it.
 */
import { Fragment, useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Globe,
  Laptop,
  Play,
  Smartphone,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Logo, Wordmark } from "../logo";
import { DESCRIPTION, FAQ, FEATURES, IMPORTS, NAME, SITE, SOURCE, TAGLINE, type Feature } from "./content";
import { CubeStill, SolveStage, solveByItself } from "./SolveStage";
import { Features } from "./Features";
import { EVENTS } from "../../../src/shared/puzzles";
import { tr } from "../../../src/client/i18n";
import { LanguagePicker, said, useLanguage } from "../base";
import { preferred, setLanguage } from "../../../src/client/i18n";

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

/** What the first button says once the visitor's platform is known, where there is something to install. */
const GET: Partial<Record<Platform, string>> = { windows: "Download for Windows", linux: "Install on Linux", macos: "Get it for macOS", android: "Download for Android" };

/** A link drawn as a button: navigation stays a real link, for people and search engines alike. */
function LinkButton({ href, size = "default", variant = "default", download, className, children }: { href: string; size?: "default" | "sm" | "lg"; variant?: "default" | "outline"; download?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <a href={href} download={download} className={cn(buttonVariants({ size, variant }), className)}>
      {children}
    </a>
  );
}
/**
 * The page's two main buttons, larger than the app's, an icon a little nearer its edge than the words are; the
 * outlined one filled, to read over the grid behind it.
 */
const BIG = "h-12 gap-2.5 rounded-full px-6 text-base has-data-[icon=inline-start]:pl-5 has-data-[icon=inline-end]:pr-5";
const FILLED = "bg-card hover:bg-accent dark:bg-card dark:hover:bg-accent";

/** A command to paste in a terminal, with a button that copies it. */
function Command({ lines, label }: { lines: string[]; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-background p-3 pl-5">
      <pre aria-label={said(label)} className="min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-sm leading-relaxed whitespace-pre text-foreground">
        {lines.map((line) => (
          <div key={line}>
            <span className="text-primary select-none">$ </span>
            {said(line)}
          </div>
        ))}
      </pre>
      <Button
        variant="outline"
        size="sm"
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
const megabytes = (bytes?: number) => (bytes ? ` · ${Math.round(bytes / 1048576)} MB` : "");

/** How to get Qbix on each platform, the visitor's own selected once known. */
function Install({ detected }: { detected?: Platform }) {
  const [chosen, setPlatform] = useState<Platform>(),
    platform = chosen ?? detected ?? "web",
    [origin, setOrigin] = useState(SITE),
    [apk, setApk] = useState<number>();
  useEffect(() => {
    setOrigin(location.origin);
    void fetch("/api/mobile/release")
      .then((r) => (r.ok ? r.json() : null))
      .then((release) => release?.apkSize && setApk(release.apkSize))
      .catch(() => {});
  }, []);
  const note = "text-sm text-muted-foreground";
  return (
    <Tabs value={platform} onValueChange={(value) => setPlatform(value as Platform)} className="gap-5">
      <TabsList className="flex h-auto! w-full flex-wrap justify-start gap-1 bg-transparent p-0">
        {PLATFORMS.map((p) => (
          <TabsTrigger key={p.id} value={p.id} className="h-9 flex-none rounded-lg border px-3.5 data-active:border-primary data-active:bg-primary/10">
            {said(p.label)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent keepMounted value="windows" className="flex flex-col gap-3">
        <p className={note}>{tr("Open PowerShell and paste this line: it installs Qbix for you, with a Start menu shortcut. No administrator rights needed.")}</p>
        <Command label={tr("Install on Windows")} lines={[`irm ${origin}/install.ps1 | iex`]} />
        <p className="text-xs text-muted-foreground">{tr("Windows 10 and 11, 64-bit. Run it again to update.")}</p>
      </TabsContent>
      <TabsContent keepMounted value="linux" className="flex flex-col gap-3">
        <p className={note}>{tr("Paste this in a terminal: Qbix goes to your applications menu and the")}{" "}<code className="font-mono">{tr("cubix")}</code> {" "}{tr("command. No sudo needed.")}</p>
        <Command label={tr("Install on Linux")} lines={[`curl -fsSL ${origin}/install.sh | sh`]} />
        <p className="text-xs text-muted-foreground">
          {tr("Linux x64. Run it again to update; add")}{" "}<code className="font-mono">-s -- --uninstall</code> {" "}{tr("after")}{" "}<code className="font-mono">sh</code> {" "}{tr("to remove it.")}</p>
      </TabsContent>
      <TabsContent keepMounted value="macos" className="flex flex-col gap-3">
        <p className={note}>
          {tr("The macOS app is built on your Mac from the source code, with")}{" "}<a className="text-foreground underline underline-offset-4" href="https://bun.sh">{tr("Bun")}</a> {" "}{tr("installed. Or use Qbix in Safari or Chrome, nothing to install.")}</p>
        <Command label={tr("Build on macOS")} lines={[`git clone ${SOURCE}.git && cd cubix`, "bun install --frozen-lockfile && bun run build:desktop", "cp -R artifacts/electron/Cubix-darwin-*/Cubix.app /Applications/"]} />
      </TabsContent>
      <TabsContent keepMounted value="android" className="flex flex-col items-start gap-3">
        <p className={note}>{tr("Download the app and open the file to install it; your phone may ask you to allow installs from your browser once. It updates itself afterwards.")}</p>
        <LinkButton href="/api/mobile/apk" size="lg" download className={BIG}>
          <Download data-icon="inline-start" />
          {tr("Download the APK")}{megabytes(apk)}
        </LinkButton>
        <p className="text-xs text-muted-foreground">{tr("Android 7 and later, 64-bit ARM phones.")}</p>
      </TabsContent>
      <TabsContent keepMounted value="ios" className="flex flex-col items-start gap-3">
        <p className={note}>
          {tr("There is no iPhone or iPad app yet. Qbix runs in Safari: open it, then")}{" "}<strong className="font-medium text-foreground">{tr("Share → Add to Home Screen")}</strong>{tr(". It opens full screen like an app and works offline.")}</p>
        <LinkButton href="/timer" size="lg" className={BIG}>
          <Globe data-icon="inline-start" />
          {tr("Open Qbix in Safari")}</LinkButton>
      </TabsContent>
      <TabsContent keepMounted value="web" className="flex flex-col items-start gap-3">
        <p className={note}>{tr("Nothing to install: Qbix runs in any recent browser and works offline. Chrome and Edge also offer to install it as an app.")}</p>
        <LinkButton href="/timer" size="lg" className={BIG}>
          <Globe data-icon="inline-start" />
          {tr("Open Qbix in your browser")}</LinkButton>
      </TabsContent>
    </Tabs>
  );
}

function Section({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("mx-auto w-full max-w-7xl scroll-mt-8 px-5 py-20 md:px-8 md:py-28", className)}>
      {children}
    </section>
  );
}
/** A line of the sheet under "Free. Really.": what it is about, then the facts. */
function Fact({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="grid scroll-mt-8 gap-x-12 gap-y-3 border-t py-8 md:grid-cols-[20rem_minmax(0,1fr)] md:py-10">
      <h3 className="text-xl font-semibold tracking-tight text-balance md:text-2xl">{title}</h3>
      <div className="flex max-w-[68ch] flex-col gap-4 text-lg leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
/** Names side by side, as a sentence would list them. */
function Names({ label, names }: { label: string; names: string[] }) {
  return (
    <ul aria-label={said(label)} className="flex flex-wrap gap-x-6 gap-y-1.5 text-lg font-medium text-foreground">
      {names.map((name) => (
        <li key={name}>{said(name)}</li>
      ))}
    </ul>
  );
}

/** Words that come in one after the other: each is a part of its own (see `landing-part` and `landing-in` in globals.css). */
function Words({ text, from = 0, part = "landing-in", className }: { text: string; from?: number; part?: string; className?: string }) {
  return text.split(" ").map((word, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span className={cn(part, "inline-block", className)} style={{ "--i": from + i } as React.CSSProperties}>
        {said(word)}
      </span>
    </Fragment>
  ));
}
/**
 * A feature in the solve: a few words, as large as the window allows, that come in one after the other as it scrolls
 * into view, on the side of the window the cube leaves free. What the feature does in full is further down the page.
 */
function Chapter({ feature, right }: { feature: Feature; right: boolean }) {
  return (
    <section data-chapter className="flex min-h-[72svh] items-center lg:min-h-svh" style={{ "--n": feature.hook.split(" ").length } as React.CSSProperties}>
      {/* The place of the words across the page: they are held in the window, over it (see `landing-title`). */}
      <div className={cn("w-full lg:w-[50%]", right && "lg:ml-auto")}>
        <h2 className="landing-title landing-ink text-[clamp(2.75rem,12vw,4.25rem)] leading-[0.96] font-semibold tracking-[-0.04em] text-balance lg:text-[clamp(3.75rem,6.8vw,6.5rem)]">
          <Words text={said(feature.hook)} part="landing-part" />
        </h2>
      </div>
    </section>
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
  const link = "rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground";
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip bg-background text-foreground">
      <div className="fixed top-4 right-4 z-40 md:top-5 md:right-6">
        <LanguagePicker className="h-9 rounded-full bg-background/80 backdrop-blur" />
      </div>
      <main>
        {/* The solve: the cube stays in the window while the page is read, and each feature that comes in plays a step of it. */}
        <SolveStage
          finish={[
            <LinkButton key="install" href="#download" className="h-10 gap-2 rounded-full px-4 text-sm has-data-[icon=inline-start]:pl-3.5">
              <Download data-icon="inline-start" />
              {tr("Install")}</LinkButton>,
            <LinkButton key="web" href="/timer" variant="outline" className={cn("h-10 rounded-full px-4 text-sm", FILLED)}>
              {tr("Try on web")}</LinkButton>,
          ]}
        >
          <div className="mx-auto w-full max-w-7xl px-5 md:px-8">
            <section data-top className="landing-leave flex min-h-svh flex-col justify-center gap-6 pt-12 pb-32 lg:gap-7 lg:w-[52%] lg:pt-16 lg:pb-44">
              <a href="/" className="landing-in flex items-center gap-2 self-start rounded-sm" aria-label={tr("{0} home", { 0: NAME })} style={{ "--i": 0 } as React.CSSProperties}>
                <Logo size={22} />
                <Wordmark className="text-xl" />
              </a>
              <h1 className="landing-ink text-[clamp(2.6rem,5.4vw,4.5rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-balance">
                <Words text={tr("The free speedcubing app to")} className="text-muted-foreground" /> <Words text={tr("time, learn and get faster")} from={5} />
              </h1>
              <p className="landing-in landing-ink max-w-[56ch] text-lg leading-relaxed text-muted-foreground" style={{ "--i": 10 } as React.CSSProperties}>
                {said(TAGLINE)}
              </p>
              <div className="landing-in flex flex-wrap gap-3 pt-1" style={{ "--i": 12 } as React.CSSProperties}>
                <LinkButton href="#download" size="lg" className={BIG}>
                  <Download data-icon="inline-start" />
                  {said((platform && GET[platform]) ?? tr("Download {0}", { 0: NAME }))}
                </LinkButton>
                <LinkButton href="/timer" size="lg" variant="outline" className={cn(BIG, FILLED)}>
                  {tr("Open in your browser")}<ArrowRight data-icon="inline-end" />
                </LinkButton>
              </div>
              <div className="landing-in flex flex-wrap items-center gap-x-4 gap-y-2 pt-6 text-sm text-muted-foreground lg:pt-8" style={{ "--i": 14 } as React.CSSProperties}>
                <Button variant="outline" size="lg" className={cn("h-11 gap-2 rounded-full px-5 text-base has-data-[icon=inline-start]:pl-4", FILLED)} onClick={solveByItself}>
                  <Play data-icon="inline-start" className="text-primary" />
                  {tr("Solve the cube")}</Button>
                <span className="landing-ink">{tr("or scroll: the timer starts with the first turn")}</span>
              </div>
            </section>

            <div id="features" className="scroll-mt-8">
              {FEATURES.map((feature, i) => (
                <Chapter key={feature.id} feature={feature} right={i % 2 === 1} />
              ))}
            </div>
          </div>
        </SolveStage>

        <Features />

        <Section id="free" className="flex flex-col gap-12 md:gap-16">
          <h2 className="text-[clamp(3.5rem,11vw,6rem)] leading-[0.9] font-semibold tracking-[-0.04em]">
            {tr("Free.")}{" "}<span className="text-muted-foreground">{tr("Really.")}</span>
          </h2>
          <div className="border-b">
            <Fact title={tr("Nothing to pay, nothing to unlock")}>
              <p>{tr("No ads, ever. No premium tier: every feature for everyone, from the first solve to competition. No subscription, no trial.")}</p>
              <p>{tr("Only a coaching session has a price, and its coach sets it.")}</p>
            </Fact>
            <Fact title={tr("Everything in one app")}>
              <p>{tr("The timer, the algorithms, the training, the courses, the duels and the statistics share your times and what you learned: a case you drill is a case you see improve.")}</p>
            </Fact>
            <Fact id="puzzles" title={tr("Every WCA event")}>
              <ul aria-label={tr("Puzzles")} className="flex flex-wrap gap-2">
                {EVENTS.map((e) => (
                  <li key={e.id} title={said(e.label)} aria-label={said(e.label)} className="flex size-11 items-center justify-center rounded-xl border bg-card transition-colors hover:border-primary/60">
                    <Logo size={24} puzzle={e.id} />
                  </li>
                ))}
              </ul>
            </Fact>
            <Fact id="import" title={tr("Switch from your timer in a minute")}>
              <p>
                {tr("Export your times from your current timer and drop the file in")}{" "}{said(NAME)}{tr(": every solve comes with its date, penalty, scramble and session. It is read on your device, and importing the same file twice adds nothing twice.")}</p>
              <Names label={tr("Timers you can import from")} names={IMPORTS} />
            </Fact>
            <Fact title={tr("Offline first")}>
              <p>{tr("Every solve is saved on your device first, then synced to your other devices. The timer, the algorithms and the training work without a connection.")}</p>
            </Fact>
            <Fact title={tr("Open source")}>
              <p>
                {said(NAME)} {" "}{tr("is an independent project, and its code is public.")}{" "}
                <a href={SOURCE} className="inline-flex items-center gap-1 rounded-sm text-foreground underline underline-offset-4 transition-colors hover:text-primary">
                  {tr("Read it on GitHub")}<ArrowUpRight className="size-4" />
                </a>
              </p>
            </Fact>
          </div>
        </Section>

        <Section id="download" className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <header className="flex flex-col gap-5">
            <h2 className="text-4xl leading-none font-semibold tracking-tight md:text-6xl">{tr("Get")}{" "}{said(NAME)}</h2>
            <p className="max-w-[44ch] text-lg leading-relaxed text-muted-foreground">{tr("Free on every platform, with the same account everywhere. Your platform is selected for you.")}</p>
            <ul className="flex flex-col gap-3 pt-2 text-sm leading-relaxed text-muted-foreground">
              {[
                { icon: Laptop, text: "Windows, Linux and macOS apps open the latest version at every launch: nothing to update by hand." },
                { icon: Smartphone, text: "The Android app updates itself; your times sync with your computer." },
                { icon: Globe, text: "The web app works offline and installs from Chrome, Edge or Safari." },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  {said(text)}
                </li>
              ))}
            </ul>
          </header>
          <div className="self-start rounded-3xl border bg-card p-5 md:p-8">
            <Install detected={platform} />
          </div>
        </Section>

        <Section id="faq" className="flex flex-col gap-12">
          <h2 className="text-4xl leading-none font-semibold tracking-tight md:text-6xl">{tr("Questions")}</h2>
          <dl className="grid gap-x-16 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.question} className="flex flex-col gap-2 border-t py-7">
                <dt className="text-lg font-medium">{said(item.question)}</dt>
                <dd className="max-w-[60ch] leading-relaxed text-muted-foreground">{said(item.answer)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section className="grid items-center gap-x-16 gap-y-9 pb-28 md:pb-40 lg:grid-cols-[minmax(0,1fr)_auto]">
          {/* Where the page began scrambled, it ends solved. */}
          <CubeStill solved className="size-80 max-lg:hidden lg:order-2 xl:size-96" />
          <div className="flex flex-col items-start gap-9">
            <h2 className="max-w-[12ch] text-[clamp(3rem,9vw,6rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-balance">{tr("Ready for your next PB?")}</h2>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="#download" size="lg" className={BIG}>
                <Download data-icon="inline-start" />
                {said((platform && GET[platform]) ?? tr("Download {0}", { 0: NAME }))}
              </LinkButton>
              <LinkButton href="/timer" size="lg" variant="outline" className={cn(BIG, FILLED)}>
                {tr("Open in your browser")}<ArrowRight data-icon="inline-end" />
              </LinkButton>
            </div>
          </div>
        </Section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-8 text-sm text-muted-foreground md:px-8">
          <span className="flex items-center gap-2 text-foreground">
            <Logo size={16} />
            <Wordmark />
          </span>
          <span>{said(DESCRIPTION.split(":")[0])}.</span>
          <span className="flex-1" />
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
          <span className="w-full text-xs">{tr("Not affiliated with Rubik's Brand Ltd or the World Cube Association.")}</span>
        </div>
      </footer>
    </div>
  );
}
