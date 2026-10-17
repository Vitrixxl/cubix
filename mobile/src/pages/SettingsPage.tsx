import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Bell, BookA, BookOpen, Check, CircleHelp, Coffee, Download, Languages, LogIn, LogOut, Monitor, Moon, Pencil, Sun, Trash2, Upload, type LucideIcon } from "lucide-react-native";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { LEGAL_DOCUMENTS } from "../../../src/client/lib/legal";
import { canInstall, install, onInstallChange } from "../../../src/client/lib/pwaInstall";
import { THEMES } from "../../../src/client/lib/theme";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { API_ORIGIN, api } from "../api";
import { PushedBar } from "../components/AppBar";
import { ImportSheet } from "../components/ImportTimes";
import { ListRow } from "../components/layout";
import { Caption, PillSeg, SheetChoice } from "../components/PuzzlePicker";
import { Sheet } from "../components/Sheet";
import { toastAtom } from "../components/Toast";
import { UserAvatar } from "../components/UserAvatar";
import { LANGUAGES, setLanguage, useLanguage, type Language } from "../i18n";
import { useLayout } from "../hooks/useLayout";
import { exportData } from "../lib/files";
import { updateAvailable } from "../lib/release";
import { APK_DOWNLOAD_URL, APP_BUILD, APP_COMMIT, APP_RUNTIME, APP_VERSION, latestReleaseAtom, restartWithUpdate, useOtaCheck, useOtaPending, useReleaseCheck } from "../release";
import { colorModeAtom, guestModeAtom, guidesAtom, notationAtom, remindersAtom, themeAtom, userAtom } from "../state";
import { said, tr } from "../../../src/client/i18n";

/**
 * The settings, pushed from the profile (direction A): the account (its username to change) and signing out, then
 * grouped rows: the appearance (mode and accent), the language, the data (importing, a copy to keep, the account deleted),
 * the guides, the legal documents and the installed version. A tablet sets the language in place
 * and lays the groups in two columns; a wide screen docks the account, the help and the version at the right.
 *
 * @public Loaded on demand, by `require` (App.tsx, CoachingPage.tsx).
 */
export function SettingsPage() {
  useReleaseCheck(true);
  useOtaCheck(true);
  const openGuides = useSetAtom(guidesAtom);
  const { tablet, wide } = useLayout();
  const head = <PushedBar title={tr("Settings")}>
    <Pressable accessibilityRole="button" accessibilityLabel={tr("Guides")} onPress={() => openGuides("about")} className="size-11 items-center justify-center rounded-full active:bg-muted">
      <Icon as={CircleHelp} size={20} />
    </Pressable>
  </PushedBar>;
  if (wide) return <View className="flex-1 flex-row">
    <View className="min-w-0 flex-1">
      {head}
      <ScrollView className="flex-1" contentContainerClassName="flex-row gap-3 px-7 pb-4" showsVerticalScrollIndicator={false}>
        <View className="flex-1 gap-2.5"><Appearance /><LanguageChoice /><RemindersGroup /></View>
        <View className="flex-1 gap-2.5"><Data /></View>
      </ScrollView>
    </View>
    <View className="w-[404px] p-3 pl-0">
      <ScrollView className="flex-1 rounded-3xl bg-card" contentContainerClassName="gap-2.5 p-4" showsVerticalScrollIndicator={false}>
        <Account />
        <Help />
        <Legal />
        <Version />
      </ScrollView>
    </View>
  </View>;
  if (tablet) return <View className="flex-1">
    {head}
    <ScrollView className="flex-1" contentContainerClassName="gap-3 px-7 pb-4" showsVerticalScrollIndicator={false}>
      <Account />
      <Appearance />
      <LanguageChoice />
      <RemindersGroup />
      <View className="flex-row gap-3">
        <View className="flex-1 gap-2.5"><Data /></View>
        <View className="flex-1 gap-2.5"><Help /></View>
      </View>
      <Legal />
      <Version />
    </ScrollView>
  </View>;
  return <View className="flex-1">
    {head}
    <ScrollView className="flex-1" contentContainerClassName="gap-2.5 px-4 pb-4" showsVerticalScrollIndicator={false}>
      <Account />
      <Appearance />
      <LanguageGroup />
      <RemindersGroup />
      <Data />
      <Help />
      <Legal />
      <Version />
    </ScrollView>
  </View>;
}

