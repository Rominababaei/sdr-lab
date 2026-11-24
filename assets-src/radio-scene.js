let THREE;
let OrbitControls;

const stage = document.querySelector('#radio-stage');
const pauseButton = document.querySelector('#radio-pause');
const resetButton = document.querySelector('#radio-reset');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const state = { paused: motionPreference.matches, visible: true, time: .9, frame: 0, lastInteraction: 0 };
let view;

function updatePause() {
  pauseButton.setAttribute('aria-pressed', String(state.paused));
  pauseButton.querySelector('span').textContent = state.paused ? 'پخش حرکت' : 'توقف حرکت';
  pauseButton.querySelector('path').setAttribute('d', state.paused ? 'M7 4 15 10 7 16Z' : 'M7 5v10m6-10v10');
  stage.dataset.motion = state.paused ? 'paused' : 'running';
  view?.invalidate();
}
pauseButton.addEventListener('click', () => { state.paused = !state.paused; updatePause(); });
resetButton.addEventListener('click', () => { state.lastInteraction = performance.now(); view?.reset(); });
motionPreference.addEventListener('change', event => { state.paused = event.matches; updatePause(); });
new IntersectionObserver(entries => { state.visible = entries[0].isIntersecting; }, { threshold: .05 }).observe(stage);

function bindKeyboard(canvas) {
  canvas.addEventListener('keydown', event => {
    const directions = { ArrowLeft: [-.15,0], ArrowRight:[.15,0], ArrowUp:[0,-.1], ArrowDown:[0,.1] };
    if (directions[event.key]) { event.preventDefault(); view.rotate(...directions[event.key]); }
    else if (['+','=','-','_'].includes(event.key)) { event.preventDefault(); view.zoom(event.key === '-' || event.key === '_' ? .9 : 1.1); }
    else if (event.key === 'Home') { event.preventDefault(); view.reset(); }
    else if (event.code === 'Space') { event.preventDefault(); state.paused = !state.paused; updatePause(); }
    else return;
    state.lastInteraction = performance.now();
  });
}
function ready(canvas, kind) {
  stage.setAttribute('aria-busy','false');
  stage.dataset.renderer = kind;
  document.querySelector('#radio-loading').hidden = true;
  stage.classList.add('is-ready');
  pauseButton.disabled=false;resetButton.disabled=false;
  canvas.addEventListener('pointerdown', () => { state.lastInteraction = performance.now(); stage.classList.add('was-dragged'); });
  bindKeyboard(canvas);
  updatePause();
}

