/** What the method courses teach beyond a method's own steps (`methods.ts`): the cube from zero, and each method's ideas. */
import type { CubeMask } from "./cubeAppearance";

export interface LessonPage {
  title: string;
  text: string;
  /** A still cube: moves from solved, the pieces shown. */
  picture?: { setup?: string; mask?: CubeMask; held?: boolean };
  /** Turns played in 3D, from `algSetup` when given. */
  alg?: string;
  algSetup?: string;
  /** How the 3D cube is coloured. */
  mask?: CubeMask;
  /** Short points to keep. */
  points?: string[];
  /** A question, answered before going on. */
  quiz?: { question: string; options: string[]; answer: number; explain: string };
  /** Turns to make on the real cube: a connected one is watched, otherwise the player says so. */
  task?: string;
  /** The catalogue sets this step teaches, opened from the page. */
  sets?: string[];
  /** Ends on the player's own cube, connected or read (the assisted solve). */
  ownCube?: boolean;
}
export interface Lesson { id: string; title: string; pages: LessonPage[] }

/** Where every 3×3 course starts: pieces, notation, what an algorithm is. */
export const BASICS: Lesson[] = [
  {
    id: "pieces", title: "The pieces",
    pages: [
      { title: "Pieces, not stickers", text: "A cube is made of 26 pieces that move as blocks. A turn never moves one sticker on its own: solving means putting each piece in its place.", picture: {} },
      {
        title: "Centres", text: "A centre has one sticker and only spins on the spot. The six centres never change places, so each one names its face: the face around the white centre is the white face.",
        picture: { mask: "centres" },
        quiz: { question: "The centre on top is yellow. What colour is the face underneath?", options: ["White", "Green", "Red"], answer: 0, explain: "Opposite colours never change: white and yellow, green and blue, red and orange." },
      },
      { title: "Edges", text: "An edge sits between two centres and has two stickers. There is exactly one white and red edge in the cube, and it belongs between the white and red centres.", picture: { mask: "edges" } },
      {
        title: "Corners", text: "A corner sits where three faces meet and has three stickers. Its three colours give it exactly one place.",
        picture: { mask: "corners" },
        quiz: { question: "How many edges have a white sticker?", options: ["Four", "Eight", "Twelve"], answer: 0, explain: "Four edges and four corners surround the white centre." },
      },
    ],
  },
  {
    id: "solved", title: "What solved means",
    pages: [
      {
        title: "A face is not a layer", text: "One colour on a face is not enough: a piece is solved only when all its stickers match their centres. Here the first layer is really solved: white underneath, and every side lines up.",
        picture: { mask: "F1L" },
        quiz: { question: "A white corner is on the white face, but its red sticker is above the blue centre. Is it solved?", options: ["No: it is in the wrong place", "Yes: white is on white"], answer: 0, explain: "Each sticker of the piece has to match its own centre." },
      },
    ],
  },
  {
    id: "notation", title: "Reading the turns",
    pages: [
      { title: "A letter is a face", text: "R right, L left, U up, D down, F front, B back. Alone, a letter is a quarter turn clockwise, as you look straight at that face.", alg: "R" },
      { title: "The apostrophe", text: "R' is the same face turned the other way.", alg: "R'" },
      { title: "The 2", text: "R2 is a half turn. Either way round, it ends in the same place.", alg: "R2" },
      {
        title: "Check", text: "Every algorithm is written with these few signs.",
        alg: "U'",
        quiz: { question: "What does U' mean?", options: ["The top face, counter-clockwise", "The top face, clockwise", "The bottom face, counter-clockwise"], answer: 0, explain: "U is up, and the apostrophe reverses the turn." },
      },
      { title: "On your cube", text: "Hold it with yellow on top and green facing you, and keep it that way. Read each letter, then make the turn slowly.", task: "R U R' U'", alg: "R U R' U'" },
    ],
  },
  {
    id: "algorithms", title: "What an algorithm is",
    pages: [
      { title: "A fixed list of turns", text: "An algorithm takes pieces out of the way, moves the ones you care about, then puts the rest back. That is why what you have already solved survives it.", alg: "R U R' U'" },
      { title: "See for yourself", text: "Make R U R' U' six times from a solved cube. The pieces wander off, and all come back.", task: "R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'" },
      { title: "Reading a diagram", text: "Grey stickers do not matter at this step. Only the coloured ones tell you which case you have.", picture: { setup: "R U2 R' U' R U' R'", mask: "OLL" } },
      {
        title: "Two skills", text: "Knowing an algorithm is recognising its case at a glance, then letting the hands do the turns without thinking.",
        points: ["Learn it in gestures, not letter by letter.", "Say it once, then do it from memory.", "Come back to it after a day, then a week."],
      },
    ],
  },
];

/** What a method rests on, before its steps. */
export const CONCEPTS: Record<string, Lesson[]> = {
  beginner: [
    {
      id: "layers", title: "Layer by layer",
      pages: [{
        title: "Three layers", text: "You build the first layer on white, fill the middle, then finish the top. The further you go, the less you may disturb, so algorithms take over from intuition.",
        picture: { mask: "F1L" },
      }],
    },
  ],
  cfop: [
    {
      id: "pairs", title: "Why pairs",
      pages: [
        { title: "One slot, two pieces", text: "After the cross, each of the four slots needs a corner and an edge. CFOP joins them on top, then puts both in at once.", picture: { mask: "F2L" } },
        { title: "A pair goes in", text: "R opens the slot, U brings the pair over it, R' closes it. The cross comes back untouched: that is the whole idea of F2L.", alg: "R U R'", algSetup: "R U' R'", mask: "F2L" },
      ],
    },
    {
      id: "last-layer", title: "Orient, then permute",
      pages: [
        {
          title: "Two jobs", text: "OLL only makes the top one colour. PLL then moves the top pieces to their places without changing what OLL did.",
          picture: { setup: "R U2 R' U' R U' R'", mask: "OLL" },
          quiz: { question: "The top is all yellow. What is left?", options: ["Moving the top pieces to their places", "Making the top yellow"], answer: 0, explain: "OLL is done: only PLL remains." },
        },
        { title: "Two looks first", text: "Full OLL and PLL are 78 algorithms; two looks need only 16. Start with those, then replace them one case at a time.", points: ["10 algorithms for 2-look OLL.", "6 algorithms for 2-look PLL."] },
      ],
    },
  ],
  roux: [
    {
      id: "blocks", title: "Blocks, not layers",
      pages: [
        { title: "Two blocks", text: "Roux builds a 1×2×3 block on the left and another on the right. Between them, the middle slice stays free all the way.", picture: { mask: "blocks" } },
        { title: "Corners next", text: "With both blocks done, CMLL solves the four top corners, whatever the top edges are doing.", picture: { setup: "R U R' U R U2 R'", mask: "CMLL" } },
        { title: "The last six edges", text: "Only M and U turns remain, for six edges and the centres. This last part is solved by thinking rather than by long algorithms.", alg: "M' U M U2" },
      ],
    },
  ],
  zz: [
    {
      id: "edges", title: "Oriented edges",
      pages: [
        { title: "What flips an edge", text: "An edge is oriented when it can reach its place with R, L, U and D turns alone. Only F and B turns can flip one.", alg: "F" },
        {
          title: "Pay once", text: "ZZ starts by orienting all twelve edges and placing two bottom edges. After that no F or B turn is needed: the first two layers are solved with R, U and L, without rotating the cube.",
          points: ["Harder start, smoother solve.", "The last layer always has its edges oriented."],
        },
      ],
    },
  ],
};
