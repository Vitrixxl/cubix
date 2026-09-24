import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {theme} from './theme';
import {ActionButton} from './ui';
import {LauncherCube} from './LauncherCube';
import type {LauncherBridge, LauncherState} from '../launcher-state';
import './styles.css';
import './launcher.css';

declare global { interface Window { cubixLauncher: LauncherBridge } }
/** Same screen as the phone launcher: the cube, the name, one status line and a bar while a download runs. */
function Startup({initial}: {initial: LauncherState}) {
  const [state, setState] = useState(initial);
  useEffect(() => window.cubixLauncher.onState(setState), []);
  useEffect(() => {
    // Display only after the saved appearance and the real application fonts are painted.
    void document.fonts.ready.then(() => requestAnimationFrame(() => window.cubixLauncher.ready()));
  }, []);
  const percent = state.message.match(/(\d+)\s*%/);
  const progress = percent ? Math.min(100, Number(percent[1])) : undefined;
  return <main className={`app startup ${state.light ? 'light' : ''}`} style={theme(state.themeName, state.light) as React.CSSProperties}>
    <section className="startup-content">
      <LauncherCube size={172} finish={state.phase === 'opening'} onSettled={() => window.cubixLauncher.settled()}/>
      <div className="col startup-title">
        <h1>Cubix</h1>
        <p id="status" role="status" aria-live="polite" className="muted">{state.message}</p>
      </div>
      <div className={`startup-progress ${progress === undefined ? 'hidden' : ''}`} role="progressbar" aria-label="Téléchargement de la mise à jour" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-hidden={progress === undefined}>
        <div style={{width: `${progress ?? 0}%`}}/>
      </div>
    </section>
    <footer className="row between startup-footer">
      <span className="muted">L’application s’ouvrira automatiquement.</span>
      <ActionButton onClick={() => window.cubixLauncher.close()}>Annuler</ActionButton>
    </footer>
  </main>;
}
void window.cubixLauncher.state().then(initial => createRoot(document.getElementById('root')!).render(<Startup initial={initial}/>));
