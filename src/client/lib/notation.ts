/**
 * The move notation guide, shared by the web app and Android: for the cubes, every kind of move as a tile the 3D
 * player turns on a solved cube (seen from a side where the turning layer shows); for the other puzzles, a short
 * explanation of their own notation.
 */
import { CUBE_PITCH, CUBE_YAW } from "../../shared/cubeScene";
import { puzzleInfo, type PuzzleId } from "../../shared/puzzles";

/** One face, slice or axis: its name, what it turns, and its three moves (clockwise, counter-clockwise, half turn). */
export interface NotationBlock {
  move: string;
  name: string;
  text: string;
  variants: string[];
}
export interface NotationGroup {
  title: string;
  /** What the group's moves have in common, in one or two sentences. */
  lead: string;
  blocks: NotationBlock[];
}
export interface NotationSection { title: string; text: string; examples?: string[] }

const block = (move: string, name: string, text: string): NotationBlock => {
  return { move, name, text, variants: [move, move + "'", move + "2"] };
};

/** The cube's notation on a cube of `size`: the moves that exist there, wide and inner layers for the big cubes. */
export function cubeNotation(size: number): NotationGroup[] {
  const groups: NotationGroup[] = [
    {
      title: "Faces",
      lead: "A letter turns that face a quarter turn clockwise, as you see it when you look straight at the face. A prime (') turns it counter-clockwise, a 2 half a turn.",
      blocks: [
        block("U", "Up", "the top face"),
        block("D", "Down", "the bottom face"),
        block("F", "Front", "the face towards you"),
        block("B", "Back", "the face away from you"),
        block("R", "Right", "the right face"),
        block("L", "Left", "the left face"),
      ],
    },
  ];
  if (size >= 3)
    groups.push(
      {
        title: "Wide moves",
        lead:
          size >= 4
            ? "A lowercase letter or a w turns the face with the layer behind it; a number in front sets how many layers turn, or, without the w, turns that inner layer alone."
            : "A lowercase letter or a w turns the face with the middle layer behind it.",
        blocks: [
          block("r", "r", "the right face and the next layer in"),
          block("Rw", "Rw", "the same as r, as the WCA writes it"),
          block("l", "l", "the left face and the next layer in"),
          block("u", "u", "the top face and the next layer down"),
          block("f", "f", "the front face and the next layer in"),
          block("d", "d", "the bottom face and the next layer up"),
          block("b", "b", "the back face and the next layer in"),
          ...(size >= 4 ? [block("3Rw", "3Rw", "the three right layers together"), block("2R", "2R", "only the second layer from the right")] : []),
        ],
      },
      {
        title: "Slices",
        lead: "The middle layers. Each turns the way of a face: M like L, E like D, S like F.",
        blocks: [
          block("M", "Middle", "between L and R, turns like L"),
          block("E", "Equator", "between U and D, turns like D"),
          block("S", "Standing", "between F and B, turns like F"),
        ],
      },
    );
  groups.push({
    title: "Rotations",
    lead: "The whole cube turns in your hands; nothing is scrambled. x turns like R, y like U, z like F.",
    blocks: [
      block("x", "x", "the whole cube, turning like R"),
      block("y", "y", "the whole cube, turning like U"),
      block("z", "z", "the whole cube, turning like F"),
    ],
  });
  return groups;
}

/** What a move does, in one line: "R': Right, the right face, counter-clockwise". */
export function describeMove(move: string, size: number): string {
  for (const b of cubeNotation(size).flatMap((g) => g.blocks)) {
    const i = b.variants.indexOf(move);
    const turn = ["clockwise", "counter-clockwise", "half turn"][i];
    if (i >= 0) return b.name === b.move ? `${b.text[0]!.toUpperCase()}${b.text.slice(1)}, ${turn}` : `${b.name}: ${b.text}, ${turn}`;
  }
  return CUBE_READING.find((r) => r.examples?.includes(move))?.title ?? "";
}

