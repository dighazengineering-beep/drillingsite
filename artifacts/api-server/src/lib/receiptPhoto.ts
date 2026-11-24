/**
 * Turns the flat receipt picture into a "photograph": a sheet torn from a receipt book (scalloped, ragged left edge), paper grain, a fold,
 * a slight tilt, shadows, window light and camera grain, lying on a wooden desk. Runs in the browser on a canvas, so it can be made at 4K (3840 x 2160).
 * Written as a plain string so it can be put straight into the receipt page.
 */
export const PHOTO_JS = String.raw`
window.dzPhoto=function(src,seed,W,H){
  W=W||3840;H=H||2160;
  function hash(s){var h=2166136261;s=String(s);for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  var a=hash(seed)||1;function R(){a=(a+0x6D2B79F5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;}
  function cv(w,h){var c=document.createElement("canvas");c.width=Math.round(w);c.height=Math.round(h);return c;}
  var k=W/3840;
  /* a tile of fine random grain, reused for the wood, the paper and the camera */
  function grain(n,lo,hi){var c=cv(n,n),x=c.getContext("2d"),d=x.createImageData(n,n);for(var i=0;i<d.data.length;i+=4){var v=lo+R()*(hi-lo);d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}x.putImageData(d,0,0);return c;}
  var gt=grain(256,0,255);
  function tile(g,w,h,alpha,mode,sc){g.save();g.globalAlpha=alpha;g.globalCompositeOperation=mode||"source-over";var p=g.createPattern(gt,"repeat");g.scale(sc||1,sc||1);g.fillStyle=p;g.fillRect(0,0,w/(sc||1),h/(sc||1));g.restore();}

  var out=cv(W,H),g=out.getContext("2d");
  /* ---- the desk: warm wood, planks, long grain, knots of colour ---- */
  var bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#7a5232");bg.addColorStop(.5,"#6a4429");bg.addColorStop(1,"#583720");g.fillStyle=bg;g.fillRect(0,0,W,H);
  for(var p=0;p<5;p++){var py=p*H/4.4,ph=H/4.4;g.fillStyle="rgba("+(p%2?"255,200,140":"20,8,0")+","+(.035+R()*.05)+")";g.fillRect(0,py,W,ph);
    if(p){g.fillStyle="rgba(15,6,0,.55)";g.fillRect(0,py,W,3*k+1);g.fillStyle="rgba(255,215,170,.12)";g.fillRect(0,py+3*k+1,W,2*k+1);}}
  for(var i=0;i<900;i++){var y=R()*H,x0=R()*W*.4,len=W*(.3+R()*.7),amp=(1+R()*5)*k,fr=.0008+R()*.0016,ph0=R()*6;
    g.beginPath();g.lineWidth=(.6+R()*2.6)*k;g.strokeStyle=R()<.62?"rgba(30,14,4,"+(.03+R()*.1)+")":"rgba(255,214,160,"+(.02+R()*.06)+")";
    for(var x=x0;x<x0+len;x+=40*k){var yy=y+Math.sin(x*fr+ph0)*amp+Math.sin(x*fr*3.1+ph0)*amp*.3;if(x===x0)g.moveTo(x,yy);else g.lineTo(x,yy);}g.stroke();}
  for(var j=0;j<7;j++){var kx=R()*W,ky=R()*H,kr=(60+R()*140)*k,gr=g.createRadialGradient(kx,ky,0,kx,ky,kr);gr.addColorStop(0,"rgba(30,12,2,.28)");gr.addColorStop(1,"rgba(30,12,2,0)");g.save();g.translate(kx,ky);g.scale(2.8,1);g.translate(-kx,-ky);g.fillStyle=gr;g.fillRect(kx-kr,ky-kr,kr*2,kr*2);g.restore();}
  tile(g,W,H,.16,"overlay",1.4);

  /* ---- the paper ---- */
  var rw=Math.min(W*.74,(H*.74)*src.width/src.height),rh=rw*src.height/src.width,u=rw/760;
  var P=cv(rw,rh),q=P.getContext("2d");
  try{q.filter="blur("+(.35*u)+"px)";}catch(e){}
  q.drawImage(src,0,0,rw,rh);q.filter="none";
  q.globalCompositeOperation="multiply";q.fillStyle="rgba(247,238,214,.62)";q.fillRect(0,0,rw,rh);q.globalCompositeOperation="source-over";
  tile(q,rw,rh,.13,"multiply",.9);
  for(var f=0;f<420;f++){q.beginPath();var fx=R()*rw,fy=R()*rh,fl=(3+R()*14)*u,fa=R()*6.28;q.moveTo(fx,fy);q.lineTo(fx+Math.cos(fa)*fl,fy+Math.sin(fa)*fl);q.lineWidth=(.3+R()*.5)*u;q.strokeStyle=R()<.5?"rgba(120,100,60,.10)":"rgba(255,255,255,.22)";q.stroke();}
  /* a few soft stains and a thumb-smudge of grey */
  for(var s=0;s<4;s++){var sx=R()*rw,sy=R()*rh,sr=(30+R()*90)*u,sg=q.createRadialGradient(sx,sy,0,sx,sy,sr);sg.addColorStop(0,"rgba(150,120,60,.07)");sg.addColorStop(1,"rgba(150,120,60,0)");q.fillStyle=sg;q.fillRect(sx-sr,sy-sr,sr*2,sr*2);}
  /* the fold: a crease across the sheet with a dark and a light side */
  var fy2=rh*(.42+R()*.2),fw=18*u,fg=q.createLinearGradient(0,fy2-fw,0,fy2+fw);
  fg.addColorStop(0,"rgba(0,0,0,0)");fg.addColorStop(.44,"rgba(60,45,20,.13)");fg.addColorStop(.5,"rgba(40,28,10,.22)");fg.addColorStop(.56,"rgba(255,255,255,.30)");fg.addColorStop(1,"rgba(255,255,255,0)");
  q.fillStyle=fg;q.fillRect(0,fy2-fw,rw,fw*2);
  var ff=q.createLinearGradient(0,0,rw,0);ff.addColorStop(0,"rgba(255,255,255,.0)");ff.addColorStop(.5,"rgba(255,255,255,.07)");ff.addColorStop(1,"rgba(255,255,255,0)");q.fillStyle=ff;q.fillRect(0,0,rw,rh);
  /* window light falling across the sheet */
  var lg=q.createLinearGradient(0,0,rw,rh);lg.addColorStop(0,"rgba(255,250,235,.20)");lg.addColorStop(.55,"rgba(255,255,255,0)");lg.addColorStop(1,"rgba(70,45,10,.20)");q.fillStyle=lg;q.fillRect(0,0,rw,rh);
  /* the outline: perforated, torn left edge; cleanly cut top, right and bottom with a tiny wobble */
  function outline(c,tx){
    c.beginPath();var r2=R;
    var step=21*u,n=Math.floor(rh/step),pts=[];
    c.moveTo(0,0);
    for(var x=0;x<rw;x+=9*u)c.lineTo(x,(R()-.5)*1.1*u);
    c.lineTo(rw,0);
    for(var y=0;y<rh;y+=9*u)c.lineTo(rw+(R()-.5)*1.1*u,y);
    c.lineTo(rw,rh);
    for(var x2=rw;x2>0;x2-=9*u)c.lineTo(x2,rh+(R()-.5)*1.1*u);
    c.lineTo(0,rh);
    /* up the left side, hole by hole */
    var yy=rh;
    while(yy>0){
      var rad=(6.4+R()*1.6)*u,cy=yy-step/2,jit=(R()-.5)*1.4*u,ny=Math.max(0,yy-step);
      c.lineTo((R()*1.6)*u,yy-(step/2-rad));
      c.quadraticCurveTo(rad*1.5+jit,yy-(step/2-rad)-rad*.3,rad*1.45+jit,cy);
      c.quadraticCurveTo(rad*1.5+jit,cy-rad*.7,(R()*1.6)*u,cy-rad);
      /* ragged paper fibres between two holes */
      var ty=cy-rad;while(ty>ny+1*u){ty-=(1.4+R()*2.6)*u;c.lineTo((R()*2.6)*u,Math.max(ny,ty));}
      yy=ny;if(yy<=0)break;
    }
    c.closePath();
  }
  var M=cv(rw,rh),m=M.getContext("2d");a=hash(seed)+7;outline(m,0);m.fillStyle="#000";m.fill();
  var P2=cv(rw,rh),w2=P2.getContext("2d");w2.drawImage(P,0,0);w2.globalCompositeOperation="destination-in";w2.drawImage(M,0,0);
  /* torn-edge fibres: a pale, fuzzy rim along the left side, and a thin dark line for thickness */
  w2.globalCompositeOperation="source-atop";
  var eg=w2.createLinearGradient(0,0,14*u,0);eg.addColorStop(0,"rgba(255,253,245,.85)");eg.addColorStop(1,"rgba(255,253,245,0)");w2.fillStyle=eg;w2.fillRect(0,0,14*u,rh);
  var sh=w2.createLinearGradient(0,0,34*u,0);sh.addColorStop(0,"rgba(60,40,10,.14)");sh.addColorStop(1,"rgba(60,40,10,0)");w2.fillStyle=sh;w2.fillRect(0,0,34*u,rh);
  w2.globalCompositeOperation="source-over";

  /* ---- place the sheet on the desk with its shadows ---- */
  var ang=(-1.4+R()*.9)*Math.PI/180,cx=W*.5,cy=H*.5;
  function place(c){c.translate(cx,cy);c.rotate(ang);c.translate(-rw/2,-rh/2);}
  g.save();place(g);g.shadowColor="rgba(0,0,0,.55)";g.shadowBlur=90*k;g.shadowOffsetX=22*k;g.shadowOffsetY=46*k;g.drawImage(M,0,0);g.restore();
  g.save();place(g);g.shadowColor="rgba(0,0,0,.6)";g.shadowBlur=10*k;g.shadowOffsetX=3*k;g.shadowOffsetY=6*k;g.drawImage(M,0,0);g.restore();
  g.save();place(g);g.drawImage(P2,0,0);g.restore();

  /* ---- the camera: lens vignette, warm light from the top left, grain, a touch of softness ---- */
  var wl=g.createLinearGradient(0,0,W,H);wl.addColorStop(0,"rgba(255,236,200,.20)");wl.addColorStop(.6,"rgba(255,255,255,0)");wl.addColorStop(1,"rgba(0,0,0,.22)");g.fillStyle=wl;g.fillRect(0,0,W,H);
  var vg=g.createRadialGradient(W*.5,H*.46,H*.35,W*.5,H*.5,W*.72);vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,.5)");g.fillStyle=vg;g.fillRect(0,0,W,H);
  tile(g,W,H,.075,"overlay",1);
  return out;
};
`;
