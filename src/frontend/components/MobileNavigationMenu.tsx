import {useEffect,useRef,useState} from 'react';
import {useAtom,useAtomValue} from 'jotai';
import * as Popover from '@radix-ui/react-popover';
import {chatActivityAtom,colorModeAtom,cubeSwitchLockedAtom,routeAtom} from '../state';
import {IconHelp,IconMessage,IconMoon,IconMore,IconPalette,IconSun,IconUser,IconUsers} from './icons';

import {helpPath} from '../seo/pages';

/** Secondary destinations stay within thumb reach without squeezing the main tabs. */
export function MobileNavigationMenu({onThemes}:{onThemes:()=>void}){
  const [open,setOpen]=useState(false),[route,setRoute]=useAtom(routeAtom),[mode,setMode]=useAtom(colorModeAtom);
  const activity=useAtomValue(chatActivityAtom),locked=useAtomValue(cubeSwitchLockedAtom);
  const handoff=useRef(false),trigger=useRef<HTMLButtonElement>(null);
  const secondary=['messages','community','profile'].includes(route.page);
  useEffect(()=>{setOpen(false);},[route.page,locked]);
  useEffect(()=>{
    const media=matchMedia('(max-width: 700px)');
    const resize=()=>{if(!media.matches)setOpen(false);};
    media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);
  },[]);
  return <Popover.Root open={open} onOpenChange={setOpen} modal>
    <Popover.Trigger asChild><button ref={trigger} type="button" className={`nav-item mobile-nav-more ${secondary?'active':''}`} aria-label="More" disabled={locked}>
      <IconMore/><span className="nav-label">More</span>
      {secondary&&<span className="nav-indicator"/>}
      {activity&&<span className="chat-activity-dot" role="status" aria-label="New activity in messages"/>}
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="mobile-nav-popover" side="top" align="end" sideOffset={12} collisionPadding={12} aria-label="More navigation" aria-modal="true" data-practice-control data-timer-ignore onCloseAutoFocus={event=>{
      if(handoff.current){event.preventDefault();handoff.current=false;trigger.current?.focus({preventScroll:true});onThemes();}
      else if(!matchMedia('(max-width: 700px)').matches)event.preventDefault();
    }}>
      <div className="mobile-nav-links">
        {([{page:'messages',label:'Messages',Icon:IconMessage},{page:'community',label:'Community',Icon:IconUsers},{page:'profile',label:'My account',Icon:IconUser}] as const).map(({page,label,Icon})=><button key={page} type="button" aria-current={route.page===page?'page':undefined} onClick={()=>{setOpen(false);setRoute({page});}}>
          <Icon/><span>{label}</span>{page==='messages'&&activity&&<span className="mobile-nav-activity" aria-label="New activity in messages"/>}
        </button>)}
        <a href={helpPath(route.page)}><IconHelp/><span>Help</span></a>
      </div>
      <div className="mobile-nav-appearance">
        <button type="button" onClick={()=>{handoff.current=true;setOpen(false);}}><IconPalette/><span>Themes</span></button>
        <button type="button" role="switch" aria-label="Light mode" aria-checked={mode==='light'} onClick={()=>setMode(value=>value==='light'?'dark':'light')}>
          {mode==='light'?<IconSun/>:<IconMoon/>}<span>Light mode</span><span className="mobile-nav-switch" aria-hidden="true"/>
        </button>
      </div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
