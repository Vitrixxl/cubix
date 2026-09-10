import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";
export const Kpi = memo(function Kpi({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={value} className={`value ${small ? "small" : ""}`} initial={{ opacity: 0, y: 8, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.94 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
          {value}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
