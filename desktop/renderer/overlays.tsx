/** Dialogs drawn over the app: settings, guides, methods, case search, solves, comments and group order. */
import React, { useState } from "react";
import { Check, Compass, Download, GraduationCap, MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { store as s, matches } from "./store";
import { call, openExternal } from "./bridge";
import { ImportTimes } from "./ImportTimes";
import { accents } from "./theme";
import { LearningGroups } from "./LearningGroups";
import { fmtSolve } from "../../src/client/lib/format";
import { GuideContent } from "../guides/Content";
import { METHODS } from "../../src/shared/methods";
import { PUZZLES, puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import { GUIDES, type Guide } from "../guides/pages";
import { ActionToggle, Alg, Avatar, Button, Choice, Diagram, LABEL, NUMERIC, run, usePhone } from "./ui";
import { PhoneSheet, SessionSheet } from "./phone";
import { TimerStats } from "./stats";
import { AlgView } from "./algView";
import { SolveSolution } from "./SolveAnalysis";
import { NotationContent } from "./notation";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList, Command } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { tr } from "../../src/client/i18n";
import { LanguagePicker, said } from "./base";
import { LEGAL_DOCUMENTS } from "./legal/paths";

const close = s.closeOverlay;

/**
 * A dialog shown while the app overlay is `id`; phones get a sheet from the bottom, full height when `tall`.
 * `className` styles the dialog, `sheetClassName` the sheet's body.
 */
function Modal({ id, children, className, sheetClassName, title, description, hideHeader = false, tall = false }: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  hideHeader?: boolean;
  tall?: boolean;
  className?: string;
  sheetClassName?: string;
  children: React.ReactNode;
}) {
  const phone = usePhone(),
    open = s.overlay === id,
    onOpenChange = (next: boolean) => !next && s.overlay === id && close();
  if (phone)
    return (
      <PhoneSheet open={open} onOpenChange={onOpenChange} title={title} description={description} tall={tall} hideTitle={hideHeader} className={sheetClassName}>
        {children}
      </PhoneSheet>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("gap-5 p-6", className)}>
        <DialogHeader className={hideHeader ? "sr-only" : undefined}>
          <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** A settings row: its name on the left, its controls on the right. */
function SettingRow({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4">
      <span className="text-sm">{said(label)}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Settings: the account, then the appearance. */
function Settings() {
  return (
    <div className="settings flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className={LABEL}>{tr("Account")}</h3>
        <div className="flex items-center gap-3">
          <Avatar name={s.user.username} size={40} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{s.user.username}</span>
            <span className="text-xs text-muted-foreground">{tr("Joined")}{" "}{s.profile?.user?.joined}</span>
          </div>
          <Button action="logout" variant="outline">
            {tr("Sign out")}</Button>
        </div>
      </section>
      {!s.user.isGuest && <AccountData />}
      <Separator />
      <section className="flex flex-col gap-2">
        <h3 className={LABEL}>{tr("Language")}</h3>
        <SettingRow label={tr("Language of the app")}>
          <LanguagePicker className="w-40" />
        </SettingRow>
      </section>
      <Separator />
      <section className="flex flex-col gap-2">
        <h3 className={LABEL}>{tr("Appearance")}</h3>
        <SettingRow label={tr("Theme")}>
          <Choice
            prefix="light:"
            label={tr("Theme")}
            value={s.light ? "light" : "dark"}
            options={[
              { id: "dark", label: "Dark" },
              { id: "light", label: "Light" },
            ]}
          />
        </SettingRow>
        <SettingRow label={tr("Accent")}>
          {accents.map((a) => (
            <button
              key={a.id}
              type="button"
              data-action={"theme:" + a.id}
              title={said(a.name)}
              aria-label={said(a.name)}
              aria-pressed={s.themeName === a.id}
              onClick={run("theme:" + a.id)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50",
                s.themeName === a.id && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-popover",
              )}
              style={{ background: a.color }}
            >
              {s.themeName === a.id && <Check className="size-3.5 text-white" />}
            </button>
          ))}
        </SettingRow>
      </section>
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={tr("Legal documents")}>
        {[...LEGAL_DOCUMENTS, { path: "/privacy#cookies", label: "Cookies" }].map(({ path, label }) => (
          <a key={path} href={path} onClick={(e) => (e.preventDefault(), void openExternal(location.origin + path))} className="rounded-sm hover:text-foreground hover:underline">
            {tr(label)}
          </a>
        ))}
      </nav>
    </div>
  );
}


/** The account's data: a copy to download, and the account deleted with its password. */
function AccountData() {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await call("deleteAccount", password);
      await s.action("accountDeleted");
      toast.success(tr("Your account and its data were deleted."));
    } catch (reason) {
      setError(tr((reason as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="flex flex-col gap-2" aria-label={tr("Your data")}>
      <h3 className={LABEL}>{tr("Your data")}</h3>
      <div className="flex flex-wrap gap-2">
        <UiButton variant="outline" size="sm" onClick={() => void s.action("exportData")} data-action="exportData">
          <Download />
          {tr("Download my data")}
        </UiButton>
        <AlertDialog onOpenChange={() => (setPassword(""), setError(""))}>
          <AlertDialogTrigger render={<UiButton variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" data-action="deleteAccount" />}>
            <Trash2 />
            {tr("Delete my account")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <form onSubmit={remove} className="flex flex-col gap-5">
              <AlertDialogHeader>
                <AlertDialogTitle>{tr("Delete your account?")}</AlertDialogTitle>
                <AlertDialogDescription>{tr("Your times, sessions, friends, messages, groups you own and everything else of the account are erased from the server at once. This cannot be undone.")}</AlertDialogDescription>
              </AlertDialogHeader>
              <Field data-invalid={!!error || undefined}>
                <FieldLabel htmlFor="delete-password">{tr("Your password")}</FieldLabel>
                <Input id="delete-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus aria-invalid={!!error || undefined} />
                {error && <FieldError>{error}</FieldError>}
              </Field>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">{tr("Keep my account")}</AlertDialogCancel>
                <UiButton type="submit" variant="destructive" disabled={!password || busy}>
                  {busy ? tr("Deleting…") : tr("Delete for good")}
                </UiButton>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}

/** The guides: their list on the left, the chosen guide on the right; phones get a full-height sheet, the list on top. */
function GuidesDialog() {
  const page = (s.guidePage in GUIDES ? s.guidePage : "overviewGuide") as Guide;
  return (
    <Modal
      id="guides"
      title={tr("Guides")}
      description={tr("How Cubix works")}
      hideHeader
      tall
      className="flex h-[min(88vh,820px)] gap-0 overflow-hidden p-0 sm:max-w-5xl"
      sheetClassName="gap-0 p-0"
    >
      <nav aria-label={tr("Guides")} className="flex shrink-0 flex-col gap-0.5 p-3 md:w-52 md:border-r md:pt-5 max-md:flex-row max-md:overflow-x-auto max-md:border-b max-md:pr-12 max-md:[scrollbar-width:none]">
        <span className={cn(LABEL, "px-2.5 pb-2 max-md:hidden")}>{tr("Guides")}</span>
        {(Object.keys(GUIDES) as Guide[]).map((id) => (
          <Button
            key={id}
            action={"guidePage:" + id}
            className={cn("h-auto min-h-8 justify-start py-1.5 text-left font-normal whitespace-normal text-muted-foreground max-md:whitespace-nowrap", id === page && "bg-muted font-medium text-foreground")}
          >
            {said(GUIDES[id].name)}
          </Button>
        ))}
        {/* Replays: the app tour (the shared `tour` action) and the introduction, which leaves the guides behind. */}
        <div className="flex gap-0.5 md:mt-auto md:flex-col md:border-t md:pt-2 max-md:border-l max-md:pl-1">
          <Button action="tour" icon={Compass} className="justify-start font-normal text-muted-foreground">
            {tr("Replay tour")}</Button>
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
        className="guides-body min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-10 md:px-10 md:pt-10"
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
      <Separator />
      <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-base font-semibold">{said(method.name)}</h3>
            <p className="text-sm text-muted-foreground">{said(method.summary)}</p>
          </div>
          <Button action={`learnFrom:${s.guidePuzzle}:${method.id}`} icon={GraduationCap} variant="outline" className="shrink-0">
            {tr("Learn this method")}</Button>
        </div>
        <ol className="flex flex-col gap-4">
          {method.steps.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className={cn(NUMERIC, "w-5 shrink-0 pt-px text-sm text-muted-foreground")}>{i + 1}</span>
              <div className="flex flex-col gap-1">
                <strong className="text-sm font-medium">{said(step.title)}</strong>
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
  const results = s
    .cases()
    .filter((c: any) => matches(c, s.search))
    .slice(0, 50);
  return (
    <CommandDialog
      open={s.overlay === "search"}
      onOpenChange={(open: boolean) => !open && s.overlay === "search" && close()}
      title={tr("Search cases")}
      description={tr("Find a case by its name, set or group")}
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false}>
        <CommandInput
          autoFocus
          placeholder={tr("Search a case: oll fish, pll t, f2l 6…")}
          value={s.search}
          onValueChange={(v) => {
            s.search = v;
            s.emit();
          }}
        />
        <CommandList className="max-h-[min(60vh,28rem)] p-1">
          <CommandEmpty>{tr("No case matches.")}</CommandEmpty>
          {results.map((c: any) => (
            <CommandItem key={c.id} value={c.id} onSelect={() => void s.action("case:" + c.id)} className="gap-3 py-1.5">
              <Diagram c={c} size={40} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {c.id}
                  {c.name !== c.id && <span className="font-normal text-muted-foreground"> · {c.name}</span>}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {c.setLabel} · {c.group}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function CommentForm() {
  const solve = s.overlaySolve,
    [comment, setComment] = useState(solve?.comment ?? "");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await call("setComment", solve.id, comment);
          close();
          await s.refresh();
        } catch (e) {
          s.fail(e);
        }
      }}
    >
      <Textarea autoFocus className="min-h-28" placeholder={tr("What happened on this solve?")} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex justify-end gap-2">
        <UiButton type="button" variant="ghost" onClick={close}>
          {tr("Cancel")}</UiButton>
        <UiButton type="submit">{tr("Save")}</UiButton>
      </div>
    </form>
  );
}

function SolveDetails() {
  const solve = s.overlaySolve;
  if (!solve) return null;
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className={cn(NUMERIC, "text-5xl font-medium tracking-tight", solve.penalty === "dnf" && "text-destructive", solve.penalty === "+2" && "text-warning")}>
          {fmtSolve(solve.time_ms, solve.penalty)}
        </span>
        <span className="text-sm text-muted-foreground">{solve.displayDate}</span>
      </div>
      {solve.scramble && <Alg text={solve.scramble} size={15} className="text-foreground/90" />}
      {solve.solution && <SolveSolution key={solve.id} solve={solve} />}
      {solve.comment && <p className="text-sm text-muted-foreground">{solve.comment}</p>}
      <div className="flex flex-wrap items-center gap-1">
        <ActionToggle action={"penalty:" + solve.id + ":+2"} pressed={solve.penalty === "+2"}>
          +2
        </ActionToggle>
        <ActionToggle action={"penalty:" + solve.id + ":dnf"} pressed={solve.penalty === "dnf"}>
          {tr("DNF")}</ActionToggle>
        <Button action={"comment:" + solve.id} icon={MessageSquare}>
          {tr("Comment")}</Button>
        <Button action={"delete:" + solve.id} icon={Trash2} variant="destructive" className="ml-auto">
          {tr("Delete")}</Button>
      </div>
    </>
  );
}

/** Every dialog of the app, each open while the app overlay names it. */
/** Picking a puzzle the player cannot solve yet: learn it, say it is already known, or go back to the previous one. */
function LearnPuzzle() {
  const puzzle = puzzleInfo(s.puzzle as PuzzleId).label;
  const phone = usePhone();
  return (
    <Modal id="learnPuzzle" title={tr("Learn to solve the {0}?", { 0: puzzle })} description={tr("Learn it step by step, and the timer, algorithms, training and duels open on the {0} once you finish. Already know it? Unlock everything now.", { 0: puzzle })} className="sm:max-w-md">
      <div className={cn("flex gap-2", phone ? "flex-col-reverse" : "items-center justify-end")}>
        {s.lockedFrom && (
          <Button action="learnPuzzle:cancel" variant="ghost" className={cn(!phone && "mr-auto")}>
            {tr("Not now")}</Button>
        )}
        <Button action="learnPuzzle:skip" variant="outline">
          {tr("Unlock everything")}</Button>
        <Button action="learnPuzzle:start" variant="default" icon={GraduationCap}>
          {tr("Start learning")}</Button>
      </div>
    </Modal>
  );
}

/** A greyed section while the puzzle's course comes first: keep learning, or skip the tutorial and open everything. */
function SkipLearning() {
  const puzzle = puzzleInfo(s.puzzle as PuzzleId).label;
  const phone = usePhone();
  return (
    <Modal id="skipLearning" title={tr("Skip the tutorial?")} description={tr("This section opens once you can solve the {0}. Skip the tutorial if you already know how.", { 0: puzzle })} className="sm:max-w-md">
      <div className={cn("flex gap-2", phone ? "flex-col-reverse" : "justify-end")}>
        <UiButton variant="ghost" onClick={close}>
          {tr("Keep learning")}</UiButton>
        <Button action="skipLearning" variant="default">
          {tr("Skip the tutorial")}</Button>
      </div>
    </Modal>
  );
}

export function Overlays() {
  return (
    <>
      <Modal id="settings" title={tr("Settings")} className="sm:max-w-md" tall>
        <Settings />
      </Modal>
      <Modal id="importTimes" title={tr("Import times")} description={tr("From another timer, or a file exported from Qbix. The file is read on this device.")} className="sm:max-w-lg">
        <ImportTimes />
      </Modal>
      <GuidesDialog />
      <SessionSheet />
      <MethodsDialog />
      <SearchDialog />
      <LearnPuzzle />
      <SkipLearning />
      <Modal id="algPlayer" title={s.algView?.items[s.algView.index]?.name ?? tr("Algorithm")} description={tr("The algorithm played on the cube")} hideHeader tall className="flex h-[min(86vh,560px)] gap-0 overflow-hidden p-0 sm:max-w-4xl" sheetClassName="pb-6">
        <AlgView />
      </Modal>
      <Modal id="notation" title={tr("Notation")} description={tr("How moves are written")} tall className="flex h-[min(88vh,760px)] flex-col sm:max-w-5xl">
        <NotationContent />
      </Modal>
      <Modal id="learningGroups" title={tr("Group order · {0}", { 0: s.learningMode })} description={tr("Drag the groups, or use the arrow keys on a handle.")} className="sm:max-w-md">
        <LearningGroups key={s.learningMode} />
      </Modal>
      <Modal id="comment" title={tr("Comment")} className="sm:max-w-md">
        <CommentForm key={s.overlaySolve?.id} />
      </Modal>
      <Modal id="solve" title={tr("Solve")} hideHeader className="sm:max-w-lg">
        <SolveDetails />
      </Modal>
      <Modal id="profileCase" title={said(s.caseId)} className="flex h-[min(88vh,760px)] flex-col sm:max-w-4xl" tall>
        <TimerStats compact data={s.caseHistory} empty={tr("No attempts on this case yet.")} />
      </Modal>
    </>
  );
}
