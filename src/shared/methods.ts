import type { PuzzleId } from "./puzzles";

/** A short, English walkthrough of one way to solve a puzzle, shown in the solving methods guide. */
export interface SolvingMethod {
  id: string;
  name: string;
  summary: string;
  steps: { title: string; text: string }[];
}

function bigCube(size: 4 | 5 | 6 | 7): SolvingMethod[] {
  const even = size % 2 === 0;
  const centres = even
    ? `Each face has ${(size - 2) ** 2} centre pieces and no fixed centre, so place the colours in the standard scheme yourself: white opposite yellow, green opposite blue, then check the order around.`
    : `Each face has ${(size - 2) ** 2} centre pieces; the middle one is fixed and sets the colour of the face.`;
  const parity = even
    ? "Two parities are special to even cubes: OLL parity (a single flipped edge) and PLL parity (two swapped edges). Each is fixed with one long algorithm when it appears."
    : "Odd cubes have no OLL or PLL parity: the only parity appears while pairing the last two edges and is fixed with one algorithm.";
  return [
    {
      id: "reduction", name: "Reduction",
      summary: `Turn the ${size}×${size} into a big 3×3: build the centres, pair the edges, then solve it like a 3×3.`,
      steps: [
        { title: "Centres", text: `${centres} Build the first two opposite centres, then the last four, taking care not to break the finished ones.` },
        { title: "Edge pairing", text: `Join the ${size - 2} edge pieces of each edge into one bar. Match pieces on the inner slices, pair them with a flip, then restore the centres with the reverse slice move.` },
        { title: "3×3 stage", text: "Only the outer layers move from here: solve the cube with your 3×3 method (cross, F2L, OLL, PLL)." },
        { title: "Parity", text: parity },
      ],
    },
    {
      id: "yau", name: "Yau",
      summary: "The method used by most fast solvers: the cross is built during the centres, so the edges can be paired with more freedom.",
      steps: [
        { title: "First two centres", text: "Solve two opposite centres, usually white and yellow, and hold white on the left." },
        { title: "Three cross edges", text: "Pair three white edges and place them around the white centre." },
        { title: "Last four centres", text: "Build the remaining centres without disturbing the three cross edges." },
        { title: "Last cross edge and pairing", text: "Pair and place the last cross edge, turn white to the bottom, then pair the eight remaining edges, usually three, then two, then three at a time." },
        { title: "3×3 stage", text: `The cross is already done: finish with F2L, OLL and PLL. ${parity}` },
      ],
    },
  ];
}