function startWebGL(context) {
  const canvas = document.querySelector('#radio-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias:true, alpha:true, powerPreference:'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3,3,2,-2,.1,30);
  const initialPosition = new THREE.Vector3(4.3,3.3,5.5);
  const initialTarget = new THREE.Vector3(0,.4,0);
  camera.position.copy(initialPosition);
  const controls = new OrbitControls(camera,canvas);
  controls.target.copy(initialTarget);
  controls.enableDamping = true;
  controls.dampingFactor = .085;
  controls.enablePan = false;
  controls.minZoom = .72;
  controls.maxZoom = 1.85;
  controls.minPolarAngle = .36;
  controls.maxPolarAngle = Math.PI * .47;
  controls.rotateSpeed = .7;
  controls.zoomSpeed = .65;
  controls.cursorStyle = 'grab';
  controls.update();
  controls.saveState();
  scene.add(new THREE.HemisphereLight(0xf2fbff,0x637c8e,2.5));
  const key = new THREE.DirectionalLight(0xfff8ef,4.2);
  key.position.set(-3,7,5);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.left=-4;key.shadow.camera.right=4;
  key.shadow.camera.top=4;key.shadow.camera.bottom=-4;
  key.shadow.normalBias=.025;key.shadow.bias=-.0002;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8de2e1,2.4);fill.position.set(4,2,-3);scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff,2);rim.position.set(-3,1,-5);scene.add(rim);
  const object = new THREE.Group();scene.add(object);
  const materials = {
    board:new THREE.MeshStandardMaterial({color:0x12485a,roughness:.46,metalness:.25}),
    navy:new THREE.MeshStandardMaterial({color:0x162e44,roughness:.55,metalness:.18}),
    black:new THREE.MeshStandardMaterial({color:0x172b38,roughness:.78}),
    silver:new THREE.MeshStandardMaterial({color:0xc7d7de,roughness:.26,metalness:.78}),
    gold:new THREE.MeshStandardMaterial({color:0xb29453,roughness:.3,metalness:.8}),
    teal:new THREE.MeshStandardMaterial({color:0x159c98,roughness:.32,metalness:.2,emissive:0x08766d,emissiveIntensity:.18}),
    blue:new THREE.MeshStandardMaterial({color:0x467b9c,roughness:.32,metalness:.2,emissive:0x426983,emissiveIntensity:.14}),
    ceramic:new THREE.MeshStandardMaterial({color:0xd5c9b1,roughness:.65}),
    stage:new THREE.MeshStandardMaterial({color:0xd7e4eb,roughness:.85}),
  };
  function mesh(geometry, material, position, parent=object) {
    const item = new THREE.Mesh(geometry,material);
    item.position.set(...position);item.castShadow=true;item.receiveShadow=true;
    parent.add(item);return item;
  }
  function box(w,h,d,position,material,parent=object) {return mesh(new THREE.BoxGeometry(w,h,d),material,position,parent);}
  function roundedPlate(w,d,h,r,material,position,parent=object) {
    const shape=new THREE.Shape();const x=-w/2,y=-d/2;
    shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);
    shape.lineTo(x+w,y+d-r);shape.quadraticCurveTo(x+w,y+d,x+w-r,y+d);
    shape.lineTo(x+r,y+d);shape.quadraticCurveTo(x,y+d,x,y+d-r);
    shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
    const geometry = new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.015,bevelThickness:.015,curveSegments:10});
    const plate=mesh(geometry,material,position,parent);plate.rotation.x=-Math.PI/2;return plate;
  }
  const ground = mesh(new THREE.PlaneGeometry(20,20),new THREE.ShadowMaterial({opacity:.09}),[0,-.86,0],scene);
  ground.rotation.x=-Math.PI/2;ground.castShadow=false;
  const plinth = mesh(new THREE.CylinderGeometry(1.93,1.99,.15,96),materials.stage,[0,-.65,0]);
  const plinthRim = mesh(new THREE.TorusGeometry(1.94,.018,8,96),materials.silver,[0,-.57,0]);
  plinthRim.rotation.x=Math.PI/2;
  const grid = new THREE.GridHelper(2.65,16,0x9cb8c7,0xbbcfd9);
  grid.position.y=-.567;grid.material.transparent=true;grid.material.opacity=.28;object.add(grid);
  const board = new THREE.Group();board.rotation.y=-.14;object.add(board);
  // An illustrative SDR board, rather than a replica of a particular device.
  roundedPlate(2.5,1.58,.13,.13,materials.board,[0,-.17,0],board);
  for (const x of [-1.07,1.07]) for(const z of [-.62,.62]) {
    mesh(new THREE.CylinderGeometry(.045,.045,.035,16),materials.silver,[x,.002,z],board);
    box(.035,.003,.007,[x,.021,z],materials.navy,board);
    box(.007,.003,.035,[x,.021,z],materials.navy,board);
  }
  // The board silkscreen and circuit traces use a local, generated texture.
  const surface=document.createElement('canvas');surface.width=1024;surface.height=640;
  const paint=surface.getContext('2d');paint.fillStyle='#164a5d';paint.fillRect(0,0,1024,640);
  paint.strokeStyle='#468b91';paint.lineWidth=3;
  const tracePaths=[[[75,170],[210,170],[270,230],[380,230]],[[75,470],[200,470],[280,390],[380,390]],[[950,160],[780,160],[720,230],[640,230]],[[950,490],[805,490],[720,390],[640,390]],[[290,80],[290,140],[390,140],[430,220]],[[710,80],[710,150],[630,150],[590,220]],[[350,570],[350,490],[430,490],[430,410]],[[680,565],[680,470],[590,470],[590,410]]];
  for(const path of tracePaths){paint.beginPath();path.forEach(([x,y],i)=>i?paint.lineTo(x,y):paint.moveTo(x,y));paint.stroke();for(const [x,y]of[path[0],path.at(-1)]){paint.fillStyle='#b9a566';paint.beginPath();paint.arc(x,y,5,0,Math.PI*2);paint.fill();}}
  paint.strokeStyle='#2b6577';paint.lineWidth=1;paint.strokeRect(28,28,968,584);
  paint.fillStyle='#b0d1d8';paint.font='600 26px monospace';paint.fillText('SDR LAB',45,590);
  paint.font='18px monospace';paint.fillText('RX',54,96);paint.fillText('TX',910,96);paint.fillText('I + jQ',785,590);
  const surfaceTexture=new THREE.CanvasTexture(surface);surfaceTexture.colorSpace=THREE.SRGBColorSpace;
  const top=mesh(new THREE.PlaneGeometry(2.42,1.5),new THREE.MeshStandardMaterial({map:surfaceTexture,roughness:.7,metalness:.1}),[0,-.017,0],board);
  top.rotation.x=-Math.PI/2;top.castShadow=false;
  roundedPlate(1.02,.74,.13,.04,materials.navy,[.02,.01,0],board);
  roundedPlate(.88,.60,.025,.025,materials.silver,[.02,.153,0],board);
  const label=document.createElement('canvas');label.width=512;label.height=256;
  const labelPaint=label.getContext('2d');labelPaint.fillStyle='#d9e5e8';labelPaint.fillRect(0,0,512,256);
  labelPaint.fillStyle='#25495d';labelPaint.textAlign='center';labelPaint.font='700 110px monospace';labelPaint.fillText('SDR',256,142);
  labelPaint.fillStyle='#527783';labelPaint.font='18px monospace';labelPaint.fillText('SOFTWARE DEFINED RADIO',256,192);
  const labelTexture=new THREE.CanvasTexture(label);labelTexture.colorSpace=THREE.SRGBColorSpace;
  const chipLabel=mesh(new THREE.PlaneGeometry(.81,.46),new THREE.MeshStandardMaterial({map:labelTexture,roughness:.45,metalness:.25}),[.02,.196,0],board);
  chipLabel.rotation.x=-Math.PI/2;chipLabel.castShadow=false;
  const pins=new THREE.InstancedMesh(new THREE.BoxGeometry(.036,.035,.105),materials.gold,32);
  const dummy=new THREE.Object3D();let pin=0;
  for(let side=0;side<4;side++)for(let i=0;i<8;i++){
    const along=(i-3.5)*.105;
    dummy.position.set(side%2===0?along+.02:(side===1?.56:-.52),.047,side%2===0?(side===0?.415:-.415):along*.73);
    dummy.rotation.y=side%2?Math.PI/2:0;dummy.updateMatrix();pins.setMatrixAt(pin++,dummy.matrix);
  }
  pins.castShadow=true;board.add(pins);
  for(const [x,z]of[[-.8,.23],[-.82,-.16],[.85,.25],[.8,-.21]]) {
    box(.22,.11,.14,[x,.046,z],materials.black,board);
    box(.06,.025,.1,[x+.15,.018,z],materials.ceramic,board);
    box(.055,.018,.08,[x-.15,.014,z],materials.silver,board);
  }
  box(.49,.19,.24,[.45,-.015,.81],materials.silver,board);
  box(.37,.1,.012,[.45,-.012,.937],materials.black,board);
  box(.26,.025,.016,[.45,-.018,.946],materials.teal,board);
  const sma=mesh(new THREE.CylinderGeometry(.075,.075,.24,12),materials.gold,[-.77,.015,.84],board);sma.rotation.x=Math.PI/2;
  const smaHole=mesh(new THREE.CylinderGeometry(.039,.039,.014,16),materials.black,[-.77,.015,.966],board);smaHole.rotation.x=Math.PI/2;
  const ledMaterial=new THREE.MeshStandardMaterial({color:0x72dfb3,emissive:0x39b783,emissiveIntensity:1.3,roughness:.2});
  const led=mesh(new THREE.SphereGeometry(.035,16,12),ledMaterial,[1.08,.03,.37],board);
  const emitters=[];
  for(const side of [-1,1]) {
    const antenna=new THREE.Group();antenna.position.set(side*1.01,-.01,-.49);antenna.rotation.z=-side*.095;board.add(antenna);
    mesh(new THREE.CylinderGeometry(.085,.085,.12,8),materials.gold,[0,.07,0],antenna);
    mesh(new THREE.CylinderGeometry(.052,.052,.17,16),materials.gold,[0,.2,0],antenna);
    mesh(new THREE.CylinderGeometry(.065,.075,.20,20),materials.black,[0,.36,0],antenna);
    mesh(new THREE.CylinderGeometry(.033,.052,.88,20),materials.black,[0,.88,0],antenna);
    mesh(new THREE.SphereGeometry(.033,16,12),materials.black,[0,1.32,0],antenna);
    const antennaBand=mesh(new THREE.CylinderGeometry(.056,.056,.035,20),materials.silver,[0,.47,0],antenna);
    emitters.push(new THREE.Vector3(side*1.01+side*.125,1.31,-.49));
  }
  const fronts=[];
  for(let side=0;side<2;side++)for(let i=0;i<3;i++) {
    const waveGroup=new THREE.Group();waveGroup.position.copy(emitters[side]);board.add(waveGroup);
    const material=new THREE.MeshBasicMaterial({color:side?0x729cb8:0x139b99,transparent:true,opacity:.6,depthWrite:false});
    const front=mesh(new THREE.TorusGeometry(1,.009,5,72),material,[0,0,0],waveGroup);front.castShadow=false;front.receiveShadow=false;
    const cross=mesh(new THREE.TorusGeometry(1,.006,5,72),material,[0,0,0],waveGroup);cross.rotation.y=Math.PI/2;cross.castShadow=false;cross.receiveShadow=false;
    fronts.push({group:waveGroup,material,offset:i/3+side*.15});
  }
  function makeWave(material,quadrature) {
    const segments=100,radial=6;
    const positions=new Float32Array((segments+1)*(radial+1)*3);
    const normals=new Float32Array(positions.length);
    const indices=[];
    for(let i=0;i<segments;i++)for(let j=0;j<radial;j++) {
      const a=i*(radial+1)+j,b=a+radial+1;indices.push(a,b,a+1,b,b+1,a+1);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(indices);
    const wave=mesh(geometry,material,[0,0,0],board);wave.frustumCulled=false;wave.castShadow=false;
    return {geometry,quadrature,segments,radial,positions,normals};
  }
  const waves=[makeWave(materials.teal,false),makeWave(materials.blue,true)];
  const beads=new THREE.InstancedMesh(new THREE.SphereGeometry(.032,10,8),materials.teal,10);board.add(beads);beads.castShadow=false;
  const dot=new THREE.Object3D();
  function updateWaves(time) {
    for(const item of waves) {
      const {positions,normals,segments,radial,quadrature}=item;
      for(let i=0;i<=segments;i++) {
        const x=-1.08+2.16*i/segments,phase=i/segments*Math.PI*4-time*3.3;
        const s=Math.sin(phase),c=Math.cos(phase),slope=(quadrature?-s:c)*.23*Math.PI*4/2.16;
        const norm=1/Math.hypot(slope,1);
        for(let j=0;j<=radial;j++) {
          const angle=j/radial*Math.PI*2,ca=Math.cos(angle),sa=Math.sin(angle),k=(i*(radial+1)+j)*3;
          const nx=-slope*norm*ca,ny=quadrature?sa:norm*ca,nz=quadrature?norm*ca:sa;
          positions[k]=x+nx*.012;positions[k+1]=1.03+(quadrature?0:.23*s)+ny*.012;positions[k+2]=.18+(quadrature?.23*c:0)+nz*.012;
          normals[k]=nx;normals[k+1]=ny;normals[k+2]=nz;
        }
      }
      item.geometry.attributes.position.needsUpdate=true;item.geometry.attributes.normal.needsUpdate=true;
    }
    for(let i=0;i<10;i++) {
      const u=(i/10+time*.11)%1,phase=u*Math.PI*4-time*3.3;
      dot.position.set(-1.08+2.16*u,1.03+.23*Math.sin(phase),.18+.23*Math.cos(phase));
      const pulse=.75+.25*Math.sin(time*3+i);dot.scale.setScalar(pulse);dot.updateMatrix();beads.setMatrixAt(i,dot.matrix);
    }
    beads.instanceMatrix.needsUpdate=true;
    for(const front of fronts) {
      const progress=(time*.72+front.offset)%1;
      front.group.scale.setScalar(.12+progress*.72);
      front.material.opacity=(1-progress)*.48;
    }
    board.position.y=.035*Math.sin(time*.9);
    led.material.emissiveIntensity=.9+.55*(.5+.5*Math.sin(time*4));
  }
  let dirty=true,dragging=false;
  controls.addEventListener('start',()=>{dragging=true;state.lastInteraction=performance.now();dirty=true;});
  controls.addEventListener('end',()=>{dragging=false;state.lastInteraction=performance.now();dirty=true;});
  controls.addEventListener('change',()=>{dirty=true;stage.dataset.rotation=controls.getAzimuthalAngle().toFixed(3);});
  function resize() {
    const {width,height}=stage.getBoundingClientRect();if(!width||!height)return;
    const aspect=width/height,vertical=3.55*Math.max(1,1.27/aspect);
    camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;camera.top=vertical/2;camera.bottom=-vertical/2;
    camera.updateProjectionMatrix();renderer.setSize(width,height,false);dirty=true;
  }
  new ResizeObserver(resize).observe(stage);resize();
  let last=performance.now(),lastDraw=0,lastMark=0;
  function animate(now) {
    requestAnimationFrame(animate);
    const delta=Math.min(.07,(now-last)/1000);last=now;
    if(!state.visible||document.hidden)return;
    if(!state.paused)state.time+=delta;
    controls.autoRotate=!state.paused&&!dragging&&now-state.lastInteraction>7000;
    controls.autoRotateSpeed=.32;
    controls.update(delta);
    if(now-lastDraw<1000/30)return;
    if(!state.paused||dirty) {
      lastDraw=now;updateWaves(state.time);renderer.render(scene,camera);dirty=false;
      if(!state.paused)state.frame++;
      if(now-lastMark>250){stage.dataset.phase=state.time.toFixed(2);stage.dataset.frame=String(state.frame);lastMark=now;}
    }
  }
  updateWaves(state.time);renderer.render(scene,camera);requestAnimationFrame(animate);
  view={
    invalidate(){dirty=true;},
    reset(){controls.reset();camera.zoom=1;camera.updateProjectionMatrix();dirty=true;},
    zoom(factor){camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,controls.minZoom,controls.maxZoom);camera.updateProjectionMatrix();dirty=true;},
    rotate(dx,dy){const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);spherical.theta+=dx;spherical.phi=THREE.MathUtils.clamp(spherical.phi+dy,controls.minPolarAngle,controls.maxPolarAngle);camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target));controls.update();dirty=true;}
  };
  ready(canvas,'webgl');
}

