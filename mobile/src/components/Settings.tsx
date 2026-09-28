import { THEMES } from "../../../src/client/lib/theme";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState, type ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { api, authToken } from "../api";
import { updateAvailable } from "../lib/release";
import { APK_DOWNLOAD_URL, APP_BUILD, APP_COMMIT, APP_RUNTIME, APP_VERSION, latestReleaseAtom, restartWithUpdate, useOtaCheck, useOtaPending, useReleaseCheck } from "../release";
import { guidesAtom, colorModeAtom, routeAtom, statsVersionAtom, themeAtom, userAtom } from "../state";
import { useTheme } from "../theme";
import { Sheet, SheetScrollView } from "./Sheet";
import { Avatar, Btn, FormError, Input, Label, Muted, Segmented } from "./ui";

/**
 * The web app's Settings dialog (`Settings` in desktop/renderer/main.tsx): plain sections separated by
 * lines. Account: the sign-in / create-account form for a guest, or the signed-in account with Sign out.
 * Appearance: theme, accent, help (opens the guides) and, on the native app, the installed version.
 */

export type AuthMode = "register" | "login";

/** `.account-form`: Sign in / Create account tabs, username, password and the submit button. */
export function AccountForm({ initialMode = "register", onDone }: { initialMode?: AuthMode; onDone?: () => void } = {}) {
  const t = useTheme();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  useEffect(() => { setMode(initialMode); }, [initialMode]);
  const setUser = useSetAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) { setError("Username: 3–24 letters, digits or underscores."); return; }
    if (password.length < (mode === "register" ? 10 : 1)) { setError(mode === "register" ? "Password: 10 characters or more." : "Enter your password."); return; }
    setBusy(true); setError("");
    try {
      const result = mode === "register" ? await api.register(username, password) : await api.login(username, password);
      authToken.set(result.token); setUser(result.user); bumpStats(v => v + 1);
      setPassword("");
      if (onDone) onDone(); else setRoute({ page: "profile" });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <View style={styles.form}>
    <Segmented plain options={[{ id: "login", label: "Sign in" }, { id: "register", label: "Create account" }]} value={mode} onChange={m => { setMode(m); setError(""); }} disabled={busy} itemStyle={{ height: 32 }} />
    <Muted>{mode === "register" ? "An account keeps your times, statistics and achievements in sync between devices." : "Your local times are merged into your account."}</Muted>
    <View style={styles.field}><Text style={[styles.fieldLabel, { color: t.secondary }]}>Username</Text><Input accessibilityLabel="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={24} editable={!busy} style={styles.input} /></View>
    <View style={styles.field}><Text style={[styles.fieldLabel, { color: t.secondary }]}>Password</Text><Input accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === "register" ? "new-password" : "current-password"} textContentType={mode === "register" ? "newPassword" : "password"} maxLength={128} editable={!busy} onSubmitEditing={() => void submit()} style={styles.input} /></View>
    {mode === "register" && <Muted size={12}>3–24 letters, digits or underscores. Password: 10 characters or more.</Muted>}
    {error ? <FormError>{error}</FormError> : null}
    <Btn variant="primary" size={36} disabled={busy} label={busy ? "One moment…" : mode === "register" ? "Create account" : "Sign in"} onPress={() => void submit()} style={{ alignSelf: "flex-start" }} />
  </View>;
}

/** The signed-in account: avatar, name, join date and Sign out. */
function SignedIn() {
  const t = useTheme();
  const [user, setUser] = useAtom(userAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const setRoute = useSetAtom(routeAtom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!user) return null;
  const logout = async () => {
    setBusy(true); setError("");
    try {
      await api.logout(); authToken.clear(); setUser(await api.me()); bumpStats(v => v + 1);
      setRoute({ page: "profile" });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 8 }}>
    <View style={styles.signedIn}>
      <View style={styles.account}>
        <Avatar username={user.username} size={44} />
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: "600" }}>{user.username}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</Text>
        </View>
      </View>
      <Btn size={30} label={busy ? "Signing out…" : "Sign out"} disabled={busy} onPress={() => void logout()} />
    </View>
    {error ? <FormError>{error}</FormError> : null}
  </View>;
}

