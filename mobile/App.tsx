import { useLanguage } from "./src/i18n";
import "./global.css";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PortalHost } from "@rn-primitives/portal";
import { Provider, getDefaultStore, useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { Suspense, useEffect } from "react";
import { AppState, BackHandler, Keyboard, Linking, View } from "react-native";
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
import { SessionSheet } from "./src/components/PuzzlePicker";
import { SolveMenuProvider } from "./src/components/SolveMenus";
import { StartupGate } from "./src/components/StartupGate";
import { SyncIndicator } from "./src/components/SyncIndicator";
import { TabBar } from "./src/components/TabBar";
import { attachSocial, coaching, community, openUrl, useSocial } from "./src/lib/social";
import { Introduction } from "./src/components/Introduction";
import { introductionAtom, journeyAtom } from "./src/journey";
import { journeyProfile } from "../src/client/lib/journey";
import { ThemeProvider } from "./src/components/ThemeProvider";
import { Toast } from "./src/components/Toast";
import { ProfilePage } from "./src/pages/AccountPage";
import { profileAchievementsAtom, profileDataAtom } from "./src/profile";
import { AlgorithmsPage } from "./src/pages/AlgorithmsPage";
import { AssistedPage } from "./src/pages/AssistedPage";
import { AuthScreen } from "./src/pages/AuthScreen";
import { DuelPage } from "./src/pages/DuelPage";
import { LearnPage } from "./src/pages/LearnPage";
import { PlaygroundPage } from "./src/pages/PlaygroundPage";
import { TrainingPage } from "./src/pages/TrainingPage";
import { useReleaseCheck } from "./src/release";
import { ScramblerHost } from "./src/scrambler";
import {
  TAB_ROOT, casesAtom, goBackAtom, replaceRouteAtom, hasTokenAtom, keyboardVisibleAtom, openTabAtom, profileFiltersAtom, routeAtom, setsAtom, signedInAtom, statsAtom, statsVersionAtom,
  tabOf, timerRunningAtom, userAtom, type Route, type Tab,
} from "./src/state";

/**
 * Runs `tasks` one at a time once the first frames are drawn, each in its own slice of the JS thread, so warming caches
 * never holds a tap back; returns its cancellation.
 */
function afterFirstFrames(...tasks: (() => void)[]) {
  let timer = setTimeout(next, 400), index = 0;
  function next() {
    tasks[index++]?.();
    if (index < tasks.length) timer = setTimeout(next, 30);
  }
  return () => clearTimeout(timer);
}

function renderPage(route: Route) {
  switch (route.page) {
    case "learn": return <LearnPage method={route.method} />;
    case "algorithms": return <AlgorithmsPage caseId={route.caseId} caseIds={route.caseIds} />;
    case "training": return <TrainingPage />;
    case "playground": return <PlaygroundPage />;
    case "duel": return <DuelPage />;
    case "profile": return <ProfilePage mode={route.mode} group={route.group} />;
    case "assisted": return <AssistedPage />;
    // The social pages load on first use: none of them is on the way to the timer.
    case "community": { const { CommunityPage } = require("./src/pages/CommunityPage") as typeof import("./src/pages/CommunityPage"); return <CommunityPage view={route.view} />; }
    case "tournaments": { const { TournamentsPage } = require("./src/pages/TournamentsPage") as typeof import("./src/pages/TournamentsPage"); return <TournamentsPage view={route.view} />; }
    case "match": { const { MatchPage } = require("./src/pages/MatchPage") as typeof import("./src/pages/MatchPage"); return <MatchPage id={route.id} />; }
    case "coaching": { const { CoachingPage } = require("./src/pages/CoachingPage") as typeof import("./src/pages/CoachingPage"); return <CoachingPage view={route.view} />; }
  }
}

export function App() {
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <KeyboardProvider>
        {/* The default store, so the social clients (src/lib/social.ts) reach the route and the toast from outside React. */}
        <Provider store={getDefaultStore()}>
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

/**
 * The account on this device, kept in step with the local workspace; without a signed-in account, the sign-in screen.
 * A change of language draws everything again.
 */
function Session() {
  useLanguage();
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
  // The community and the coaching follow the account signed in, and leave with it.
  const account = signedIn ? user : null;
  useEffect(() => attachSocial(account), [account?.id, account?.isGuest]);
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
  useEffect(() => afterFirstFrames(
    () => { store.get(casesAtom); store.get(setsAtom); },
    () => store.get(statsAtom),
    ...PUZZLES.map(puzzle => () => { local.read.catalog(puzzle.id); }),
    () => { store.get(profileDataAtom); },
    () => { store.get(profileAchievementsAtom); },
  ), [store]);
  // Then the diagrams of the current puzzle's cases, so the algorithm list and selector open without geometry work.
  const cases = useAtomValue(casesAtom);
  useEffect(() => {
    let cancel = () => {};
    const stop = afterFirstFrames(() => { cancel = prefetchCaseDiagrams(cases); });
    return () => { stop(); cancel(); };
  }, [cases]);
  const route = useAtomValue(routeAtom);
  // The pages are built again in a new language: their lists and remembered labels follow it.
  const language = useLanguage();
  const goBack = useSetAtom(goBackAtom), replaceRoute = useSetAtom(replaceRouteAtom);
  // The hardware back button walks the in-app history, like the browser's back button.
  useEffect(() => {
    // The first setup has to be finished; a setup opened again from the guides, or the tour, close.
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (introduction === "setup" && !journeyProfile(store.get(journeyAtom))) return true;
      if (introduction) { closeIntroduction(null); return true; }
      if (running || goBack()) return true;
      // With nothing left to go back to, another tab returns to the timer before the app closes (Android's start
      // destination).
      if (tabOf(store.get(routeAtom).page) === "timer") return false;
      replaceRoute(TAB_ROOT.timer);
      return true;
    });
    return () => subscription.remove();
  }, [goBack, running, introduction, closeIntroduction, store, replaceRoute]);
  useLinks();
  // A tab opens on the page it showed last; every tab opens on every puzzle (as on the web).
  const openTab = useSetAtom(openTabAtom);
  const active = route.page;
  // New solves or a sync make the profile stale: compute it again in the background, so opening it later costs
  // nothing. Never on the timer pages, where a busy JS thread would delay the next start and skew its time.
  const statsVersion = useAtomValue(statsVersionAtom);
  const timing = running || active === "playground" || active === "training" || active === "duel";
  useEffect(() => {
    if (timing) return;
    return afterFirstFrames(() => { store.get(profileDataAtom); }, () => { store.get(profileAchievementsAtom); });
  }, [store, statsVersion, timing]);
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
          <PageStack key={language} route={route} render={renderPage} />
        </Suspense>
      </View>
    </KeyboardAvoidingView>
    {!keyboardVisible && active !== "assisted" && <Fade hidden={running}><Tabs active={active} onNavigate={openTab} /></Fade>}
    <FloatingCall />
    <SettingsSheet />
    <SessionSheet />
    <GuidesSheet />
    <NotationSheet />
    <SyncIndicator hidden={running} />
    <Toast />
    </View><Introduction /></View></BottomSheetModalProvider></SolveMenuProvider>;
}

