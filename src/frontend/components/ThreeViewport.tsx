import {useLayoutEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {AmbientLight,Color,DirectionalLight,DoubleSide,InstancedMesh,MeshBasicMaterial,NeutralToneMapping,PCFSoftShadowMap,PlaneGeometry,PMREMGenerator,Group,Mesh,OrthographicCamera,Scene,SRGBColorSpace,WebGLRenderer,type Object3D,type Material} from 'three';
import {PuzzlePlaceholder} from './PuzzlePlaceholder';

export interface ThreeModel { object: Object3D; }
export interface ThreeViewportProps<M extends ThreeModel> {
  createModel: () => M;
  cacheKey?: string;
  loading?: boolean;
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
  object.traverse(node=>{if(node instanceof InstancedMesh)node.dispose();if(node instanceof Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
export function ThreeViewport<M extends ThreeModel>({createModel,cacheKey,loading=false,updateModel,label,rotation={x:-30,y:-40},interactive=true,onRotationChange,className='',style,viewSize=3.9}:ThreeViewportProps<M>){
  const host=useRef<HTMLDivElement>(null),[error,setError]=useState(''),[painted,setPainted]=useState(false);
  const waiting=useRef(loading);waiting.current=loading;
  const current=useRef<{model:M;factory:()=>M;key?:string;models:Map<string,M>;render:()=>void;release:(model:M)=>void;resize:()=>void;orientation:Group}|null>(null);
  const update=useRef(updateModel);update.current=updateModel;
  const view=useRef(viewSize);view.current=viewSize;
  const orientation=useRef(rotation),drag=useRef<{x:number;y:number;rx:number;ry:number}|null>(null);
  const applyRotation=()=>{const entry=current.current;if(!entry)return;entry.orientation.rotation.set(-orientation.current.x*Math.PI/180,orientation.current.y*Math.PI/180,0,'XYZ');entry.render();};
  useLayoutEffect(()=>{
    const el=host.current;if(!el)return;setError('');
    let renderer:WebGLRenderer;
    try{renderer=new WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}catch{setError('3D unavailable: WebGL 2 is required.');return;}
    renderer.outputColorSpace=SRGBColorSpace;renderer.setClearColor(0,0);
    renderer.toneMapping=NeutralToneMapping;renderer.toneMappingExposure=1;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-hidden','true');el.prepend(renderer.domElement);
    const scene=new Scene(), camera=new OrthographicCamera(-2,2,2,-2,.1,100),group=new Group();
    // Narrow studio softboxes leave distinct moving reflections in the lacquer.
    // They are baked once into the environment, with no extra lights per frame.
    const room=new Scene();room.background=new Color(.18,.18,.18);
    for(const {position,width,height,intensity} of [
      {position:[-6,-3.6,-.8],width:.45,height:5,intensity:20},
      {position:[6,-2.5,-2.7],width:.5,height:5,intensity:18},
      {position:[0,6,-3],width:5,height:.8,intensity:18},
    ]){
      const panel=new Mesh(new PlaneGeometry(width,height),new MeshBasicMaterial({color:new Color().setScalar(intensity),side:DoubleSide}));
      panel.position.set(position[0],position[1],position[2]);panel.lookAt(0,0,0);room.add(panel);
    }
    const pmrem=new PMREMGenerator(renderer),environment=pmrem.fromScene(room,.005);
    scene.environment=environment.texture;scene.environmentIntensity=.7;
    disposeObject(room);pmrem.dispose();
    camera.position.z=8;scene.add(group);scene.add(new AmbientLight(0xffffff,.35));
    const light=new DirectionalLight(0xfff7ed,1.6);light.position.set(-3,6,8);light.castShadow=true;
    light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-2;light.shadow.camera.right=2;
    light.shadow.camera.top=2;light.shadow.camera.bottom=-2;light.shadow.camera.near=.1;light.shadow.camera.far=20;
    light.shadow.normalBias=.008;light.shadow.bias=-.0001;scene.add(light);
    const fill=new DirectionalLight(0xdce8ff,.45);fill.position.set(5,1,3);scene.add(fill);
    const rim=new DirectionalLight(0xffffff,.8);rim.position.set(2,4,-5);scene.add(rim);
    const model=createModel();group.add(model.object);
    let frame:number|null=null;
    const retired:M[]=[];
    const release=(previous:M)=>retired.push(previous);
    // React updates, animation and ResizeObserver can all fire in one frame.
    // Draw their final state once, instead of blocking input with duplicate GPU work.
    const render=()=>{if(waiting.current)return;if(frame===null)frame=requestAnimationFrame(()=>{
      frame=null;if(waiting.current)return;renderer.render(scene,camera);setPainted(true);
      retired.splice(0).forEach(previous=>disposeObject(previous.object));
    });};
    update.current(model);
    group.rotation.set(-orientation.current.x*Math.PI/180,orientation.current.y*Math.PI/180,0,'XYZ');
    const resize=()=>{const {width,height}=el.getBoundingClientRect();if(!width||!height)return;const aspect=width/height;const half=view.current/2;camera.left=-half*Math.max(1,aspect);camera.right=-camera.left;camera.top=half*Math.max(1,1/aspect);camera.bottom=-camera.top;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(width,height,false);render();};
    const models=new Map<string,M>();if(cacheKey)models.set(cacheKey,model);
    const entry={model,factory:createModel,key:cacheKey,models,render,release,resize,orientation:group};current.current=entry;
    const observer=new ResizeObserver(resize);observer.observe(el);resize();
    const lost=(e:Event)=>{e.preventDefault();setError('3D paused. Reload to restore the view.');};renderer.domElement.addEventListener('webglcontextlost',lost);
    return()=>{current.current=null;if(frame!==null)cancelAnimationFrame(frame);retired.forEach(previous=>disposeObject(previous.object));observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);new Set([...entry.models.values(),entry.model]).forEach(owned=>disposeObject(owned.object));environment.dispose();light.shadow.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[]);
  useLayoutEffect(()=>{
    const entry=current.current;if(!entry||loading)return;
    if(cacheKey?entry.key!==cacheKey:entry.factory!==createModel){
      setPainted(false);
      const previous=entry.model;
      const previousKey=entry.key;
      entry.model=(cacheKey&&entry.models.get(cacheKey))||createModel();entry.factory=createModel;entry.key=cacheKey;
      if(cacheKey){
        entry.models.delete(cacheKey);entry.models.set(cacheKey,entry.model);
        if(entry.models.size>12){const oldest=entry.models.keys().next().value!;entry.release(entry.models.get(oldest)!);entry.models.delete(oldest);}
      }
      entry.orientation.remove(previous.object);entry.orientation.add(entry.model.object);
      updateModel(entry.model);entry.render();
      // Render the replacement before releasing old materials, keeping shared shaders warm.
      if(!previousKey)entry.release(previous);
    }else{updateModel(entry.model);entry.render();}
  });
  useLayoutEffect(()=>{current.current?.resize();},[viewSize]);
  useLayoutEffect(()=>{orientation.current=rotation;applyRotation();},[rotation.x,rotation.y]);
  const down=(event:PointerEvent<HTMLDivElement>)=>{if(!interactive||event.button!==0)return;drag.current={x:event.clientX,y:event.clientY,rx:orientation.current.x,ry:orientation.current.y};event.currentTarget.setPointerCapture(event.pointerId);};
  const move=(event:PointerEvent<HTMLDivElement>)=>{if(!drag.current)return;const next={x:Math.max(-90,Math.min(90,drag.current.rx-(event.clientY-drag.current.y)*.5)),y:drag.current.ry+(event.clientX-drag.current.x)*.5};orientation.current=next;applyRotation();onRotationChange?.(next);};
  return <div ref={host} className={`three-viewport ${loading||!painted?"is-loading":""} ${className}`} role="img" aria-label={label} aria-busy={loading||!painted} data-renderer="threejs" data-timer-ignore={interactive||undefined} style={{touchAction:interactive?'none':undefined,cursor:interactive?'grab':undefined,...style}} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>{(loading||!painted)&&!error&&<PuzzlePlaceholder/>}{error&&<span className="three-error" role="alert">{error}</span>}</div>;
}
