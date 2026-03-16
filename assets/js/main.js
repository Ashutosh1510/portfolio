/* ══════════════════════════════════════
   COLOR BENDS — Three.js WebGL shader
   Direct port of the React component
══════════════════════════════════════ */
const FRAG = `

#define MAX_COLORS 8
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
varying vec2 vUv;
void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;
  vec2 rp = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;
  vec2 toward = (uPointer - rp);
  q += toward * uMouseInfluence * 0.2;
  vec3 col = vec3(0.0);
  float a = 1.0;
  if (uColorCount > 0) {
    vec2 s = q;
    vec3 sumCol = vec3(0.0);
    float cover = 0.0;
    for (int i = 0; i < MAX_COLORS; ++i) {
      if (i >= uColorCount) break;
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float m = mix(m0, m1, kMix);
      float w = 1.0 - exp(-6.0 / exp(6.0 * m));
      sumCol += uColors[i] * w;
      cover = max(cover, w);
    }
    col = clamp(sumCol, 0.0, 1.0);
    a = uTransparent > 0 ? cover : 1.0;
  }
  if (uNoise > 0.0001) {
    float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
    col += (n - 0.5) * uNoise;
    col = clamp(col, 0.0, 1.0);
  }
  vec3 rgb = (uTransparent > 0) ? col * a : col;
  gl_FragColor = vec4(rgb, a);
}

`;
const VERT = `
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position,1.0);}
`;

function createColorBends(canvas, opts) {
  const {
    colors = ['#ff5c7a','#8a5cff','#00ffd1'],
    rotation = 0, speed = 0.2, scale = 1,
    frequency = 1, warpStrength = 1,
    mouseInfluence = 1, parallax = 0.5,
    noise = 0.1, transparent = true, autoRotate = 0
  } = opts;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const geo = new THREE.PlaneGeometry(2,2);

  const MAX_COLORS = 8;
  const uColorsArray = Array.from({length:MAX_COLORS},()=>new THREE.Vector3(0,0,0));

  function hexToVec3(hex) {
    const h = hex.replace('#','').trim();
    const v = h.length===3
      ? [parseInt(h[0]+h[0],16),parseInt(h[1]+h[1],16),parseInt(h[2]+h[2],16)]
      : [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
    return new THREE.Vector3(v[0]/255,v[1]/255,v[2]/255);
  }

  const arr = colors.filter(Boolean).slice(0,MAX_COLORS).map(hexToVec3);
  arr.forEach((v,i)=>uColorsArray[i].copy(v));

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uCanvas:       {value: new THREE.Vector2(1,1)},
      uTime:         {value: 0},
      uSpeed:        {value: speed},
      uRot:          {value: new THREE.Vector2(1,0)},
      uColorCount:   {value: arr.length},
      uColors:       {value: uColorsArray},
      uTransparent:  {value: transparent?1:0},
      uScale:        {value: scale},
      uFrequency:    {value: frequency},
      uWarpStrength: {value: warpStrength},
      uPointer:      {value: new THREE.Vector2(0,0)},
      uMouseInfluence:{value: mouseInfluence},
      uParallax:     {value: parallax},
      uNoise:        {value: noise}
    },
    premultipliedAlpha: true,
    transparent: true
  });

  scene.add(new THREE.Mesh(geo,mat));

  const renderer = new THREE.WebGLRenderer({canvas, antialias:false, alpha:true, powerPreference:'high-performance'});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(0x000000, transparent?0:1);

  function resize() {
    const w = canvas.clientWidth||window.innerWidth;
    const h = canvas.clientHeight||window.innerHeight;
    renderer.setSize(w,h,false);
    mat.uniforms.uCanvas.value.set(w,h);
  }
  resize();
  if('ResizeObserver' in window) {
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement||canvas);
  }

  // Mouse tracking
  const ptrTarget = new THREE.Vector2(0,0);
  const ptrCurrent = new THREE.Vector2(0,0);
  const container = canvas.parentElement || document.body;
  container.addEventListener('pointermove', e => {
    const r = container.getBoundingClientRect();
    const x = ((e.clientX-r.left)/(r.width||1))*2-1;
    const y = -(((e.clientY-r.top)/(r.height||1))*2-1);
    ptrTarget.set(x,y);
  });

  const clock = new THREE.Clock();
  let rotAngle = rotation;
  function loop() {
    const dt = clock.getDelta();
    const elapsed = clock.elapsedTime;
    mat.uniforms.uTime.value = elapsed;
    rotAngle += autoRotate * dt;
    const rad = (rotAngle * Math.PI) / 180;
    mat.uniforms.uRot.value.set(Math.cos(rad), Math.sin(rad));
    ptrCurrent.lerp(ptrTarget, Math.min(1, dt*8));
    mat.uniforms.uPointer.value.copy(ptrCurrent);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// — Hero ColorBends: warm pink/violet/teal, low opacity via CSS
createColorBends(document.getElementById('cb-canvas'), {
  colors: ['#ff5c7a','#8a5cff','#00ffd1'],
  rotation: 0, speed: 0.18, scale: 1, frequency: 1,
  warpStrength: 1, mouseInfluence: 1, parallax: 0.5,
  noise: 0.08, transparent: true, autoRotate: 0
});

// — Contact ColorBends: cooler palette
createColorBends(document.getElementById('cb-contact'), {
  colors: ['#00ffd1','#8a5cff','#ff5c7a'],
  rotation: 45, speed: 0.12, scale: 1.2, frequency: 0.8,
  warpStrength: 1.2, mouseInfluence: 0.8, parallax: 0.3,
  noise: 0.06, transparent: true, autoRotate: 3
});

/* ══════════════════════════════════════
   CURSOR
══════════════════════════════════════ */
const CUR=document.getElementById('CUR'),CURF=document.getElementById('CUR_F');
let mx=0,my=0,fx=0,fy=0;
document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;CUR.style.left=mx+'px';CUR.style.top=my+'px'});
(function animF(){fx+=(mx-fx)*.1;fy+=(my-fy)*.1;CURF.style.left=fx+'px';CURF.style.top=fy+'px';requestAnimationFrame(animF)})();

