import { Text, type StyleProp, type TextStyle } from "react-native";
import { FONT, useTheme } from "../theme";

const SOURCE_LABEL: Record<string, string> = { speedcubedb: "SpeedCubeDB", jperm: "J Perm", f2ltrainer: "F2L Trainer" };
/** The display name of an algorithm source (`speedcubedb` → SpeedCubeDB, a URL → its site). */
export function sourceLabel(source: string) {
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
