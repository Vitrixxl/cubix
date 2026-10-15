/** Dialogs drawn over the app: settings, guides, methods, case search, solves, comments and group order. */
import React, { memo, useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Compass, Download, GraduationCap, LogOut, Monitor, Moon, Pencil, RotateCcw, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { store as s } from "./store";
import { searchCases } from "../../src/client/lib/practiceCatalog";
import { call, openExternal } from "./bridge";
import { ImportTimes } from "./ImportTimes";
import { accents } from "./theme";
import { GuideContent } from "../guides/Content";
import { METHODS } from "../../src/shared/methods";
import { PUZZLES, puzzleInfo, puzzleOf } from "../../src/shared/puzzles";
import { GUIDES, type Guide } from "../guides/pages";
import { Avatar, Button, Choice, FOCUS, LABEL, Modal, NUMERIC, Tip, run, usePhone } from "./ui";
import { SessionSheet } from "./phone";
import { AlgView } from "./algView";
import { SolveView } from "./SolveView";
import { NotationContent } from "./notation";
import { DailyDialog } from "./daily";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandList, Command } from "@/components/ui/command";
import { Command as CommandPrimitive } from "cmdk";
import { CaseTile } from "./algorithms";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { language, tr } from "../../src/client/i18n";
import { LanguagePicker, said } from "./base";
import { LEGAL_DOCUMENTS } from "./legal/paths";

const close = s.closeOverlay;

/** A settings row: its name on the left, its controls on the right. */
function SettingRow({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-sm font-medium">{said(label)}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** A group of settings under its small heading. */
function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className={LABEL}>{title}</h3>
      {children}
    </section>
  );
}

/** Settings: who is signed in, then the look of the app, its language and the account's data. */
function Settings() {
  const joined = s.profile?.user?.joined;
  return (
    <div className="settings flex flex-col gap-6">
      <section className="flex items-center gap-3 rounded-[20px] bg-muted p-3" aria-label={tr("Account")}>
        <Avatar name={s.user.username} size={44} />
        <div className="flex min-w-0 flex-1 flex-col">
          {s.user.isGuest ? <span className="truncate text-base font-bold tracking-[-0.01em]">{s.user.username}</span> : <Username />}
          {joined && <span className="truncate text-xs text-muted-foreground">{tr("Joined")} {joined}</span>}
        </div>
        <Button action="logout" icon={LogOut} variant="ghost" className="text-muted-foreground hover:text-foreground">
          {tr("Sign out")}</Button>
      </section>
      <SettingGroup title={tr("Appearance")}>
        <SettingRow label={tr("Theme")}>
          <Choice
            prefix="light:"
            label={tr("Theme")}
            value={s.colorMode}
            className="bg-muted"
            options={[
              { id: "dark", label: <><Moon />{tr("Dark")}</> },
              { id: "light", label: <><Sun />{tr("Light")}</> },
              { id: "system", label: <><Monitor />{tr("System")}</> },
            ]}
          />
        </SettingRow>
        <SettingRow label={tr("Accent")}>
          {accents.map((a) => (
            <Tip key={a.id} content={said(a.name)}>
              <button
                type="button"
                data-action={"theme:" + a.id}
                aria-label={said(a.name)}
                aria-pressed={s.themeName === a.id}
                onClick={run("theme:" + a.id)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full transition-shadow",
                  FOCUS,
                  s.themeName === a.id && "ring-2 ring-primary ring-offset-2 ring-offset-popover",
                )}
                style={{ background: a.color }}
              >
                {s.themeName === a.id && <Check className="size-3.5 text-[#1c1317]" />}
              </button>
            </Tip>
          ))}
        </SettingRow>
      </SettingGroup>
      <SettingGroup title={tr("Language")}>
        <SettingRow label={tr("Language of the app")}>
          <LanguagePicker className="w-40" />
        </SettingRow>
      </SettingGroup>
      {!s.user.isGuest && <AccountData />}
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={tr("Legal documents")}>
        {[...LEGAL_DOCUMENTS, { path: "/privacy#cookies", label: "Cookies" }].map(({ path, label }) => (
          <a key={path} href={path} onClick={(e) => (e.preventDefault(), void openExternal(location.origin + path))} className={cn("rounded-sm hover:text-foreground hover:underline", FOCUS)}>
            {tr(label)}
          </a>
        ))}
      </nav>
    </div>
  );
}