/** A titled group of rows on one card. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <>
    <View className="px-1 pt-1.5"><Caption>{title}</Caption></View>
    <View className="overflow-hidden rounded-2xl bg-card">{children}</View>
  </>;
}

/** Where the coffee is bought. */
const COFFEE = "https://buymeacoffee.com/vitrixxl";
/** A row's icon: plain, muted. */
const glyph = (icon: LucideIcon, className = "text-muted-foreground") => <Icon as={icon} size={20} className={className} />;

/** A setting whose value opens its choices in a sheet. */
function ChoiceRow<T extends string>({ icon, title, value, options, onChange, first }: { icon: LucideIcon; title: string; value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; first?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <ListRow first={first} iconNode={glyph(icon)} title={title} onPress={() => setOpen(true)}
      trailing={<Text numberOfLines={1} className="max-w-36 text-sm text-muted-foreground">{said(options.find(o => o.id === value)?.label ?? value)}</Text>} />
    <Sheet open={open} onClose={() => setOpen(false)} title={title}>
      <SheetChoice label={title} columns={options.length > 4 ? 2 : 1} value={value} options={options} onChange={id => { setOpen(false); onChange(id); }} />
    </Sheet>
  </>;
}

function Account() {
  const user = useAtomValue(userAtom);
  const [busy, setBusy] = useState(false), setGuest = useSetAtom(guestModeAtom);
  if (!user) return null;
  const [renaming, setRenaming] = useState(false);
  const signOut = async () => { setBusy(true); try { await api.logout(); } finally { setBusy(false); } };
  return <View className="flex-row items-center gap-3 rounded-2xl bg-primary/10 py-2.5 pr-2 pl-3" accessibilityLabel={tr("Account")}>
    <UserAvatar user={user} size={44} className="rounded-xl" />
    {/* An account's username, a tap away from a new one. */}
    <Pressable disabled={user.isGuest} accessibilityRole={user.isGuest ? undefined : "button"} accessibilityLabel={user.isGuest ? undefined : tr("Change username")}
      onPress={() => setRenaming(true)} className="min-w-0 flex-1 flex-row items-center gap-1.5">
      <Text numberOfLines={1} className="min-w-0 shrink text-lg font-extrabold tracking-[-0.02em]">{user.username}</Text>
      {!user.isGuest && <Icon as={Pencil} size={15} className="text-muted-foreground" />}
    </Pressable>
    <Rename open={renaming} onClose={() => setRenaming(false)} />
    {user.isGuest ? <Button className="h-11 gap-1.5 rounded-full" onPress={() => setGuest(false)}>
      <Icon as={LogIn} size={16} className="text-primary-foreground" />
      <Text>{tr("Sign in")}</Text>
    </Button> : <Button variant="ghost" className="h-11 gap-1.5" disabled={busy} onPress={() => void signOut()}>
      <Icon as={LogOut} size={16} className="text-muted-foreground" />
      <Text className="text-muted-foreground">{busy ? tr("Logging out…") : tr("Sign out")}</Text>
    </Button>}
  </View>;
}

/** A new username in a sheet: the server's refusal (taken, wrong characters) under the field. */
function Rename({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAtomValue(userAtom);
  const [name, setName] = useState(user?.username ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const save = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await api.setUsername(name.trim()); onClose(); } catch (e) { setError(said((e as Error).message)); } finally { setBusy(false); }
  };
  return <Sheet open={open} onClose={onClose} title={tr("Change username")}>
    <Input value={name} onChangeText={setName} accessibilityLabel={tr("Username")} maxLength={24} autoCapitalize="none" autoCorrect={false} autoFocus onSubmitEditing={() => void save()} />
    {error ? <Alert variant="destructive">{error}</Alert> : null}
    <View className="flex-row justify-end gap-2">
      <Button variant="ghost" onPress={onClose}><Text>{tr("Cancel")}</Text></Button>
      <Button disabled={busy || !name.trim()} onPress={() => void save()}><Text>{tr("Save")}</Text></Button>
    </View>
  </Sheet>;
}

function Appearance() {
  const [mode, setMode] = useAtom(colorModeAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  return <Group title={tr("Appearance")}>
    <View className="min-h-16 flex-row items-center justify-between gap-3 px-4 py-3">
      <Text className="text-base font-medium">{tr("Theme")}</Text>
      <PillSeg label={tr("Theme")} value={mode} onChange={setMode}
        options={[{ id: "dark", label: tr("Dark"), icon: Moon }, { id: "light", label: tr("Light"), icon: Sun }, { id: "system", label: tr("System"), icon: Monitor }]} />
    </View>
    <View className="min-h-16 flex-row items-center justify-between gap-3 border-t border-border px-4 py-3">
      <Text className="text-base font-medium">{tr("Accent")}</Text>
      <View className="flex-row gap-1" accessibilityRole="radiogroup" accessibilityLabel={tr("Accent colour")}>
        {THEMES.map(item => {
          const on = theme === item.id;
          return <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={said(item.name)} accessibilityState={{ checked: on }} onPress={() => setTheme(item.id)}
            className="size-9 items-center justify-center rounded-full" style={{ borderWidth: 2, borderColor: on ? item.color : "transparent" }}>
            <View className="size-7 items-center justify-center rounded-full" style={{ backgroundColor: item.color }}>
              {on ? <Icon as={Check} size={15} strokeWidth={3} className="text-[#1c1317]" /> : null}
            </View>
          </Pressable>;
        })}
      </View>
    </View>
  </Group>;
}

/** The day's reminders, on or off (`lib/reminders`). */
function RemindersGroup() {
  const [on, setOn] = useAtom(remindersAtom);
  return <Group title={tr("Reminders")}>
    <ChoiceRow first icon={Bell} title={tr("The cases to review and the streak at stake")} value={on ? "on" : "off"} onChange={id => setOn(id === "on")}
      options={[{ id: "on", label: tr("Once a day") }, { id: "off", label: tr("Never") }]} />
  </Group>;
}

function LanguageGroup() {
  const language = useLanguage();
  return <Group title={tr("Language")}>
    <ChoiceRow<Language> first icon={Languages} title={tr("Language of the app")} value={language} onChange={id => void setLanguage(id)} options={LANGUAGES.map(l => ({ id: l.id, label: l.name }))} />
  </Group>;
}

/** On a tablet: the app's languages in place, on a card of their own. */
function LanguageChoice({ className }: { className?: string }) {
  const language = useLanguage();
  return <View className={cn("rounded-2xl bg-card p-4", className)}>
    <SheetChoice<Language> label={tr("Language of the app")} columns={2} value={language} onChange={id => void setLanguage(id)} options={LANGUAGES.map(l => ({ id: l.id, label: l.name }))} />
  </View>;
}

/** The account's data: times brought from another timer, a copy to keep, the account deleted. */
function Data() {
  const user = useAtomValue(userAtom);
  const toast = useSetAtom(toastAtom);
  const [importing, setImporting] = useState(false), [exporting, setExporting] = useState(false), [deleting, setDeleting] = useState(false);
  const download = async (kind: "csv" | "json") => {
    setExporting(true);
    try { await exportData(kind); } catch (e) { toast({ title: (e as Error).message }); } finally { setExporting(false); }
  };
  const format = (kind: "csv" | "json") => <Pressable key={kind} accessibilityRole="button" accessibilityLabel={tr("Download my data ({0})", { 0: kind.toUpperCase() })} disabled={exporting}
    onPress={() => void download(kind)} className={cn("h-9 justify-center rounded-full bg-muted px-3 active:bg-accent", exporting && "opacity-50")}>
    <Text className="text-xs font-bold text-muted-foreground">{kind.toUpperCase()}</Text>
  </Pressable>;
  return <Group title={tr("Your data")}>
    <ListRow first iconNode={glyph(Upload)} title={tr("Import times")} onPress={() => setImporting(true)} />
    <ListRow iconNode={glyph(Download)} title={exporting ? tr("Preparing…") : tr("Download my data")} trailing={<View className="flex-row gap-1">{format("csv")}{format("json")}</View>} />
    {user && !user.isGuest && <ListRow iconNode={glyph(Trash2, "text-destructive")} title={<Text className="text-base font-medium text-destructive">{tr("Delete my account")}</Text>}
      accessibilityLabel={tr("Delete my account")} chevron={false} onPress={() => setDeleting(true)} />}
    <ImportSheet open={importing} onClose={() => setImporting(false)} />
    <DeleteAccount open={deleting} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); toast({ title: tr("Your account and its data were deleted.") }); }} />
  </Group>;
}

