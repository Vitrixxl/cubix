import "./global.css";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PortalHost } from "@rn-primitives/portal";
import { Provider, useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { Suspense, useCallback, useEffect } from "react";
import { AppState, BackHandler, InteractionManager, Keyboard, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { PUZZLES } from "../src/shared/puzzles";
import { authToken, local, localChanged, syncStatusChanged } from "./src/api";
import { prefetchCaseDiagrams } from "./src/components/CaseDiagram";
import { GuidesSheet } from "./src/components/GuidesDialog";
import { NotationSheet } from "./src/components/Notation";
import { Fade } from "./src/components/layout";
import { LiveConnection } from "./src/components/LiveConnection";
import { PageStack } from "./src/components/PageStack";
import { SettingsSheet } from "./src/components/Settings";
import { SolveMenuProvider } from "./src/components/SolveMenus";
import { StartupGate } from "./src/components/StartupGate";
import { SyncIndicator } from "./src/components/SyncIndicator";
import { TabBar } from "./src/components/TabBar";
import { Introduction } from "./src/components/Introduction";
import { introductionAtom, isLockedPage, journeyAtom, puzzleLockedAtom, skipLearningAtom } from "./src/journey";
import { LearnGate } from "./src/components/LearnGate";
import { journeyProfile } from "../src/client/lib/journey";
import { ThemeProvider } from "./src/components/ThemeProvider";
import { Toast } from "./src/components/Toast";
import { ProfilePage } from "./src/pages/AccountPage";
import { AlgorithmsPage } from "./src/pages/AlgorithmsPage";
import { AuthScreen } from "./src/pages/AuthScreen";
import { DuelPage } from "./src/pages/DuelPage";
import { LearnPage } from "./src/pages/LearnPage";
import { PlaygroundPage } from "./src/pages/PlaygroundPage";
import { TrainingPage } from "./src/pages/TrainingPage";
import { useReleaseCheck } from "./src/release";
import { ScramblerHost } from "./src/scrambler";
import {
  casesAtom, goBackAtom, hasTokenAtom, keyboardVisibleAtom, learnMethodAtom, profileFiltersAtom, routeAtom, setsAtom, signedInAtom, statsAtom, statsVersionAtom,
  timerRunningAtom, userAtom, type Page, type Route,
} from "./src/state";

function renderPage(route: Route) {
  switch (route.page) {
    case "learn": return <LearnPage method={route.method} />;
    case "algorithms": return <AlgorithmsPage caseId={route.caseId} caseIds={route.caseIds} />;
    case "training": return <TrainingPage />;
    case "playground": return <PlaygroundPage />;
    case "duel": return <DuelPage />;
    case "profile": return <ProfilePage mode={route.mode} group={route.group} />;
  }
}

export function App() {
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <KeyboardProvider>
        <Provider>
          <ThemeProvider>
            <BottomSheetModalProvider>
              <StartupGate fontsReady><Session /></StartupGate>
            </BottomSheetModalProvider>
            <PortalHost />
          </ThemeProvider>
        </Provider>
      </KeyboardProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>;
}

/** The account on this device, kept in step with the local workspace; without a signed-in account, the sign-in screen. */
function Session() {
  const [user, setUser] = useAtom(userAtom);
  const setHasToken = useSetAtom(hasTokenAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const signedIn = useAtomValue(signedInAtom);
  useEffect(() => {
    const refresh = () => { setUser(local.current()); setHasToken(!!authToken.get()); bumpStats(v => v + 1); };
    refresh();
    void local.restore();
    const unsubscribe = localChanged.on(refresh);
    // An expired session (401) clears the token: back to the sign-in screen.
    const unsubscribeStatus = syncStatusChanged.on(status => { if (status.state === "signin") setHasToken(!!authToken.get()); });
    const reconnect = () => { void local.restore(); };
    const appState = AppState.addEventListener("change", state => { if (state === "active") reconnect(); });
    const retry = setInterval(reconnect, 30000);
    return () => { unsubscribe(); unsubscribeStatus(); appState.remove(); clearInterval(retry); };
  }, [setUser, setHasToken, bumpStats]);
  useReleaseCheck(true);
  if (!signedIn) return <AuthScreen key={user?.id ?? "none"} initialUsername={user && !user.isGuest ? user.username : ""} />;
  return <Shell />;
}

function Shell() {
  const introduction = useAtomValue(introductionAtom);
  const closeIntroduction = useSetAtom(introductionAtom);
  const insets = useSafeAreaInsets();
  const running = useAtomValue(timerRunningAtom);
  const [keyboardVisible, setKeyboardVisible] = useAtom(keyboardVisibleAtom);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, [setKeyboardVisible]);
  // Warm every page's data once the first screen is up: the catalogue of each puzzle and the current puzzle's cases,
  // sets and statistics, so switching tabs later never computes anything visible.
  const store = useStore();
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      for (const puzzle of PUZZLES) local.read.catalog(puzzle.id);
      store.get(casesAtom); store.get(setsAtom); store.get(statsAtom);
      local.read.achievements();
    });
    return () => task.cancel();
  }, [store]);
  // Then the diagrams of the current puzzle's cases, so the algorithm list and selector open without geometry work.
  const cases = useAtomValue(casesAtom);
  useEffect(() => {
    let cancel = () => {};
    const task = InteractionManager.runAfterInteractions(() => { cancel = prefetchCaseDiagrams(cases); });
    return () => { task.cancel(); cancel(); };
  }, [cases]);
  const [route, setRoute] = useAtom(routeAtom);
  const goBack = useSetAtom(goBackAtom);
  // The hardware back button walks the in-app history, like the browser's back button.
  useEffect(() => {
    // The first setup has to be finished; a setup opened again from the guides, or the tour, close.
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (introduction === "setup" && !journeyProfile(store.get(journeyAtom))) return true;
      if (introduction) { closeIntroduction(null); return true; }
      return running || goBack();
    });
    return () => subscription.remove();
  }, [goBack, running, introduction, closeIntroduction, store]);
  // The Learn tab comes back to the course it showed; a section waiting for the puzzle's course asks to skip it.
  const setSkip = useSetAtom(skipLearningAtom);
  const navigate = useCallback((page: Page) => {
    if (isLockedPage(store.get(puzzleLockedAtom), page)) setSkip(page);
    else setRoute(page === "learn" ? { page, method: store.get(learnMethodAtom) } : { page } as Route);
  }, [setRoute, setSkip, store]);
  const active = route.page;
  // The profile's filters last while its sections are browsed and reset once another tab is opened.
  const resetProfileFilters = useSetAtom(profileFiltersAtom);
  useEffect(() => { if (active !== "profile") resetProfileFilters(f => Object.keys(f).length ? {} : f); }, [active, resetProfileFilters]);
  // Sheets render where their provider is: this one sits inside the solve menu, so the times listed in a sheet keep
  // their long-press menu. (The solve menu's own sheets use the provider of the whole app.)
  return <SolveMenuProvider><BottomSheetModalProvider><View style={{ flex: 1 }}>
    <View style={{ flex: 1 }} pointerEvents={introduction ? "none" : "auto"} accessibilityElementsHidden={!!introduction} importantForAccessibility={introduction ? "no-hide-descendants" : "auto"}>
    <LiveConnection />
    <ScramblerHost />
    <KeyboardAvoidingView behavior="padding" className="flex-1">
      <View className="min-h-0 flex-1" style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
        {/* Nothing suspends; the boundary only guards against a future async atom. */}
        <Suspense fallback={<View className="flex-1" />}>
          <PageStack route={route} render={renderPage} />
        </Suspense>
      </View>
    </KeyboardAvoidingView>
    {!keyboardVisible && <Fade hidden={running}><TabBar active={active} onNavigate={navigate} /></Fade>}
    <SettingsSheet />
    <GuidesSheet />
    <NotationSheet />
    <LearnGate />
    <SyncIndicator hidden={running} />
    <Toast />
    </View><Introduction /></View></BottomSheetModalProvider></SolveMenuProvider>;
}