/* ══════════════════════════════════════
   SCROLL PROGRESS + NAV BLUR
══════════════════════════════════════ */
const pbar=document.getElementById('pbar'),tnav=document.getElementById('tnav');
window.addEventListener('scroll',()=>{
  const p=window.scrollY/(document.body.scrollHeight-window.innerHeight)*100;
  pbar.style.width=p+'%';
  tnav.classList.toggle('scrolled',window.scrollY>60);
},{passive:true});

/* ══════════════════════════════════════
   COUNT UP
══════════════════════════════════════ */
function countUp(el){
  const target=+el.dataset.target, suffix=el.dataset.suffix||'';
  let cur=0;const step=target/60;
  const t=setInterval(()=>{
    cur=Math.min(cur+step,target);
    el.textContent=Math.floor(cur)+suffix;
    if(cur>=target){el.textContent=target+suffix;clearInterval(t)}
  },25);
}
const cntObs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){countUp(e.target);cntObs.unobserve(e.target)}})},{threshold:.5});
document.querySelectorAll('.counter').forEach(el=>cntObs.observe(el));

/* ══════════════════════════════════════
   SCROLL REVEAL
══════════════════════════════════════ */
const revObs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in')})},{threshold:.08,rootMargin:'0px 0px -50px 0px'});
document.querySelectorAll('.reveal').forEach(el=>revObs.observe(el));

/* ══════════════════════════════════════
   EXP CARD top-bar
══════════════════════════════════════ */
const cObs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in')})},{threshold:.15});
document.querySelectorAll('.exp-card').forEach(el=>cObs.observe(el));

/* ══════════════════════════════════════
   TILT CARDS
══════════════════════════════════════ */
document.querySelectorAll('.tilt-card').forEach(card=>{
  card.addEventListener('mousemove',e=>{
    const r=card.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width-.5;
    const y=(e.clientY-r.top)/r.height-.5;
    card.style.transform=`perspective(600px) rotateY(${x*12}deg) rotateX(${-y*12}deg) translateZ(6px)`;
  });
  card.addEventListener('mouseleave',()=>{card.style.transform=''});
});

/* ══════════════════════════════════════
   MAGNETIC BUTTONS
══════════════════════════════════════ */
document.querySelectorAll('.mag-btn').forEach(btn=>{
  btn.addEventListener('mousemove',e=>{
    const r=btn.getBoundingClientRect();
    const dx=(e.clientX-r.left-r.width/2)*.28;
    const dy=(e.clientY-r.top-r.height/2)*.28;
    btn.style.transform=`translate(${dx}px,${dy}px)`;
  });
  btn.addEventListener('mouseleave',()=>{btn.style.transform=''});
});

/* ══════════════════════════════════════
   SIDE NAV + TOP NAV ACTIVE
══════════════════════════════════════ */
const sideItems=document.querySelectorAll('.si');
const topLinks=document.querySelectorAll('.nls a');
const snObs=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){
      const id=entry.target.id;
      sideItems.forEach(a=>a.classList.toggle('act',a.dataset.s===id));
      topLinks.forEach(a=>a.classList.toggle('act',a.getAttribute('href')==='#'+id));
    }
  });
},{threshold:.35});
document.querySelectorAll('section[id]').forEach(s=>snObs.observe(s));