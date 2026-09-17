/**
 * A training session with cases still to learn celebrates the moment every selected case is learned.
 * The goal is derived (selected cases not yet learned) and is met only when learning empties it:
 * deselecting the remaining cases keeps the session quiet.
 */
export const pendingCases = (selected: readonly string[], learned: ReadonlySet<string>): string[] => selected.filter(id => !learned.has(id));

/** `previous` is the pending list observed before the latest selection or learning change. */
export function learningGoalMet(previous: readonly string[], selected: readonly string[], learned: ReadonlySet<string>): boolean {
  return previous.length > 0 && selected.length > 0 && previous.every(id => learned.has(id)) && pendingCases(selected, learned).length === 0;
}
