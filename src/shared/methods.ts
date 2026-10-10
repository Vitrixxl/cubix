import type { CubeMask } from "./cubeAppearance";
import type { PuzzleId } from "./puzzles";

/** How far into the puzzle a method takes you: the first way to solve it, a speed method, or its top-level method. */
export type MethodLevel = "beginner" | "intermediate" | "advanced";

/** An algorithm a step teaches that the case catalogue does not hold (a beginner sequence, a two-look set…). */
export interface MethodAlgorithm {
  name: string;
  alg: string;
  /** Other common ways to execute it. */
  alternatives?: string[];
  /** How to hold the puzzle for it, or when to use it. */
  note?: string;
  /** A short fact beside its name (how many times to repeat it…). */
  detail?: string;
  /**
   * The case it is shown on, as moves from a solved puzzle, when the algorithm does not solve it outright (a step
   * done in several passes). By default the algorithm undone.
   */
  setup?: string;
}

export interface MethodStep {
  title: string;
  text: string;
  /** Catalogue sets of the puzzle holding the cases of this step, in the order they are learnt. */
  sets?: string[];
  /** The step's algorithms that are not in the catalogue. */
  algs?: MethodAlgorithm[];
  /** How the diagrams of `algs` are drawn: the whole cube, or only the pieces of a stage. */
  mask?: CubeMask;
  /** Short advice for the step, intuitive ones above all. */
  tips?: string[];
  /** The step's algorithms Cubix does not have yet, said in one sentence. */
  missing?: string;
  /** The training mode that practises an intuitive step (Training → Cross). */
  train?: "cross";
}

/** A short, English walkthrough of one way to solve a puzzle: the solving methods guide and the Learn section. */
export interface SolvingMethod {
  id: string;
  name: string;
  level: MethodLevel;
  summary: string;
  steps: MethodStep[];
}

const CORNER_INSERTION: MethodAlgorithm = {
  name: "Corner insertion",
  alg: "R U R' U'",
  note: "Hold the corner above its slot, at front right, or in its slot when it is twisted there. Repeat until it is solved, five times at most.",
};
/** Repeating the Sune orients any last layer whose edges are done; checked on every case by tests/methods.test.ts. */
const SUNE_REPEATED: MethodAlgorithm = {
  name: "Sune",
  alg: "R U R' U R U2 R'",
  note: "One yellow corner on top: hold it at front left. None: hold the front-left corner with yellow on its left side. Two: hold it with yellow facing front. Repeat until the face is done.",
};

/**
 * The seven ways the top corners can need turning, each solved with the Sune alone as the beginner step says: the
 * case set up already held for its first Sune, then every Sune with the turn of the top that holds the cube for the
 * next. Checked by tests/methods.test.ts.
 */
const SUNE = "R U R' U R U2 R'";
const HOLD_NONE = "No yellow corner up: turn the top until the front-left corner shows its yellow on the left.",
  HOLD_ONE = "One yellow corner up: hold it at the front left.",
  HOLD_TWO = "Two yellow corners up: turn the top until the front-left corner shows its yellow to the front.";
const SUNE_CASES: MethodAlgorithm[] = [
  { name: "Sune", detail: "Sunes needed: 1", alg: `(${SUNE})`, setup: "R U2 R' U' R U' R'", note: `${HOLD_ONE} One Sune solves it.` },
  { name: "Antisune", detail: "Sunes needed: 2", alg: `(${SUNE}) U2 (${SUNE})`, setup: "R U R' U R U2 R' U2", note: `${HOLD_ONE} The Sune makes the Sune case: hold its yellow corner at the front left again.` },
  { name: "H", detail: "Sunes needed: 2", alg: `(${SUNE})2`, setup: "R U2 R' U' R U R' U' R U' R'", note: `${HOLD_NONE} After one Sune a single corner is up, already at the front left.` },
  { name: "Pi", detail: "Sunes needed: 2", alg: `(${SUNE}) U' (${SUNE})`, setup: "R' U2 R2 U R2 U R2 U2 R'", note: `${HOLD_NONE} One Sune leaves one corner up: put it at the front left.` },
  { name: "Headlights", detail: "Sunes needed: 3", alg: `(${SUNE}) U' (${SUNE}) U2 (${SUNE})`, setup: "R U2 R D R' U2 R D' R2", note: `${HOLD_TWO} Each Sune leaves a new case: count again and hold it as it says.` },
  { name: "T", detail: "Sunes needed: 3", alg: `(${SUNE}) U (${SUNE}) U2 (${SUNE})`, setup: "F R' F' r U R U' r'", note: `${HOLD_TWO} Each Sune leaves a new case: count again and hold it as it says.` },
  { name: "Bowtie", detail: "Sunes needed: 3", alg: `(${SUNE})2 U2 (${SUNE})`, setup: "r U R' U' r' F R F'", note: `${HOLD_TWO} Each Sune leaves a new case: count again and hold it as it says.` },
];