/** The account deleted once confirmed, as the web's dialog; this device goes back to the sign-in screen. */
function DeleteAccount({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const close = () => { setError(""); onClose(); };
  const remove = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await api.deleteAccount(); onDeleted(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <Sheet open={open} onClose={close} title={tr("Delete your account?")} description={tr("This cannot be undone.")}>
    {error ? <Alert variant="destructive">{error}</Alert> : null}
    <View className="flex-row justify-end gap-2">
      <Button variant="ghost" accessibilityLabel={tr("Keep my account")} onPress={close}><Text>{tr("Cancel")}</Text></Button>
      <Button variant="destructive" accessibilityLabel={tr("Delete for good")} disabled={busy} onPress={() => void remove()}><Text>{busy ? tr("Deleting…") : tr("Delete")}</Text></Button>
    </View>
  </Sheet>;
}

function Help() {
  const openGuides = useSetAtom(guidesAtom), openNotation = useSetAtom(notationAtom);
  // On the web only, while the browser offers to install the app (pwaInstall.ts).
  const installable = useSyncExternalStore(onInstallChange, canInstall, () => false) && Platform.OS === "web";
  return <Group title={tr("Help")}>
    <ListRow first iconNode={glyph(BookOpen)} title={tr("Guides")} onPress={() => openGuides("about")} />
    <ListRow iconNode={glyph(BookA)} title={tr("Notation")} onPress={() => openNotation(true)} />
    <ListRow iconNode={glyph(Coffee)} title={tr("Buy me a coffee")} onPress={() => void Linking.openURL(COFFEE)} />
    {installable && <ListRow iconNode={glyph(Download)} title={tr("Install")} accessibilityLabel={tr("Install Qbix as an app")} onPress={install} />}
  </Group>;
}

/** The legal documents, read on the website. */
function Legal() {
  return <View className="flex-row flex-wrap gap-x-1 px-1" accessibilityLabel={tr("Legal documents")}>
    {[...LEGAL_DOCUMENTS, { path: "/privacy#cookies", label: "Cookies" }].map(({ path, label }) =>
      <Pressable key={path} accessibilityRole="link" onPress={() => void Linking.openURL(API_ORIGIN + path)} className="h-11 justify-center px-2 active:opacity-60">
        <Text className="text-xs text-muted-foreground">{tr(label)}</Text>
      </Pressable>)}
  </View>;
}

/**
 * The installed build. A JavaScript update fetched over the air only needs a restart; a new native build needs the APK
 * the server announces.
 */
function Version() {
  const latest = useAtomValue(latestReleaseAtom);
  const pending = useOtaPending();
  const outdated = !pending && updateAvailable(APP_BUILD, latest, APP_RUNTIME);
  return <View className="flex-row flex-wrap items-center justify-between gap-3 px-1">
    <Text className="text-xs text-muted-foreground" accessibilityLabel={tr("Installed version")}>Qbix {APP_VERSION}{APP_COMMIT ? ` · ${APP_COMMIT}` : ""}</Text>
    {pending && <Button size="sm" accessibilityLabel={tr("Restart to update")} onPress={() => void restartWithUpdate()}><Text>{tr("Install")}</Text></Button>}
    {outdated && <Button size="sm" accessibilityLabel={tr("Download update")} accessibilityHint={tr("Build {0}", { 0: latest?.apkCommit?.slice(0, 7) })} onPress={() => void Linking.openURL(APK_DOWNLOAD_URL)}><Text>{tr("Download")}</Text></Button>}
  </View>;
}
