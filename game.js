(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.querySelector('#score');
  const bestEl = document.querySelector('#best');
  const finalScoreEl = document.querySelector('#finalScore');
  const finalBestEl = document.querySelector('#finalBest');
  const nextNameEl = document.querySelector('#nextName');
  const overlay = document.querySelector('#gameOver');
  const soundBtn = document.querySelector('#soundBtn');
  const W = canvas.width, H = canvas.height;
  const dangerY = 135;
  const names = ['小奶蛙','奶泡蛙','奶糖蛙','奶萌蛙','奶团蛙','奶星蛙','奶云蛙','奶月蛙','奶王蛙','半神奶蛙','神奶蛙'];
  const colors = ['#f9cf67','#f6b9ae','#a7d8f0','#f3a1ba','#c9a8ee','#86d1b0','#9bd5df','#f8c873','#f19783','#b9a5f6','#ffbf59'];
  const imageNames = ['01-grape','02-cherry','03-orange','04-lemon','05-kiwi','06-tomato','07-peach','08-pineapple','09-coconut','10-halfmelon','11-watermelon'];
  // 贴图随网页包一起发布，朋友打开链接时无需访问 GitHub Raw。
  const imageUrls = imageNames.map(n => `${n}.webp`);
  const images = imageUrls.map(src => { const img = new Image(); img.src = src; img.decoding = 'async'; return img; });
  const radii = [17, 22, 27, 33, 40, 48, 57, 68, 80, 94, 112];
  const spawnWeights = [0.31, 0.27, 0.21, 0.14, 0.07];
  let balls = [], score = 0, best = Number(localStorage.getItem('heNaiwa.best') || 0), highestLevel = 0, dangerTimer = 0, drops = 0;
  let nextLevel = 0, current = null, gameOver = false, aimingX = W / 2, last = 0, audioOn = true;
  let overTimer = 0, particles = [], audioCtx = null;
  bestEl.textContent = best;

  function randomLevel() {
    // 开局先保证最初级奶蛙，给玩家熟悉落点和合成节奏的空间。
    if(drops<6)return 0;
    const r = Math.random(); let n=0, sum=0;
    for (let i=0;i<spawnWeights.length;i++){sum+=spawnWeights[i]; if(r<sum){n=i;break;}}
    // 进度越高，后续掉落的最低等级越高，但最多只追到当前最高等级前四级。
    const floor=clamp(highestLevel-4,0,6);
    return clamp(Math.max(n,floor),0,8);
  }
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function setScore(v){ score=v; scoreEl.textContent=v; if(v>best){best=v; bestEl.textContent=v; localStorage.setItem('heNaiwa.best', v);} }
  function makeBaby(level, x, y, vx=0, vy=0){ return {level,x,y,vx,vy,r:radii[level],dead:false,age:0,rest:0,angle:(Math.random()-.5)*.08,angularVelocity:0,sleeping:false,touched:false,squash:0,pop:.22}; }
  function reset(){ balls=[]; particles=[]; highestLevel=0; dangerTimer=0; drops=0; setScore(0); gameOver=false; overlay.classList.add('hidden'); nextLevel=0; current=null; spawnPreview(); }
  function spawnPreview(){ current={level:nextLevel}; drops++; nextLevel=randomLevel(); nextNameEl.textContent=names[nextLevel]; }
  function drawBackground(){
    const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#fffaf0'); g.addColorStop(1,'#fff0d5'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(188,144,111,.28)'; ctx.setLineDash([8,7]); ctx.beginPath(); ctx.moveTo(0,dangerY); ctx.lineTo(W,dangerY); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='rgba(188,144,111,.68)'; ctx.font='12px ui-rounded, sans-serif'; ctx.fillText('警戒线', W-48, dangerY-8);
  }
  function drawBaby(b, ghost=false){
    const r=b.r, x=b.x, y=b.y, img=images[b.level];
    const squash=b.squash||0, pop=b.pop||0;
    const fallStretch=clamp((b.vy||0)/5200,0,.09);
    const scaleX=(1+squash*.58-fallStretch*.38)*(1+pop*.42);
    const scaleY=(1-squash*.42+fallStretch)*(1+pop*.42);
    ctx.save(); ctx.translate(x,y); ctx.rotate(b.angle||0); ctx.scale(scaleX,scaleY); ctx.globalAlpha=ghost?0.48:1;
    // 柔和贴地阴影让奶蛙更像有弹性的软糖，离地越高阴影越淡。
    if(!ghost){
      const altitude=Math.max(0,H-(y+r));
      const shadow=clamp(1-altitude/430,.22,.78);
      ctx.save(); ctx.rotate(-(b.angle||0)); ctx.globalAlpha=shadow*.22;
      ctx.fillStyle='#9b6b4d'; ctx.beginPath(); ctx.ellipse(0,r*.88,r*.72*shadow,r*.16*shadow,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    if(img.complete && img.naturalWidth){ ctx.drawImage(img,-r*1.09,-r*1.09,r*2.18,r*2.18); }
    else {
      // 图片加载中时保持透明，避免出现蛋状或奶瓶占位图。
      ctx.globalAlpha = 0;
    }
    ctx.restore();
  }
  function drawNext(){ const r=Math.max(12,radii[nextLevel]*.58); const b={level:nextLevel,r,x:W-34,y:38,angle:0}; ctx.save(); ctx.globalAlpha=.8; drawBaby(b); ctx.restore(); }
  function drawAim(){ if(!current || gameOver)return; ctx.strokeStyle='rgba(185,144,112,.35)'; ctx.setLineDash([5,7]); ctx.beginPath(); ctx.moveTo(aimingX, current.level ? 35 : 32); ctx.lineTo(aimingX, H); ctx.stroke(); ctx.setLineDash([]); drawBaby({level:current.level,r:radii[current.level],x:aimingX,y:40,angle:0},true); }
  function drawParticles(){ for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/650);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();} ctx.globalAlpha=1; }
  function updateParticles(dt){ particles=particles.filter(p=>p.life>0); for(const p of particles){p.life-=dt;p.x+=p.vx*dt/1000;p.y+=p.vy*dt/1000;p.vy+=540*dt/1000;} }
  function addBurst(x,y,level){for(let i=0;i<15;i++){const a=Math.random()*Math.PI*2,s=50+Math.random()*130;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,life:550+Math.random()*300,size:2+Math.random()*3,color:colors[level]});}}
  function merge(a,b){
    if(a.dead||b.dead)return;
    const level=a.level+1,x=(a.x+b.x)/2,y=(a.y+b.y)/2;
    highestLevel=Math.max(highestLevel,level);
    a.dead=true;b.dead=true;
    if(level<radii.length){
      const child=makeBaby(level,x,y,(a.vx+b.vx)/2,(a.vy+b.vy)/2-45);
      child.angularVelocity=(a.angularVelocity+b.angularVelocity)*.18;
      balls.push(child);
      setScore(score+(level+1)*(level+1));
      addBurst(x,y,level);beep(level);
      // 合成出高级奶蛙后，立即抬高下一颗的保底等级。
      nextLevel=Math.max(nextLevel,clamp(highestLevel-4,0,8));
    }else{
      setScore(score+500);addBurst(x,y,level-1);beep(level);
    }
  }
  function wake(b){ b.sleeping=false; b.rest=0; }
  function keepInside(b){
    const left=b.r,right=W-b.r,top=b.r,bottom=H-b.r;
    if(b.x<left){b.x=left;if(b.vx<0)b.vx=0;}
    if(b.x>right){b.x=right;if(b.vx>0)b.vx=0;}
    if(b.y<top){b.y=top;if(b.vy<0)b.vy=0;}
    if(b.y>bottom){b.y=bottom;if(b.vy>0)b.vy=0;}
  }
  function physics(dt){
    const step=Math.min(dt,24)/1000;
    // 先积分自由运动。睡着的奶蛙不再被重力反复推入地面，避免满屏抖动。
    for(const b of balls){
      b.touched=false;
      if(b.sleeping) continue;
      b.vy+=1550*step;
      b.x+=b.vx*step;
      b.y+=b.vy*step;
      b.angle+=b.angularVelocity*step;
      b.angularVelocity += (-b.angle*2.8-b.angularVelocity*.8)*step;
      if(b.x-b.r<0){b.x=b.r; b.vx=Math.abs(b.vx)*.22; b.angularVelocity*=.65; b.squash=Math.max(b.squash,.10); b.touched=true;}
      if(b.x+b.r>W){b.x=W-b.r; b.vx=-Math.abs(b.vx)*.22; b.angularVelocity*=.65; b.squash=Math.max(b.squash,.10); b.touched=true;}
      if(b.y+b.r>H){
        b.y=H-b.r;
        const impact=Math.abs(b.vy);
        if(impact>48) b.squash=Math.max(b.squash,clamp(impact/1500,.08,.30));
        b.vy=impact>48 ? -impact*.16 : 0;
        b.vx*=.84;
        b.angularVelocity*=.45;
        b.touched=true;
      }
    }
    // 多次接触求解：按半径近似质量，碰撞后只保留很小的回弹，手感更像软胶体。
    for(let pass=0;pass<4;pass++){
      const count=balls.length;
      for(let i=0;i<count;i++){
        for(let j=i+1;j<count;j++){
          const a=balls[i],b=balls[j];
          if(a.dead||b.dead)continue;
          const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001,min=a.r+b.r;
          if(d>=min)continue;
          if(a.level===b.level && d<min+1.4){merge(a,b);continue;}
          const nx=dx/d,ny=dy/d,over=min-d;
          // 已经稳定在底层的奶蛙承担更多支撑作用，避免被上方堆积物推出边界。
          const invA=(a.sleeping?.12:1)/(a.r*a.r),invB=(b.sleeping?.12:1)/(b.r*b.r),invSum=invA+invB;
          // 较慢的软分离，允许贴图有轻微形变和压扁感，不像硬球瞬间弹开。
          a.x-=nx*over*.52*invA/invSum; a.y-=ny*over*.52*invA/invSum;
          b.x+=nx*over*.52*invB/invSum; b.y+=ny*over*.52*invB/invSum;
          a.touched=b.touched=true;
          const rvx=b.vx-a.vx,rvy=b.vy-a.vy,normalVelocity=rvx*nx+rvy*ny;
          if(normalVelocity<-8){
            const impact=Math.abs(normalVelocity), squash=clamp(impact/1500,.06,.23);
            a.squash=Math.max(a.squash,squash); b.squash=Math.max(b.squash,squash);
            if(impact>24){wake(a);wake(b);}
            const restitution=.025+clamp(impact/2400,0,.07);
            const impulse=-(1+restitution)*normalVelocity/invSum;
            a.vx-=nx*impulse*invA; a.vy-=ny*impulse*invA;
            b.vx+=nx*impulse*invB; b.vy+=ny*impulse*invB;
            const tx=-ny,ty=nx,tangentVelocity=rvx*tx+rvy*ty;
            const friction=clamp(-tangentVelocity/invSum,-impulse*.18,impulse*.18);
            a.vx-=tx*friction*invA; a.vy-=ty*friction*invA;
            b.vx+=tx*friction*invB; b.vy+=ty*friction*invB;
            a.angularVelocity-=friction*invA*.012; b.angularVelocity+=friction*invB*.012;
          }
        }
      }
      for(const b of balls)keepInside(b);
    }
    balls=balls.filter(b=>!b.dead);
    let dangerCandidate=false;
    for(const b of balls){
      b.age+=dt;
      keepInside(b);
      const speed=Math.hypot(b.vx,b.vy);
      // 新掉落的奶蛙有短暂缓冲；缓冲后只要顶部越过警戒线，就稳定计入结束判定。
      if(b.age>650 && b.y-b.r<=dangerY) dangerCandidate=true;
      if(b.touched && Math.hypot(b.vx,b.vy)<20 && Math.abs(b.angularVelocity)<.08)b.sleepTimer=(b.sleepTimer||0)+dt; else b.sleepTimer=0;
      if(b.sleepTimer>360){b.sleeping=true;b.vx=0;b.vy=0;b.angularVelocity=0;b.squash=0;}
    }
    dangerTimer=dangerCandidate?dangerTimer+dt:Math.max(0,dangerTimer-dt*2.2);
    if(dangerTimer>700)endGame();
  }
  function updateJuice(dt){for(const b of balls){b.squash*=Math.exp(-dt/105);b.pop=Math.max(0,(b.pop||0)-dt/420);}}
  function endGame(){if(gameOver)return;gameOver=true;finalScoreEl.textContent=score;finalBestEl.textContent=best;overlay.classList.remove('hidden');beep(10);}
  function beep(level){if(!audioOn)return; try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=220+level*55;g.gain.setValueAtTime(.001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.08,audioCtx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.13);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.14);}catch(e){} }
  function drop(x){if(gameOver||!current)return;const r=radii[current.level];balls.push(makeBaby(current.level,clamp(x,r,W-r),38));beep(current.level);spawnPreview();}
  function pointerX(e){const rect=canvas.getBoundingClientRect();return clamp((e.clientX-rect.left)*W/rect.width,0,W);}
  let pointerDown=false;
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();pointerDown=true;aimingX=pointerX(e);canvas.setPointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(pointerDown){e.preventDefault();aimingX=pointerX(e);}});
  canvas.addEventListener('pointerup',e=>{if(pointerDown){pointerDown=false;aimingX=pointerX(e);drop(aimingX);}});
  canvas.addEventListener('pointercancel',()=>pointerDown=false);
  window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return; if(e.key==='ArrowLeft'){aimingX-=15;e.preventDefault();} if(e.key==='ArrowRight'){aimingX+=15;e.preventDefault();} if(e.key===' '||e.key==='Enter'){e.preventDefault();drop(aimingX);} if(e.key.toLowerCase()==='r')reset();});
  document.querySelector('#restartBtn').addEventListener('click',reset); document.querySelector('#playAgainBtn').addEventListener('click',reset);
  soundBtn.addEventListener('click',()=>{audioOn=!audioOn;soundBtn.textContent=audioOn?'🔊':'🔇';});
  function loop(t){const dt=last?Math.min(32,t-last):16;last=t;drawBackground();drawNext();drawAim();physics(dt);updateJuice(dt);updateParticles(dt);for(const b of balls)drawBaby(b);drawParticles();requestAnimationFrame(loop);}
  names.forEach((n,i)=>{const el=document.createElement('div');el.className='chain-item';const img=document.createElement('img');img.src=imageUrls[i];img.alt=n;img.onerror=()=>{img.style.visibility='hidden';};const label=document.createElement('span');label.textContent=n;el.append(img,label);document.querySelector('#chain').append(el);});
  reset(); requestAnimationFrame(loop);
})();