/** Reading an algorithm on any cube. */
export const CUBE_READING: NotationSection[] = [
  { title: "Brackets", text: "Parentheses only group moves that flow together as one finger trick; play them as written. A number after a group repeats it, a prime undoes it backwards.", examples: ["(R U R' U')", "(R U R' U')2"] },
  { title: "AUF", text: "Adjust U Face: a U, U' or U2 at the start or the end turns the top so the case or the solved cube lines up. It is often written in brackets.", examples: ["(U) R U R' U'"] },
  { title: "Commutators", text: "[A, B] is A, B, then A and B undone: A B A' B'. [A: B] is A, B, then A undone: A B A'.", examples: ["[R, U]", "[F: R U R' U']"] },
  { title: "How to hold the cube", text: "Unless a step says otherwise, hold the solved side down (white on the bottom) and read every move from where you stand: R is always the face on your right, whatever its colour." },
];

/** The notation of the other puzzles, said in a few lines each. */
export const PUZZLE_NOTATION: Partial<Record<PuzzleId, NotationSection[]>> = {
  pyram: [
    { title: "Faces", text: "Hold a face towards you with one corner on top. U, L, R and B turn the two layers around the top, left, right and back corners a third of a turn clockwise, looking at that corner; a prime turns it back.", examples: ["R U' R' U"] },
    { title: "Tips", text: "Lowercase u, l, r and b turn only the small tip at that corner. Scrambles end with them; solve the tips last, they never disturb the rest." },
  ],
  skewb: [
    { title: "Corner turns", text: "R, L, U and B each turn half the puzzle around one of four fixed corners, a third of a turn clockwise as seen looking at that corner; a prime turns it back. Keep the puzzle in the same hold for the whole scramble.", examples: ["R L' R' L"] },
    { title: "Sledges", text: "Most beginner algorithms repeat a short sledge such as R' L R L'; count the repeats rather than memorising long strings." },
  ],
  minx: [
    { title: "Scrambles", text: "R++ and R-- turn everything but the left part two fifths of a turn (D++ and D-- the same for everything but the top); U and U' turn the top face a fifth of a turn. Each scramble line ends with a U.", examples: ["R++ D-- R-- D++ U'"] },
    { title: "Solving moves", text: "Algorithms use the 3×3 letters for the faces you see: R, U, F, L… turn a fifth of a turn, R2 two fifths. Most last-layer algorithms are 3×3 ones moved over." },
  ],
  sq1: [
    { title: "Layers", text: "(x, y) turns the top layer by x and the bottom layer by y, in twelfths of a turn (one small wedge); positive is clockwise, negative counter-clockwise.", examples: ["(1, 0)", "(-3, 3)"] },
    { title: "Slash", text: "/ turns the right half of the puzzle a half turn. It only works when both layers line up along the slice.", examples: ["(1, 0) / (-1, 0) /"] },
  ],
  clock: [
    { title: "Pins and dials", text: "UR, DR, DL and UL put the pin of that corner up; U, R, D, L two pins on a side; ALL every pin. The number then turns those dials by that many hours, + clockwise, - counter-clockwise.", examples: ["UR3+", "ALL2-"] },
    { title: "Turning over", text: "y2 turns the clock over to work on its back; the moves after it are read on that side.", examples: ["y2"] },
  ],
};

/** Whether the puzzle's notation is cube notation, shown on the 3D cube. */
export const isCubeNotation = (puzzle: PuzzleId) => !!puzzleInfo(puzzle).cubeSize;

/**
 * The view showing a move best: the default front-right-top corner, turned so the layer that moves faces you
 * (left for L, the bottom for D, the back for B).
 */
export function notationView(move: string): { yaw: number; pitch: number } {
  const letter = /[UDFBRLudfbrlMESxyz]/.exec(move)?.[0]?.toUpperCase() ?? "U";
  if (letter === "L") return { yaw: -CUBE_YAW, pitch: CUBE_PITCH };
  if (letter === "D") return { yaw: CUBE_YAW, pitch: -CUBE_PITCH };
  if (letter === "B") return { yaw: Math.PI - CUBE_YAW, pitch: CUBE_PITCH };
  return { yaw: CUBE_YAW, pitch: CUBE_PITCH };
}
