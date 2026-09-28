import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { Page } from "../state";
import { useLayout } from "../hooks/useLayout";
import { useTheme } from "../theme";
import { styles as practice } from "../pages/PlaygroundPage";
import { Bone } from "./Bone";
import { PracticeDock } from "./Practice";
import { TrainingSetupSkeleton } from "./TrainingSetup";

/**
 * Loading placeholders that copy the real screens: the same layout styles, the same sizes, with
 * pulsing blocks where text, controls and diagrams will render. Shown only while the app boots.
 */

function Kpis({ count, phone }: { count: number; phone: boolean }) {
  return <>{Array.from({ length: count }, (_, i) => <View key={i} style={{ alignItems: "center", flex: 1 }}>
    <Bone width={38} text={12} />
    <Bone width={phone ? 46 : 58} text={phone ? 18 : 22} />
  </View>)}</>;
}

function DockSkeleton() {
  return <PracticeDock hidden={false}>
    <View style={practice.dockLastSolve} />
    <View style={practice.dockRow}>{[0, 1, 2].map(i => <Bone key={i} width="30%" height={44} radius={10} />)}</View>
    <View style={practice.dockRow}><Bone width={104} height={44} radius={10} /><Bone width={86} height={44} radius={10} /></View>
  </PracticeDock>;
}

/** The timer page: page head with its controls, scramble block, the time, then the 4×2 figures. */
export function PlaygroundSkeleton() {
  const t = useTheme();
  const { phone, pagePadding, height, landscape } = useLayout();
  const line = { borderColor: t.line };
  const scrambleSize = phone ? 19 : 27;
  const preview = phone ? (height < 700 || landscape ? 0 : 76) : 112;
  return <View style={practice.page}>
    <View style={[{ gap: 8, paddingVertical: 10, paddingHorizontal: pagePadding, borderBottomWidth: 1 }, line]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 32 }}>
        <Bone width={64} text={20} strong /><Bone width={96} text={13} /><View style={{ flex: 1 }} /><Bone width={82} height={32} radius={8} />
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>{[86, 96, 76, 32, 32, 32].map((width, i) => <Bone key={i} width={width} height={32} radius={8} />)}</View>
    </View>
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: phone ? 14 : 22, paddingHorizontal: phone ? 16 : 32, borderBottomWidth: 1 }, line]}>
      <View style={{ flex: 1, gap: 8 }}>
        <Bone width={130} text={11} />
        <View><Bone width="94%" text={scrambleSize} /><Bone width="72%" text={scrambleSize} /></View>
      </View>
      {preview > 0 && <Bone width={preview} height={preview} radius={Math.round(preview * 0.14)} strong />}
    </View>
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Bone width={phone ? 190 : 300} height={phone ? 64 : 100} radius={12} /></View>
    <View style={[{ borderTopWidth: 1 }, line]}>
      {[0, 1].map(row => <View key={row} style={[{ flexDirection: "row" }, row > 0 && { borderTopWidth: 1 }, line]}>
        {[0, 1, 2, 3].map(cell => <View key={cell} style={[{ flex: 1, paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10 }, cell > 0 && { borderLeftWidth: 1 }, line]}><Bone width={44} text={10} /><Bone width={52} text={15} /></View>)}
      </View>)}
    </View>
  </View>;
}