export const METHODS: Record<PuzzleId, SolvingMethod[]> = {
  "333": [
    {
      id: "beginner", name: "Beginner",
      summary: "Layer by layer with a handful of short algorithms. Slow but reliable, and the base of every other method.",
      steps: [
        { title: "White cross", text: "Place the four white edges around the white centre so their side colours match the side centres." },
        { title: "First-layer corners", text: "Bring each white corner under its slot and repeat R U R' U' until it drops in correctly." },
        { title: "Second-layer edges", text: "Insert the four middle edges from the top layer with the left or right insertion algorithm." },
        { title: "Yellow cross", text: "Flip the yellow edges with F R U R' U' F' until the yellow cross appears." },
        { title: "Yellow face", text: "Orient the yellow corners, for example by repeating the Sune (R U R' U R U2 R')." },
        { title: "Last layer permutation", text: "Swap the corners into place, then cycle the edges to finish the cube." },
      ],
    },
    {
      id: "cfop", name: "CFOP",
      summary: "The most popular speed method: Cross, F2L, OLL and PLL. Most Cubix sets for the 3×3 follow it.",
      steps: [
        { title: "Cross", text: "Solve the four bottom edges in about eight moves. Plan the whole cross during inspection." },
        { title: "F2L", text: "Pair a corner with its edge and insert them together into their slot, four times. The 41 basic cases are learnt intuitively first." },
        { title: "OLL", text: "Make the top face one colour in a single algorithm (57 cases), or in two steps with 2-look OLL (10 algorithms)." },
        { title: "PLL", text: "Move the last-layer pieces into place in a single algorithm (21 cases), or with 2-look PLL (6 algorithms)." },
        { title: "Going further", text: "When the last-layer edges are already oriented after F2L, ZBLL solves the whole last layer in one algorithm." },
      ],
    },
    {
      id: "roux", name: "Roux",
      summary: "A block-building method with a low move count, finished with M-slice and U turns.",
      steps: [
        { title: "First block", text: "Build a 1×2×3 block on the left, at the bottom." },
        { title: "Second block", text: "Build the matching 1×2×3 block on the right using R, r, U and M turns, keeping the first block intact." },
        { title: "CMLL", text: "Orient and permute the four top corners in one algorithm (42 cases)." },
        { title: "LSE", text: "Solve the last six edges with only M and U turns: orient them, place the left and right edges, then finish the middle slice." },
      ],
    },
    {
      id: "zz", name: "ZZ",
      summary: "Orient every edge first, so the rest of the solve needs no cube rotations and no F or B turns.",
      steps: [
        { title: "EOLine", text: "Orient all twelve edges and place the front and back bottom edges. EOCross places all four bottom edges instead." },
        { title: "F2L", text: "Build the left and right blocks using only R, U and L turns." },
        { title: "Last layer", text: "Edges are already oriented, so ZBLL finishes in one algorithm; otherwise orient the corners, then use PLL." },
      ],
    },
  ],
  "222": [
    {
      id: "beginner", name: "Beginner",
      summary: "Layer by layer, the 3×3 corner steps on a smaller puzzle.",
      steps: [
        { title: "First layer", text: "Solve four corners of one colour so their side colours match." },
        { title: "Orient the last layer", text: "Turn the top face one colour, for example by repeating the Sune (R U R' U R U2 R')." },
        { title: "Permute the last layer", text: "Swap the top corners into place with one algorithm, repeated once if needed." },
      ],
    },
    {
      id: "ortega", name: "Ortega",
      summary: "A fast method with only a dozen algorithms: face, orientation, then both layers at once.",
      steps: [
        { title: "First face", text: "Make one face a single colour. The side colours do not need to match yet." },
        { title: "OLL", text: "Turn the opposite face one colour with one of 7 algorithms." },
        { title: "PBL", text: "Permute both layers at once with one of 5 algorithms." },
      ],
    },
    {
      id: "cll", name: "CLL",
      summary: "One more look saved: after a full first layer, one algorithm solves the rest.",
      steps: [
        { title: "First layer", text: "Solve a complete first layer, with matching side colours." },
        { title: "CLL", text: "Orient and permute the last layer in one algorithm (42 cases)." },
      ],
    },
    {
      id: "eg", name: "EG",
      summary: "The top-level method: a single face, then one algorithm for the whole cube.",
      steps: [
        { title: "First face", text: "Make one face a single colour; the first layer may be solved, adjacent-swapped or diagonal-swapped." },
        { title: "CLL, EG-1 or EG-2", text: "Recognise the case and solve both layers in one algorithm: CLL, EG-1 or EG-2 depending on the first layer, 42 cases each." },
      ],
    },
  ],
  "444": bigCube(4),
  "555": bigCube(5),
  "666": bigCube(6),
  "777": bigCube(7),
  sq1: [
    {
      id: "beginner", name: "Beginner",
      summary: "Restore the cube shape, then fix the pieces one property at a time with short algorithms.",
      steps: [
        { title: "Cube shape", text: "Return both layers to a square with the known shape sequences, keeping the middle layer aligned." },
        { title: "Orient corners", text: "Bring every top-colour corner to the top and every bottom-colour corner to the bottom." },
        { title: "Orient edges", text: "Do the same with the edges." },
        { title: "Permute corners", text: "Swap corners until both layers have their corners in place." },
        { title: "Permute edges", text: "Cycle the edges into place." },
        { title: "Parity", text: "If two pieces stay swapped or the middle layer is flipped, apply the parity algorithm." },
      ],
    },
    {
      id: "vandenbergh", name: "Vandenbergh",
      summary: "The standard speed method: the same steps, merged into fewer looks with more algorithms.",
      steps: [
        { title: "Cube shape", text: "Solve the shape efficiently during inspection; advanced solvers also track parity here." },
        { title: "CO/EO", text: "Orient corners, then edges, each in one algorithm." },
        { title: "CP", text: "Permute the corners of both layers in one algorithm." },
        { title: "EP", text: "Permute the edges of both layers, recognising parity cases in the same step." },
      ],
    },
  ],
  pyram: [
    {
      id: "beginner", name: "Layer by layer",
      summary: "Tips first, then the bottom layer and the last three edges.",
      steps: [
        { title: "Tips", text: "Turn each of the four small tips to match the centre below it. They move independently of everything else." },
        { title: "Centres", text: "Align the three centres around one corner with a colour on the bottom face." },
        { title: "Bottom edges", text: "Insert the three bottom edges one by one with short insertions." },
        { title: "Last three edges", text: "Solve the top edges with one of a few algorithms, such as the Sledge (R' L R L')." },
      ],
    },
    {
      id: "l4e", name: "L4E",
      summary: "A faster method: a small V block, then the last four edges in one algorithm.",
      steps: [
        { title: "Tips", text: "Solve the tips, or leave them for the end since they only need one turn each." },
        { title: "V", text: "Solve three centres and two edges around one corner, forming a V shape." },
        { title: "Last four edges", text: "Place the last four edges with one algorithm chosen from their position and orientation." },
      ],
    },
  ],
  skewb: [
    {
      id: "beginner", name: "Beginner",
      summary: "A first layer, then the top corners and the centres with two repeated sequences.",
      steps: [
        { title: "First layer", text: "Solve one centre and its four corners so their side colours agree." },
        { title: "Top corners", text: "Orient and place the top corners by repeating the Sledgehammer (R' L R L') or the Sune." },
        { title: "Centres", text: "Cycle the last centres into place with the centre algorithm." },
      ],
    },
    {
      id: "sarah", name: "Sarah's intermediate",
      summary: "A popular speed method with a small set of algorithms.",
      steps: [
        { title: "First layer", text: "Solve one face and its four corners, usually planned during inspection." },
        { title: "Top corners", text: "Solve the four remaining corners in one algorithm chosen by their orientation." },
        { title: "Last five centres", text: "Place the remaining centres with a single algorithm (L5C)." },
      ],
    },
  ],
  minx: [
    {
      id: "beginner", name: "Layer by layer",
      summary: "The 3×3 beginner approach, spread over twelve faces.",
      steps: [
        { title: "Star", text: "Place the five edges around the first centre." },
        { title: "First layer", text: "Insert the five corners around it, as on the 3×3." },
        { title: "Middle layers", text: "Insert the edges, then the corner and edge pairs, face by face, until only the last face remains." },
        { title: "Last layer", text: "Orient the last-layer edges, then the corners, then permute corners and edges." },
      ],
    },
    {
      id: "speed", name: "S2L and 4-look",
      summary: "The standard speed approach: pairs and blocks, then the last layer in four algorithms.",
      steps: [
        { title: "Star and F2L", text: "Build the star, then insert five corner and edge pairs as in 3×3 F2L." },
        { title: "S2L", text: "Build the next layers with blocks on the side faces until only the last face remains." },
        { title: "Last layer", text: "Orient the edges, orient the corners, permute the edges, then permute the corners." },
      ],
    },
  ],
  clock: [
    {
      id: "beginner", name: "Beginner",
      summary: "Solve the front cross, then the back cross, then the corners.",
      steps: [
        { title: "Front cross", text: "Use pin settings to bring the four edge dials to the same time as the centre, then turn the whole cross to 12." },
        { title: "Back cross", text: "Flip the clock and solve the other cross, with pin settings that leave the first one untouched." },
        { title: "Corners", text: "Turn each corner to 12, one pin up at a time. Each corner dial is linked to the one behind it, so both sides finish together." },
      ],
    },
    {
      id: "7-simul", name: "7-simul",
      summary: "The speed method: seven steps with the same pin settings every solve, turning two wheels at once.",
      steps: [
        { title: "Read", text: "During inspection, read the dials and work out how far each of the seven steps must turn." },
        { title: "Solve", text: "Apply the steps of the first side, flip the clock and apply the rest. Only the amounts change from one scramble to the next." },
      ],
    },
  ],
};
