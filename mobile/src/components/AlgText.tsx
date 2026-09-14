import { Linking, Text, View, type StyleProp, type TextStyle } from "react-native";
import type { AlgEntry } from "../../../src/shared/types";
import { FONT, useTheme } from "../theme";
import { Chip } from "./ui";

const SOURCE_LABEL: Record<string, string> = { speedcubedb: "SpeedCubeDB", jperm: "J Perm", f2ltrainer: "F2L Trainer" };
function sourceLabel(source: string) {
  if (SOURCE_LABEL[source]) return SOURCE_LABEL[source];
  if (source.startsWith("Cubix")) return "Cubix drill";
  const sites: Record<string, string> = { "jperm.net": "J Perm", "speedcubedb.com": "SpeedCubeDB", "jaapsch.net": "Jaap's Puzzle Page", "cubezone.be": "CubeZone", "cubeskills.com": "CubeSkills", "speedcube.com.au": "Speedcube", "sarah.cubing.net": "Sarah Strong", "youtube.com": "Cubing World" };
  return Object.entries(sites).find(([domain]) => source.includes(domain))?.[1] ?? source;
}

const NOTATION = /(\(-?\d+,\s*-?\d+\)|(?:UR|UL|DR|DL|ALL|[URDLFB])\d+[+-]|[RD](?:\+\+|--)|\d*[URFDLBMESxyzurfdlb]w?[23]?['’]?|\/)/g;
/** Keep Square-1 tuples together without splitting Android's text layout into adjacent spans. */
const notationText = (alg: string) => alg.replace(NOTATION, token => token.replace(/ /g, " "));

export function AlgText({ alg, size = 14, lineHeight, color, style, selectable, wordSpacing = 0 }: { alg: string; size?: number; lineHeight?: number; color?: string; style?: StyleProp<TextStyle>; selectable?: boolean; wordSpacing?: number }) {
  const t = useTheme();
  const text = wordSpacing ? alg.replace(/ /g, " ".repeat(1 + wordSpacing)) : alg;
  return <Text selectable={selectable} style={[{ fontFamily: FONT.mono, fontWeight: "500", fontSize: size, lineHeight: lineHeight ?? size * 1.6, color: color ?? t.text }, style]}>{notationText(text)}</Text>;
}

export function AlgorithmBadges({ algorithm: a, primary = false }: { algorithm: AlgEntry; primary?: boolean }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
    {primary && <Chip label="Primary" accent />}
    {a.recommended_by?.includes("jperm") && <Chip label="J Perm pick" />}
    {a.stm !== undefined && <Chip label={`${a.stm} STM`} />}
    <Chip label={sourceLabel(a.source)} />
    {a.youtube && <Chip label="Video" onPress={() => void Linking.openURL(a.youtube!)} />}
  </View>;
}
