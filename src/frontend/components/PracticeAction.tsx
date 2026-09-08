import { motion, type HTMLMotionProps } from "motion/react";
import { useTimerChrome } from "../hooks/useTimerChrome";

export function PracticeAction({ running, ...props }: HTMLMotionProps<"button"> & {
  running: boolean;
}) {
  const chrome = useTimerChrome("down", running, true);
  return <motion.button type="button" className="practice-action" {...props} {...chrome} />;
}