/** The call under way, floating over the app away from its page; its module (and WebRTC) loads with the first call. */
function FloatingCall() {
  const inCall = useSocial(() => coaching.inCall);
  if (!inCall) return null;
  const { FloatingCall: Floating } = require("./src/components/coaching/call/Floating") as typeof import("./src/components/coaching/call/Floating");
  return <Floating />;
}

/** The tab bar, with a dot where something waits: unread coaching messages; unread messages, friend requests and group
 * invitations on the account, which holds the community (as on the web). */
function Tabs({ active, onNavigate }: { active: Route["page"]; onNavigate: (tab: Tab) => void }) {
  const coach = useSocial(() => coaching.me?.unread ?? 0);
  const account = useSocial(() => (community.me ? community.me.unread + community.me.incoming.length + community.me.invitations.length : 0));
  return <TabBar active={tabOf(active)} waiting={{ coaching: coach, profile: account }} onNavigate={onNavigate} />;
}

/** Whether the link the app was opened with was followed, so signing in again does not follow it twice. */
let initialLinkFollowed = false;
/**
 * Web links of the app (https://cubix.vitrixxl.fr/community/…, a notification's /match/9) and cubix:// ones open their
 * page; an address the app has no page for is left alone.
 */
function useLinks() {
  useEffect(() => {
    const follow = (url: string | null) => { if (url) openUrl(url.replace(/^cubix:\/\//, "/")); };
    if (!initialLinkFollowed) { initialLinkFollowed = true; void Linking.getInitialURL().then(follow, () => {}); }
    const subscription = Linking.addEventListener("url", ({ url }) => follow(url));
    return () => subscription.remove();
  }, []);
}
