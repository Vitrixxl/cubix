import { Easing } from "react-native";

/** Timing shared by every horizontal page transition: a quick start that settles softly. */
export const SLIDE = { duration: 280, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true } as const;

