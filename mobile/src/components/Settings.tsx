import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookA, BookOpen, Check, Download, Languages, LogOut, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { joinedDate } from "../../../src/client/lib/format";
import { LEGAL_DOCUMENTS } from "../../../src/client/lib/legal";
import { THEMES } from "../../../src/client/lib/theme";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { API_ORIGIN, api } from "../api";
import { LANGUAGES, setLanguage, useLanguage, type Language } from "../i18n";
import { exportData } from "../lib/files";
import { updateAvailable } from "../lib/release";
import { APK_DOWNLOAD_URL, APP_BUILD, APP_COMMIT, APP_RUNTIME, APP_VERSION, latestReleaseAtom, restartWithUpdate, useOtaCheck, useOtaPending, useReleaseCheck } from "../release";
import { colorModeAtom, guidesAtom, notationAtom, settingsOpenAtom, themeAtom, userAtom } from "../state";
import { ListGroup, ListRow, Segmented } from "./layout";
import { ChoiceButton } from "./PuzzlePicker";
import { Sheet, SheetInput } from "./Sheet";
import { toastAtom } from "./Toast";
import { UserAvatar } from "./UserAvatar";
import { tr } from "../../../src/client/i18n";

/**
 * The settings, as the web's dialog but in a tall sheet: the account and signing out, its data (a copy to keep, the
 * account deleted), the language, the appearance (mode and accent) and, on the native app, the guides, the legal
 * documents and the installed version.
 */
export function SettingsSheet() {
  const [open, setOpen] = useAtom(settingsOpenAtom);
  useReleaseCheck(open);
  useOtaCheck(open);
  return <Sheet open={open} onClose={() => setOpen(false)} title={tr("Settings")} scroll contentClassName="gap-6">
    <Account onSignedOut={() => setOpen(false)} />
    <LanguageGroup />
    <Appearance />
    <Help onOpen={() => setOpen(false)} />
    <Legal />
    <Version />
  </Sheet>;
}

function Account({ onSignedOut }: { onSignedOut: () => void }) {
  const user = useAtomValue(userAtom);
  const [busy, setBusy] = useState(false), [exporting, setExporting] = useState(false), [deleting, setDeleting] = useState(false);
  const toast = useSetAtom(toastAtom);
  if (!user) return null;
  const signOut = async () => {
    setBusy(true);
    try { await api.logout(); onSignedOut(); } finally { setBusy(false); }
  };
  const download = async () => {
    setExporting(true);
    try { await exportData("json"); } catch (e) { toast({ title: (e as Error).message }); } finally { setExporting(false); }
  };
  return <>
    <ListGroup title={tr("Account")}>
      <ListRow first iconNode={<UserAvatar user={user} size={40} />} title={user.username} detail={tr("Joined {0}", { 0: joinedDate(user.createdAt) })} />
      <ListRow icon={LogOut} title={<Text className="text-base font-medium text-destructive">{busy ? tr("Logging out…") : tr("Log out")}</Text>} chevron={false} disabled={busy}
        accessibilityLabel={tr("Log out")} onPress={() => void signOut()} />
    </ListGroup>
    <ListGroup title={tr("Your data")}>
      <ListRow first icon={Download} title={exporting ? tr("Preparing…") : tr("Download my data")} disabled={exporting} onPress={() => void download()} />
      <ListRow icon={Trash2} title={tr("Delete my account")} onPress={() => setDeleting(true)} />
    </ListGroup>
    <DeleteAccount open={deleting} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); onSignedOut(); toast({ title: tr("Your account and its data were deleted.") }); }} />
  </>;
}