function bigCube(size: 4 | 5 | 6 | 7): SolvingMethod[] {
  const even = size % 2 === 0;
  const id = `${size}x${size}`;
  const centres = even
    ? `Each face has ${(size - 2) ** 2} centre pieces and no fixed centre, so place the colours in the standard scheme yourself: white opposite yellow, green opposite blue, then check the order around.`
    : `Each face has ${(size - 2) ** 2} centre pieces; the middle one is fixed and sets the colour of the face.`;
  const parity = even
    ? "Two parities are special to even cubes: OLL parity (a single flipped edge) and PLL parity (two swapped edges). Each is fixed with one long algorithm when it appears."
    : "Odd cubes have no OLL or PLL parity: the only parity appears while pairing the last two edges and is fixed with one algorithm.";
  const stage3 = [`${id}-f2l`, `${id}-2look-oll`, `${id}-2look-pll`];
  return [
    {
      id: "reduction", name: "Reduction", level: "beginner",
      summary: `Turn the ${size}×${size} into a big 3×3: build the centres, pair the edges, then solve it like a 3×3.`,
      steps: [
        {
          title: "Centres", text: `${centres} Build the first two opposite centres, then the last four, taking care not to break the finished ones.`,
          sets: [`${id}-centers`],
          tips: ["Build each centre as bars first, then join the bars.", "Use only slice moves and the face you are building on, so finished centres stay intact."],
        },
        {
          title: "Edge pairing", text: `Join the ${size - 2} edge pieces of each edge into one bar. Match pieces on the inner slices, pair them with a flip, then restore the centres with the reverse slice move.`,
          sets: [`${id}-edges`],
          tips: ["Pair edges on the front and back of the middle row, never on the top or bottom.", "Always undo the slice move after the flip, or the centres break."],
        },
        {
          title: "3×3 stage", text: "Only the outer layers move from here: solve the cube with your 3×3 method (cross, F2L, OLL, PLL).",
          sets: stage3,
          tips: ["The big cube turns more slowly: look ahead rather than turning faster."],
        },
        { title: "Parity", text: parity, sets: [`${id}-parity`] },
      ],
    },
    {
      id: "yau", name: "Yau", level: "intermediate",
      summary: "The method used by most fast solvers: the cross is built during the centres, so the edges can be paired with more freedom.",
      steps: [
        {
          title: "First two centres", text: "Solve two opposite centres, usually white and yellow, and hold white on the left.",
          sets: [`${id}-centers`],
        },
        {
          title: "Three cross edges", text: "Pair three white edges and place them around the white centre.",
          tips: ["Plan the first edge during inspection.", "Pair each edge with one slice move and insert it on the left without breaking the centres."],
        },
        {
          title: "Last four centres", text: "Build the remaining centres without disturbing the three cross edges.",
          tips: ["Keep the cross edges on the left face: only the right and the inner slices move freely."],
        },
        {
          title: "Last cross edge and pairing", text: "Pair and place the last cross edge, turn white to the bottom, then pair the eight remaining edges, usually three, then two, then three at a time.",
          sets: [`${id}-edges`],
        },
        { title: "3×3 stage", text: `The cross is already done: finish with F2L, OLL and PLL. ${parity}`, sets: [...stage3, `${id}-parity`] },
      ],
    },
  ];
}