/** The account's username, a pencil away from a new one. */
function Username() {
  const [draft, setDraft] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || draft === null) return;
    setBusy(true);
    setError("");
    try {
      await s.rename(draft);
      setDraft(null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (draft === null)
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate text-base font-bold tracking-[-0.01em]">{s.user.username}</span>
        <Tip content={tr("Change username")}>
          <UiButton variant="ghost" size="icon-sm" data-action="username:edit" aria-label={tr("Change username")} onClick={() => setDraft(s.user.username)} className="text-muted-foreground">
            <Pencil />
          </UiButton>
        </Tip>
      </span>
    );
  return (
    <form onSubmit={save} className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setDraft(null))}
          aria-label={tr("Username")} maxLength={24} autoComplete="off" autoCapitalize="none" spellCheck={false} className="h-8 min-w-0 flex-1 bg-background" />
        <UiButton type="submit" size="sm" disabled={busy || !draft.trim()} data-action="username:save">{tr("Save")}</UiButton>
        <UiButton type="button" size="sm" variant="ghost" onClick={() => (setDraft(null), setError(""))}>{tr("Cancel")}</UiButton>
      </span>
      {error && <FieldError>{said(error)}</FieldError>}
    </form>
  );
}

/** The account's data: a copy to download, and the account deleted once confirmed. */
function AccountData() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await call("deleteAccount");
      await s.action("accountDeleted");
      toast.success(tr("Your account and its data were deleted."));
    } catch (reason) {
      setError(tr((reason as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingGroup title={tr("Your data")}>
      <div className="flex flex-wrap gap-2 pt-1">
        <UiButton variant="secondary" onClick={() => void s.action("exportData")} data-action="exportData">
          <Download />
          {tr("Export")}
        </UiButton>
        <AlertDialog onOpenChange={() => setError("")}>
          <AlertDialogTrigger render={<UiButton variant="ghost" className="text-muted-foreground hover:text-destructive" data-action="deleteAccount" aria-label={tr("Delete my account")} />}>
            <Trash2 />
            {tr("Delete")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <form onSubmit={remove} className="flex flex-col gap-5">
              <AlertDialogHeader>
                <AlertDialogTitle>{tr("Delete your account?")}</AlertDialogTitle>
                <AlertDialogDescription>{tr("The account and all its data are erased for good.")}</AlertDialogDescription>
              </AlertDialogHeader>
              {error && <FieldError>{error}</FieldError>}
              <AlertDialogFooter>
                <AlertDialogCancel type="button">{tr("Keep it")}</AlertDialogCancel>
                <UiButton type="submit" variant="destructive" disabled={busy}>
                  {busy ? tr("Deleting…") : tr("Delete")}
                </UiButton>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SettingGroup>
  );
}

/** The guides: their list on the left, the chosen guide on the right; phones get a full-height sheet, the list on top. */
function GuidesDialog() {
  const page = (s.guidePage in GUIDES ? s.guidePage : "overviewGuide") as Guide,
    phone = usePhone();
  return (
    <Modal
      id="guides"
      title={tr("Guides")}
      description={tr("How Qbix works")}
      hideHeader
      tall
      className="flex h-[min(88vh,820px)] gap-0 overflow-hidden p-0 sm:max-w-5xl"
      sheetClassName="gap-0 p-0"
    >
      <nav aria-label={tr("Guides")} className="flex shrink-0 flex-col gap-0.5 p-3 md:m-2 md:mr-0 md:w-56 md:rounded-[20px] md:bg-muted/60 md:pt-5 max-md:flex-row max-md:overflow-x-auto max-md:pr-12 max-md:[scrollbar-width:none]">
        <span className="px-2.5 pb-3 text-lg font-extrabold tracking-[-0.025em] max-md:hidden">{tr("Guides")}</span>
        {/* One guide among the others: the chosen one raised, as every choice of the app. Outside the article, so its
            click handler never sees these actions. */}
        <ToggleGroup
          aria-label={tr("Guides")}
          orientation={phone ? "horizontal" : "vertical"}
          spacing={1}
          value={[page]}
          onValueChange={(next: string[]) => next[0] && next[0] !== page && void s.action("guidePage:" + next[0])}
          className="w-full max-md:w-auto"
        >
          {(Object.keys(GUIDES) as Guide[]).map((id) => (
            <ToggleGroupItem
              key={id}
              value={id}
              data-action={"guidePage:" + id}
              className="h-auto min-h-9 justify-start rounded-[10px] py-1.5 text-left font-medium whitespace-normal text-muted-foreground hover:bg-accent/60 aria-pressed:bg-accent aria-pressed:font-semibold aria-pressed:text-foreground max-md:whitespace-nowrap max-md:bg-muted"
            >
              {said(GUIDES[id].name)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {/* Replays: the app tour (the shared `tour` action) and the introduction, which leaves the guides behind. */}
        <div className="flex gap-0.5 md:mt-auto md:flex-col md:pt-2 max-md:pl-1">
          <Button action="tour" icon={Compass} label="Replay tour" className="justify-start font-normal text-muted-foreground">
            {tr("Tour")}</Button>
          <UiButton
            variant="ghost"
            data-action="onboarding"
            className="justify-start font-normal text-muted-foreground"
            onClick={() => {
              close();
              void s.action("onboarding");
            }}
          >
            <RotateCcw />
            {tr("Redo the introduction")}</UiButton>
        </div>
      </nav>
      <article
        className="guides-body min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-10 md:px-12 md:pt-10"
        onClick={(e) => {
          const button = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
          if (button) return void s.action(button.dataset.action!);
          const a = (e.target as HTMLElement).closest("a");
          if (!a) return;
          e.preventDefault();
          const href = a.getAttribute("href") ?? "",
            entry = Object.entries(GUIDES).find(([, v]) => v.path === href);
          if (entry) void s.action("guidePage:" + entry[0]);
          else if (href.startsWith("http")) void openExternal(href);
          else void s.action("nav:" + (href === "/training/" ? "training" : href === "/algorithms/" ? "algorithms" : "playground"));
        }}
      >
        <GuideContent page={page} puzzle={s.guidePuzzle} method={s.guideMethod} />
      </article>
    </Modal>
  );
}

function MethodsDialog() {
  const methods = METHODS[s.guidePuzzle],
    method = methods.find((m) => m.id === s.guideMethod) ?? methods[0]!;
  return (
    <Modal id="methods" title={tr("Solving methods")} className="sm:max-w-2xl" tall>
      <div className="flex flex-col gap-2">
        <Choice prefix="guidePuzzle:" label={tr("Puzzle")} value={s.guidePuzzle} options={PUZZLES.map((p) => ({ id: p.id, label: p.label }))} className="flex-wrap" />
        <Choice prefix="guideMethod:" label={tr("Method")} value={method.id} options={methods.map((m) => ({ id: m.id, label: m.name }))} className="flex-wrap" />
      </div>
      <div className="flex max-h-[55vh] flex-col gap-5 overflow-y-auto rounded-[20px] bg-muted/60 p-5">
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-xl font-extrabold tracking-[-0.025em]">{said(method.name)}</h3>
            <p className="text-sm text-muted-foreground">{said(method.summary)}</p>
          </div>
          <Button action={`learnFrom:${s.guidePuzzle}:${method.id}`} icon={GraduationCap} variant="outline" className="shrink-0">
            {tr("Learn")}</Button>
        </div>
        <ol className="flex flex-col gap-4">
          {method.steps.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className={cn(NUMERIC, "flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-primary")}>{i + 1}</span>
              <div className="flex flex-col gap-1">
                <strong className="pt-0.5 text-sm font-semibold">{said(step.title)}</strong>
                <p className="text-sm text-muted-foreground">{said(step.text)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}

function SearchDialog() {
  return (
    <CommandDialog
      open={s.overlay === "search"}
      onOpenChange={(open: boolean) => !open && s.overlay === "search" && close()}
      title={tr("Search cases")}
      className="sm:max-w-xl"
    >
      <SearchCases />
    </CommandDialog>
  );
}
/** The search, there only while its dialog is open: typing draws its results again, never the page under it. Its results
 * are the algorithms page's tiles; the arrow keys go from one to the next. */
function SearchCases() {
  const [query, setQuery] = useState(""),
    typed = useDeferredValue(query),
    results = useMemo(() => searchCases(s.cases(), typed).slice(0, 48), [typed, s.puzzle]);
  return (
    <Command shouldFilter={false}>
      <CommandInput autoFocus placeholder={tr("Search a case: oll fish, pll t, f2l 6…")} value={query} onValueChange={setQuery} />
      <CommandList className="max-h-[min(60vh,28rem)] p-2">
        <CommandEmpty>{tr("No case matches.")}</CommandEmpty>
        <CommandGroup className={cn("p-0 **:[[cmdk-group-items]]:grid **:[[cmdk-group-items]]:gap-1.5", "**:[[cmdk-group-items]]:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]")}>
          {results.map((c: any) => (
            // cmdk's own item, unstyled: the tile is the whole result, chosen as on the algorithms page.
            <CommandPrimitive.Item
              key={c.id}
              value={c.id}
              title={c.name !== c.id ? `${c.id} · ${tr(c.name)}` : c.id}
              onSelect={() => void s.action("case:" + c.id)}
              // The chosen result in the accent colour, no ring: a ring was cut by the list's edges.
              className="rounded-[14px] outline-hidden data-[selected=true]:*:bg-accent!"
            >
              <CaseTile c={c} plain selected={false} />
            </CommandPrimitive.Item>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function SolveDetails() {
  const solve = s.overlaySolve;
  return solve ? <SolveView key={solve.id} solve={solve} owner /> : null;
}

/**
 * What the dialogs show of the app: with one open, anything (each change draws it again); with none, only which opens
 * and the language. A solve's few changes then pass them by.
 */
const overlaysKey = () => (s.overlay ? s.overlay + ":" + s.version : "") + "|" + language();
/** Every dialog of the app, each open while the app overlay names it. */
export const Overlays = memo(function Overlays() {
  useSyncExternalStore(s.subscribe, overlaysKey, overlaysKey);
  return (
    <>
      <Modal id="settings" title={tr("Settings")} className="sm:max-w-lg" tall>
        <Settings />
      </Modal>
      <Modal id="importTimes" title={tr("Import times")} className="sm:max-w-lg">
        <ImportTimes />
      </Modal>
      <GuidesDialog />
      <SessionSheet />
      <MethodsDialog />
      <SearchDialog />
      <DailyDialog />
      <Modal id="algPlayer" title={s.algView?.items[s.algView.index]?.name ?? tr("Algorithm")} description={tr("The algorithm played on the cube")} hideHeader tall className="flex h-[min(86vh,560px)] gap-0 overflow-hidden p-0 sm:max-w-4xl" sheetClassName="pb-6">
        <AlgView />
      </Modal>
      <Modal id="notation" title={tr("Notation")} tall className="flex h-[min(88vh,760px)] flex-col sm:max-w-5xl">
        <NotationContent />
      </Modal>
      <Modal id="solve" title={tr("Solve")} hideHeader className={s.overlaySolve?.scramble && puzzleInfo(puzzleOf(s.overlaySolve)).cubeSize ? "sm:max-w-4xl" : "sm:max-w-lg"}>
        <SolveDetails />
      </Modal>
    </>
  );
});
