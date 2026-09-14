import type React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

export interface IconProps { size?: number; color?: string; strokeWidth?: number }
const base = ({ size = 16, color = "currentColor", strokeWidth = 2 }: IconProps) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const IconGrid = (p: IconProps) => <Svg {...base(p)}><Rect x="3" y="3" width="7" height="7" rx="1.5" /><Rect x="14" y="3" width="7" height="7" rx="1.5" /><Rect x="3" y="14" width="7" height="7" rx="1.5" /><Rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>;
export const IconTimer = (p: IconProps) => <Svg {...base(p)}><Circle cx="12" cy="13" r="8" /><Path d="M12 9v4l2.5 2.5M9 2h6" /></Svg>;
export const IconBook = (p: IconProps) => <Svg {...base(p)}><Path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15M5 8h4M15 8h4M5 12h4M15 12h4" /></Svg>;
export const IconTraining = (p: IconProps) => <Svg {...base(p)}><Path d="m6.5 6.5 11 11M4 9l5-5M15 20l5-5M2 7l5-5M17 22l5-5" /></Svg>;
export const IconSettings = (p: IconProps) => <Svg {...base(p)}><Path d="M9.6 2h4.8l.6 3 2 .9 2.9-.9 2.4 4.2-2.3 2.1v2.4l2.3 2.1-2.4 4.2-2.9-.9-2 .9-.6 3H9.6L9 20l-2-.9-2.9.9-2.4-4.2L4 13.7v-2.4L1.7 9.2 4.1 5 7 5.9 9 5Z" /><Circle cx="12" cy="12.5" r="3.2" /></Svg>;
export const IconBack = (p: IconProps) => <Svg {...base(p)}><Path d="M15 18l-6-6 6-6" /></Svg>;
export const IconClose = (p: IconProps) => <Svg {...base({ strokeWidth: 2.5, ...p })}><Path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconCheck = (p: IconProps) => <Svg {...base({ strokeWidth: 3, ...p })}><Path d="M5 12l5 5L20 7" /></Svg>;
export const IconMinus = (p: IconProps) => <Svg {...base({ strokeWidth: 3, ...p })}><Path d="M6 12h12" /></Svg>;
export const IconShuffle = (p: IconProps) => <Svg {...base(p)}><Path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></Svg>;
export const IconCube = (p: IconProps) => <Svg {...base(p)}><Path d="M12 2l9 5v10l-9 5-9-5V7z" /><Path d="M12 12l9-5M12 12v10M12 12L3 7" /></Svg>;
export const IconUndo = (p: IconProps) => <Svg {...base(p)}><Path d="M9 14L4 9l5-5" /><Path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Svg>;
export const IconSkip = (p: IconProps) => <Svg {...base(p)}><Path d="M5 4l10 8-10 8zM19 5v14" /></Svg>;
export const IconEye = (p: IconProps) => <Svg {...base(p)}><Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><Circle cx="12" cy="12" r="3" /></Svg>;
export const IconUser = (p: IconProps) => <Svg {...base(p)}><Circle cx="12" cy="8" r="4" /><Path d="M4 21v-2a8 8 0 0 1 16 0v2" /></Svg>;
export const IconUsers = (p: IconProps) => <Svg {...base(p)}><Circle cx="9" cy="8" r="3.5" /><Path d="M2 21v-2a7 7 0 0 1 14 0v2M16 4a4 4 0 0 1 0 8M18 15a6 6 0 0 1 4 6" /></Svg>;
export const IconSearch = (p: IconProps) => <Svg {...base(p)}><Circle cx="10.5" cy="10.5" r="6.5" /><Path d="m16 16 5 5" /></Svg>;
export const IconMessage = (p: IconProps) => <Svg {...base(p)}><Path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z" /><Path d="M7 9h8M7 13h5" /></Svg>;
export const IconChevronDown = (p: IconProps) => <Svg {...base(p)}><Path d="m6 9 6 6 6-6" /></Svg>;
export const IconInfo = (p: IconProps) => <Svg width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 20 20" fill="none" stroke={p.color} strokeWidth={1.5}><Circle cx="10" cy="10" r="8" /><Path d="M10 9v5" /><Circle cx="10" cy="6" r=".7" fill={p.color} stroke="none" /></Svg>;
export type Icon = (p: IconProps) => React.JSX.Element;
