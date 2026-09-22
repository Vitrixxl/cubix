import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";

/** Read cached sysfs attributes; opening a DRM node can itself wake the dGPU. */
export async function integratedRenderNode(
  sysfs = "/sys/class/drm",
  devices = "/dev/dri",
): Promise<string | null> {
  try {
    const cards = await Promise.all(
      (await readdir(sysfs)).filter((name) => /^renderD\d+$/.test(name)).map(async (name) => {
        try {
          const device = join(sysfs, name, "device");
          const [vendor, boot] = await Promise.all([
            readFile(join(device, "vendor"), "utf8"),
            readFile(join(device, "boot_vga"), "utf8"),
          ]);
          return { name, vendor: vendor.trim(), boot: boot.trim() === "1" };
        } catch { return null; }
      }),
    );
    // Limit the workaround to hybrid PCs with an Intel/AMD primary GPU and NVIDIA secondary.
    const primary = cards.find((card) => card?.boot && ["0x8086", "0x1002"].includes(card.vendor));
    if (!primary || !cards.some((card) => card?.vendor === "0x10de" && !card.boot)) return null;
    const node = join(devices, primary.name);
    await access(node);
    return node;
  } catch { return null; }
}

export async function electronLaunchOptions() {
  const env = { ...process.env };
  const args: string[] = [];
  if (process.platform !== "linux") return { args, env };
  if (!env.WAYLAND_DISPLAY) args.push("--ozone-platform=x11");
  // Explicit GPU/offload choices take precedence over the automatic low-power startup.
  if (env.CUBIX_DESKTOP_GPU === "system" || env.DRI_PRIME || env.__NV_PRIME_RENDER_OFFLOAD)
    return { args, env };
  const node = await integratedRenderNode();
  if (node) {
    args.push(`--render-node-override=${node}`);
    // Cubix uses Canvas 2D/OpenGL. Vulkan enumeration probes even unrelated GPUs,
    // waking a suspended NVIDIA card for ~1.8 s before the first frame.
    // Keep OpenGL hardware acceleration; only disable unused Vulkan driver probing.
    env.VK_LOADER_DRIVERS_DISABLE ??= "*";
  }
  return { args, env };
}
