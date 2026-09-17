import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { Page } from "../state";
import { useLayout } from "../hooks/useLayout";
import { styles as practice } from "../pages/PlaygroundPage";
import { Bone } from "./Bone";

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

/** The timer page: scramble, timer and statistics grouped in the middle, actions at the bottom. */
export function PlaygroundSkeleton() {
  const layout = useLayout();
  const scrambleSize = layout.phone ? 21 : layout.short ? 19 : Math.max(22, Math.min(30, layout.width * 0.022));
  const timerSize = layout.short ? Math.max(48, Math.min(layout.height * 0.09, 72)) : layout.phone ? Math.max(56, Math.min(layout.width * 0.15, 84)) : Math.max(60, Math.min(layout.width * 0.07, 108));
  const grouped = layout.phone && !layout.landscape;
  return <View style={practice.page}><View style={practice.workspace}>
    <View style={practice.center}>
      <View style={[practice.toolbar, { paddingHorizontal: layout.pagePadding, paddingTop: layout.phone ? 8 : 12 }]}>
        <View style={[practice.toolbarGroup, { flex: 1, justifyContent: "flex-end" }]}>{!layout.wide && <Bone width={74} height={30} radius={8} />}</View>
      </View>
      <View style={[practice.stack, layout.landscape && practice.stackLandscape, { paddingHorizontal: layout.pagePadding, paddingBottom: layout.short ? layout.navSpace + 72 : 44 }]}>
        <View style={[practice.scramble, layout.landscape && practice.landscapeLeft, grouped && practice.grouped]}>
          <Bone width={150} text={11} style={{ marginBottom: 8 }} />
          <View style={{ width: "100%", alignItems: "center", paddingHorizontal: layout.phone ? 12 : 0 }}>
            <Bone width="92%" text={scrambleSize} />
            <Bone width="80%" text={scrambleSize} />
          </View>
        </View>
        <View style={[practice.timerSlot, { paddingVertical: 20 }]}><Bone width={Math.round(timerSize * 2.6)} height={Math.round(timerSize * 1.1)} radius={12} /></View>
        <View style={[practice.stats, (layout.landscape || grouped) && { flex: 0 }, { gap: layout.phone ? 14 : Math.max(16, Math.min(layout.width * 0.035, 40)) }]}><Kpis count={5} phone={layout.phone} /></View>
      </View>
      <View style={[practice.bottomActions, { bottom: layout.navSpace + 20, paddingHorizontal: layout.pagePadding }]}>
        <View style={practice.bottomActionRow}><Bone width={118} height={34} radius={10} /><Bone width={96} height={34} radius={10} /><Bone width={124} height={30} radius={8} /></View>
      </View>
    </View>
  </View></View>;
}

