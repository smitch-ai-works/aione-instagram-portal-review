'use strict';
// Existing internal export drawing inspected read-only on 2026-10-11.
window.drawInternalReport=function(canvas,revenue,month,preview=false){
  canvas.width=1080;canvas.height=1080;const ctx=canvas.getContext('2d');
  function gold(x1,y1,x2,y2){const g=ctx.createLinearGradient(x1,y1,x2,y2);[[0,'#d4af37'],[.2,'#fcf6ba'],[.4,'#b8860b'],[.7,'#fbf5b7'],[1,'#aa771c']].forEach(([n,c])=>g.addColorStop(n,c));return g;}
  const bg=ctx.createRadialGradient(540,540,100,540,540,800);bg.addColorStop(0,'#001f3f');bg.addColorStop(1,'#000b1a');ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1080);
  [[850,0,1080,200,0],[850,1080,1080,880,1080]].forEach(p=>{ctx.save();ctx.beginPath();ctx.moveTo(p[0],p[4]);ctx.lineTo(p[2],p[3]);ctx.lineTo(p[2],p[4]);ctx.closePath();ctx.clip();ctx.fillStyle=gold(p[0],Math.min(p[3],p[4]),p[2],Math.max(p[3],p[4]));ctx.fillRect(p[0],Math.min(p[3],p[4]),230,200);ctx.strokeStyle='#fbf5b7';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(p[0],p[4]);ctx.lineTo(p[2],p[3]);ctx.stroke();ctx.restore();});
  let seed=12345;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<100;i++){ctx.fillStyle=`rgba(212,175,55,${random()*.7})`;ctx.beginPath();ctx.arc(random()*1080,random()*1080,random()*2,0,Math.PI*2);ctx.fill();}
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=gold(400,80,680,80);ctx.font='500 70px sans-serif';const [year,m]=month.split('-');ctx.fillText(`— ${year.slice(2)}年${m}月 成果実績 —`,540,180);
  const light=ctx.createRadialGradient(540,180,0,540,180,300);light.addColorStop(0,'rgba(212,175,55,0.25)');light.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=light;ctx.beginPath();ctx.arc(540,180,300,0,Math.PI*2);ctx.fill();
  const x=60,y=300,w=960,h=650,frame=gold(x,y,x+w,y+h);ctx.strokeStyle=frame;ctx.lineWidth=5;ctx.strokeRect(x,y,w,h);ctx.lineWidth=1;ctx.strokeRect(x+18,y+18,w-36,h-36);
  [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(p=>{ctx.save();ctx.translate(...p);ctx.rotate(Math.PI/4);ctx.fillStyle=frame;ctx.fillRect(-10,-10,20,20);ctx.restore();});ctx.fillStyle='#000b1a';ctx.fillRect(x+22,y+22,w-44,h-44);
  ctx.fillStyle='#fcf6ba';ctx.font='bold 65px sans-serif';const title='発生収益 (合計)';ctx.fillText(title,540,y+130);const tw=ctx.measureText(title).width;ctx.strokeStyle='#fcf6ba';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+100,y+130);ctx.lineTo(540-tw/2-60,y+130);ctx.stroke();ctx.beginPath();ctx.moveTo(540+tw/2+60,y+130);ctx.lineTo(x+w-100,y+130);ctx.stroke();
  const text=revenue.toLocaleString('ja-JP');let size=240;ctx.font=`bold ${size}px serif`;while(ctx.measureText('¥'+text).width>w-100&&size>30){size-=10;ctx.font=`bold ${size}px serif`;}
  ctx.fillStyle=gold(x,y+300,x+w,y+550);const numW=ctx.measureText(text).width;ctx.font=`bold ${size*.5}px serif`;const symW=ctx.measureText('¥').width,start=540-(numW+symW+35)/2;ctx.textAlign='left';ctx.fillText('¥',start,y+420);ctx.font=`bold ${size}px serif`;ctx.fillText(text,start+symW+35,y+400);
  if(preview){ctx.textAlign='center';ctx.fillStyle='#aebac6';ctx.font='24px sans-serif';ctx.fillText('プレビュー用サンプル',540,1010);}
};