// A perspective canvas illustration remains interactive when WebGL is disabled.
function startCanvasScene() {
  const oldCanvas=document.querySelector('#radio-canvas');
  const canvas=oldCanvas.cloneNode(false);oldCanvas.replaceWith(canvas);
  const ctx=canvas.getContext('2d');
  let yaw=-.52,pitch=.52,zoom=1,dragging=false,origin=null,dirty=true,pinchDistance=null;
  const pointers=new Map();
  function project([x,y,z]) {
    const c=Math.cos(yaw),s=Math.sin(yaw),xx=x*c+z*s,zz=-x*s+z*c;
    const yy=y*Math.cos(pitch)-zz*Math.sin(pitch),depth=y*Math.sin(pitch)+zz*Math.cos(pitch);
    const scale=Math.min(canvas.width/4.9,canvas.height/3.6)*zoom*(6/(6+depth));
    return [canvas.width*.5+xx*scale,canvas.height*.57-yy*scale,depth];
  }
  function path(points,colour,width=2,fill=false) {
    ctx.beginPath();points.map(project).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    if(fill){ctx.closePath();ctx.fillStyle=colour;ctx.fill();}else{ctx.strokeStyle=colour;ctx.lineWidth=width;ctx.stroke();}
  }
  function cuboid(x,y,z,w,h,d,colours) {
    const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],d0=[x-w/2,y,z+d/2];
    const upper=p=>[p[0],p[1]+h,p[2]];
    path([a,b,upper(b),upper(a)],colours[1],1,true);path([b,c,upper(c),upper(b)],colours[2],1,true);
    path([c,d0,upper(d0),upper(c)],colours[1],1,true);path([d0,a,upper(a),upper(d0)],colours[2],1,true);
    path([upper(a),upper(b),upper(c),upper(d0)],colours[0],1,true);
  }
  function draw() {
    const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
    ctx.save();
    const shadow=ctx.createRadialGradient(w*.5,h*.72,0,w*.5,h*.72,w*.35);shadow.addColorStop(0,'#183c5422');shadow.addColorStop(1,'#183c5400');ctx.fillStyle=shadow;ctx.fillRect(0,0,w,h);
    const ring=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*2;ring.push([Math.cos(a)*1.94,-.56,Math.sin(a)*1.94]);}path(ring,'#d5e2ea',1,true);path(ring,'#a3bfce',1.5);
    ctx.save();ctx.clip();
    for(let i=-5;i<=5;i++){const x=i*.3;path([[x,-.55,-1.5],[x,-.55,1.5]],'#c0d3dc',.6);path([[-1.5,-.55,x],[1.5,-.55,x]],'#c0d3dc',.6);}
    ctx.restore();
    cuboid(0,-.14,0,2.5,.14,1.6,['#22586a','#123b52','#1b465c']);
    for(const side of[-1,1])for(const z of[-.43,-.18,.2,.45])path([[side*1.12,.005,z],[side*.71,.005,z],[side*.51,.005,z*.65]],'#49939b',1.2*devicePixelRatio);
    for(const x of[-1,1]){cuboid(x,0,-.5,.12,.25,.12,['#bfaa72','#967738','#b59450']);path([[x,.25,-.5],[x*1.12,1.34,-.5]],'#1c3444',7*devicePixelRatio);}
    for(const x of[-.8,.8])for(const z of[-.2,.25])cuboid(x,.01,z,.22,.1,.14,['#2c4250','#162d3a','#203a4b']);
    for(let i=0;i<8;i++)for(const side of[-1,1]){const x=(i-3.5)*.105;path([[x,.03,side*.29],[x,.03,side*.44]],'#b7a062',2.5*devicePixelRatio);path([[side*.44,.03,x*.7],[side*.57,.03,x*.7]],'#b7a062',2.5*devicePixelRatio);}
    cuboid(0,.015,0,1,.18,.72,['#bfcfd7','#8ca4b2','#a0b7c2']);
    const la=project([-.42,.2,-.27]),lb=project([.42,.2,-.27]),lc=project([-.42,.2,.27]);
    ctx.save();ctx.transform((lb[0]-la[0])/512,(lb[1]-la[1])/512,(lc[0]-la[0])/256,(lc[1]-la[1])/256,la[0],la[1]);
    ctx.fillStyle='#244758';ctx.font='bold 110px monospace';ctx.textAlign='center';ctx.fillText('SDR',256,150);ctx.font='18px monospace';ctx.fillStyle='#658491';ctx.fillText('SOFTWARE DEFINED RADIO',256,202);ctx.restore();
    cuboid(.45,-.02,.84,.48,.19,.24,['#d8e2e7','#809ba9','#afc3ce']);
    path([[.27,.02,.968],[.63,.02,.968],[.63,.1,.968],[.27,.1,.968]],'#234153',1,true);
    const light=project([1.05,.03,.42]);ctx.beginPath();ctx.arc(light[0],light[1],2.5*devicePixelRatio,0,Math.PI*2);ctx.fillStyle=`rgba(79,195,160,${.7+.3*Math.sin(state.time*4)})`;ctx.fill();
    for(const side of[-1,1])for(let i=0;i<3;i++) {
      const t=(state.time*.72+i/3)%1,r=.1+t*.7,points=[];
      for(let j=0;j<=80;j++){const a=j/80*Math.PI*2;points.push([side*1.12+r*Math.cos(a),1.34+r*Math.sin(a),-.5]);}
      path(points,`rgba(${side<0?'20,151,148':'84,133,164'},${(1-t)*.6})`,1.5*devicePixelRatio);
    }
    for(let wave=0;wave<2;wave++) {
      const points=[];for(let i=0;i<=120;i++){const u=i/120,a=u*Math.PI*4-state.time*3.3;points.push([-1.08+2.16*u,1.03+(wave?0:.23*Math.sin(a)),.18+(wave?.23*Math.cos(a):0)]);}
      path(points,wave?'#5986a5':'#159b96',2.5*devicePixelRatio);
    }
    for(let i=0;i<8;i++){const u=(i/8+state.time*.11)%1,phase=u*Math.PI*4-state.time*3.3,point=project([-1.08+2.16*u,1.03+.23*Math.sin(phase),.18+.23*Math.cos(phase)]);ctx.beginPath();ctx.arc(point[0],point[1],2.1*devicePixelRatio,0,Math.PI*2);ctx.fillStyle=i%2?'#6c9bb2':'#1b9c98';ctx.fill();}
    ctx.restore();
  }
  function resize(){const r=stage.getBoundingClientRect(),ratio=Math.min(devicePixelRatio,1.65);canvas.width=r.width*ratio;canvas.height=r.height*ratio;dirty=true;}
  new ResizeObserver(resize).observe(stage);resize();
  canvas.addEventListener('pointerdown',event=>{dragging=true;origin=[event.clientX,event.clientY];pointers.set(event.pointerId,origin);canvas.setPointerCapture(event.pointerId);if(pointers.size===2){const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
  canvas.addEventListener('pointermove',event=>{if(!dragging)return;pointers.set(event.pointerId,[event.clientX,event.clientY]);if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinchDistance>0)zoom=Math.max(.72,Math.min(1.85,zoom*distance/pinchDistance));pinchDistance=distance;}else{yaw+=(event.clientX-origin[0])*.008;pitch=Math.max(.15,Math.min(1.15,pitch+(event.clientY-origin[1])*.006));}origin=[event.clientX,event.clientY];dirty=true;stage.dataset.rotation=yaw.toFixed(3);});
  const release=event=>{pointers.delete(event.pointerId);dragging=pointers.size>0;pinchDistance=null;if(dragging)origin=[...pointers.values()][0];};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=Math.max(.72,Math.min(1.85,zoom*Math.exp(-event.deltaY*.001)));dirty=true;},{passive:false});
  let last=performance.now(),lastDraw=0;
  function animate(now){requestAnimationFrame(animate);const delta=Math.min(.07,(now-last)/1000);last=now;if(!state.visible||document.hidden)return;if(!state.paused)state.time+=delta;if(now-lastDraw<1000/30)return;if(!state.paused||dirty){draw();lastDraw=now;dirty=false;state.frame++;stage.dataset.phase=state.time.toFixed(2);}}
  view={invalidate(){dirty=true;},reset(){yaw=-.52;pitch=.52;zoom=1;stage.dataset.rotation=yaw.toFixed(3);dirty=true;},rotate(dx,dy){yaw+=dx;pitch=Math.max(.15,Math.min(1.15,pitch+dy));stage.dataset.rotation=yaw.toFixed(3);dirty=true;},zoom(factor){zoom=Math.max(.72,Math.min(1.85,zoom*factor));dirty=true;}};
  draw();requestAnimationFrame(animate);ready(canvas,'canvas');
}

async function start() {
  const canvas=document.querySelector('#radio-canvas');
  let context=null;
  try { context=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'low-power'}); } catch { /* Canvas projection remains available. */ }
  if(!context){startCanvasScene();return;}
  try {
    const [engine,orbit]=await Promise.all([import('./vendor/three/three.module.js'),import('./vendor/three/OrbitControls.js')]);
    THREE=engine;OrbitControls=orbit.OrbitControls;startWebGL(context);
  } catch(error) { console.warn('Using the canvas radio illustration.',error);startCanvasScene(); }
}
start();