export const METHODS: Record<PuzzleId, SolvingMethod[]> = {
  "333": [
    {
      id: "beginner", name: "Beginner", level: "beginner",
      summary: "Layer by layer with a handful of short algorithms. Slow but reliable, and the base of every other method.",
      steps: [
        {
          title: "White cross", text: "Place the four white edges around the white centre so their side colours match the side centres.", train: "cross",
          tips: [
            "Start with a daisy: the four white edges around the yellow centre, white facing up.",
            "Turn the top until an edge's side colour matches the centre below it, then turn that face twice to bring it down.",
            "Hold the cube white side down from here on.",
          ],
        },
        {
          title: "First-layer corners", text: "Bring each white corner under its slot and repeat R U R' U' until it drops in correctly.",
          mask: "F1L", algs: [CORNER_INSERTION],
          tips: ["Turn the top until the corner sits above the slot between its two side colours."],
        },
        {
          title: "Second-layer edges", text: "Insert the four middle edges from the top layer with the left or right insertion algorithm.",
          mask: "F2L",
          algs: [
            { name: "Right insertion", alg: "U R U' R' U' F' U F", note: "The edge's front colour matches the front centre and its top colour is the right centre." },
            { name: "Left insertion", alg: "U' L' U L U F U' F'", note: "The edge's front colour matches the front centre and its top colour is the left centre." },
          ],
          tips: ["Look for a top edge without yellow.", "An edge stuck in the wrong slot comes out when any top edge is inserted there."],
        },
        {
          title: "Yellow cross", text: "Look at the yellow edges on top, ignoring the corners: none (a dot), two side by side (an L) or two across (a line). Hold the cube as the case says, then flip them with its algorithm.",
          mask: "EO",
          algs: [
            {
              name: "Dot", alg: "F R U R' U' F'", setup: "f U R U' R' f' F U R U' R' F'",
              note: "No yellow edge on top: do the line's algorithm from any side, you get an L. Turn the top until the L is at the back left, then do the L.",
            },
            {
              name: "L", alg: "F U R U' R' F'", alternatives: ["(F R U R' U' F')2"],
              note: "Turn the top until the L sits at the back left (yellow edges at the back and on the left), then do it once. The line's algorithm done twice works too: the first makes the line.",
            },
            {
              name: "Line", alg: "F R U R' U' F'",
              note: "Hold the line horizontal, from left to right, then do it once: the cross is made.",
            },
          ],
          tips: ["Only the four edges count here: the corners are done in the next step.", "Keep the white face on the bottom: only the top layer changes."],
        },
        {
          title: "Yellow face", text: "Turn the yellow corners up with the Sune alone, R U R' U R U2 R'. Count the yellow corners already up, hold the cube as that count says, do the Sune, then look again: three Sunes at most.",
          mask: "OLL",
          algs: SUNE_CASES,
          tips: [
            "No yellow corner up: turn the top until the front-left corner shows its yellow on the left.",
            "One yellow corner up (the fish): turn the top until it sits at the front left.",
            "Two yellow corners up: turn the top until the front-left corner shows its yellow to the front.",
          ],
        },
        {
          title: "Last layer permutation", text: "Swap the corners into place, then cycle the edges to finish the cube.",
          mask: "PLL",
          algs: [
            { name: "Corner cycle", alg: "R' F R' B2 R F' R' B2 R2", note: "Hold two corners with matching sides (headlights) at the back. None: do it once from any side and look again." },
            { name: "Edge cycle · Ua", alg: "R U' R U R U R U' R' U' R2", note: "Hold the solved edge at the back; the front edge belongs on the right. No solved edge: do it once and look again." },
            { name: "Edge cycle · Ub", alg: "R2 U R U R' U' R' U' R' U R'", note: "Hold the solved edge at the back; the front edge belongs on the left." },
          ],
        },
      ],
    },
    {
      id: "cfop", name: "CFOP", level: "intermediate",
      summary: "The most popular speed method: Cross, F2L, OLL and PLL. Most Cubix sets for the 3×3 follow it.",
      steps: [
        {
          title: "Cross", text: "Solve the four bottom edges in about eight moves. Plan the whole cross during inspection.", train: "cross",
          tips: ["Build it on the bottom from the start, so the pairs stay in view.", "Place edges relative to each other first; the centres can be matched with one last turn.", "Most crosses take eight moves or fewer: if yours takes more, look for a shorter one."],
        },
        { title: "F2L", text: "Pair a corner with its edge and insert them together into their slot, four times. The 41 basic cases are learnt intuitively first.", sets: ["f2l"] },
        { title: "OLL", text: "Make the top face one colour in a single algorithm (57 cases), or in two steps with 2-look OLL (10 algorithms).", sets: ["2look-oll", "oll"] },
        { title: "PLL", text: "Move the last-layer pieces into place in a single algorithm (21 cases), or with 2-look PLL (6 algorithms).", sets: ["2look-pll", "pll"] },
        {
          title: "Going further", text: "WV and VLS orient the last layer while inserting the last pair; COLL and OLLCP leave only an edge PLL. When the last-layer edges are already oriented after F2L, ZBLL solves the whole last layer in one algorithm.",
          sets: ["wv", "vls", "coll", "ollcp", "zbll-t", "zbll-u", "zbll-l", "zbll-pi", "zbll-h", "zbll-s", "zbll-as"],
        },
      ],
    },
    {
      id: "roux", name: "Roux", level: "advanced",
      summary: "A block-building method with a low move count, finished with M-slice and U turns.",
      steps: [
        {
          title: "First block", text: "Build a 1×2×3 block on the left, at the bottom.",
          tips: ["Plan the edge and one of the pairs during inspection.", "Build the 1×2×2 square first, then add the back pair."],
        },
        {
          title: "Second block", text: "Build the matching 1×2×3 block on the right using R, r, U and M turns, keeping the first block intact.",
          tips: ["Place the bottom edge first, then insert the two pairs as in F2L.", "Free M turns help: the middle slice is not solved yet."],
        },
        {
          title: "CMLL", text: "Orient and permute the four top corners in one algorithm (42 cases).",
          sets: ["cmll"],
          mask: "OLL",
          algs: [
            { name: "Sune", alg: "R U R' U R U2 R'" },
            { name: "Antisune", alg: "R U2 R' U' R U' R'" },
            { name: "H", alg: "R U R' U R U' R' U R U2 R'" },
            { name: "Pi", alg: "R U2 R2 U' R2 U' R2 U2 R" },
            { name: "U", alg: "R2 D R' U2 R D' R' U2 R'" },
            { name: "T", alg: "r U R' U' r' F R F'" },
            { name: "L", alg: "F R' F' r U R U' r'" },
            { name: "Adjacent swap", alg: "R U R' U' R' F R2 U' R' U' R U R' F'", note: "Corners oriented: the two corners with matching sides go on the left." },
            { name: "Diagonal swap", alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'", note: "Corners oriented, no two with matching sides." },
          ],
          tips: ["The nine algorithms below are two-look CMLL, to start with: orient the corners, then swap them. The top edges may move freely."],
        },
        {
          title: "LSE", text: "Solve the last six edges with only M and U turns: orient them, place the left and right edges, then finish the middle slice.",
          algs: [
            { name: "Middle cycle", alg: "M' U2 M U2", note: "Cycles the edges of the middle slice: the front top edge goes down to the front bottom." },
            { name: "Middle cycle, reverse", alg: "M U2 M' U2", note: "The front top edge goes to the back top." },
            { name: "Double swap", alg: "M2 U2 M2 U2", note: "Swaps the two top middle edges and the two bottom ones." },
          ],
          tips: ["An edge is oriented when its white or yellow sticker faces up or down.", "Orient all six first, then place the left and right edges, then the middle slice."],
        },
      ],
    },
    {
      id: "zz", name: "ZZ", level: "advanced",
      summary: "Orient every edge first, so the rest of the solve needs no cube rotations and no F or B turns.",
      steps: [
        {
          title: "EOLine", text: "Orient all twelve edges and place the front and back bottom edges. EOCross places all four bottom edges instead.",
          tips: ["An edge is bad when an R, L, U or D move alone cannot fix it: count the bad edges during inspection.", "F or B turns flip four edges at once: use them to bring the count to zero."],
        },
        {
          title: "F2L", text: "Build the left and right blocks using only R, U and L turns.",
          tips: ["No rotations: build the left block with L and U, the right one with R and U.", "Every edge stays oriented, so pairs never need F or B turns."],
        },
        {
          title: "Last layer", text: "Edges are already oriented, so ZBLL finishes in one algorithm; otherwise orient the corners, then use PLL.",
          sets: ["2look-oll", "pll"],
          tips: ["Only the corner cases of 2-Look OLL appear: the edges are already oriented."],
        },
      ],
    },
  ],
  "222": [
    {
      id: "beginner", name: "Beginner", level: "beginner",
      summary: "Layer by layer, the 3×3 corner steps on a smaller puzzle.",
      steps: [
        {
          title: "First layer", text: "Solve four corners of one colour so their side colours match.",
          mask: "F2L", algs: [CORNER_INSERTION],
          tips: ["Choose one corner as the reference; the others are placed around it."],
        },
        { title: "Orient the last layer", text: "Turn the top face one colour, for example by repeating the Sune (R U R' U R U2 R').", mask: "OLL", algs: [SUNE_REPEATED] },
        {
          title: "Permute the last layer", text: "Swap the top corners into place with one algorithm, repeated once if needed.",
          mask: "PLL",
          algs: [
            { name: "Adjacent swap", alg: "R U R' U' R' F R2 U' R' U' R U R' F'", note: "Two corners with matching sides (headlights): hold them on the left." },
            { name: "Diagonal swap", alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'", note: "No headlights on any side." },
          ],
        },
      ],
    },
    {
      id: "ortega", name: "Ortega", level: "intermediate",
      summary: "A fast method with only a dozen algorithms: face, orientation, then both layers at once.",
      steps: [
        {
          title: "First face", text: "Make one face a single colour. The side colours do not need to match yet.",
          tips: ["Plan the whole face during inspection: it takes four or five moves.", "Pick the colour whose face is quickest, usually white or yellow."],
        },
        { title: "OLL", text: "Turn the opposite face one colour with one of 7 algorithms.", sets: ["2x2-oll"] },
        { title: "PBL", text: "Permute both layers at once with one of 5 algorithms.", sets: ["2x2-pbl"] },
      ],
    },
    {
      id: "cll", name: "CLL", level: "advanced",
      summary: "One more look saved: after a full first layer, one algorithm solves the rest.",
      steps: [
        {
          title: "First layer", text: "Solve a complete first layer, with matching side colours.",
          tips: ["Plan the whole layer during inspection.", "Build it on the bottom, so the top is in view for recognition."],
        },
        { title: "CLL", text: "Orient and permute the last layer in one algorithm (42 cases).", sets: ["2x2-cll"] },
      ],
    },
    {
      id: "eg", name: "EG", level: "advanced",
      summary: "The top-level method: a single face, then one algorithm for the whole cube.",
      steps: [
        {
          title: "First face", text: "Make one face a single colour; the first layer may be solved, adjacent-swapped or diagonal-swapped.",
          tips: ["Recognise the bottom layer during inspection: solved, adjacent swap or diagonal swap."],
        },
        { title: "CLL, EG-1 or EG-2", text: "Recognise the case and solve both layers in one algorithm: CLL, EG-1 or EG-2 depending on the first layer, 42 cases each.", sets: ["2x2-cll", "2x2-eg1", "2x2-eg2"] },
      ],
    },
  ],
  "444": bigCube(4),
  "555": bigCube(5),
  "666": bigCube(6),
  "777": bigCube(7),
  sq1: [
    {
      id: "beginner", name: "Beginner", level: "beginner",
      summary: "Restore the cube shape, then fix the pieces one property at a time with short algorithms.",
      steps: [
        { title: "Cube shape", text: "Return both layers to a square with the known shape sequences, keeping the middle layer aligned.", sets: ["sq1-shape"] },
        { title: "Orient corners", text: "Bring every top-colour corner to the top and every bottom-colour corner to the bottom.", sets: ["sq1-co"] },
        { title: "Orient edges", text: "Do the same with the edges.", sets: ["sq1-eo"] },
        { title: "Permute corners", text: "Swap corners until both layers have their corners in place.", sets: ["sq1-cp"] },
        { title: "Permute edges", text: "Cycle the edges into place.", sets: ["sq1-ep"] },
        { title: "Parity", text: "If two pieces stay swapped or the middle layer is flipped, apply the parity algorithm.", sets: ["sq1-parity"] },
      ],
    },
    {
      id: "vandenbergh", name: "Vandenbergh", level: "advanced",
      summary: "The standard speed method: the same steps, merged into fewer looks with more algorithms.",
      steps: [
        { title: "Cube shape", text: "Solve the shape efficiently during inspection; advanced solvers also track parity here.", sets: ["sq1-shape"] },
        { title: "CO/EO", text: "Orient corners, then edges, each in one algorithm.", sets: ["sq1-co", "sq1-eo"] },
        { title: "CP", text: "Permute the corners of both layers in one algorithm.", sets: ["sq1-cp"], missing: "Cubix holds the beginner corner cases; the full one-look CP set is not in it yet." },
        { title: "EP", text: "Permute the edges of both layers, recognising parity cases in the same step.", sets: ["sq1-ep", "sq1-parity"], missing: "The full EP set is not in Cubix yet." },
      ],
    },
  ],
  pyram: [
    {
      id: "beginner", name: "Layer by layer", level: "beginner",
      summary: "Tips first, then the bottom layer and the last three edges.",
      steps: [
        {
          title: "Tips", text: "Turn each of the four small tips to match the centre below it. They move independently of everything else.",
          tips: ["The lowercase moves u, r, l and b turn one tip each."],
        },
        {
          title: "Centres", text: "Align the three centres around one corner with a colour on the bottom face.",
          tips: ["Each centre turns with the corner above it: one move per centre at most."],
        },
        { title: "Bottom edges", text: "Insert the three bottom edges one by one with short insertions.", sets: ["pyram-basics"] },
        { title: "Last three edges", text: "Solve the top edges with one of a few algorithms, such as the Sledge (R' L R L').", sets: ["pyram-ll"] },
      ],
    },
    {
      id: "l4e", name: "L4E", level: "intermediate",
      summary: "A faster method: a small V block, then the last four edges in one algorithm.",
      steps: [
        {
          title: "Tips", text: "Solve the tips, or leave them for the end since they only need one turn each.",
          tips: ["Leaving the tips for the end saves looking at them twice."],
        },
        {
          title: "V", text: "Solve three centres and two edges around one corner, forming a V shape.",
          tips: ["Plan the whole V during inspection: it takes four or five moves."],
        },
        { title: "Last four edges", text: "Place the last four edges with one algorithm chosen from their position and orientation.", missing: "The L4E algorithms are not in Cubix yet." },
      ],
    },
  ],
  skewb: [
    {
      id: "beginner", name: "Beginner", level: "beginner",
      summary: "A first layer, then the top corners and the centres with two repeated sequences.",
      steps: [
        {
          title: "First layer", text: "Solve one centre and its four corners so their side colours agree.",
          tips: ["Start from the centre, then add the corners one at a time with short insertions.", "Check that each corner agrees with its two neighbours on the sides."],
        },
        { title: "Top corners", text: "Orient and place the top corners by repeating the Sledgehammer (R' L R L') or the Sune.", sets: ["skewb-corners"] },
        { title: "Centres", text: "Cycle the last centres into place with the centre algorithm.", sets: ["skewb-centers"] },
      ],
    },
    {
      id: "sarah", name: "Sarah's intermediate", level: "intermediate",
      summary: "A popular speed method with a small set of algorithms.",
      steps: [
        {
          title: "First layer", text: "Solve one face and its four corners, usually planned during inspection.",
          tips: ["Plan the whole layer during inspection: it takes four or five moves."],
        },
        { title: "Top corners", text: "Solve the four remaining corners in one algorithm chosen by their orientation.", sets: ["skewb-corners"], missing: "Cubix holds the basic corner cases; the full intermediate set is not in it yet." },
        { title: "Last five centres", text: "Place the remaining centres with a single algorithm (L5C).", sets: ["skewb-centers"], missing: "Cubix holds the two centre cycles; the other L5C cases are not in it yet." },
      ],
    },
  ],
  minx: [
    {
      id: "beginner", name: "Layer by layer", level: "beginner",
      summary: "The 3×3 beginner approach, spread over twelve faces.",
      steps: [
        {
          title: "Star", text: "Place the five edges around the first centre.",
          tips: ["Like the 3×3 cross: match each edge with its side centre."],
        },
        { title: "First layer", text: "Insert the five corners around it, as on the 3×3.", algs: [{ ...CORNER_INSERTION, note: "Hold the corner above its slot, at front right, and repeat until it is solved." }] },
        { title: "Middle layers", text: "Insert the edges, then the corner and edge pairs, face by face, until only the last face remains.", sets: ["minx-pairs"] },
        { title: "Last layer", text: "Orient the last-layer edges, then the corners, then permute corners and edges.", sets: ["minx-eo", "minx-co", "minx-ep", "minx-cp"] },
      ],
    },
    {
      id: "speed", name: "S2L and 4-look", level: "intermediate",
      summary: "The standard speed approach: pairs and blocks, then the last layer in four algorithms.",
      steps: [
        { title: "Star and F2L", text: "Build the star, then insert five corner and edge pairs as in 3×3 F2L.", sets: ["minx-pairs"] },
        {
          title: "S2L", text: "Build the next layers with blocks on the side faces until only the last face remains.",
          tips: ["Solve one side face at a time, as a block of two pairs and its edges.", "Keep the unsolved faces at the top, so the blocks stay in view."],
        },
        { title: "Last layer", text: "Orient the edges, orient the corners, permute the edges, then permute the corners.", sets: ["minx-eo", "minx-co", "minx-ep", "minx-cp"] },
      ],
    },
  ],
};
