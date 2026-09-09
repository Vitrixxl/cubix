export function PuzzlePlaceholder({error='',onRetry}:{error?:string;onRetry?:()=>void}){
  return <div className="puzzle-placeholder" role={error?'alert':'status'} aria-label={error||'Loading puzzle'} data-timer-ignore>
    <svg viewBox="0 0 100 110" aria-hidden="true"><path d="M50 8 90 31v47l-40 24L10 78V31Z M10 31l40 24 40-24 M50 55v47 M30 20l40 24v47 M70 20 30 44v46 M10 55l40 24 40-24"/></svg>
    {error&&<><span>{error}</span>{onRetry&&<button type="button" className="mini-btn" onClick={onRetry}>Retry</button>}</>}
  </div>;
}
