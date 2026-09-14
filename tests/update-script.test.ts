import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
async function run(options: { corrupt?: boolean; badURL?: boolean; downloadOnly?: boolean; failDownload?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cubix-update-test-')); dirs.push(dir);
  const bin = join(dir, 'bin'); mkdirSync(bin);
  const payload = 'synthetic package';
  writeFileSync(join(dir, 'package'), payload);
  const checksum = options.corrupt ? '0'.repeat(64) : createHash('sha256').update(payload).digest('hex');
  writeFileSync(join(dir, 'checksum'), checksum + '  cubix-linux-x86_64.pkg.tar.zst\n');
  const stub = (name: string, body: string) => writeFileSync(join(bin, name), `#!${process.execPath}\n${body}`, { mode: 0o755 });
  stub('curl', `
    const a=process.argv.slice(2), url=a.at(-1), root=process.env.FIXTURE!;
    if(url.endsWith('/latest')) { console.log(process.env.BAD_URL?'https://example.com/elsewhere':'https://github.com/Vitrixxl/cubix/releases/tag/desktop-test'); }
    else {
      if(process.env.FAIL_DOWNLOAD)process.exit(22);
      if(!url.startsWith('https://github.com/Vitrixxl/cubix/releases/download/desktop-test/'))process.exit(99);
      await Bun.write(a[a.indexOf('--output')+1],Bun.file(root+(url.endsWith('.sha256')?'/checksum':'/package')));
    }
  `);
  stub('pacman', `if(process.argv[2]!=='-Qp')process.exit(99); console.log('cubix-bin 0.1.0');`);
  stub('id', `console.log('1000');`);
  stub('yay', `await Bun.write(process.env.FIXTURE+'/installed',JSON.stringify(process.argv.slice(2)));`);
  stub('makepkg', `await Bun.write(process.env.FIXTURE+'/compiled','unexpected compilation'); process.exit(99);`);
  const proc = Bun.spawn(['/bin/sh', resolve('update.sh'), ...(options.downloadOnly ? ['--download-only'] : [])], {
    cwd: dir, env: { ...process.env, PATH: bin + ':' + process.env.PATH, XDG_CACHE_HOME: join(dir, 'cache'), FIXTURE: dir,
      BAD_URL: options.badURL ? '1' : '', FAIL_DOWNLOAD: options.failDownload ? '1' : '' }, stdout: 'pipe', stderr: 'pipe',
  });
  const [status, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  expect(existsSync(join(dir, 'compiled'))).toBe(false);
  return { dir, status, stdout, stderr, installed: existsSync(join(dir, 'installed')) };
}
test('binary updater pins the release, verifies it and installs without compiling', async () => {
  const r = await run(); expect(r.status).toBe(0); expect(r.installed).toBe(true);
  const args = JSON.parse(readFileSync(join(r.dir, 'installed'), 'utf8'));
  expect(args[0]).toBe('-U'); expect(readFileSync(args[1], 'utf8')).toBe('synthetic package');
});
test('download-only verifies the package without running the installer', async () => {
  const r = await run({ downloadOnly: true }); expect(r.status).toBe(0); expect(r.installed).toBe(false);
  expect(r.stdout).toContain('Verified:');
});
test('a corrupt download cannot reach the installer', async () => {
  const r = await run({ corrupt: true }); expect(r.status).not.toBe(0); expect(r.installed).toBe(false);
  expect(r.stderr).toContain('Checksum mismatch');
});
test('unexpected release URLs and failed downloads cannot reach the installer', async () => {
  for (const options of [{ badURL: true }, { failDownload: true }]) {
    const r = await run(options); expect(r.status).not.toBe(0); expect(r.installed).toBe(false);
  }
});