/** Device preferences: they apply to guests as well as signed-in cubers. */
function AppearanceSettings({ onNavigate }: { onNavigate?: () => void } = {}) {
  const t = useTheme();
  const openGuides = useSetAtom(guidesAtom);
  const [mode, setMode] = useAtom(colorModeAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  return <View accessibilityLabel="Appearance">
    <Row label="Theme">
      <View style={styles.choices}>
        <Btn size={30} active={mode === "dark"} label="Dark" onPress={() => setMode("dark")} />
        <Btn size={30} active={mode === "light"} label="Light" onPress={() => setMode("light")} />
      </View>
    </Row>
    <Row label="Accent">
      <View style={styles.choices} accessibilityLabel="Accent colour">
        {THEMES.map(item => {
          const chosen = theme === item.id;
          return <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ selected: chosen }} onPress={() => setTheme(item.id)} hitSlop={3}
            style={[styles.swatchRing, { borderColor: chosen ? t.text : "transparent" }]}>
            <View style={[styles.swatch, { backgroundColor: item.color }]} />
          </Pressable>;
        })}
      </View>
    </Row>
    <Row label="Help"><Btn size={30} active label="Open the guides" onPress={() => { onNavigate?.(); openGuides("about"); }} /></Row>
    <VersionRow />
  </View>;
}

/**
 * Shows the installed build. A JavaScript update fetched over the air only needs a restart;
 * a new native build needs the APK the server announces.
 */
function VersionRow() {
  const t = useTheme();
  const latest = useAtomValue(latestReleaseAtom);
  const pending = useOtaPending();
  const outdated = !pending && updateAvailable(APP_BUILD, latest, APP_RUNTIME);
  return <Row label="Version">
    <View style={styles.version}>
      <Text style={{ color: t.muted, fontSize: 13 }} accessibilityLabel="Installed version">{APP_VERSION}{APP_COMMIT ? ` · ${APP_COMMIT}` : ""}</Text>
      {pending && <Btn size={30} variant="primary" label="Restart to update" onPress={() => void restartWithUpdate()} />}
      {outdated && <Btn size={30} variant="primary" label="Download update" accessibilityHint={`Build ${latest?.apkCommit?.slice(0, 7)}`} onPress={() => void Linking.openURL(APK_DOWNLOAD_URL)} />}
    </View>
  </Row>;
}

/** `.settings .panel`: a section under a top line with its quiet uppercase title. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.section, { borderTopColor: t.line }]}>
    <Label>{title}</Label>
    {children}
  </View>;
}

/** The Settings dialog; `authMode` picks the form tab a guest sees first (the account header's buttons). */
export function SettingsDialog({ open, onClose, authMode = "register" }: { open: boolean; onClose: () => void; authMode?: AuthMode }) {
  const user = useAtomValue(userAtom);
  useReleaseCheck(open);
  useOtaCheck(open);
  return <Sheet open={open} onClose={onClose} title="Settings">
    <SheetScrollView contentContainerStyle={{ paddingBottom: 4 }}>
      <Section title="Account">
        {!user || user.isGuest ? <AccountForm initialMode={authMode} onDone={onClose} /> : <SignedIn />}
      </Section>
      <Section title="Appearance"><AppearanceSettings onNavigate={onClose} /></Section>
    </SheetScrollView>
  </Sheet>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  const t = useTheme();
  return <View style={styles.row}><Text style={[styles.label, { color: t.text }]}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  section: { gap: 10, paddingVertical: 16, borderTopWidth: 1 },
  form: { gap: 12 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: "500" },
  input: { minHeight: 38, height: 38, paddingVertical: 0 },
  signedIn: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  account: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1, minWidth: 0 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 },
  label: { fontSize: 13.5, fontWeight: "500" },
  choices: { flexDirection: "row", alignItems: "center", gap: 4 },
  version: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 12, flexShrink: 1 },
  swatchRing: { padding: 1.5, borderRadius: 8, borderWidth: 1.5 },
  swatch: { width: 22, height: 22, borderRadius: 6 },
});
