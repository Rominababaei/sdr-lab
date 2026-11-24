(() => {
  'use strict';
  const filters = [...document.querySelectorAll('[data-filter]')];
  const search = document.querySelector('#archive-search');
  let filter = 'all';
  const normalise = text => text.toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ').trim();
  function updateArchive() {
    const term = normalise(search?.value || '');
    let count = 0;
    for (const experiment of document.querySelectorAll('.hub-experiment')) {
      const matches = normalise(experiment.dataset.search + ' ' + experiment.textContent).includes(term);
      let visible = 0;
      for (const doc of experiment.querySelectorAll('.hub-document')) {
        doc.hidden = !matches || (filter !== 'all' && doc.dataset.type !== filter);
        if (!doc.hidden) visible++;
      }
      experiment.hidden = !visible;
      count += visible;
    }
    const empty = document.querySelector('#no-results');
    if (empty) empty.hidden = count !== 0;
    const list = document.querySelector('#experiment-list');
    if (list) list.hidden = count === 0;
    const announcement = document.querySelector('#filter-announcement');
    if (announcement) announcement.textContent = count.toLocaleString('fa-IR') + ' مورد نمایش داده می‌شود.';
  }
  filters.forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    filters.forEach(item => {
      const selected = item === button;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    updateArchive();
  }));
  search?.addEventListener('input', updateArchive);
  document.addEventListener('click', event => {
    document.querySelectorAll('.hub-switch[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.hub-switch[open]').forEach(menu => {menu.open=false;menu.querySelector('summary').focus();});
  });

  const canvas = document.querySelector('#waterfall');
  const line = document.querySelector('#spectrum-line');
  const area = document.querySelector('#spectrum-area');
  if (!canvas || !line || !area) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.querySelector('#signal-toggle');
  let paused = reduced.matches;
  let frame = 0;
  let previousTime = 0;
  let inView = true;
  const peaks = [{x:.19,w:.014,a:.62},{x:.38,w:.035,a:.88},{x:.63,w:.022,a:.72},{x:.82,w:.012,a:.48}];
  function level(x, time) {
    let value = .075 + .018*Math.sin(x*393 + time*.7) + .014*Math.sin(x*1297+time*.4);
    for (const p of peaks) value += p.a*Math.exp(-.5*((x-p.x)/p.w)**2)*(1+.035*Math.sin(time+p.x*21));
    return Math.min(.97, Math.max(0,value));
  }
  function drawSpectrum(t) {
    const points=[];
    for(let i=0;i<=540;i++) points.push([i,174-level(i/540,t)*155]);
    const path=points.map((p,i)=>(i?'L':'M')+p[0]+','+p[1].toFixed(2)).join(' ');
    line.setAttribute('d',path);
    area.setAttribute('d',path+' L540,186 L0,186 Z');
  }
  function colour(v) {
    const stops=[[10,29,49],[20,63,88],[29,107,129],[74,167,172],[193,217,153]];
    const index=Math.min(3,Math.floor(v*4));
    const mix=Math.min(1,v*4-index);
    return stops[index].map((n,c)=>Math.round(n+(stops[index+1][c]-n)*mix));
  }
  function waterfallRow(y,t) {
    const row=ctx.createImageData(canvas.width,1);
    for(let x=0;x<canvas.width;x++) {
      let v=level(x/canvas.width,t);
      v+=.035*Math.sin(x*5.7+y*7.1+t*2);
      const c=colour(Math.max(0,Math.min(.99,v)));
      const i=x*4;row.data[i]=c[0];row.data[i+1]=c[1];row.data[i+2]=c[2];row.data[i+3]=255;
    }
    ctx.putImageData(row,0,y);
  }
  drawSpectrum(0);
  for(let y=0;y<canvas.height;y++)waterfallRow(y,y*.09);
  function animate(now) {
    requestAnimationFrame(animate);
    if(paused || document.hidden || !inView || now-previousTime<90)return;
    previousTime=now;frame+=.1;
    drawSpectrum(frame);
    ctx.drawImage(canvas,0,0,canvas.width,canvas.height-2,0,2,canvas.width,canvas.height-2);
    waterfallRow(0,frame);waterfallRow(1,frame+.03);
  }
  function updateToggle() {
    toggle?.classList.toggle('is-paused',paused);
    toggle?.setAttribute('aria-pressed',String(paused));
    toggle?.setAttribute('aria-label',paused?'پخش پویانمایی سیگنال':'توقف پویانمایی سیگنال');
    const label=document.querySelector('#signal-toggle-label');
    if(label)label.textContent=paused?'پخش':'توقف';
  }
  toggle?.addEventListener('click',()=>{paused=!paused;updateToggle();});
  reduced.addEventListener('change',event=>{paused=event.matches;updateToggle();});
  new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;},{threshold:.05}).observe(canvas);
  updateToggle();requestAnimationFrame(animate);
})();
