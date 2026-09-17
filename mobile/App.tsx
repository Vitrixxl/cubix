import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { Provider, useAtom, useAtomValue, useSetAtom } from "jotai";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AppState, BackHandler, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { local, localChanged } from "./src/api";
import { LiveConnection } from "./src/components/LiveConnection";
import { SettingsDialog } from "./src/components/Settings";
import { Nav } from "./src/components/Nav";
import { SolveMenuProvider } from "./src/components/SolveMenus";
import { SolvingCube } from "./src/components/SolvingCube";
import { SyncIndicator } from "./src/components/SyncIndicator";
import { useLayout } from "./src/hooks/useLayout";
import { PlaygroundPage } from "./src/pages/PlaygroundPage";
import { useReleaseCheck } from "./src/release";
import { ScramblerHost } from "./src/scrambler";
import { colorModeAtom, goBackAtom, keyboardVisibleAtom, routeAtom, statsVersionAtom, themeAtom, timerRunningAtom, userAtom, type Page, type Route } from "./src/state";
import { buildTheme, ThemeContext } from "./src/theme";

const ProfilePage = lazy(() => import("./src/pages/AccountPage").then(m => ({ default: m.ProfilePage })));
const AlgorithmsPage = lazy(() => import("./src/pages/AlgorithmsPage").then(m => ({ default: m.AlgorithmsPage })));
const TrainingPage = lazy(() => import("./src/pages/TrainingPage").then(m => ({ default: m.TrainingPage })));
const GuidesPage = lazy(() => import("./src/pages/GuidesPage").then(m => ({ default: m.GuidesPage })));

/** Which navigation entry a route belongs to. */
function navPage(route: Route): Page {
  if (route.page === "guides") return "profile";
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

/** Shown while fonts load, the account restores or a page's code arrives. */
function Boot() {
  return <View style={styles.boot}><SolvingCube size={120} /></View>;
}

function Shell() {
  const insets = useSafeAreaInsets();
  const { phone, navInFlow, insets: safe } = useLayout();
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
  useReleaseCheck(true);
  const [route, setRoute] = useAtom(routeAtom);
  const goBack = useSetAtom(goBackAtom);
  // The hardware back button walks the in-app history, like the browser's back button.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => running || goBack());
    return () => subscription.remove();
  }, [goBack, running]);
  const navigate = useCallback((page: Page) => setRoute({ page } as Route), [setRoute]);
  const active = navPage(route);
  return <SolveMenuProvider>
    <LiveConnection />
    <ScramblerHost />
    <KeyboardAvoidingView behavior={Platform.OS === "android" ? "height" : undefined} style={styles.main}>
    <View style={[styles.main, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <Suspense fallback={<Boot />}>
        {!user ? <Boot /> : <>
          {route.page === "algorithms" && <AlgorithmsPage />}
          {route.page === "training" && <TrainingPage />}
          {route.page === "playground" && <PlaygroundPage />}
          {route.page === "guides" && <GuidesPage guide={route.guide} />}
          {route.page === "profile" && <ProfilePage mode={route.mode} caseId={route.caseId} />}
        </>}
      </Suspense>
    </View>
    </KeyboardAvoidingView>
    <Nav active={active} onNavigate={navigate} onSettings={() => setSettingsOpen(true)} settingsOpen={settingsOpen} hidden={running || keyboardVisible} collapsed={navInFlow && keyboardVisible} phone={phone} />
    <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    <SyncIndicator hidden={running} offset={navInFlow ? 74 + safe.bottom : 84 + safe.bottom} />
  </SolveMenuProvider>;
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  main: { flex: 1, minHeight: 0 },
  boot: { flex: 1, alignItems: "center", justifyContent: "center" },
});