/** The account deleted with its password, as the web's dialog; this device goes back to the sign-in screen. */
function DeleteAccount({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const close = () => { setPassword(""); setError(""); onClose(); };
  const remove = async () => {
    if (!password || busy) return;
    setBusy(true); setError("");
    try { await api.deleteAccount(password); setPassword(""); onDeleted(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <Sheet open={open} onClose={close} title={tr("Delete your account?")}
    description={tr("Your times, sessions, friends, messages, groups you own and everything else of the account are erased from the server at once. This cannot be undone.")}>
    <View className="gap-2">
      <Text className="text-sm font-medium">{tr("Your password")}</Text>
      <SheetInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password"
        accessibilityLabel={tr("Your password")} returnKeyType="go" onSubmitEditing={() => void remove()} className={error ? "border-destructive" : undefined} />
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </View>
    <View className="flex-row justify-end gap-2">
      <Button variant="ghost" onPress={close}><Text>{tr("Keep my account")}</Text></Button>
      <Button variant="destructive" disabled={!password || busy} onPress={() => void remove()}><Text>{busy ? tr("Deleting…") : tr("Delete for good")}</Text></Button>
    </View>
  </Sheet>;
}

function LanguageGroup() {
  const language = useLanguage();
  return <ListGroup title={tr("Language")}>
    <ListRow first icon={Languages} title={tr("Language of the app")} chevron={false}
      trailing={<ChoiceButton label={tr("Language")} value={language} options={LANGUAGES.map(l => ({ id: l.id, label: l.name }))} onChange={(id: Language) => void setLanguage(id)} />} />
  </ListGroup>;
}

function Appearance() {
  const [mode, setMode] = useAtom(colorModeAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  return <ListGroup title={tr("Appearance")}>
    <View className="gap-4 p-4">
      <Segmented label={tr("Theme")} value={mode} onChange={setMode}
        options={[{ id: "dark", label: tr("Dark") }, { id: "light", label: tr("Light") }, { id: "system", label: tr("System") }]} />
      <View className="flex-row justify-between" accessibilityRole="radiogroup" accessibilityLabel={tr("Accent colour")}>
        {THEMES.map(item => {
          const on = theme === item.id;
          return <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: on }} onPress={() => setTheme(item.id)}
            className="size-11 items-center justify-center" style={{ borderRadius: 999, borderWidth: 2, borderColor: on ? item.color : "transparent" }}>
            <View className="size-8 items-center justify-center" style={{ borderRadius: 999, backgroundColor: item.color }}>
              {on ? <Icon as={Check} size={16} className="text-white" /> : null}
            </View>
          </Pressable>;
        })}
      </View>
    </View>
  </ListGroup>;
}

function Help({ onOpen }: { onOpen: () => void }) {
  const openGuides = useSetAtom(guidesAtom), openNotation = useSetAtom(notationAtom);
  return <ListGroup title={tr("Help")}>
    <ListRow first icon={BookOpen} title={tr("Guides")} detail={tr("How each part of Qbix works")} onPress={() => { onOpen(); openGuides("about"); }} />
    <ListRow icon={BookA} title={tr("Notation")} detail={tr("What every move letter means")} onPress={() => { onOpen(); openNotation(true); }} />
  </ListGroup>;
}

/** The legal documents, read on the website. */
function Legal() {
  return <View className="flex-row flex-wrap gap-x-1 px-1" accessibilityLabel={tr("Legal documents")}>
    {[...LEGAL_DOCUMENTS, { path: "/privacy#cookies", label: tr("Cookies") }].map(({ path, label }) =>
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
  return <View className="gap-3">
    <View className="flex-row flex-wrap items-center justify-between gap-3 px-1">
      <Text className="text-xs text-muted-foreground" accessibilityLabel={tr("Installed version")}>Qbix {APP_VERSION}{APP_COMMIT ? ` · ${APP_COMMIT}` : ""}</Text>
      {pending && <Button size="sm" onPress={() => void restartWithUpdate()}><Text>{tr("Restart to update")}</Text></Button>}
      {outdated && <Button size="sm" accessibilityHint={tr("Build {0}", { 0: latest?.apkCommit?.slice(0, 7) })} onPress={() => void Linking.openURL(APK_DOWNLOAD_URL)}><Text>{tr("Download update")}</Text></Button>}
    </View>
  </View>;
}