/** The algorithm browser: stage tabs, learning filters and the case grid. */
export function AlgorithmsSkeleton() {
  const t = useTheme();
  const { navSpace } = useLayout();
  const line = { borderColor: t.line };
  return <View style={skeleton.page}>
    {/* PageHead: title, learned count and puzzle control, then Search and Methods. */}
    <View style={[{ gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1 }, line]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 32 }}>
        <Bone width={104} text={20} strong /><Bone width={96} text={13} /><View style={{ flex: 1 }} /><Bone width={82} height={32} radius={8} />
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}><Bone width={66} height={32} radius={8} /><Bone width={32} height={32} radius={8} /></View>
    </View>
    {/* Stage tabs, set variants and the learning filter. */}
    <View style={[{ gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1 }, line]}>
      <View style={{ flexDirection: "row", gap: 2 }}>{[46, 46, 46, 56].map((width, i) => <Bone key={i} width={width} height={30} radius={8} strong={i === 0} />)}</View>
      <Bone width={236} height={32} radius={9} />
      <Bone width={222} height={32} radius={9} />
    </View>
    <View style={{ paddingHorizontal: 8, paddingBottom: navSpace }}>
      {[4, 3].map((count, group) => <View key={group}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 38, paddingTop: 4, paddingHorizontal: 6 }}><Bone width={120} text={12.5} /><Bone width={52} height={20} radius={6} /></View>
        {Array.from({ length: count }, (_, i) => <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 50, paddingLeft: 8, paddingRight: 11 }}>
          <Bone width={36} height={36} radius={6} strong /><View style={{ flex: 1 }}><Bone width={28} text={13.5} /></View><Bone width={12} text={12.5} /><Bone width={16} height={16} radius={4} style={{ marginLeft: 11 }} />
        </View>)}
      </View>)}
    </View>
  </View>;
}

/**
 * The account overview (pages/AccountPage.tsx): the page head with avatar, name and filter controls, then
 * the activity, timer and training cards with the same paddings, radii and figure sizes.
 */
export function ProfileSkeleton() {
  const t = useTheme();
  const { pagePadding, short, navSpace, height } = useLayout();
  const card = { backgroundColor: t.raised, borderColor: t.line, borderWidth: 1, borderRadius: 12, paddingVertical: short ? 14 : 18, paddingHorizontal: short ? 16 : 20, gap: short ? 12 : 16 };
  const cell = height <= 640 ? 10 : height < 800 ? 12 : 17;
  return <View style={skeleton.page}>
    <View style={{ gap: 8, paddingVertical: 10, paddingHorizontal: pagePadding, borderBottomWidth: 1, borderColor: t.line }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 32 }}>
        <Bone width={36} height={36} radius={18} />
        <Bone width={84} text={20} />
        <Bone width={150} text={13} />
      </View>
      <View style={{ flexDirection: "row", gap: 6, overflow: "hidden" }}>
        <Bone width={66} height={32} radius={8} /><Bone width={122} height={32} radius={8} strong /><Bone width={86} height={32} radius={8} /><Bone width={100} height={32} radius={8} />
      </View>
    </View>
    <View style={{ flex: 1, minHeight: 0, overflow: "hidden", paddingTop: 12, paddingHorizontal: pagePadding, paddingBottom: navSpace, gap: short ? 12 : 16 }}>
      <View style={[card, { gap: 10 }]}>
        <Bone width="62%" text={13} />
        <Bone width="86%" text={13} />
        <Bone width="100%" height={14 + 3 + 7 * (Math.min(cell, 12) + 3)} radius={6} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Bone width={110} text={12} /><Bone width={120} text={12} /></View>
      </View>
      <View style={card}>
        <View style={{ flexDirection: "row", gap: 10 }}><Bone width={40} text={13} /><Bone width={150} text={12} /></View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", columnGap: 36, rowGap: 14 }}>
          <View style={{ gap: 6 }}><Bone width={80} text={11} /><Bone width={126} height={short ? 34 : 44} radius={8} /></View>
          <View style={{ gap: 6 }}><Bone width={64} text={11} /><Bone width={90} height={26} radius={6} /></View>
          <View style={{ gap: 6 }}><Bone width={70} text={11} /><Bone width={90} height={26} radius={6} /></View>
        </View>
        <Bone width="100%" height={short ? 80 : 100} radius={8} />
      </View>
      <View style={card}>
        <Bone width={60} text={13} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}><Bone width={58} height={58} radius={29} /><View style={{ flex: 1, gap: 6 }}><Bone width="60%" height={26} radius={6} /><Bone width="45%" text={12} /></View></View>
      </View>
    </View>
  </View>;
}

/** The skeleton of a navigation entry, used while the app boots into it. */
export function PageSkeleton({ page }: { page: Page }): ReactNode {
  if (page === "algorithms") return <AlgorithmsSkeleton />;
  if (page === "training") return <TrainingSetupSkeleton />;
  if (page === "profile") return <ProfileSkeleton />;
  return <PlaygroundSkeleton />;
}

const skeleton = StyleSheet.create({
  page: { flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center", minHeight: 0 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
});
