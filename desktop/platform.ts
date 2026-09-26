import { accessSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Read cached sysfs attributes; opening a DRM node can itself wake the dGPU. */
export function integratedRenderNode(
  sysfs = "/sys/class/drm",
  devices = "/dev/dri",
): string | null {
  try {
    const cards = readdirSync(sysfs).filter((name) => /^renderD\d+$/.test(name)).map((name) => {
      try {
        const device = join(sysfs, name, "device");
        const vendor = readFileSync(join(device, "vendor"), "utf8").trim();
        const boot = readFileSync(join(device, "boot_vga"), "utf8").trim() === "1";
        return { name, vendor, boot };
      } catch { return null; }
    });
    // Limit the workaround to hybrid PCs with an Intel/AMD primary GPU and NVIDIA secondary.
    const primary = cards.find((card) => card?.boot && ["0x8086", "0x1002"].includes(card.vendor));
    if (!primary || !cards.some((card) => card?.vendor === "0x10de" && !card.boot)) return null;
    const node = join(devices, primary.name);
    accessSync(node);
    return node;
  } catch { return null; }
}

/** Chromium switches and environment for Linux, applied by the Electron main process before start-up. */
export function electronLaunchOptions(env: NodeJS.ProcessEnv = process.env) {
  const switches: [string, string][] = [];
  if (process.platform !== "linux") return { switches, env: {} };
  if (!env.WAYLAND_DISPLAY) switches.push(["ozone-platform", "x11"]);
  // Explicit GPU/offload choices take precedence over the automatic low-power startup.
  if (env.CUBIX_DESKTOP_GPU === "system" || env.DRI_PRIME || env.__NV_PRIME_RENDER_OFFLOAD)
    return { switches, env: {} };
  const node = integratedRenderNode();
  if (!node) return { switches, env: {} };
  // Cubix uses Canvas 2D/OpenGL. Vulkan enumeration probes even unrelated GPUs,
  // waking a suspended NVIDIA card for ~1.8 s before the first frame.
  // Keep OpenGL hardware acceleration; only disable unused Vulkan driver probing.
  switches.push(["render-node-override", node]);
  return { switches, env: { VK_LOADER_DRIVERS_DISABLE: env.VK_LOADER_DRIVERS_DISABLE ?? "*" } };
}
