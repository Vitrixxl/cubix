/** Always run real Electron in an isolated virtual display, never in the user's session. */
import {chromium} from 'playwright';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import assert from 'node:assert/strict';
import {THEMES} from '../../src/client/lib/theme';
import {theme} from '../renderer/theme';
if (process.env.CUBIX_LAUNCHER_VIRTUAL_DISPLAY !== '1') {
  const child = Bun.spawn(['xvfb-run', '-a', 'env', 'WAYLAND_DISPLAY=', 'CUBIX_LAUNCHER_VIRTUAL_DISPLAY=1', process.execPath, import.meta.path], {stdout:'inherit', stderr:'inherit'});
  process.exit(await child.exited);
}
assert(process.env.DISPLAY && process.env.DISPLAY !== ':0' && !process.env.WAYLAND_DISPLAY, 'Isolated Xvfb display required');
delete process.env.ELECTRON_RUN_AS_NODE;
const out=resolve('artifacts/electron/testing/launcher');await mkdir(out,{recursive:true});
for (const selected of THEMES) for (const light of [false,true]) {
  const fixture=await mkdtemp(join(tmpdir(),'cubix-startup-appearance-'));
  const storage=join(fixture,'data');await mkdir(storage);
  await writeFile(join(storage,'storage.json'),JSON.stringify({'cubix.ui.theme':JSON.stringify(selected.id),'cubix.ui.colorMode':JSON.stringify(light?'light':'dark')}));
  const reservation=Bun.serve({port:0,fetch:()=>new Response('')});const port=reservation.port;reservation.stop();
  const child=Bun.spawn([resolve('node_modules/electron/dist/electron'),'--no-sandbox','--disable-gpu','--ozone-platform=x11',`--remote-debugging-port=${port}`,`--user-data-dir=${join(fixture,'profile')}`,resolve('artifacts/electron/cubix-linux-x64/splash.cjs')],{
    env:{...process.env,CUBIX_DESKTOP_DATA:storage,WAYLAND_DISPLAY:''},stdin:'pipe',stdout:'pipe',stderr:Bun.file(join(fixture,'electron.log')),
  });
  let output='';
  const stdout=(async()=>{const reader=child.stdout.getReader();try{while(true){const next=await reader.read();if(next.done)break;output+=new TextDecoder().decode(next.value);}}finally{reader.releaseLock();}})();
  let browser;
  try {
    for(let i=0;i<150;i++) {
      try {await fetch(`http://127.0.0.1:${port}/json/version`);break;} catch {
        if(child.exitCode!==null)throw Error(await Bun.file(join(fixture,'electron.log')).text());
        await Bun.sleep(40);
      }
    }
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page=browser.contexts()[0].pages()[0];
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.waitForSelector('.startup');await page.evaluate(()=>document.fonts.ready);
    const colors=theme(selected.id,light);
    const actual=await page.evaluate(()=>{
      const style=getComputedStyle(document.querySelector('.app')!);
      return {bg:style.getPropertyValue('--bg').trim(),accent:style.getPropertyValue('--accent').trim(),danger:style.getPropertyValue('--danger').trim(),font:getComputedStyle(document.body).fontFamily,loaded:[...document.fonts].some(font=>font.family.replaceAll('\"','')==='Geist'&&font.status==='loaded')};
    });
    if(!actual.loaded)console.error(await page.evaluate(()=>[...document.fonts].map(f=>({family:f.family,status:f.status}))));
    assert.equal(actual.bg,colors['--bg']);assert.equal(actual.accent,colors['--accent']);assert.equal(actual.danger,colors['--danger']);assert(actual.font.startsWith('Geist'));assert(actual.loaded,'Real Geist font must load');
    for(let i=0;i<50&&!output.includes('ready');i++)await Bun.sleep(10);
    assert(output.includes('ready'),'Window acknowledges readiness after appearance is applied');
    child.stdin.write(JSON.stringify({message:'Téléchargement de la mise à jour… 60 %'})+'\n');
    await page.waitForFunction(()=>document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')==='60');
    await page.waitForFunction(()=>document.querySelectorAll('.launcher-cube polygon').length>=27,undefined,{timeout:5000});
    if(selected.id==='t3-code'||selected.id==='t3-chat')await page.screenshot({path:join(out,`${selected.id}-${light?'light':'dark'}-progress.png`)});
    child.stdin.write(JSON.stringify({message:'Ouverture de Cubix…',phase:'opening'})+'\n');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Ouverture de Cubix…');
    // The window lets the cube finish standing before it lets the launcher open the application.
    for(let i=0;i<800&&!output.includes('settled');i++)await Bun.sleep(10);
    assert(output.includes('settled'),'Window reports the standing cube');
    assert.equal(await page.evaluate(()=>document.querySelectorAll('.launcher-cube polygon').length),54,'All 27 pieces and stickers stand');
    if(selected.id==='iris')await page.screenshot({path:join(out,`iris-${light?'light':'dark'}-opening.png`)});
    assert(await page.evaluate(()=>{
      const footer=document.querySelector('.startup-footer')!.getBoundingClientRect();
      return document.documentElement.scrollHeight<=innerHeight&&footer.bottom<=innerHeight;
    }));
    try {await page.getByRole('button',{name:'Annuler'}).click();}
    catch(error) {if(!String(error).includes('Target page, context or browser has been closed'))throw error;}
    for(let i=0;i<300&&!output.includes('cancel');i++)await Bun.sleep(10);
    assert(output.includes('cancel'),'Closing the window cancels the launch');
    assert.equal(await child.exited,0);assert.deepEqual(errors,[]);
    console.log(`PASS ${selected.id} ${light?'light':'dark'}: saved theme, Geist, cube, progress, settle, cancel`);
  } catch (error) {
    console.error(await Bun.file(join(fixture,'electron.log')).text());
    throw error;
  } finally {
    await browser?.close();if(child.exitCode===null)child.kill();await child.exited;await stdout;
    await rm(fixture,{recursive:true,force:true});
  }
}
