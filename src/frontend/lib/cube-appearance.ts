import {colorOf,originInULayer,slotInULayer,cubeSize,type CubeState,type Face,type Move} from "../../shared/cube";
/** Yellow on top, green in front (orange right, red left) — the usual CFOP colour scheme. */
export const FACE_COLORS: Record<Face, string> = {
  U: "rgb(255, 230, 42)",
  D: "rgb(236, 232, 226)",
  F: "rgb(26, 190, 87)",
  B: "rgb(61, 124, 224)",
  R: "rgb(255, 128, 31)",
  L: "rgb(235, 66, 66)",
};
const GREY = "rgb(58, 58, 66)";
const DIM = "rgb(36, 36, 42)";

export type CubeMask = "full" | "OLL" | "PLL" | "F2L";

export interface LayerAnimation {
  move: Move;
  /** degrees, right-handed about the positive axis (math convention) */
  angle: number;
}

export const DEFAULT_ROTATION = { x: -30, y: -40 };

export function stickerColor(state: CubeState, slot: number, mask: CubeMask): string {
  const face = colorOf(state, slot);
  switch (mask) {
    case "OLL":
      if (face === "U") return FACE_COLORS.U;
      return slotInULayer(slot, cubeSize(state)) ? GREY : DIM;
    case "PLL":
      return slotInULayer(slot, cubeSize(state)) ? FACE_COLORS[face] : DIM;
    case "F2L":
      return originInULayer(state, slot) ? GREY : FACE_COLORS[face];
    default:
      return FACE_COLORS[face];
  }
}

