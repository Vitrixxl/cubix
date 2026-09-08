import { useAtom } from "jotai";
import { animationsEnabledAtom } from "../state";

export function AnimationSetting() {
  const [enabled, setEnabled] = useAtom(animationsEnabledAtom);
  return <div className="animation-setting">
    <div><strong>Animations</strong><p>Animate panels, transitions and cube moves.</p></div>
    <button type="button" className={`switch ${enabled ? "on" : ""}`} role="switch" aria-label="Animations" aria-checked={enabled} onClick={() => setEnabled(value => !value)}>
      <span className="switch-track" /><span>{enabled ? "On" : "Off"}</span>
    </button>
  </div>;
}
