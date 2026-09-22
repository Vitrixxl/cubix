import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { integratedRenderNode } from "../platform";

test("selects the integrated GPU on hybrid PCs without opening the NVIDIA device", async () => {
  const root = await mkdtemp(join(tmpdir(), "cubix-gpu-test-"));
  const sysfs = join(root, "sys"), devices = join(root, "dev");
  const card = async (name: string, vendor: string, boot: boolean) => {
    const dir = join(sysfs, name, "device");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "vendor"), vendor + "\n");
    await writeFile(join(dir, "boot_vga"), boot ? "1\n" : "0\n");
  };
  try {
    expect(await integratedRenderNode(sysfs, devices)).toBeNull();
    await mkdir(devices);
    await card("renderD131", "0x8086", true);
    await writeFile(join(devices, "renderD131"), "");
    expect(await integratedRenderNode(sysfs, devices)).toBeNull();
    await card("renderD128", "0x10de", false);
    // No NVIDIA device file: detection must only read cached metadata.
    expect(await integratedRenderNode(sysfs, devices)).toBe(join(devices, "renderD131"));
    await card("renderD131", "0x1002", true);
    expect(await integratedRenderNode(sysfs, devices)).toBe(join(devices, "renderD131"));
    await card("renderD128", "0x10de", true);
    expect(await integratedRenderNode(sysfs, devices)).toBeNull();
    await card("renderD128", "0x10de", false);
    await rm(join(devices, "renderD131"));
    expect(await integratedRenderNode(sysfs, devices)).toBeNull();
  } finally { await rm(root, { recursive: true, force: true }); }
});
