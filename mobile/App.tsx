import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { Provider, useAtom, useAtomValue, useSetAtom } from "jotai";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AppState, BackHandler, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { local, localChanged } from "./src/api";
import { ChatConnection } from "./src/components/ChatConnection";
import { AccountTabs } from "./src/components/AccountTabs";
import { SettingsDialog } from "./src/components/Settings";
import { Nav } from "./src/components/Nav";
import { SolveMenuProvider } from "./src/components/SolveMenus";
import { SyncIndicator } from "./src/components/SyncIndicator";
import { useLayout } from "./src/hooks/useLayout";
import { PlaygroundPage } from "./src/pages/PlaygroundPage";
import { ScramblerHost } from "./src/scrambler";
import { chatActivityAtom, colorModeAtom, goBackAtom, keyboardVisibleAtom, routeAtom, statsVersionAtom, themeAtom, timerRunningAtom, userAtom, type Page, type Route } from "./src/state";
import { buildTheme, ThemeContext, useTheme } from "./src/theme";

const CommunityPage = lazy(() => import("./src/pages/AccountPage").then(m => ({ default: m.CommunityPage })));
const ProfilePage = lazy(() => import("./src/pages/AccountPage").then(m => ({ default: m.ProfilePage })));
const AlgorithmsPage = lazy(() => import("./src/pages/AlgorithmsPage").then(m => ({ default: m.AlgorithmsPage })));
const TrainingPage = lazy(() => import("./src/pages/TrainingPage").then(m => ({ default: m.TrainingPage })));
const MessagesPage = lazy(() => import("./src/pages/MessagesPage").then(m => ({ default: m.MessagesPage })));
const GuidesPage = lazy(() => import("./src/pages/GuidesPage").then(m => ({ default: m.GuidesPage })));

/** Which navigation entry a route belongs to. */
function navPage(route: Route): Page {
  if (route.page === "guides") return "profile";
  if (route.page === "messages" || route.page === "community") return "profile";
  return route.page;
}

export function App() {
  const [fontsLoaded, fontError] = useFonts({ "cubing-icons": require("./assets/fonts/cubing-icons.ttf") });
  return <SafeAreaProvider><Provider><Themed>{fontsLoaded || fontError ? <Shell /> : <Boot />}</Themed></Provider></SafeAreaProvider>;
}

function Themed({ children }: { children: React.ReactNode }) {
  const themeId = useAtomValue(themeAtom), colorMode = useAtomValue(colorModeAtom);
  const theme = useMemo(() => buildTheme(themeId, colorMode), [themeId, colorMode]);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.bg);
  }, [theme]);
  return <ThemeContext.Provider value={theme}>
    <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
    <View style={[styles.app, { backgroundColor: theme.bg }]}>{children}</View>
  </ThemeContext.Provider>;
}

function Boot() {
  const t = useTheme();
  return <View style={styles.boot}><Text style={{ color: t.muted, fontSize: 14 }}>Loading…</Text></View>;
}

function Shell() {
  const insets = useSafeAreaInsets();
  const { phone } = useLayout();
  const running = useAtomValue(timerRunningAtom);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useAtom(keyboardVisibleAtom);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, [setKeyboardVisible]);
  const [user, setUser] = useAtom(userAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  useEffect(() => {
    const refresh = () => { setUser(local.current()); bumpStats(v => v + 1); };
    refresh();
    void local.restore();
    const unsubscribe = localChanged.on(refresh);
    const reconnect = () => { void local.restore(); };
    const appState = AppState.addEventListener("change", state => { if (state === "active") reconnect(); });
    const retry = setInterval(reconnect, 30000);
    return () => { unsubscribe(); appState.remove(); clearInterval(retry); };
  }, [setUser, bumpStats]);
  const [route, setRoute] = useAtom(routeAtom);
  const goBack = useSetAtom(goBackAtom);
  const [chatActivity, setChatActivity] = useAtom(chatActivityAtom);
  useEffect(() => { if (route.page === "messages") setChatActivity(false); }, [route.page, chatActivity, setChatActivity]);
  // The hardware back button walks the in-app history, like the browser's back button.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => running || goBack());
    return () => subscription.remove();
  }, [goBack, running]);
  const navigate = useCallback((page: Page) => setRoute({ page } as Route), [setRoute]);
  const active = navPage(route);
  return <SolveMenuProvider>
    <ChatConnection />
    <ScramblerHost />
    <KeyboardAvoidingView behavior={Platform.OS === "android" ? "height" : undefined} style={styles.main}>
    <View style={[styles.main, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      {!!user && !user.isGuest && !keyboardVisible && ["profile", "community", "messages"].includes(route.page) && !(route.page === "profile" && (route.username || route.caseId)) && <AccountTabs route={route} />}
      <Suspense fallback={<Boot />}>
        {!user ? <Boot /> : <>
          {route.page === "algorithms" && <AlgorithmsPage />}
          {route.page === "training" && <TrainingPage />}
          {route.page === "playground" && <PlaygroundPage />}
          {route.page === "messages" && <MessagesPage solveId={route.solveId} />}
          {route.page === "guides" && <GuidesPage guide={route.guide} />}
          {route.page === "community" && <CommunityPage />}
          {route.page === "profile" && <ProfilePage key={route.username ?? "self"} username={route.username} mode={route.mode} caseId={route.caseId} />}
        </>}
      </Suspense>
    </View>
    </KeyboardAvoidingView>
    <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    <Nav active={active} onNavigate={navigate} onSettings={() => setSettingsOpen(true)} settingsOpen={settingsOpen} chatActivity={chatActivity} hidden={running || keyboardVisible} phone={phone} />
    <SyncIndicator hidden={running} />
  </SolveMenuProvider>;
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  main: { flex: 1, minHeight: 0 },
  boot: { flex: 1, alignItems: "center", justifyContent: "center" },
});
