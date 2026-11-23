/* C4 bilingual reader. No framework, network translation, fetch, or source-file writes.
 * The English article is an exact embedded source fragment. Highlighting uses
 * Range + CSS Highlights (or a paint-only rectangle fallback), never text wrappers.
 */
(() => {
  'use strict';
  const DATA = window.C4_READER_DATA;
  if (!DATA || !Array.isArray(DATA.pages)) {
    document.getElementById('rr-error').hidden = false;
    document.getElementById('rr-error').textContent = 'Không tải được dữ liệu. Hãy giải nén toàn bộ gói và giữ thư mục assets cạnh index.html.';
    return;
  }
  const $ = id => document.getElementById(id);
  const enRoot = $('rr-en'), viRoot = $('rr-vi');
  const enPane = $('rr-en-scroll'), viPane = $('rr-vi-scroll');
  const APP_URL = new URL('.', document.baseURI), PROJECT_URL = new URL('../', APP_URL);
  const PAGE_MAP = new Map(DATA.pages.map(p => [p.path, p]));
  const SOURCE_URL_MAP = new Map(DATA.pages.map(p => [new URL(p.path, PROJECT_URL).href, p.path]));
  const KEY = 'c4-bilingual-reader:v1';
  const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,td,th,figcaption,dt,dd,label';
  const hasHighlights = Boolean(window.CSS && CSS.highlights && window.Highlight && !new URLSearchParams(location.search).has('fallback'));
  const defaults = {version:1, mode:'practice', sync:true, font:16, rate:1, words:[], completed:[], positions:{}, hints:0, lastPage:'introduction.html'};
  let storageOK = true, state;
  try {
    const loaded = JSON.parse(localStorage.getItem(KEY) || 'null');
    state = {...defaults, ...(loaded && loaded.version === 1 ? loaded : {})};
    const probe = KEY + ':probe'; localStorage.setItem(probe, '1'); localStorage.removeItem(probe);
  } catch (_) { state = {...defaults}; storageOK = false; }
  if (!['parallel','practice','challenge'].includes(state.mode)) state.mode = 'practice';
  if (!Array.isArray(state.words)) state.words = [];
  if (!Array.isArray(state.completed)) state.completed = [];
  state.completed = [...new Set(state.completed.filter(p => PAGE_MAP.has(p)))];
  if (!state.positions || typeof state.positions !== 'object') state.positions = {};
  state.sync = state.sync !== false;
  state.font = Math.max(13, Math.min(22, Number(state.font) || 16));
  state.rate = [0.75,1,1.25].includes(Number(state.rate)) ? Number(state.rate) : 1;
  state.hints = Math.max(0, Number(state.hints) || 0);
  let currentPage = null, enGroups = [], viGroups = [], nodeGroups = new WeakMap(), active = null;
  let pinned = false, revealed = new Set(), saveTimer = 0, toastTimer = 0, syncFrame = 0, syncTarget = null, syncUntil = 0;
  let libraryTab = 'saved', reviewIndex = 0, reviewFlipped = false, lastPointer = null, pointerFrame = 0;
  let validationErrors = [], currentPairs = 0;

  const tidy = s => String(s).replace(/\s+/g, ' ').trim();
  function normalized(s) {
    // Map normalized character positions back to original UTF-16 offsets.
    let text = '', map = [], pending = -1;
    for (let i=0; i<s.length; i++) {
      if (/\s/.test(s[i])) { if (text && pending < 0) pending = i; continue; }
      if (pending >= 0) { map.push(pending); text += ' '; pending = -1; }
      map.push(i); text += s[i];
    }
    return {text, map};
  }
  function persist(immediate=false) {
    clearTimeout(saveTimer);
    const write = () => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (_) { storageOK = false; updateStorageNotice(); }
    };
    if (immediate) write(); else saveTimer = setTimeout(write, 300);
  }
  function notify(text) {
    clearTimeout(toastTimer); $('rr-toast').textContent = text; $('rr-toast').hidden = false;
    toastTimer = setTimeout(() => { $('rr-toast').hidden = true; }, 4200);
  }
  function updateStorageNotice() {
    $('rr-storage-status').textContent = storageOK
      ? 'Lưu trên trình duyệt này; xuất JSON để sao lưu hoặc chuyển máy.'
      : 'Trình duyệt chặn lưu trữ. Dữ liệu chỉ còn trong phiên này; hãy xuất JSON trước khi đóng.';
  }
  function element(tag, cls, text) {
    const el = document.createElement(tag); if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text; return el;
  }
  function collectGroups(root) {
    const groups = [], byElement = new Map();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim() || node.parentElement.closest('script,style,svg')) continue;
      const block = node.parentElement.closest(BLOCK_SELECTOR);
      const el = block && root.contains(block) ? block : node.parentElement;
      let g = byElement.get(el);
      if (!g) { g = {el, nodes:[], text:'', index:groups.length}; groups.push(g); byElement.set(el,g); }
      g.nodes.push(node); g.text += node.textContent;
    }
    groups.forEach(g => { g.normal = normalized(g.text); });
    return groups;
  }
  function rangeOf(group, from=0, to=group.normal.text.length) {
    if (!group.nodes.length || to<=from || from<0 || to>group.normal.map.length) return null;
    const start = group.normal.map[from], end = group.normal.map[to-1]+1;
    let consumed=0, startNode=null, endNode=null, s=0, e=0;
    for (const n of group.nodes) {
      const length=n.textContent.length;
      if (!startNode && start>=consumed && start<consumed+length) {startNode=n;s=start-consumed;}
      if (end>consumed && end<=consumed+length) {endNode=n;e=end-consumed;break;}
      consumed+=length;
    }
    if (!startNode || !endNode) return null;
    const r=document.createRange();r.setStart(startNode,s);r.setEnd(endNode,e);return r;
  }
  function renderTranslatedMarkup(text, sourceLinks) {
    const frag=document.createDocumentFragment();
    const re=/\[\[(\d+)\|([^\]]+)\]\]/g;let pos=0,m;
    while ((m=re.exec(text))) {
      frag.append(document.createTextNode(text.slice(pos,m.index)));
      const link=sourceLinks[Number(m[1])];
      if (link) { const a=element('a','',m[2]);a.setAttribute('href',link.href || '#');frag.append(a); }
      else frag.append(document.createTextNode(m[2]));
      pos=re.lastIndex;
    }
    frag.append(document.createTextNode(text.slice(pos)));return frag;
  }
  function resolveResources(root,page,isVI=false) {
    const base=new URL(page.path,PROJECT_URL);
    root.querySelectorAll('[src],[href],[poster]').forEach(el => {
      for (const name of ['src','href','poster']) {
        const value=el.getAttribute(name);
        if (!value || /^(data:|blob:|javascript:)/i.test(value)) continue;
        // SVG <use> references stay within this document.
        if (el.tagName.toLowerCase()==='use') continue;
        try { el.setAttribute(name,new URL(value,base).href); } catch (_) { /* Preserve unusual original URL. */ }
      }
    });
    root.querySelectorAll('a[target="_blank"]').forEach(a => a.rel='noopener noreferrer');
    if (isVI) {
      root.querySelectorAll('[id]').forEach(el => { el.id='vi-'+el.id; });
      root.querySelectorAll('[for]').forEach(el => el.setAttribute('for','vi-'+el.getAttribute('for')));
      root.querySelectorAll('[aria-labelledby]').forEach(el => el.setAttribute('aria-labelledby',el.getAttribute('aria-labelledby').split(/\s+/).map(x=>'vi-'+x).join(' ')));
      root.querySelectorAll('input[name]').forEach(el => el.name='vi-'+el.name);
    }
  }
  function renderPage(page,anchor='') {
    if (currentPage) rememberPosition();
    window.speechSynthesis?.cancel();
    currentPage=page;active=null;pinned=false;revealed=new Set();validationErrors=[];clearPaint();
    $('rr-error').hidden=true;
    document.body.classList.remove('challenge-revealed');
    // Setting innerHTML does not execute the original inline scripts.
    // Runtime table data is rendered from an exact captured output of the supplied script.
    enRoot.innerHTML=page.raw;
    if (page.toolsHtml) enRoot.querySelector('#toolsTable').innerHTML=page.toolsHtml;
    viRoot.innerHTML=enRoot.innerHTML;
    enGroups=collectGroups(enRoot);
    const originalViGroups=collectGroups(viRoot);
    nodeGroups=new WeakMap();
    if (enGroups.length!==page.units.length || originalViGroups.length!==page.units.length) {
      validationErrors.push(`Số đoạn không khớp: ${enGroups.length}/${page.units.length}`);
    }
    viGroups=[];currentPairs=0;
    page.units.forEach((u,i) => {
      const eg=enGroups[i],vg=originalViGroups[i];if (!eg || !vg) return;
      eg.index=i;eg.meta=u;eg.pairs=u.pairs || [];
      if (eg.normal.text!==tidy(u.en)) validationErrors.push(`Đoạn ${i}: văn bản nguồn đã khác bản đối chiếu.`);
      eg.nodes.forEach(n => nodeGroups.set(n,eg));
      const span=element('span','vi-unit');span.dataset.unit=String(i);
      span.append(renderTranslatedMarkup(u.vi,u.links || []));
      let insertion=vg.nodes[0];
      while (insertion.parentNode!==vg.el) insertion=insertion.parentNode;
      vg.el.insertBefore(span,insertion);
      vg.nodes.forEach(n=>n.remove());
      // Remove only now-empty inline elements from the translated clone, not images or source nodes.
      vg.el.querySelectorAll('a,b,strong,em,i,small,code,sup').forEach(n=> {
        if (!n.closest('.vi-unit') && !n.textContent.trim() && !n.querySelector('img,svg,iframe')) n.remove();
      });
      const nodes=[];const walker=document.createTreeWalker(span,NodeFilter.SHOW_TEXT);let n;
      while ((n=walker.nextNode())) nodes.push(n);
      const text=nodes.map(x=>x.textContent).join('');
      const v={el:vg.el,span,nodes,text,normal:normalized(text),index:i};viGroups.push(v);
      if (v.normal.text!==u.viText) validationErrors.push(`Đoạn ${i}: bản dịch không khớp.`);
      currentPairs+=eg.pairs.length;
    });
    resolveResources(enRoot,page,false);resolveResources(viRoot,page,true);
    attachTooling();
    $('rr-page-title').textContent=page.title;
    $('rr-original').href=new URL(page.path,PROJECT_URL).href;
    document.title=`${page.title} · C4 song ngữ`;
    state.lastPage=page.path;
    $('rr-complete').textContent=state.completed.includes(page.path)?'✓ Đã đánh dấu đọc':'Đánh dấu đã đọc';
    $('rr-complete').setAttribute('aria-pressed',String(state.completed.includes(page.path)));
    updateNav();setMode(state.mode,false);updateSelection();
    enPane.scrollTop=0;viPane.scrollTop=0;
    requestAnimationFrame(()=>{
      if (anchor) scrollToAnchor(anchor);
      else {
        const y=Number(state.positions[page.path])||0;
        enPane.scrollTop=y;
        if (state.sync) syncScroll(enPane,viPane,true);
      }
    });
    if (validationErrors.length) {
      $('rr-error').hidden=false;
      $('rr-error').textContent='Dữ liệu đối chiếu không khớp; đã tắt highlight để tránh chỉ sai nghĩa. Xem bản EN gốc và báo cáo kiểm tra.';
      console.error('C4 alignment validation',validationErrors);
    }
    persist();closeNav();
  }
  function attachTooling() {
    if (!currentPage.toolsHtml) return;
    const filter=value=>{
      for (const root of [enRoot,viRoot]) {
        root.querySelectorAll('.toolingOption').forEach(row=>row.classList.toggle('hidden',!row.classList.contains('toolingOption'+value)));
        root.querySelectorAll('input[type=radio]').forEach(r=>{r.checked=r.value===value;});
      }
      clearSelection();
    };
    for (const root of [enRoot,viRoot]) root.querySelectorAll('input[type=radio]').forEach(r=>r.addEventListener('change',()=>{if(r.checked)filter(r.value);}));
    filter('Modelling');
  }
  function route(path,anchor='') {
    if (!PAGE_MAP.has(path)) {notify('Trang này chưa có trong bộ đọc.');return;}
    const hash='#/'+path+(anchor?'::'+encodeURIComponent(anchor):'');
    if (location.hash===hash) {if(anchor)scrollToAnchor(anchor);return;}
    location.hash=hash;
  }
  function onRoute() {
    let raw=location.hash.startsWith('#/')?location.hash.slice(2):'';
    let [path,anchor='']=raw.split('::');
    try {anchor=decodeURIComponent(anchor);} catch (_) {anchor='';}
    if (!path) path=PAGE_MAP.has(state.lastPage)?state.lastPage:'introduction.html';
    if (!PAGE_MAP.has(path)) {notify('Không tìm thấy trang được yêu cầu; đã mở Introduction.');path='introduction.html';}
    if (currentPage?.path===path && anchor) {scrollToAnchor(anchor);return;}
    renderPage(PAGE_MAP.get(path),anchor);
  }
  function scrollToAnchor(anchor) {
    let eg,vg;
    if (/^u:\d+$/.test(anchor)) {const i=Number(anchor.slice(2));eg=enGroups[i]?.el;vg=viGroups[i]?.span;}
    else {
      eg=[...enRoot.querySelectorAll('[id]')].find(x=>x.id===anchor);
      vg=[...viRoot.querySelectorAll('[id]')].find(x=>x.id==='vi-'+anchor);
    }
    if (!eg) {notify('Neo này không tồn tại trong nội dung gốc.');return;}
    scrollElement(enPane,eg,20);if(vg)scrollElement(viPane,vg,20);
  }
  function scrollElement(pane,el,padding=70) {
    const top=el.getBoundingClientRect().top-pane.getBoundingClientRect().top+pane.scrollTop-padding;
    pane.scrollTop=Math.max(0,top);
  }
  function handleArticleLink(event) {
    const a=event.target.closest('a');if(!a)return;
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const u=new URL(a.href,location.href),hash=u.hash.slice(1);u.hash='';
    const page=SOURCE_URL_MAP.get(u.href);
    if(page) {event.preventDefault();route(page,decodeURIComponent(hash));}
    // Image files, external pages and the interactive example retain their normal link behaviour.
  }
  enRoot.addEventListener('click',handleArticleLink);viRoot.addEventListener('click',handleArticleLink);

  function setMode(mode,persistIt=true) {
    state.mode=mode;document.body.dataset.mode=mode;
    document.querySelectorAll('.mode-control button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    const labels={parallel:'Đọc hai bản song song. Rê chuột để đối chiếu cụm nghĩa; nhấn để ghim.',practice:'Đọc tiếng Anh trước. Rê chuột để xem nghĩa cụm từ; nhấn để ghim.',challenge:'Tự đọc tiếng Anh. Chỉ mở nghĩa khi bạn chủ động nhấn Hiện đoạn.'};
    $('rr-mode-description').textContent=labels[mode];
    $('rr-vi-mode-label').textContent={parallel:'BẢN DỊCH',practice:'GỢI Ý KHI CẦN',challenge:'ẨN BẢN DỊCH'}[mode];
    $('rr-challenge-message').hidden=mode!=='challenge'||document.body.classList.contains('challenge-revealed');
    $('rr-reset-reveals').hidden=mode==='parallel';
    updateSelection();paintActive();if(persistIt)persist();
  }
  function locateAt(x,y) {
    let n,offset;
    if (document.caretPositionFromPoint) {const p=document.caretPositionFromPoint(x,y);if(p){n=p.offsetNode;offset=p.offset;}}
    else if(document.caretRangeFromPoint){const r=document.caretRangeFromPoint(x,y);if(r){n=r.startContainer;offset=r.startOffset;}}
    if(!n || n.nodeType!==Node.TEXT_NODE || !enRoot.contains(n))return null;
    const g=nodeGroups.get(n);if(!g)return null;
    let rawOffset=offset;
    for(const prev of g.nodes){if(prev===n)break;rawOffset+=prev.textContent.length;}
    let normOffset=0;while(normOffset+1<g.normal.map.length&&g.normal.map[normOffset+1]<=rawOffset)normOffset++;
    const pairs=g.pairs.filter(p=>p.eRanges.some(([s,e])=>normOffset>=s&&normOffset<e));
    pairs.sort((a,b)=>(Number(b.manual)-Number(a.manual)) || ((b.eRanges[0][1]-b.eRanges[0][0])-(a.eRanges[0][1]-a.eRanges[0][0])));
    const pair=pairs[0]||null;
    return {group:g,pair,key:g.index+':'+(pair?pair.id:'paragraph')};
  }
  function activate(hit,force=false) {
    if(!hit||validationErrors.length)return;
    if(pinned&&!force)return;
    if(active?.key===hit.key&&!force)return;
    active=hit;updateSelection();paintActive();
  }
  enRoot.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch'||pinned)return;
    lastPointer={x:e.clientX,y:e.clientY};
    if(pointerFrame)return;
    pointerFrame=requestAnimationFrame(()=>{pointerFrame=0;if(lastPointer)activate(locateAt(lastPointer.x,lastPointer.y));});
  });
  enRoot.addEventListener('click',e=>{
    if(e.target.closest('a,button,input,label,select')||window.getSelection()?.toString().trim())return;
    const hit=locateAt(e.clientX,e.clientY);if(!hit)return;
    if(pinned&&active?.key===hit.key){pinned=false;updateSelection();return;}
    pinned=false;activate(hit,true);pinned=true;updateSelection();
  });
  function clearPaint() {
    if(hasHighlights)for(const key of ['rr-english','rr-vietnamese','rr-paragraph'])CSS.highlights.delete(key);
    $('rr-highlight-layer').replaceChildren();
    viRoot.querySelectorAll('.fallback-revealed').forEach(el=>{el.classList.remove('fallback-revealed');if(!revealed.has(Number(el.dataset.unit)))el.classList.remove('is-revealed');});
  }
  function activeRanges() {
    if(!active)return {english:[],vietnamese:[]};
    const eg=active.group,vg=viGroups[eg.index];if(!vg)return {english:[],vietnamese:[]};
    const er=active.pair?active.pair.eRanges:[[0,eg.normal.text.length]];
    const vr=active.pair?active.pair.vRanges:[[0,vg.normal.text.length]];
    return {english:er.map(([s,e])=>rangeOf(eg,s,e)).filter(Boolean),vietnamese:vr.map(([s,e])=>rangeOf(vg,s,e)).filter(Boolean)};
  }
  function paintActive() {
    clearPaint();if(!active||validationErrors.length)return;
    const ranges=activeRanges();
    const allowVI=state.mode==='parallel'||revealed.has(active.group.index)||(state.mode==='practice'&&Boolean(active.pair));
    if(hasHighlights){
      CSS.highlights.set('rr-english',new Highlight(...ranges.english));
      if(allowVI)CSS.highlights.set(active.pair?'rr-vietnamese':'rr-paragraph',new Highlight(...ranges.vietnamese));
    }else{
      // Old-browser fallback: draw rectangles, never wrap or replace English text.
      if(allowVI&&state.mode!=='parallel'){
        const span=viGroups[active.group.index].span;span.classList.add('is-revealed','fallback-revealed');
      }
      const paint=(rs,pane)=>{
        const clip=pane.getBoundingClientRect();
        rs.forEach(r=>[...r.getClientRects()].forEach(rect=>{
          const left=Math.max(rect.left,clip.left),top=Math.max(rect.top,clip.top),right=Math.min(rect.right,clip.right),bottom=Math.min(rect.bottom,clip.bottom);
          if(right<=left||bottom<=top)return;
          const d=element('div','fallback-highlight');Object.assign(d.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});$('rr-highlight-layer').append(d);
        }));
      };
      paint(ranges.english,enPane);if(allowVI)paint(ranges.vietnamese,viPane);
    }
  }
  function selectionText() {
    if(!active)return null;
    const u=active.group.meta,v=viGroups[active.group.index];
    return {en:active.pair?active.pair.en:active.group.normal.text,vi:active.pair?active.pair.vi.join(' … '):v.normal.text,note:active.pair?.note||'',page:currentPage.path,unit:active.group.index,context:active.group.normal.text};
  }
  function updateSelection() {
    const t=selectionText();
    for(const id of ['rr-pin','rr-reveal','rr-locate','rr-save'])$(id).disabled=!t;
    $('rr-speak').disabled=!t||!('speechSynthesis'in window);
    $('rr-pin').textContent=pinned?'Bỏ ghim':'Ghim';$('rr-pin').setAttribute('aria-pressed',String(pinned));
    $('rr-pin-state').hidden=!pinned;
    $('rr-reveal').textContent=active&&revealed.has(active.group.index)?'Ẩn đoạn':'Hiện đoạn';
    if(!t){
      $('rr-selection-kind').textContent='GỢI Ý ĐỌC';$('rr-selected-en').textContent='Chọn một từ hoặc cụm tiếng Anh';
      $('rr-selected-vi').textContent='Nghĩa tương ứng sẽ xuất hiện ở đây.';
      $('rr-context-note').textContent='Cụm chưa có đối chiếu riêng sẽ được hỗ trợ bằng cả đoạn, không đoán nghĩa từng từ.';return;
    }
    $('rr-selection-kind').textContent=active.pair?'CỤM NGHĨA TƯƠNG ỨNG':'ĐỐI CHIẾU CẢ ĐOẠN';
    $('rr-selected-en').textContent=t.en;
    const hidden=state.mode==='challenge'&&!revealed.has(active.group.index);
    const needsReveal=state.mode==='practice'&&!active.pair&&!revealed.has(active.group.index);
    $('rr-selected-vi').textContent=hidden?'Bản dịch đang ẩn. Nhấn Hiện đoạn để xem.':needsReveal?'Chưa có cặp từ riêng. Nhấn Hiện đoạn để đối chiếu.':t.vi;
    $('rr-context-note').textContent=hidden?'Chế độ thử thách không hiện nghĩa chỉ vì bạn rê chuột.':t.note||(active.pair?'Đối chiếu theo ngữ cảnh. Nhấn để ghim hoặc lưu kèm câu gốc.':'Đây là bản dịch toàn đoạn, không phải nghĩa riêng của từ dưới con trỏ.');
    if(!hasHighlights&&state.mode==='practice')$('rr-context-note').textContent+=' Trình duyệt này dùng tô sáng dự phòng và có thể hiện cả đoạn.';
  }
  function clearSelection(){active=null;pinned=false;clearPaint();updateSelection();}
  function revealCurrent(){
    if(!active)return;
    const i=active.group.index,span=viGroups[i].span;
    if(revealed.has(i)){revealed.delete(i);span.classList.remove('is-revealed');}
    else{revealed.add(i);span.classList.add('is-revealed');state.hints++;persist();}
    document.body.classList.toggle('challenge-revealed',revealed.size>0);
    $('rr-challenge-message').hidden=state.mode!=='challenge'||revealed.size>0;
    updateSelection();paintActive();
    if(revealed.has(i))scrollElement(viPane,span,80);
  }
  function rememberPosition(){if(currentPage){state.positions[currentPage.path]=enPane.scrollTop;persist();}}
  function syncScroll(source,target,force=false){
    if(!state.sync||!currentPage||(!force&&performance.now()<syncUntil&&source===syncTarget))return;
    const a=source===enPane?enGroups:viGroups,b=source===enPane?viGroups:enGroups;
    const rect=source.getBoundingClientRect();let chosen=-1;
    for(let i=0;i<a.length;i++){
      const r=a[i].el.getBoundingClientRect();if(!r.height)continue;
      if(r.top<=rect.top+45)chosen=i;else if(chosen<0){chosen=i;break;}else break;
    }
    if(chosen<0||!b[chosen])return;
    const ae=a[chosen].el,be=b[chosen].el;
    const ar=ae.getBoundingClientRect(),br=be.getBoundingClientRect(),tr=target.getBoundingClientRect();
    const ratio=Math.min(1,Math.max(0,(rect.top+35-ar.top)/Math.max(1,ar.height)));
    let next=target.scrollTop+br.top-tr.top+ratio*br.height-35;
    if(source.scrollTop<2)next=0;
    // The English pane has a final "mark read" control; don't turn that into a forced jump.
    syncTarget=target;syncUntil=performance.now()+120;
    target.scrollTop=Math.max(0,next);
  }
  function onScroll(source,target){
    if(source===enPane)rememberPosition();
    if(syncFrame)cancelAnimationFrame(syncFrame);
    syncFrame=requestAnimationFrame(()=>{syncFrame=0;syncScroll(source,target);if(!hasHighlights)paintActive();});
  }
  enPane.addEventListener('scroll',()=>onScroll(enPane,viPane),{passive:true});
  viPane.addEventListener('scroll',()=>onScroll(viPane,enPane),{passive:true});
  window.addEventListener('resize',()=>{if(!hasHighlights)paintActive();});

  const navGroups=[
    ['BẮT ĐẦU',['index.html','introduction.html','history.html']],
    ['CÁC KHÁI NIỆM',['abstractions/index.html','abstractions/software-system.html','abstractions/container.html','abstractions/component.html','abstractions/code.html','abstractions/microservices.html','abstractions/queues-and-topics.html','abstractions/faq.html']],
    ['SƠ ĐỒ',['diagrams/index.html','diagrams/system-context.html','diagrams/container.html','diagrams/component.html','diagrams/code.html','diagrams/system-landscape.html','diagrams/dynamic.html','diagrams/deployment.html','diagrams/notation.html','diagrams/checklist.html','diagrams/faq.html']],
    ['THAM KHẢO',['tooling/index.html','faq.html']]
  ];
  const navOrder=navGroups.flatMap(g=>g[1]);
  function updateNav(){
    const query=$('rr-nav-search').value.toLocaleLowerCase();$('rr-nav').replaceChildren();
    navGroups.forEach(([title,paths])=>{
      const section=element('section','nav-group');section.append(element('h3','',title));let shown=0;
      paths.forEach(path=>{
        const p=PAGE_MAP.get(path);if(!p)return;
        const label=path==='index.html'?'Home':path==='diagrams/checklist.html'?'Review checklist':p.title;
        if(query&&!`${label} ${p.units[0].viText}`.toLocaleLowerCase().includes(query))return;
        shown++;const a=element('a','nav-link'+(currentPage?.path===path?' active':''));a.href='#/'+path;a.title=p.units[0].viText;
        if(currentPage?.path===path)a.setAttribute('aria-current','page');
        a.append(element('span','',label));
        if(state.completed.includes(path))a.append(element('span','done','✓'));
        section.append(a);
      });
      if(shown)$('rr-nav').append(section);
    });
    if(!query){const a=element('a','nav-link','Interactive example ↗');a.href=new URL('example/index.html',PROJECT_URL).href;a.target='_blank';a.rel='noopener';$('rr-nav').append(a);}
    $('rr-word-count').textContent=String(state.words.length);
    $('rr-progress').textContent=`${state.completed.length} / ${DATA.pages.length}`;
    $('rr-progress-bar').style.width=(state.completed.length/DATA.pages.length*100)+'%';
  }
  function closeNav(){$('rr-sidebar').classList.remove('is-open');$('rr-nav-backdrop').hidden=true;$('rr-menu').setAttribute('aria-expanded','false');}
  function toggleNav(){const open=$('rr-sidebar').classList.toggle('is-open');$('rr-nav-backdrop').hidden=!open;$('rr-menu').setAttribute('aria-expanded',String(open));}

  function wordId(w){return `${w.page}|${w.unit}|${w.en.toLocaleLowerCase()}`;}
  function saveCurrent(){
    const t=selectionText();if(!t)return;
    if(state.mode==='challenge'&&!revealed.has(t.unit)){notify('Hãy mở bản dịch trước khi lưu từ trong chế độ Thử thách.');return;}
    const id=wordId(t);
    if(state.words.some(w=>w.id===id)){notify('Từ hoặc đoạn này đã có trong sổ.');return;}
    if(state.words.length>=2000){notify('Sổ đã đủ 2.000 mục. Hãy xuất bản sao rồi xóa bớt mục đã học.');return;}
    state.words.push({...t,id,known:false,createdAt:new Date().toISOString()});persist();updateNav();notify(active.pair?'Đã lưu cụm từ kèm ngữ cảnh.':'Đã lưu cả đoạn vào sổ.');
  }
  function validWord(w){
    return w&&typeof w==='object'&&typeof w.en==='string'&&w.en.length>0&&w.en.length<=5000&&typeof w.vi==='string'&&w.vi.length<=8000&&PAGE_MAP.has(w.page)&&Number.isInteger(w.unit)&&w.unit>=0&&w.unit<PAGE_MAP.get(w.page).units.length;
  }
  // Also validate previously stored state: local storage is not trusted markup.
  state.words=state.words.filter(validWord).slice(0,2000).map(w=>({...w,id:wordId(w),known:w.known===true}));
  function openLibrary(tab='saved'){libraryTab=tab;reviewFlipped=false;renderLibrary();$('rr-library').showModal();}
  function sourceLink(page,unit,label){
    const a=element('a','source-link',label||PAGE_MAP.get(page)?.title||'Ngữ cảnh');a.href='#/'+page+'::'+encodeURIComponent('u:'+unit);
    a.addEventListener('click',()=>{$('rr-library').close();});return a;
  }
  function renderLibrary(){
    $('rr-library-title').textContent={saved:'Sổ từ vựng',glossary:'Từ điển trong ngữ cảnh C4',review:'Ôn lại, không nhìn nghĩa'}[libraryTab];
    document.querySelectorAll('[data-library]').forEach(b=>{b.classList.toggle('active',b.dataset.library===libraryTab);b.setAttribute('aria-pressed',String(b.dataset.library===libraryTab));});
    const host=$('rr-library-content');host.replaceChildren();
    const q=$('rr-library-search').value.toLocaleLowerCase().trim();
    $('rr-library-search').hidden=libraryTab==='review';
    updateStorageNotice();$('rr-hint-count').textContent=`${state.hints} lượt chủ động mở đoạn`;
    if(libraryTab==='glossary'){
      const list=DATA.glossary.filter(g=>!q||`${g.en} ${g.vi.join(' ')} ${g.note}`.toLocaleLowerCase().includes(q));
      for(const g of list){const card=element('div','word-card');card.append(element('h3','',g.en),element('p','meaning',g.vi.join(' / ')),element('p','word-note',g.note));const actions=element('div','card-actions');actions.append(sourceLink(g.source,0,'Đọc ngữ cảnh: '+PAGE_MAP.get(g.source).title));card.append(actions);host.append(card);}
      if(!list.length)host.append(element('div','empty-state','Chưa có thuật ngữ này trong từ điển tĩnh. Hãy đối chiếu cả đoạn; bộ đọc không tự đoán nghĩa.'));return;
    }
    if(libraryTab==='review'){renderReview(host);return;}
    const list=state.words.filter(w=>!q||`${w.en} ${w.vi} ${w.context||''}`.toLocaleLowerCase().includes(q));
    if(!list.length){const empty=element('div','empty-state');empty.append(element('strong','',state.words.length?'Không tìm thấy từ phù hợp.':'Bắt đầu từ một cụm bạn chưa biết.'),document.createTextNode('Chọn một cụm tiếng Anh, rồi nhấn ＋ Lưu. Câu gốc và nghĩa sẽ được giữ cùng nhau.'));host.append(empty);return;}
    for(const w of [...list].reverse()){
      const card=element('div','word-card');card.append(element('h3','',w.en),element('p','meaning',w.vi));
      if(w.note)card.append(element('p','word-note',w.note));
      const details=element('details');details.append(element('summary','','Xem ngữ cảnh tiếng Anh'),element('p','',w.context||w.en));card.append(details);
      const actions=element('div','card-actions');actions.append(sourceLink(w.page,w.unit));
      const known=element('button','',w.known?'✓ Đã nhớ':'Cần ôn');known.setAttribute('aria-pressed',String(w.known));known.addEventListener('click',()=>{w.known=!w.known;persist();renderLibrary();});
      const del=element('button','','Xóa');del.setAttribute('aria-label','Xóa khỏi sổ: '+w.en);del.addEventListener('click',()=>{state.words=state.words.filter(x=>x.id!==w.id);persist();renderLibrary();updateNav();});actions.append(known,del);card.append(actions);host.append(card);
    }
  }
  function renderReview(host){
    const list=state.words;
    if(!list.length){host.append(element('div','empty-state','Hãy lưu ít nhất một từ hoặc đoạn để bắt đầu ôn tập.'));return;}
    reviewIndex=((reviewIndex%list.length)+list.length)%list.length;const w=list[reviewIndex];
    const card=element('div','flashcard');card.append(element('div','review-number',`THẺ ${reviewIndex+1} / ${list.length}`),element('h3','',w.en));
    const answer=element('div','meaning',reviewFlipped?w.vi:'');card.append(answer);
    const flip=element('button','primary-button',reviewFlipped?'Ẩn nghĩa':'Xem nghĩa');flip.addEventListener('click',()=>{reviewFlipped=!reviewFlipped;renderLibrary();});card.append(flip);
    const actions=element('div','review-actions');
    for(const [label,known]of[['Cần ôn lại',false],['Đã nhớ',true]]){const b=element('button','',label);b.disabled=!reviewFlipped;b.addEventListener('click',()=>{w.known=known;persist();reviewIndex++;reviewFlipped=false;renderLibrary();});actions.append(b);}
    card.append(actions,element('p','word-note','Tự đánh giá để ôn lại. Đây không phải bài chấm điểm trình độ.'));host.append(card);
  }
  function exportData(){
    const data={format:'c4-reader-v1',exportedAt:new Date().toISOString(),words:state.words,completed:state.completed,hints:state.hints};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='c4-tu-vung-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function importData(file){
    if(!file)return;
    if(file.size>5*1024*1024){notify('Tệp quá lớn. Chỉ nhận JSON dưới 5 MB.');return;}
    try{
      const d=JSON.parse(await file.text());
      if(d.format!=='c4-reader-v1'||!Array.isArray(d.words)||d.words.length>2000||!d.words.every(validWord))throw new Error('format');
      let added=0;const ids=new Set(state.words.map(w=>w.id));
      const newCount=new Set(d.words.map(wordId).filter(id=>!ids.has(id))).size;
      if(state.words.length+newCount>2000){notify('Sau khi nhập sẽ vượt 2.000 mục. Hãy xuất bản sao và giảm số mục trước.');return;}
      for(const item of d.words){
        const w={en:item.en,vi:item.vi,page:item.page,unit:item.unit,context:typeof item.context==='string'?item.context.slice(0,12000):item.en,note:typeof item.note==='string'?item.note.slice(0,2000):'',known:item.known===true,createdAt:typeof item.createdAt==='string'?item.createdAt.slice(0,40):new Date().toISOString()};
        w.id=wordId(w);if(!ids.has(w.id)){state.words.push(w);ids.add(w.id);added++;}
      }
      if(Array.isArray(d.completed))state.completed=[...new Set([...state.completed,...d.completed.filter(p=>PAGE_MAP.has(p))])];
      if(Number.isFinite(d.hints))state.hints=Math.max(state.hints,Math.max(0,d.hints));
      persist();updateNav();renderLibrary();notify(`Đã nhập ${added} từ/đoạn mới; các mục trùng được bỏ qua.`);
    }catch(_){notify('Không nhập được. Cần tệp JSON do bộ đọc xuất, với dữ liệu từ vựng hợp lệ.');}
    finally{$('rr-import').value='';}
  }
  function speak(){
    const t=selectionText();if(!t||!window.speechSynthesis)return;
    const voices=speechSynthesis.getVoices().filter(v=>/^en(?:-|_)/i.test(v.lang));
    const voice=voices.find(v=>v.localService&&/^en-GB$/i.test(v.lang))||voices.find(v=>v.localService)||voices[0];
    if(!voice){notify('Thiết bị chưa có giọng tiếng Anh. Hãy cài/bật giọng đọc tiếng Anh trong hệ điều hành.');return;}
    speechSynthesis.cancel();const utter=new SpeechSynthesisUtterance(t.en);utter.lang=voice.lang;utter.voice=voice;utter.rate=state.rate;
    utter.onerror=e=>{if(!['interrupted','canceled'].includes(e.error))notify('Không phát được giọng đọc trên thiết bị này.');};
    speechSynthesis.speak(utter);if(!voice.localService)notify('Đang dùng giọng của trình duyệt; giọng này có thể cần Internet.');
  }

  document.querySelectorAll('.mode-control button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('rr-sync').checked=state.sync;$('rr-sync').addEventListener('change',e=>{state.sync=e.target.checked;if(state.sync)syncScroll(enPane,viPane,true);persist();});
  document.documentElement.style.setProperty('--read-size',state.font+'px');
  function changeFont(n){state.font=Math.max(13,Math.min(22,state.font+n));document.documentElement.style.setProperty('--read-size',state.font+'px');persist();if(!hasHighlights)requestAnimationFrame(paintActive);}
  $('rr-font-less').addEventListener('click',()=>changeFont(-1));$('rr-font-more').addEventListener('click',()=>changeFont(1));
  $('rr-reset-reveals').addEventListener('click',()=>{revealed.clear();viGroups.forEach(g=>g.span.classList.remove('is-revealed'));document.body.classList.remove('challenge-revealed');setMode(state.mode,false);});
  $('rr-back-practice').addEventListener('click',()=>setMode('practice'));
  $('rr-pin').addEventListener('click',()=>{if(active){pinned=!pinned;updateSelection();}});
  $('rr-reveal').addEventListener('click',revealCurrent);
  $('rr-locate').addEventListener('click',()=>{if(active)scrollElement(viPane,viGroups[active.group.index].span,100);});
  $('rr-save').addEventListener('click',saveCurrent);
  $('rr-speak').addEventListener('click',speak);$('rr-stop').addEventListener('click',()=>window.speechSynthesis?.cancel());
  $('rr-rate').value=String(state.rate);$('rr-rate').addEventListener('change',e=>{state.rate=Number(e.target.value);persist();});
  $('rr-menu').addEventListener('click',toggleNav);$('rr-nav-backdrop').addEventListener('click',closeNav);
  $('rr-nav-search').addEventListener('input',updateNav);
  $('rr-complete').addEventListener('click',()=>{
    const path=currentPage.path;
    if(state.completed.includes(path))state.completed=state.completed.filter(p=>p!==path);else state.completed.push(path);
    $('rr-complete').textContent=state.completed.includes(path)?'✓ Đã đánh dấu đọc':'Đánh dấu đã đọc';$('rr-complete').setAttribute('aria-pressed',String(state.completed.includes(path)));
    updateNav();persist();
  });
  $('rr-next').addEventListener('click',()=>{const i=navOrder.indexOf(currentPage.path);route(navOrder[(i+1)%navOrder.length]);});
  $('rr-open-notebook').addEventListener('click',()=>openLibrary());
  $('rr-help').addEventListener('click',()=>$('rr-help-dialog').showModal());
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
  document.querySelectorAll('[data-library]').forEach(b=>b.addEventListener('click',()=>{libraryTab=b.dataset.library;reviewFlipped=false;renderLibrary();}));
  $('rr-library-search').addEventListener('input',renderLibrary);
  $('rr-export').addEventListener('click',exportData);$('rr-import-button').addEventListener('click',()=>$('rr-import').click());
  $('rr-import').addEventListener('change',e=>importData(e.target.files[0]));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(!$('rr-library').open&&!$('rr-help-dialog').open)clearSelection();closeNav();return;}
    if(e.target.closest('input,textarea,select,[contenteditable=true]')||e.ctrlKey||e.metaKey||e.altKey||$('rr-library').open||$('rr-help-dialog').open)return;
    if(e.key.toLowerCase()==='s'&&active){e.preventDefault();saveCurrent();}
    if(e.key.toLowerCase()==='t'&&active){e.preventDefault();revealCurrent();}
    // Keyboard access without changing any English source elements.
    if((e.key==='ArrowDown'||e.key==='ArrowUp')&&e.shiftKey&&enGroups.length){
      e.preventDefault();const d=e.key==='ArrowDown'?1:-1;
      const i=Math.max(0,Math.min(enGroups.length-1,(active?.group.index??-1)+d));
      pinned=false;activate({group:enGroups[i],pair:null,key:i+':paragraph'},true);pinned=true;updateSelection();scrollElement(enPane,enGroups[i].el,80);
    }
  });
  // Route our own hash links explicitly; no dependency on the document's base URL.
  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href^="#/"]');
    if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
    e.preventDefault();const hash=a.getAttribute('href');
    if(location.hash===hash){onRoute();closeNav();}else location.hash=hash;
  });
  document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();enRoot.focus();});
  window.addEventListener('hashchange',onRoute);
  window.addEventListener('beforeunload',()=>{rememberPosition();persist(true);window.speechSynthesis?.cancel();});
  // Read-only diagnostics used by the included automated tests and integrity report.
  Object.defineProperty(window,'C4ReaderDiagnostics',{value:()=>({page:currentPage?.path,units:enGroups.length,expected:currentPage?.units.length,phrasePairs:currentPairs,errors:[...validationErrors],highlightAPI:hasHighlights,mode:state.mode,pinned,active:active?{unit:active.group.index,phrase:active.pair?.en||null}:null,storageOK,words:state.words.length}),writable:false});
  onRoute();updateStorageNotice();
  if(!storageOK)notify('Trình duyệt không cho lưu dữ liệu. Bạn vẫn đọc được; hãy dùng Xuất JSON để sao lưu từ vựng.');
})();
