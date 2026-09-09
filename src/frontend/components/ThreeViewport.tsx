import {useLayoutEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {AmbientLight,DirectionalLight,Group,Mesh,OrthographicCamera,Scene,SRGBColorSpace,WebGLRenderer,type Object3D,type Material} from 'three';

export interface ThreeModel { object: Object3D; }
export interface ThreeViewportProps<M extends ThreeModel> {
  createModel: () => M;
  updateModel: (model: M) => void;
  label: string;
  rotation?: {x:number;y:number};
  interactive?: boolean;
  onRotationChange?: (rotation:{x:number;y:number})=>void;
  className?: string;
  style?: CSSProperties;
  viewSize?: number;
}
/** Render only on changes/drag/resize, and release every GPU resource on unmount. */
export function disposeObject(object:Object3D) {
  const geometries=new Set<Mesh['geometry']>(), materials=new Set<Material>();
  object.traverse(node=>{if(node instanceof Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
export function ThreeViewport<M extends ThreeModel>({createModel,updateModel,label,rotation={x:-30,y:-40},interactive=true,onRotationChange,className='',style,viewSize=3.9}:ThreeViewportProps<M>){
  const host=useRef<HTMLDivElement>(null),[error,setError]=useState('');
  const current=useRef<{model:M;render:()=>void;orientation:Group}|null>(null);
  const update=useRef(updateModel);update.current=updateModel;
  const orientation=useRef(rotation),drag=useRef<{x:number;y:number;rx:number;ry:number}|null>(null);
  const applyRotation=()=>{const entry=current.current;if(!entry)return;entry.orientation.rotation.set(-orientation.current.x*Math.PI/180,orientation.current.y*Math.PI/180,0,'XYZ');entry.render();};
  useLayoutEffect(()=>{
    const el=host.current;if(!el)return;setError('');
    let renderer:WebGLRenderer;
    try{renderer=new WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}catch{setError('3D unavailable: WebGL 2 is required.');return;}
    renderer.outputColorSpace=SRGBColorSpace;renderer.setClearColor(0,0);
    renderer.domElement.setAttribute('aria-hidden','true');el.prepend(renderer.domElement);
    const scene=new Scene(), camera=new OrthographicCamera(-2,2,2,-2,.1,100),group=new Group();
    camera.position.z=8;scene.add(group);scene.add(new AmbientLight(0xffffff,2.3));
    const light=new DirectionalLight(0xffffff,2.6);light.position.set(-3,6,8);scene.add(light);
    const model=createModel();group.add(model.object);
    const render=()=>renderer.render(scene,camera);
    current.current={model,render,orientation:group};update.current(model);
    group.rotation.set(-orientation.current.x*Math.PI/180,orientation.current.y*Math.PI/180,0,'XYZ');
    const resize=()=>{const {width,height}=el.getBoundingClientRect();if(!width||!height)return;const aspect=width/height;const half=viewSize/2;camera.left=-half*Math.max(1,aspect);camera.right=-camera.left;camera.top=half*Math.max(1,1/aspect);camera.bottom=-camera.top;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(width,height,false);render();};
    const observer=new ResizeObserver(resize);observer.observe(el);resize();
    const lost=(e:Event)=>{e.preventDefault();setError('3D paused. Reload to restore the view.');};renderer.domElement.addEventListener('webglcontextlost',lost);
    return()=>{current.current=null;observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);disposeObject(model.object);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[createModel,viewSize]);
  useLayoutEffect(()=>{if(current.current){updateModel(current.current.model);current.current.render();}});
  useLayoutEffect(()=>{orientation.current=rotation;applyRotation();},[rotation.x,rotation.y]);
  const down=(event:PointerEvent<HTMLDivElement>)=>{if(!interactive||event.button!==0)return;drag.current={x:event.clientX,y:event.clientY,rx:orientation.current.x,ry:orientation.current.y};event.currentTarget.setPointerCapture(event.pointerId);};
  const move=(event:PointerEvent<HTMLDivElement>)=>{if(!drag.current)return;const next={x:Math.max(-90,Math.min(90,drag.current.rx-(event.clientY-drag.current.y)*.5)),y:drag.current.ry+(event.clientX-drag.current.x)*.5};orientation.current=next;applyRotation();onRotationChange?.(next);};
  return <div ref={host} className={`three-viewport ${className}`} role="img" aria-label={label} data-renderer="threejs" style={{touchAction:interactive?'none':undefined,cursor:interactive?'grab':undefined,...style}} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>{error&&<span className="three-error" role="alert">{error}</span>}</div>;
}
