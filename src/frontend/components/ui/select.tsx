/** shadcn/ui Select (MIT), with Cubix theme classes in place of Tailwind utilities.
 * https://ui.shadcn.com/docs/components/radix/select
 */
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { IconCheck } from '../icons';
export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;
const Chevron = ({up=false}:{up?:boolean}) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={up?'m6 15 6-6 6 6':'m6 9 6 6 6-6'}/></svg>;
export function SelectTrigger({className='',children,...props}:React.ComponentProps<typeof SelectPrimitive.Trigger>){
  return <SelectPrimitive.Trigger data-slot="select-trigger" className={`select-trigger ${className}`} {...props}>{children}<SelectPrimitive.Icon asChild><Chevron/></SelectPrimitive.Icon></SelectPrimitive.Trigger>;
}
export function SelectContent({className='',children,position='popper',...props}:React.ComponentProps<typeof SelectPrimitive.Content>){
  return <SelectPrimitive.Portal><SelectPrimitive.Content data-slot="select-content" className={`select-content ${className}`} position={position} sideOffset={6} collisionPadding={12} {...props}>
    <SelectPrimitive.ScrollUpButton className="select-scroll"><Chevron up/></SelectPrimitive.ScrollUpButton>
    <SelectPrimitive.Viewport className="select-viewport">{children}</SelectPrimitive.Viewport>
    <SelectPrimitive.ScrollDownButton className="select-scroll"><Chevron/></SelectPrimitive.ScrollDownButton>
  </SelectPrimitive.Content></SelectPrimitive.Portal>;
}
export function SelectItem({className='',children,...props}:React.ComponentProps<typeof SelectPrimitive.Item>){
  return <SelectPrimitive.Item data-slot="select-item" className={`select-item ${className}`} {...props}><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText><SelectPrimitive.ItemIndicator className="select-check"><IconCheck/></SelectPrimitive.ItemIndicator></SelectPrimitive.Item>;
}
export function SelectLabel({className='',...props}:React.ComponentProps<typeof SelectPrimitive.Label>){return <SelectPrimitive.Label className={`select-label ${className}`} {...props}/>;}
export function SelectSeparator({className='',...props}:React.ComponentProps<typeof SelectPrimitive.Separator>){return <SelectPrimitive.Separator className={`select-separator ${className}`} {...props}/>;}