/** The training page: case heading, diagram, setup, timer and statistics. */
export function TrainingSkeleton() {
  const layout = useLayout();
  const grouped = layout.phone && !layout.landscape;
  const cubeSize = layout.landscape ? 72 : layout.short ? 96 : layout.phone ? 112 : 150;
  const setupSize = layout.short ? 16 : layout.phone ? 17 : Math.max(19, Math.min(25, layout.width * 0.018));
  const timerSize = layout.short ? Math.max(48, Math.min(layout.height * 0.09, 72)) : layout.phone ? Math.max(56, Math.min(layout.width * 0.15, 84)) : Math.max(60, Math.min(layout.width * 0.07, 108));
  return <View style={practice.page}><View style={practice.workspace}>
    <View style={practice.center}>
      <View style={[practice.toolbar, { paddingHorizontal: layout.pagePadding, paddingTop: layout.phone ? 8 : 12 }]}>
        <View style={[practice.toolbarGroup, { flex: 1 }]}><Bone width={84} height={30} radius={8} /></View>
        <View style={[practice.toolbarGroup, { justifyContent: "center" }]}><Bone width={104} height={30} radius={8} /></View>
        <View style={[practice.toolbarGroup, { flex: 1, justifyContent: "flex-end" }]}><Bone width={74} height={30} radius={8} /></View>
      </View>
      <View style={[practice.stack, layout.landscape && practice.stackLandscape, grouped && { paddingTop: 52, paddingBottom: 88 }, { paddingHorizontal: layout.pagePadding }]}>
        <View style={[{ width: "100%", alignItems: "center", justifyContent: "flex-end" }, layout.landscape ? practice.landscapeLeft : grouped ? practice.grouped : { flex: 1 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", columnGap: 10 }}>
            <Bone width={32} height={32} radius={9} style={{ marginRight: 6 }} />
            <View style={{ alignItems: "center", gap: 2 }}><Bone width={72} text={layout.phone ? 18 : 22} /><Bone width={110} text={13} /></View>
            <Bone width={32} height={32} radius={9} style={{ marginLeft: 6 }} />
          </View>
          <View style={{ alignItems: "center", gap: 10, marginTop: 12, width: "100%" }}>
            <Bone width={cubeSize} height={cubeSize} radius={Math.round(cubeSize * 0.12)} strong />
            <View style={{ width: "100%", maxWidth: 620, alignItems: "center" }}>
              <Bone width={44} text={11} style={{ marginBottom: 8 }} />
              <Bone width="70%" text={setupSize} />
            </View>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 4, marginTop: 4 }}><Bone width={122} height={36} radius={10} /><Bone width={112} height={36} radius={10} /></View>
        </View>
        <View style={[practice.timerSlot, { paddingVertical: 20 }]}><Bone width={Math.round(timerSize * 2.6)} height={Math.round(timerSize * 1.1)} radius={12} /></View>
        <View style={[practice.stats, (layout.landscape || layout.short || grouped) && { flex: 0 }, { gap: layout.phone ? 14 : 40 }]}><Kpis count={3} phone={layout.phone} /></View>
      </View>
    </View>
  </View></View>;
}

/** The algorithm browser: stage tabs, learning filters and the case grid. */
export function AlgorithmsSkeleton() {
  const { pagePadding, phone, width } = useLayout();
  const inner = Math.min(width, 1100) - 2 * (phone ? 14 : 24) - 4;
  const columns = Math.max(2, Math.floor(inner / (phone ? 104 : 128)));
  const cardWidth = Math.floor((inner - 4 * (columns - 1)) / columns);
  const diagram = phone ? 80 : 96;
  return <View style={[skeleton.page, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18, gap: 12 }]}>
    <View style={skeleton.toolbar}>
      <View style={{ flexDirection: "row", gap: 4 }}><Bone width={58} height={36} radius={10} strong /><Bone width={58} height={36} radius={10} /><Bone width={58} height={36} radius={10} /></View>
      <View style={{ flexDirection: "row", gap: 4 }}><Bone width={96} height={34} radius={12} strong /><Bone width={116} height={34} radius={12} strong /></View>
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 6 }}><Bone width={64} text={20} /><Bone width={150} height={32} radius={10} /></View>
    {[0, 1].map(group => <View key={group}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 4, minHeight: 38 }}><Bone width={14} height={14} radius={4} /><Bone width={140} text={15} /><View style={{ flex: 1 }} /><Bone width={78} height={30} radius={8} /></View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {Array.from({ length: columns }, (_, i) => <View key={i} style={{ width: cardWidth, alignItems: "center", gap: 2, paddingHorizontal: 4, paddingTop: phone ? 10 : 14, paddingBottom: phone ? 8 : 10 }}>
          <Bone width={diagram} height={diagram} radius={Math.round(diagram * 0.12)} strong style={{ marginBottom: 6 }} />
          <Bone width={44} text={15} /><Bone width={66} text={12} /><Bone width={30} height={30} radius={8} style={{ marginTop: 4 }} />
        </View>)}
      </View>
    </View>)}
  </View>;
}

/** The profile overview: account header, selectors and the four statistic tiles. */
export function ProfileSkeleton() {
  const { pagePadding, phone, width } = useLayout();
  const columns = width >= 900 ? 4 : 2;
  const tileWidth = Math.floor((Math.min(width, 1100) - pagePadding * 2 - 10 * (columns - 1)) / columns);
  return <View style={[skeleton.page, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18, gap: 18 }]}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Bone width={60} height={60} radius={30} />
      <View style={{ flex: 1 }}><Bone width={130} text={24} /><Bone width={170} text={14} /></View>
      <Bone width={82} height={34} radius={12} />
    </View>
    <View style={skeleton.toolbar}><Bone width={180} height={40} radius={12} strong /><Bone width={150} height={40} radius={12} strong /></View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {Array.from({ length: 4 }, (_, i) => <View key={i} style={{ width: tileWidth, minHeight: 124, borderRadius: 18, padding: 16, gap: 6 }}>
        <Bone width="100%" height={124} radius={18} style={StyleSheet.absoluteFill} />
        <Bone width={70} text={13} strong /><Bone width={110} text={34} strong /><Bone width={130} text={12} strong />
      </View>)}
    </View>
  </View>;
}

/** The skeleton of a navigation entry, used while the app boots into it. */
export function PageSkeleton({ page }: { page: Page }): ReactNode {
  if (page === "algorithms") return <AlgorithmsSkeleton />;
  if (page === "training") return <TrainingSkeleton />;
  if (page === "profile") return <ProfileSkeleton />;
  return <PlaygroundSkeleton />;
}

const skeleton = StyleSheet.create({
  page: { flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center", minHeight: 0 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
});
