/* ================================================================
   OUTFIT STUDIO — script.js  (clean rewrite v3)
   Fixes: save, description, search, light/dark mode
   New: smart positions, auto outfit, color analysis, pinning
================================================================ */
'use strict';

const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

/* ── State ── */
let outfitItems = [], history = [], redoStack = [];
let slots = [], activeSlotId = null, selectedId = null;
let wardrobe = { 'cat-head':[], 'cat-top':[], 'cat-bottom':[], 'cat-shoes':[] };
let pendingImgSrc = null, snapEnabled = false, previewMode = false, toastTimer = null;
let drag = { active:null, id:null, ox:0, oy:0, moved:false };
let pinch = { active:false, dist:0, target:null };

/* ── DOM ── */
const canvas      = $('outfit-area');
const silhouette  = $('silhouette');
const snapH = $('snapH'), snapV = $('snapV');
const bgPicker = $('bgPicker'), bgSwatch = $('bgSwatch');
const silOpacity = $('silOpacity');
const undoBtn = $('undoBtn'), redoBtn = $('redoBtn');
const gridBtn = $('gridBtn'), guidesBtn = $('guidesBtn'), snapBtn = $('snapBtn');
const clearBtn = $('clearBtn'), exportBtn = $('exportBtn'), exportLabel = $('exportLabel');
const modeEdit = $('modeEdit'), modePreview = $('modePreview');
const sidebarEl = $('sidebar'), sidebarClose = $('sidebarClose'), sidebarOpen = $('sidebarOpen');
const outfitName = $('outfitName'), newSlotBtn = $('newSlotBtn'), slotList = $('slotList');
const wardSearch = $('wardSearch'), searchClear = $('searchClear');
const wardCount = $('wardCount'), wardEmpty = $('wardEmpty');
const fTabs = $('fTabs');
const itemTag = $('itemTag'), snapTag = $('snapTag'), posTag = $('posTag');
const toastEl = $('toast'), ctxMenu = $('ctxMenu');
const ipLed = $('ipLed'), ipEmpty = $('ipEmpty'), ipBody = $('ipBody');
const ipThumb = $('ipThumb'), ipItemName = $('ipItemName'), ipItemCat = $('ipItemCat');
const scaleSlider = $('scaleSlider'), scaleVal = $('scaleVal');
const rotateSlider = $('rotateSlider'), rotateVal = $('rotateVal');
const opacitySlider = $('opacitySlider'), opacityVal = $('opacityVal');
const filterBtns = $('filterBtns'), labelInput = $('labelInput');
const posX = $('posX'), posY = $('posY'), posW = $('posW'), posH = $('posH');

/* ================================================================
   UTILS
================================================================ */
function genId() { return Math.random().toString(36).slice(2,10)+Date.now().toString(36); }
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
function currentSlot() { return slots.find(s=>s.id===activeSlotId)??null; }
function syncSlotItems() { const s=currentSlot(); if(s) s.items=deepClone(outfitItems); }
function catLabel(cat) { return {'cat-head':'Kopfbedeckung','cat-top':'Oberteil','cat-bottom':'Hose/Rock','cat-shoes':'Schuhe'}[cat]||cat; }
function nextZ() { return outfitItems.length ? Math.max(...outfitItems.map(i=>i.zIndex||5))+1 : 5; }
function applySlotBg(slot) {
    const col = slot?.bg||'#18181f';
    canvas.style.background=col;
    if(bgPicker) bgPicker.value=col;
    syncBgSwatch();
}
function syncBgSwatch() { if(bgSwatch&&bgPicker) bgSwatch.style.background=bgPicker.value; }

/* ================================================================
   TOAST
================================================================ */
function toast(msg,dur=2200) {
    toastEl.textContent=msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toastEl.classList.add('hidden'),dur);
}

/* ================================================================
   ▸ CONFIRM MODAL (replaces ugly browser confirm())
================================================================ */
(function createConfirmModal(){
    const m = document.createElement('div');
    m.className = 'modal hidden'; m.id = 'confirmModal';
    m.innerHTML = `
        <div class="modal-bg" id="confirmBg"></div>
        <div class="modal-box" style="max-width:320px">
            <div class="modal-hd">
                <h2 class="modal-h2" id="confirmTitle">Bestätigen</h2>
            </div>
            <p id="confirmMsg" style="font-size:13px;color:var(--t1);margin-bottom:18px;line-height:1.55"></p>
            <div style="display:flex;gap:8px">
                <button class="modal-save" style="background:var(--s4);color:var(--t1);flex:1" id="confirmCancel">Abbrechen</button>
                <button class="modal-save" style="flex:1;background:var(--red);color:#fff" id="confirmOk">Leeren</button>
            </div>
        </div>`;
    document.body.appendChild(m);
    document.getElementById('confirmBg').addEventListener('click', closeConfirmModal);
    document.getElementById('confirmCancel').addEventListener('click', closeConfirmModal);
})();

let _confirmCallback = null;
function openConfirmModal(title, msg, onOk, okLabel='Leeren'){
    _confirmCallback = onOk;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmOk').textContent = okLabel;
    document.getElementById('confirmModal').classList.remove('hidden');
}
function closeConfirmModal(){
    document.getElementById('confirmModal').classList.add('hidden');
    _confirmCallback = null;
}
document.getElementById('confirmOk').addEventListener('click', ()=>{
    const cb = _confirmCallback;
    closeConfirmModal();
    if(cb) cb();
});

/* ================================================================
   THEME
================================================================ */
function applyTheme(t) {
    document.body.classList.toggle('light', t==='light');
    localStorage.setItem('os_theme',t);
}
$('themeToggle')?.addEventListener('click',()=>{
    applyTheme(document.body.classList.contains('light')?'dark':'light');
    toast(document.body.classList.contains('light')?'☀ Light Mode':'🌙 Dark Mode');
});

/* ================================================================
   LOAD
================================================================ */
window.addEventListener('load',()=>{
    applyTheme(localStorage.getItem('os_theme')||'dark');
    setTimeout(()=>{
        $('loadScreen').classList.add('out');
        $('app').classList.remove('hidden');
        requestAnimationFrame(()=>$('app').classList.add('show'));
        init();
    },900);
});

/* ================================================================
   INIT
================================================================ */
function init() {
    loadWardrobeFromStorage();
    loadSlotsFromStorage();

    if(!slots.length) {
        const id=genId();
        slots.push({id,name:'Outfit 1',items:[],bg:'#18181f'});
        activeSlotId=id;
        saveSlotsToStorage();
    } else {
        if(!activeSlotId||!slots.find(s=>s.id===activeSlotId)) activeSlotId=slots[0].id;
        const s=currentSlot();
        outfitItems=deepClone(s?.items||[]);
        applySlotBg(s);
    }

    renderSlots();
    updateOutfitName();
    renderFromState();
    pushHistory();
    updateWardrobeCount();
    syncBgSwatch();
}

/* ================================================================
   HISTORY
================================================================ */
function pushHistory() {
    history.push(deepClone(outfitItems));
    if(history.length>80) history.shift();
    redoStack=[];
    updateItemCount();
}
function undo() {
    if(history.length<=1){toast('Nichts rückgängig');return;}
    redoStack.push(deepClone(outfitItems));
    history.pop();
    outfitItems=deepClone(history[history.length-1]);
    renderFromState(); saveOutfit(); toast('↩ Rückgängig');
}
function redo() {
    if(!redoStack.length){toast('Nichts wiederherstellen');return;}
    history.push(deepClone(outfitItems));
    outfitItems=deepClone(redoStack.pop());
    renderFromState(); saveOutfit(); toast('↪ Wiederholen');
}
undoBtn.addEventListener('click',undo);
redoBtn.addEventListener('click',redo);

/* ================================================================
   SIDEBAR
================================================================ */
sidebarClose.addEventListener('click',()=>{ sidebarEl.classList.add('closed'); sidebarOpen.classList.remove('hidden'); });
sidebarOpen.addEventListener('click',()=>{ sidebarEl.classList.remove('closed'); sidebarOpen.classList.add('hidden'); });

/* ================================================================
   GRID / GUIDES / SNAP
================================================================ */
gridBtn.addEventListener('click',()=>{ $('gridLayer').classList.toggle('hidden'); gridBtn.classList.toggle('active'); });
guidesBtn.addEventListener('click',()=>{ $('guidesLayer').classList.toggle('hidden'); guidesBtn.classList.toggle('active'); });
snapBtn.addEventListener('click',()=>{ snapEnabled=!snapEnabled; snapBtn.classList.toggle('active',snapEnabled); snapTag.textContent=snapEnabled?'Einrasten an':'Einrasten aus'; toast(snapEnabled?'⊙ Snap aktiviert':'⊙ Snap deaktiviert'); });

/* ================================================================
   MODE
================================================================ */
modeEdit.addEventListener('click',()=>{ previewMode=false; modeEdit.classList.add('active'); modePreview.classList.remove('active'); canvas.classList.remove('preview-mode'); toast('✏ Bearbeiten'); });
modePreview.addEventListener('click',()=>{ previewMode=true; modePreview.classList.add('active'); modeEdit.classList.remove('active'); canvas.classList.add('preview-mode'); deselectAll(); toast('👁 Vorschau'); });

/* ================================================================
   BG COLOR
================================================================ */
bgPicker.addEventListener('input',()=>{ canvas.style.background=bgPicker.value; syncBgSwatch(); const s=currentSlot(); if(s){s.bg=bgPicker.value; saveSlotsToStorage();} });
silOpacity.addEventListener('input',()=>{ silhouette.style.opacity=silOpacity.value/100; });

/* ================================================================
   UPLOAD
================================================================ */
$('upload').addEventListener('change',function(){
    const files=[...this.files]; if(!files.length)return; this.value='';
    let i=0;
    function next(){
        if(i>=files.length)return;
        const r=new FileReader();
        r.onload=e=>{ pendingImgSrc=e.target.result; openCatModal(); };
        r.readAsDataURL(files[i++]);
    }
    window._nextUpload=next;
    next();
});

/* ================================================================
   CATEGORY MODAL
================================================================ */
function openCatModal(){
    const preview=$('catImgPreview'); preview.innerHTML='';
    if(pendingImgSrc){ const img=document.createElement('img'); img.src=pendingImgSrc; img.style.cssText='width:100%;height:100%;object-fit:cover;'; preview.appendChild(img); }
    $('catModal').classList.remove('hidden');
}
function closeCatModal(){ $('catModal').classList.add('hidden'); pendingImgSrc=null; }

$('catBg').addEventListener('click',closeCatModal);
$('catClose').addEventListener('click',closeCatModal);

$$('.cg-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
        if(!pendingImgSrc)return;
        const cat=btn.dataset.cat, src=pendingImgSrc;
        addWardrobeItem(cat,src,true);
        closeCatModal();
        toast('✦ Zur Garderobe hinzugefügt');
        setTimeout(()=>window._nextUpload&&window._nextUpload(),200);
    });
});

/* ================================================================
   WARDROBE
================================================================ */
function addWardrobeItem(cat,src,saveToStorage=false){
    if(saveToStorage){ wardrobe[cat].push(src); saveWardrobeToStorage(); }
    renderWardrobeTile(cat,src);
    updateWardrobeCount(); updateCatCounts();
}
function renderWardrobeTile(cat,src){
    const grid=$(cat); if(!grid)return;
    const tile=document.createElement('div'); tile.className='w-tile'; tile.dataset.cat=cat; tile.dataset.src=src;
    const img=document.createElement('img'); img.src=src; img.alt=catLabel(cat);
    const ov=document.createElement('div'); ov.className='w-tile-ov';
    const del=document.createElement('button'); del.className='w-del'; del.innerHTML='✕';
    del.addEventListener('click',e=>{
        e.stopPropagation();
        wardrobe[cat]=wardrobe[cat].filter(s=>s!==src);
        saveWardrobeToStorage(); tile.remove();
        updateWardrobeCount(); updateCatCounts(); toast('Aus Garderobe entfernt');
    });
    ov.appendChild(del); tile.appendChild(img); tile.appendChild(ov);
    tile.addEventListener('click',()=>{ if(!previewMode) placeItem(src,cat); });
    grid.appendChild(tile);
}
function loadWardrobeFromStorage(){
    try{ const d=localStorage.getItem('os_wardrobe_v2'); if(d) wardrobe=JSON.parse(d); }catch{}
    Object.entries(wardrobe).forEach(([cat,srcs])=>srcs.forEach(src=>renderWardrobeTile(cat,src)));
}
function saveWardrobeToStorage(){ localStorage.setItem('os_wardrobe_v2',JSON.stringify(wardrobe)); }
function updateWardrobeCount(){ const t=Object.values(wardrobe).reduce((s,a)=>s+a.length,0); wardCount.textContent=`${t} Teile`; }
function updateCatCounts(){ ['cat-head','cat-top','cat-bottom','cat-shoes'].forEach(cat=>{ const el=$(`cnt-${cat}`); if(el) el.textContent=wardrobe[cat]?.length??0; }); }

/* Wardrobe search — filter tiles by category & text label search */
wardSearch.addEventListener('input',()=>{ searchClear.classList.toggle('hidden',!wardSearch.value); filterWardrobe(); });
searchClear.addEventListener('click',()=>{ wardSearch.value=''; searchClear.classList.add('hidden'); filterWardrobe(); });
fTabs.addEventListener('click',e=>{ const tab=e.target.closest('.f-tab'); if(!tab)return; $$('.f-tab').forEach(t=>t.classList.remove('active')); tab.classList.add('active'); filterWardrobe(); });

function filterWardrobe(){
    const catFil = (fTabs.querySelector('.f-tab.active')?.dataset?.cat)||'all';
    const q = (wardSearch.value||'').toLowerCase().trim();
    let anyVisible = false;
    $$('.c-block').forEach(block=>{
        const blockCat = block.dataset.cat;
        const catMatch = catFil==='all' || catFil===blockCat;
        if(!catMatch){ block.classList.add('hidden'); return; }
        // if text query, filter individual tiles by category name
        if(q){
            const label = catLabel(blockCat).toLowerCase();
            const tiles = block.querySelectorAll('.w-tile');
            let blockHasTile = false;
            tiles.forEach(tile=>{
                // Match against category name or the tile's custom label attr if present
                const tlabel = (tile.dataset.label||'').toLowerCase();
                const match = label.includes(q) || tlabel.includes(q);
                tile.style.display = match ? '' : 'none';
                if(match) blockHasTile=true;
            });
            block.classList.toggle('hidden', !blockHasTile);
            if(blockHasTile) anyVisible=true;
        } else {
            block.querySelectorAll('.w-tile').forEach(t=>t.style.display='');
            block.classList.remove('hidden');
            anyVisible=true;
        }
    });
    wardEmpty.classList.toggle('hidden', anyVisible);
}

/* ================================================================
   OUTFIT SLOTS — SAVE / LOAD
================================================================ */
function saveSlotsToStorage(){
    syncSlotItems();
    localStorage.setItem('os_slots_v3',JSON.stringify({slots,activeSlotId}));
}
function loadSlotsFromStorage(){
    try{ const d=localStorage.getItem('os_slots_v3'); if(d){const p=JSON.parse(d);slots=p.slots;activeSlotId=p.activeSlotId;} }catch{}
}
function saveOutfit(){ saveSlotsToStorage(); updateItemCount(); }

/* ================================================================
   SLOTS — CRUD
================================================================ */
function createSlot(){
    syncSlotItems();
    const id=genId();
    slots.push({id,name:`Outfit ${slots.length+1}`,items:[],bg:'#18181f'});
    activeSlotId=id; outfitItems=[]; history=[]; redoStack=[];
    renderFromState(); pushHistory(); saveSlotsToStorage(); renderSlots(); updateOutfitName();
    toast('✦ Neues Outfit erstellt');
}
function switchSlot(id){
    if(id===activeSlotId)return;
    syncSlotItems(); activeSlotId=id;
    const s=currentSlot();
    outfitItems=deepClone(s?.items||[]);
    history=[]; redoStack=[];
    deselectAll(); renderFromState(); pushHistory(); applySlotBg(s);
    saveSlotsToStorage(); renderSlots(); updateOutfitName();
}
function deleteSlot(id){
    if(slots.length<=1){ outfitItems=[]; currentSlot().items=[]; renderFromState(); pushHistory(); saveOutfit(); toast('Canvas geleert'); return; }
    const idx=slots.findIndex(s=>s.id===id); slots.splice(idx,1);
    if(activeSlotId===id){
        activeSlotId=slots[Math.min(idx,slots.length-1)].id;
        const s=currentSlot(); outfitItems=deepClone(s?.items||[]); history=[]; redoStack=[];
        renderFromState(); pushHistory(); applySlotBg(s);
    }
    saveSlotsToStorage(); renderSlots(); updateOutfitName();
}
function renameSlot(id,name){ const s=slots.find(x=>x.id===id); if(s){s.name=name;saveSlotsToStorage();renderSlots();updateOutfitName();} }
function updateOutfitName(){ outfitName.textContent=currentSlot()?.name||'—'; }

/* Outfit search */
const outfitSearchEl = $('outfitSearch');
const outfitSearchClearEl = $('outfitSearchClear');
outfitSearchEl?.addEventListener('input',()=>{ outfitSearchClearEl.classList.toggle('hidden',!outfitSearchEl.value); renderSlots(); });
outfitSearchClearEl?.addEventListener('click',()=>{ outfitSearchEl.value=''; outfitSearchClearEl.classList.add('hidden'); renderSlots(); });

function renderSlots(){
    slotList.innerHTML='';
    const q=(outfitSearchEl?.value||'').toLowerCase().trim();
    // sort pinned first
    const sorted=[...slots].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
    const filtered=q ? sorted.filter(s=>s.name.toLowerCase().includes(q)||(s.description||'').toLowerCase().includes(q)) : sorted;

    if(!filtered.length){
        slotList.innerHTML='<div style="padding:6px 4px;font-size:11px;color:var(--t3)">Kein Outfit gefunden</div>';
        return;
    }
    filtered.forEach(slot=>{
        const item=document.createElement('div');
        item.className='slot-item'+(slot.id===activeSlotId?' active':'')+(slot.pinned?' pinned':'');

        const bar=document.createElement('div'); bar.className='slot-bar';
        const name=document.createElement('span'); name.className='slot-name';
        if(q){
            const esc=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
            name.innerHTML=(slot.pinned?'📌 ':'')+slot.name.replace(new RegExp(esc,'gi'),m=>`<mark>${m}</mark>`);
        } else {
            name.textContent=(slot.pinned?'📌 ':'')+slot.name;
        }

        const acts=document.createElement('div'); acts.className='slot-acts';

        // Pin button
        const pinBtn=document.createElement('button');
        pinBtn.className='slot-act'; pinBtn.title='Anpinnen'; pinBtn.textContent='📌';
        pinBtn.addEventListener('click',e=>{ e.stopPropagation(); slot.pinned=!slot.pinned; saveSlotsToStorage(); renderSlots(); toast(slot.pinned?'📌 Angeheftet':'📌 Losgelöst'); });

        const renBtn=document.createElement('button');
        renBtn.className='slot-act'; renBtn.title='Umbenennen'; renBtn.textContent='✏';
        renBtn.addEventListener('click',e=>{ e.stopPropagation(); openRenameModal(slot.id); });

        const delBtn=document.createElement('button');
        delBtn.className='slot-act del'; delBtn.title='Löschen'; delBtn.textContent='✕';
        delBtn.addEventListener('click',e=>{
            e.stopPropagation();
            const _sid=slot.id, _sname=slot.name;
            openConfirmModal('Outfit löschen?',`"${_sname}" wirklich löschen?`,()=>deleteSlot(_sid),'Löschen');
        });

        acts.append(pinBtn,renBtn,delBtn);
        item.append(bar,name,acts);
        item.addEventListener('click',()=>switchSlot(slot.id));
        slotList.appendChild(item);
    });
}

newSlotBtn.addEventListener('click',()=>createSlot());

/* Rename modal */
let renamingSlot=null;
function openRenameModal(id){ renamingSlot=id; const s=slots.find(x=>x.id===id); $('renameInput').value=s?.name||''; $('renameModal').classList.remove('hidden'); setTimeout(()=>$('renameInput').focus(),50); }
$('renameBg').addEventListener('click',()=>$('renameModal').classList.add('hidden'));
$('renameClose').addEventListener('click',()=>$('renameModal').classList.add('hidden'));
$('renameConfirm').addEventListener('click',()=>{ const v=$('renameInput').value.trim(); if(v&&renamingSlot)renameSlot(renamingSlot,v); $('renameModal').classList.add('hidden'); toast('Umbenannt'); });
$('renameInput').addEventListener('keydown',e=>{ if(e.key==='Enter')$('renameConfirm').click(); if(e.key==='Escape')$('renameModal').classList.add('hidden'); });

/* ================================================================
   ITEM COUNT
================================================================ */
function updateItemCount(){ const n=outfitItems.length; itemTag.textContent=n===1?'1 Teil':`${n} Teile`; }

/* ================================================================
   CLEAR
================================================================ */
clearBtn.addEventListener('click',()=>{
    if(!outfitItems.length)return;
    openConfirmModal('Canvas leeren?','Alle Teile werden vom Canvas entfernt. Die Garderobe bleibt erhalten.',()=>{
        outfitItems=[]; canvas.querySelectorAll('.draggable,.item-label').forEach(el=>el.remove());
        showEmptyState(); deselectAll(); pushHistory(); saveOutfit(); toast('Canvas geleert');
    });
});

/* ================================================================
   SMART POSITIONS
================================================================ */
function smartPos(cat){
    const W=canvas.clientWidth, H=canvas.clientHeight, j=()=>(Math.random()-.5)*24;
    switch(cat){
        case 'cat-head':   return {x:W*.5-55+j(),y:H*.04+j()};
        case 'cat-top':    return {x:W*.5-65+j(),y:H*.26+j()};
        case 'cat-bottom': return {x:W*.5-60+j(),y:H*.52+j()};
        case 'cat-shoes':  return {x:W*.5-55+j(),y:H*.75+j()};
        default:           return {x:W*.5-65+j(),y:H*.38+j()};
    }
}

/* ================================================================
   PLACE ITEM ON CANVAS
================================================================ */
function placeItem(src,cat){
    // Duplicate detection
    if(outfitItems.some(i=>i.src===src)) toast('⚠ Bereits im Outfit vorhanden');
    const pos=smartPos(cat);
    const item={id:genId(),src,cat,x:pos.x,y:pos.y,scale:1,rotate:0,opacity:1,flipX:false,flipV:false,filter:'none',label:'',zIndex:nextZ()};
    createDraggable(item);
    pushHistory(); saveOutfit();
}

/* ================================================================
   CREATE DRAGGABLE
================================================================ */
function createDraggable(item,fromState=false){
    hideEmptyState();
    const img=document.createElement('img');
    img.className='draggable'; img.src=item.src; img.dataset.id=item.id;
    img.style.zIndex=item.zIndex||5; img.style.opacity=item.opacity??1;
    applyTransform(img,item); applyFilter(img,item);
    canvas.appendChild(img);
    if(item.label) renderLabel(item);
    if(!fromState){ outfitItems.push(item); updateItemCount(); }

    img.addEventListener('pointerdown',e=>{
        if(previewMode)return;
        e.preventDefault(); e.stopPropagation();
        deselectAll(); selectItem(item.id);
        drag.active=img; drag.id=item.id; drag.moved=false;
        const rect=canvas.getBoundingClientRect();
        drag.ox=e.clientX-rect.left-item.x; drag.oy=e.clientY-rect.top-item.y;
        img.setPointerCapture(e.pointerId);
    });
    img.addEventListener('contextmenu',e=>{ if(previewMode)return; e.preventDefault(); e.stopPropagation(); deselectAll(); selectItem(item.id); showCtxMenu(e.clientX,e.clientY); });
    let lpTimer=null;
    img.addEventListener('touchstart',e=>{ lpTimer=setTimeout(()=>{ const t=e.touches[0]; selectItem(item.id); showCtxMenu(t.clientX,t.clientY); },600); },{passive:true});
    img.addEventListener('touchend',()=>clearTimeout(lpTimer));
    img.addEventListener('touchmove',()=>clearTimeout(lpTimer));
}

/* ================================================================
   TRANSFORM / FILTER
================================================================ */
function applyTransform(el,item){
    const fX=item.flipX?-1:1, fY=item.flipV?-1:1;
    el.style.transform=`translate(${item.x}px,${item.y}px) scale(${(item.scale||1)*fX},${(item.scale||1)*fY}) rotate(${item.rotate||0}deg)`;
}
function applyFilter(el,item){ el.style.filter=(item.filter&&item.filter!=='none')?item.filter:''; }
function syncTransform(id){
    const item=outfitItems.find(i=>i.id===id), el=canvas.querySelector(`.draggable[data-id="${id}"]`);
    if(!item||!el)return;
    applyTransform(el,item); applyFilter(el,item);
    el.style.opacity=item.opacity??1;
    syncLabel(item); updatePositionReadout(item,el);
}

/* ================================================================
   DRAG
================================================================ */
document.addEventListener('pointermove',e=>{
    if(!drag.active)return; drag.moved=true;
    const item=outfitItems.find(i=>i.id===drag.id); if(!item)return;
    const rect=canvas.getBoundingClientRect();
    const elW=drag.active.offsetWidth, elH=drag.active.offsetHeight;
    let nx=e.clientX-rect.left-drag.ox, ny=e.clientY-rect.top-drag.oy;
    nx=Math.max(0,Math.min(nx,rect.width-elW)); ny=Math.max(0,Math.min(ny,rect.height-elH));
    if(snapEnabled){
        // Snap item CENTER to canvas center
        const itemCX = nx + elW/2, itemCY = ny + elH/2;
        const canvasCX = rect.width/2, canvasCY = rect.height/2;
        const SNAP = 14;
        if(Math.abs(itemCX-canvasCX)<SNAP){
            nx = canvasCX - elW/2;
            snapV.classList.remove('hidden'); snapV.style.left = canvasCX + 'px';
        } else { snapV.classList.add('hidden'); }
        if(Math.abs(itemCY-canvasCY)<SNAP){
            ny = canvasCY - elH/2;
            snapH.classList.remove('hidden'); snapH.style.top = canvasCY + 'px';
        } else { snapH.classList.add('hidden'); }
    }
    item.x=nx; item.y=ny;
    applyTransform(drag.active,item); syncLabel(item);
    updatePositionReadout(item,drag.active);
    posTag.textContent=`Pos: ${Math.round(nx)}×${Math.round(ny)}`;
});

document.addEventListener('pointerup',()=>{
    if(!drag.active)return;
    snapH.classList.add('hidden'); snapV.classList.add('hidden');
    if(drag.moved){saveOutfit();pushHistory();}
    drag.active=null; drag.id=null; drag.moved=false;
});

canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const el=e.target.closest('.draggable'); if(!el)return;
    const item=outfitItems.find(i=>i.id===el.dataset.id); if(!item)return;
    item.scale=Math.max(0.1,Math.min(5,(item.scale||1)+(e.deltaY<0?0.06:-0.06)));
    applyTransform(el,item); syncLabel(item); saveOutfit();
    if(selectedId===item.id) updateInspector(item,el);
},{passive:false});

canvas.addEventListener('touchstart',e=>{ if(e.touches.length===2){pinch.active=true;pinch.dist=tdist(e.touches);pinch.target=e.touches[0].target?.closest('.draggable')||null;} },{passive:true});
canvas.addEventListener('touchmove',e=>{ if(!pinch.active||e.touches.length!==2||!pinch.target)return; e.preventDefault(); const nd=tdist(e.touches),delta=nd-pinch.dist;pinch.dist=nd; const item=outfitItems.find(i=>i.id===pinch.target.dataset.id);if(!item)return; item.scale=Math.max(0.1,Math.min(5,(item.scale||1)+delta*0.003)); applyTransform(pinch.target,item);saveOutfit(); },{passive:false});
canvas.addEventListener('touchend',()=>{pinch.active=false;pinch.target=null;});
function tdist(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}

/* ================================================================
   SELECTION
================================================================ */
function selectItem(id){
    selectedId=id;
    const el=canvas.querySelector(`.draggable[data-id="${id}"]`), item=outfitItems.find(i=>i.id===id);
    if(!el||!item)return;
    el.classList.add('sel'); el.style.zIndex=999;
    ipLed.classList.add('on'); ipEmpty.classList.add('hidden'); ipBody.classList.remove('hidden');
    updateInspector(item,el);
}
function deselectAll(){
    canvas.querySelectorAll('.draggable.sel').forEach(el=>{ el.classList.remove('sel'); const item=outfitItems.find(i=>i.id===el.dataset.id); if(item)el.style.zIndex=item.zIndex||5; });
    selectedId=null; ipLed.classList.remove('on'); ipEmpty.classList.remove('hidden'); ipBody.classList.add('hidden');
}
canvas.addEventListener('click',e=>{ if(!e.target.closest('.draggable'))deselectAll(); });

/* ================================================================
   INSPECTOR
================================================================ */
function updateInspector(item,el){
    ipThumb.src=item.src; ipItemName.textContent=item.label||'—'; ipItemCat.textContent=catLabel(item.cat||'');
    scaleSlider.value=Math.round((item.scale||1)*100); scaleVal.textContent=scaleSlider.value+'%';
    rotateSlider.value=item.rotate||0; rotateVal.textContent=(item.rotate||0)+'°';
    opacitySlider.value=Math.round((item.opacity??1)*100); opacityVal.textContent=opacitySlider.value+'%';
    filterBtns.querySelectorAll('.ip-f').forEach(b=>b.classList.toggle('active',b.dataset.f===(item.filter||'none')));
    labelInput.value=item.label||'';
    updatePositionReadout(item,el);
}
function updatePositionReadout(item,el){
    posX.textContent=Math.round(item.x)+'px'; posY.textContent=Math.round(item.y)+'px';
    posW.textContent=Math.round(el.offsetWidth*(item.scale||1))+'px'; posH.textContent=Math.round(el.offsetHeight*(item.scale||1))+'px';
}

scaleSlider.addEventListener('input',()=>{ if(!selectedId)return; const item=outfitItems.find(i=>i.id===selectedId);if(!item)return; item.scale=scaleSlider.value/100; scaleVal.textContent=scaleSlider.value+'%'; syncTransform(selectedId); saveOutfit(); });
rotateSlider.addEventListener('input',()=>{ if(!selectedId)return; const item=outfitItems.find(i=>i.id===selectedId);if(!item)return; item.rotate=parseInt(rotateSlider.value); rotateVal.textContent=rotateSlider.value+'°'; syncTransform(selectedId); saveOutfit(); });
opacitySlider.addEventListener('input',()=>{ if(!selectedId)return; const item=outfitItems.find(i=>i.id===selectedId);if(!item)return; item.opacity=opacitySlider.value/100; opacityVal.textContent=opacitySlider.value+'%'; syncTransform(selectedId); saveOutfit(); });
filterBtns.addEventListener('click',e=>{ const btn=e.target.closest('.ip-f'); if(!btn||!selectedId)return; const item=outfitItems.find(i=>i.id===selectedId);if(!item)return; item.filter=btn.dataset.f; filterBtns.querySelectorAll('.ip-f').forEach(b=>b.classList.toggle('active',b===btn)); syncTransform(selectedId); saveOutfit(); pushHistory(); });
labelInput.addEventListener('input',()=>{ if(!selectedId)return; const item=outfitItems.find(i=>i.id===selectedId);if(!item)return; item.label=labelInput.value; ipItemName.textContent=item.label||'—'; syncLabel(item); saveOutfit(); });

/* Inspector actions */
function selectedAction(fn,msg){ if(!selectedId)return; const item=outfitItems.find(i=>i.id===selectedId);if(!item)return; fn(item); syncTransform(selectedId); saveOutfit(); pushHistory(); if(msg)toast(msg); }
$('aFlipH').addEventListener('click',()=>selectedAction(item=>{item.flipX=!item.flipX;},'↔ Gespiegelt'));
$('aFlipV').addEventListener('click',()=>selectedAction(item=>{item.flipV=!item.flipV;},'↕ Gekippt'));
$('aDupe').addEventListener('click',()=>{if(selectedId)duplicateItem(selectedId);});
$('aFront').addEventListener('click',()=>selectedAction(item=>{item.zIndex=nextZ();},'Nach vorne'));
$('aBack').addEventListener('click',()=>selectedAction(item=>{item.zIndex=Math.max(1,Math.min(...outfitItems.map(i=>i.zIndex||5))-1);},'Nach hinten'));
$('aDelete').addEventListener('click',e=>{e.stopPropagation();const _id=selectedId;if(_id)deleteItem(_id);});

/* ================================================================
   DELETE / DUPLICATE
================================================================ */
function deleteItem(id){
    if(!id) return;
    outfitItems = outfitItems.filter(i => i.id !== id);
    canvas.querySelectorAll(`.draggable[data-id="${id}"]`).forEach(el=>el.remove());
    canvas.querySelectorAll(`.item-label[data-id="${id}"]`).forEach(el=>el.remove());
    selectedId = null;
    ipLed.classList.remove('on');
    ipEmpty.classList.remove('hidden');
    ipBody.classList.add('hidden');
    if(!outfitItems.length) showEmptyState();
    pushHistory(); saveOutfit(); toast('✕ Teil entfernt');
}
function duplicateItem(id){
    const orig=outfitItems.find(i=>i.id===id); if(!orig)return;
    const cl=deepClone(orig); cl.id=genId(); cl.x+=22; cl.y+=22; cl.zIndex=nextZ();
    createDraggable(cl); outfitItems.push(cl);
    deselectAll(); selectItem(cl.id); pushHistory(); saveOutfit(); toast('⊕ Dupliziert');
}

/* ================================================================
   LABELS
================================================================ */
function renderLabel(item){ if(!item.label)return; let lbl=canvas.querySelector(`.item-label[data-id="${item.id}"]`); if(lbl){lbl.textContent=item.label;positionLabel(lbl,item);return;} lbl=document.createElement('div'); lbl.className='item-label'; lbl.dataset.id=item.id; lbl.textContent=item.label; canvas.appendChild(lbl); positionLabel(lbl,item); }
function syncLabel(item){ const lbl=canvas.querySelector(`.item-label[data-id="${item.id}"]`); if(!item.label){lbl?.remove();return;} if(!lbl){renderLabel(item);return;} lbl.textContent=item.label; positionLabel(lbl,item); }
function positionLabel(lbl,item){ const el=canvas.querySelector(`.draggable[data-id="${item.id}"]`);if(!el)return; const er=el.getBoundingClientRect(),cr=canvas.getBoundingClientRect(); lbl.style.left=(er.left-cr.left+er.width/2)+'px'; lbl.style.top=(er.bottom-cr.top+6)+'px'; }

/* ================================================================
   EMPTY STATE
================================================================ */
function showEmptyState(){
    if($('emptyState'))return;
    const d=document.createElement('div'); d.className='empty-state'; d.id='emptyState';
    d.innerHTML='<div class="es-star">✦</div><p class="es-title">Dein Look wartet</p><span class="es-sub">Wähle Teile aus der Garderobe</span>';
    canvas.appendChild(d);
}
function hideEmptyState(){ $('emptyState')?.remove(); }

/* ================================================================
   RENDER FROM STATE
================================================================ */
function renderFromState(){
    canvas.querySelectorAll('.draggable,.item-label').forEach(el=>el.remove());
    $('emptyState')?.remove();
    if(!outfitItems.length){showEmptyState();updateItemCount();return;}
    outfitItems.forEach(item=>createDraggable(item,true));
    outfitItems.forEach(item=>{if(item.label)renderLabel(item);});
    updateItemCount();
}

/* ================================================================
   CONTEXT MENU
================================================================ */
function showCtxMenu(x,y){ ctxMenu.classList.remove('hidden'); const mw=ctxMenu.offsetWidth,mh=ctxMenu.offsetHeight; ctxMenu.style.left=Math.min(x,window.innerWidth-mw-8)+'px'; ctxMenu.style.top=Math.min(y,window.innerHeight-mh-8)+'px'; }
function hideCtxMenu(){ ctxMenu.classList.add('hidden'); }
document.addEventListener('click',e=>{if(!ctxMenu.contains(e.target))hideCtxMenu();});

$('ctxFront').addEventListener('click',()=>{selectedAction(item=>{item.zIndex=nextZ();},'Nach vorne');hideCtxMenu();});
$('ctxBack').addEventListener('click',()=>{selectedAction(item=>{item.zIndex=Math.max(1,Math.min(...outfitItems.map(i=>i.zIndex||5))-1);},'Nach hinten');hideCtxMenu();});
$('ctxFlipH').addEventListener('click',()=>{selectedAction(item=>{item.flipX=!item.flipX;},'↔ Gespiegelt');hideCtxMenu();});
$('ctxFlipV').addEventListener('click',()=>{selectedAction(item=>{item.flipV=!item.flipV;},'↕ Gekippt');hideCtxMenu();});
$('ctxDupe').addEventListener('click',()=>{if(selectedId)duplicateItem(selectedId);hideCtxMenu();});
$('ctxDelete').addEventListener('click',e=>{e.stopPropagation();const _id=selectedId;hideCtxMenu();if(_id)deleteItem(_id);});

/* ================================================================
   KEYBOARD SHORTCUTS
================================================================ */
document.addEventListener('keydown',e=>{
    const tag=document.activeElement.tagName, editing=tag==='INPUT'||tag==='TEXTAREA';
    if(!editing){
        if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo();}
        if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.shiftKey&&e.key==='Z'))){e.preventDefault();redo();}
        if((e.ctrlKey||e.metaKey)&&e.key==='d'){e.preventDefault();if(selectedId)duplicateItem(selectedId);}
        if(e.key==='Delete'||e.key==='Backspace'){if(selectedId)deleteItem(selectedId);}
        if(e.key==='Escape'){deselectAll();hideCtxMenu();}
        if(e.key==='g')gridBtn.click();
        if(e.key==='r')guidesBtn.click();
        if(e.key==='s')snapBtn.click();
        if(selectedId&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
            e.preventDefault();
            const item=outfitItems.find(i=>i.id===selectedId); if(!item)return;
            const step=e.shiftKey?10:1;
            if(e.key==='ArrowLeft')item.x-=step; if(e.key==='ArrowRight')item.x+=step;
            if(e.key==='ArrowUp')item.y-=step; if(e.key==='ArrowDown')item.y+=step;
            syncTransform(selectedId); saveOutfit();
        }
    }
});

/* ================================================================
   EXPORT
================================================================ */
exportBtn.addEventListener('click',async()=>{
    if(!window.html2canvas){
        exportLabel.textContent='Lädt…'; exportBtn.disabled=true;
        try{ await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'); }
        catch{ toast('Export fehlgeschlagen'); exportLabel.textContent='Exportieren'; exportBtn.disabled=false; return; }
    }
    exportLabel.textContent='Rendert…'; exportBtn.disabled=true;
    deselectAll(); hideCtxMenu();
    try{
        const cnv=await html2canvas(canvas,{useCORS:true,allowTaint:true,backgroundColor:canvas.style.background||'#18181f',scale:2,logging:false});
        const name=(currentSlot()?.name||'outfit').replace(/\s+/g,'_');
        const link=document.createElement('a'); link.download=name+'.png'; link.href=cnv.toDataURL('image/png'); link.click();
        toast('✦ Exportiert als PNG');
    }catch(err){toast('Export fehlgeschlagen: '+err.message);}
    finally{exportLabel.textContent='Exportieren';exportBtn.disabled=false;}
});
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}

/* ================================================================
   AUTO OUTFIT GENERATOR
================================================================ */
$('autoOutfitBtn')?.addEventListener('click',()=>{
    const pick=cat=>{const a=wardrobe[cat]||[];return a.length?a[Math.floor(Math.random()*a.length)]:null;};
    const top=pick('cat-top'), bottom=pick('cat-bottom'), shoes=pick('cat-shoes'), head=pick('cat-head');
    if(!top&&!bottom&&!shoes){toast('⚠ Garderobe leer');return;}
    outfitItems=[]; canvas.querySelectorAll('.draggable,.item-label').forEach(el=>el.remove());
    showEmptyState(); deselectAll();
    let placed=0;
    [[head,'cat-head'],[top,'cat-top'],[bottom,'cat-bottom'],[shoes,'cat-shoes']].forEach(([src,cat])=>{
        if(!src)return;
        const pos=smartPos(cat);
        const item={id:genId(),src,cat,x:pos.x,y:pos.y,scale:1,rotate:0,opacity:1,flipX:false,flipV:false,filter:'none',label:'',zIndex:nextZ()};
        createDraggable(item); placed++;
    });
    pushHistory(); saveOutfit(); toast(`🎲 Auto Outfit: ${placed} Teile gesetzt`);
});

/* ================================================================
   COLOR ANALYSIS
================================================================ */
$('colorAnalysisBtn')?.addEventListener('click',()=>{ if(!outfitItems.length){toast('Keine Teile auf Canvas');return;} analyzeColors(); });
$('colorBg')?.addEventListener('click',()=>$('colorModal').classList.add('hidden'));
$('colorClose')?.addEventListener('click',()=>$('colorModal').classList.add('hidden'));

function getDominantColor(src){
    return new Promise(resolve=>{
        const img=new Image(); img.crossOrigin='anonymous';
        img.onload=()=>{
            const c=document.createElement('canvas'); c.width=c.height=64;
            const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,64,64);
            const data=ctx.getImageData(0,0,64,64).data;
            let r=0,g=0,b=0,n=0;
            for(let i=0;i<data.length;i+=4){ if(data[i+3]<128)continue; r+=data[i];g+=data[i+1];b+=data[i+2];n++; }
            resolve(n?[Math.round(r/n),Math.round(g/n),Math.round(b/n)]:null);
        };
        img.onerror=()=>resolve(null); img.src=src;
    });
}
function rgbToHsl(r,g,b){
    r/=255;g/=255;b/=255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    let h,s,l=(max+min)/2;
    if(max===min){h=s=0;}
    else{const d=max-min;s=l>.5?d/(2-max-min):d/(max+min);switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}
    return[Math.round(h*360),Math.round(s*100),Math.round(l*100)];
}
function colorName(r,g,b){
    const[h,s,l]=rgbToHsl(r,g,b);
    if(l<14)return'Schwarz';if(l>86)return'Weiß';if(s<14)return l<50?'Dunkelgrau':'Hellgrau';
    if(h<20||h>=340)return'Rot';if(h<40)return'Orange';if(h<65)return'Gelb';
    if(h<150)return'Grün';if(h<195)return'Türkis';if(h<260)return'Blau';if(h<290)return'Lila';return'Pink';
}
function colorHarmony(colors){
    if(colors.length<2)return{label:'Einzelfarbe',emoji:'⚪',ok:true};
    const hues=colors.map(([r,g,b])=>rgbToHsl(r,g,b)[0]);
    const maxDiff=Math.max(...hues.flatMap((h,i)=>hues.map(h2=>Math.min(Math.abs(h-h2),360-Math.abs(h-h2)))));
    if(maxDiff<30)return{label:'Monochromatisch — sehr harmonisch',emoji:'✦',ok:true};
    if(maxDiff<60)return{label:'Analoges Farbschema — harmonisch',emoji:'✓',ok:true};
    if(maxDiff>150&&maxDiff<210)return{label:'Komplementärfarben — Bold Look',emoji:'⚡',ok:true};
    if(maxDiff>100)return{label:'Starker Kontrast — mutige Wahl',emoji:'⚠',ok:false};
    return{label:'Ausgewogenes Farbspiel',emoji:'✓',ok:true};
}
async function analyzeColors(){
    const res=$('colorResults'); res.innerHTML='<div style="text-align:center;padding:20px;opacity:.5">Analysiere…</div>';
    $('colorModal').classList.remove('hidden');
    const palette=[];
    for(const item of outfitItems){ const col=await getDominantColor(item.src); if(col)palette.push({item,col}); }
    if(!palette.length){res.innerHTML='<p style="opacity:.5;text-align:center;padding:16px">Keine Farben erkennbar</p>';return;}
    const harmony=colorHarmony(palette.map(p=>p.col));
    let html=`<div class="ca-harmony ${harmony.ok?'ok':'warn'}"><span class="ca-harmony-icon">${harmony.emoji}</span><span>${harmony.label}</span></div><div class="ca-swatches">`;
    palette.forEach(({item,col})=>{
        const[r,g,b]=col, name=colorName(r,g,b);
        const hex='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
        const tc=(r*.299+g*.587+b*.114)>140?'#000':'#fff';
        html+=`<div class="ca-swatch-row"><div class="ca-swatch" style="background:${hex};color:${tc}">${name}</div><div class="ca-swatch-info"><span class="ca-cat">${catLabel(item.cat)}</span><span class="ca-hex">${hex.toUpperCase()}</span></div></div>`;
    });
    html+='</div>'; res.innerHTML=html;
}

/* ================================================================
   OUTFIT DESCRIPTION
================================================================ */
$('describeBtn')?.addEventListener('click',generateDescription);
$('descBg')?.addEventListener('click',()=>$('descModal').classList.add('hidden'));
$('descClose')?.addEventListener('click',()=>$('descModal').classList.add('hidden'));

async function generateDescription(){
    if(!outfitItems.length){toast('Keine Teile auf Canvas');return;}
    const res=$('descResults'); res.innerHTML='<div style="text-align:center;padding:20px;opacity:.5">Analysiere…</div>';
    $('descModal').classList.remove('hidden');

    // Collect colors
    const palette=[];
    for(const item of outfitItems){ const col=await getDominantColor(item.src); palette.push({item,col}); }
    const colOf=cat=>palette.find(p=>p.item.cat===cat)?.col||null;

    // Group by category
    const parts={head:[],top:[],bottom:[],shoes:[]};
    outfitItems.forEach(i=>{ const k=(i.cat||'').replace('cat-',''); (parts[k]||parts.top).push(i); });

    // Color descriptor
    const cdesc=col=>{ if(!col)return''; const n=colorName(...col); const map={Schwarz:'schwarzem',Weiß:'weißem',Blau:'blauem',Rot:'rotem',Grün:'grünem',Orange:'orangem',Gelb:'gelbem',Lila:'lilaem',Pink:'pinkem',Türkis:'türkisem',Dunkelgrau:'dunkelgrauem',Hellgrau:'hellgrauem'}; return map[n]||n.toLowerCase(); };

    const styles=['Clean','Streetwear','Casual','Smart Casual','Editorial','Monochrome'];
    const style=styles[outfitItems.length%styles.length];

    const lines=[];
    if(parts.top.length) lines.push(`Oberteil in ${cdesc(colOf('cat-top'))} Tönen`);
    if(parts.bottom.length) lines.push(`${cdesc(colOf('cat-bottom'))} Unterteil`);
    if(parts.shoes.length) lines.push(`${cdesc(colOf('cat-shoes'))} Schuhe`);
    if(parts.head.length) lines.push(`Kopfbedeckung als Highlight`);

    const harmony=colorHarmony(palette.filter(p=>p.col).map(p=>p.col));
    const tags=[style, outfitItems.length>=3?'Complete Look':'Statement Piece', ...parts.shoes.length?['Schuhe']:[], ...parts.head.length?['Accessoire']:[]];
    const plain=`${style} Look: `+lines.join(', ')+`. ${harmony.emoji} ${harmony.label}`;

    window._lastOutfitDesc = plain;
    res.innerHTML=`
        <div class="desc-style-tag">${style} Look</div>
        <p class="desc-main">${lines.join(', ')}.</p>
        <div class="desc-harmony ${harmony.ok?'ok':'warn'}">${harmony.emoji} ${harmony.label}</div>
        <div class="desc-tags">${tags.map(t=>`<span class="desc-tag">${t}</span>`).join('')}</div>
        <button class="modal-save" style="margin-top:14px" id="descCopyBtn">📋 Kopieren</button>
    `;
    const copyBtn = document.getElementById('descCopyBtn');
    if(copyBtn) copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(window._lastOutfitDesc||'')
            .then(()=>toast('📋 Beschreibung kopiert!'))
            .catch(()=>{ const ta=document.createElement('textarea'); ta.value=window._lastOutfitDesc||''; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('📋 Kopiert!'); });
    });

    // Save description to slot
    const s=currentSlot(); if(s){s.description=plain;saveSlotsToStorage();}
}

/* ================================================================
   ▸ OUTFIT DNA
   Each outfit gets a "fingerprint": dominant colors, categories,
   style tags. Find similar outfits across slots.
================================================================ */

async function computeOutfitDNA(items){
    const cats = [...new Set(items.map(i=>i.cat).filter(Boolean))];
    const palette = [];
    for(const item of items){
        const col = await getDominantColor(item.src);
        if(col) palette.push(col);
    }
    const colorNames = palette.map(c=>colorName(...c));
    const colorFreq = {};
    colorNames.forEach(n=>colorFreq[n]=(colorFreq[n]||0)+1);
    const dominantColors = Object.entries(colorFreq).sort((a,b)=>b[1]-a[1]).map(e=>e[0]);

    // Style tags
    const tags = [];
    if(cats.includes('cat-head')) tags.push('Accessoire');
    if(cats.length>=3) tags.push('Complete Look');
    if(cats.length===1) tags.push('Statement Piece');
    if(dominantColors[0]==='Schwarz') tags.push('Dark');
    if(dominantColors[0]==='Weiß') tags.push('Clean');
    if(dominantColors.length<=2) tags.push('Monochrome');
    else tags.push('Colorful');
    if(items.some(i=>i.scale>1.4)) tags.push('Oversized');

    return { cats, dominantColors, tags, itemCount: items.length };
}

function dnaFingerprint(dna){
    // Readable fingerprint: colors + category abbreviations + style tag
    const colorMap = {Schwarz:'BK',Weiß:'WH',Blau:'BL',Rot:'RD',Grün:'GN',Orange:'OR',Gelb:'YL',Lila:'PU',Pink:'PK',Türkis:'TQ',Dunkelgrau:'DG',Hellgrau:'LG'};
    const catMap = {'cat-head':'H','cat-top':'T','cat-bottom':'B','cat-shoes':'S'};
    const colors = dna.dominantColors.slice(0,2).map(c=>colorMap[c]||c.slice(0,2).toUpperCase()).join('+');
    const cats = dna.cats.map(c=>catMap[c]||c[4]).sort().join('');
    const tag = dna.tags.find(t=>['Dark','Clean','Colorful','Monochrome','Oversized'].includes(t))||'';
    return [colors, cats, tag].filter(Boolean).join(' · ');
}

function dnaSimilarity(a, b){
    if(!a||!b) return 0;
    let score = 0;
    // Category overlap
    const catSet = new Set([...a.cats, ...b.cats]);
    const catInter = a.cats.filter(c=>b.cats.includes(c)).length;
    score += catInter / Math.max(catSet.size,1) * 40;
    // Color overlap
    const colSet = new Set([...a.dominantColors, ...b.dominantColors]);
    const colInter = a.dominantColors.filter(c=>b.dominantColors.includes(c)).length;
    score += colInter / Math.max(colSet.size,1) * 40;
    // Tag overlap
    const tagInter = a.tags.filter(t=>b.tags.includes(t)).length;
    score += tagInter / Math.max(a.tags.length,b.tags.length,1) * 20;
    return Math.round(score);
}

// DNA button in toolbar-right area — add dynamically
(function addDNABtn(){
    const tbRight = document.querySelector('.tb-right');
    if(!tbRight) return;
    const btn = document.createElement('button');
    btn.className = 'sq-btn'; btn.id='dnaBtn'; btn.title='Outfit DNA';
    btn.innerHTML='🧬';
    btn.style.cssText='font-size:14px;width:32px;height:32px;';
    tbRight.insertBefore(btn, tbRight.firstChild);
    btn.addEventListener('click', openDNAModal);
})();

// DNA Modal
(function createDNAModal(){
    const m = document.createElement('div');
    m.className='modal hidden'; m.id='dnaModal';
    m.innerHTML=`
        <div class="modal-bg" id="dnaBg"></div>
        <div class="modal-box" style="max-width:440px;max-height:80vh;overflow-y:auto">
            <div class="modal-hd">
                <h2 class="modal-h2">🧬 Outfit DNA</h2>
                <button class="modal-close-btn" id="dnaClose">✕</button>
            </div>
            <div id="dnaResults"></div>
        </div>`;
    document.body.appendChild(m);
    document.getElementById('dnaBg').addEventListener('click',()=>m.classList.add('hidden'));
    document.getElementById('dnaClose').addEventListener('click',()=>m.classList.add('hidden'));
})();

async function openDNAModal(){
    const modal=$('dnaModal'), res=$('dnaResults');
    modal.classList.remove('hidden');
    res.innerHTML='<div style="text-align:center;padding:24px;opacity:.5">Analysiere alle Outfits…</div>';

    // Compute DNA for all slots
    const dnaMap={};
    for(const slot of slots){
        const items=slot.items||[];
        if(!items.length) continue;
        dnaMap[slot.id]=await computeOutfitDNA(items);
    }

    const currentDNA = dnaMap[activeSlotId];
    if(!currentDNA){ res.innerHTML='<p style="padding:16px;opacity:.5">Aktuelles Outfit ist leer</p>'; return; }

    // Find similar outfits
    const similarities = slots
        .filter(s=>s.id!==activeSlotId&&dnaMap[s.id])
        .map(s=>({slot:s, score:dnaSimilarity(currentDNA,dnaMap[s.id])}))
        .sort((a,b)=>b.score-a.score);

    // Style pattern analysis across all outfits
    const allTags={}, allColors={};
    Object.values(dnaMap).forEach(dna=>{
        dna.tags.forEach(t=>allTags[t]=(allTags[t]||0)+1);
        dna.dominantColors.slice(0,2).forEach(c=>allColors[c]=(allColors[c]||0)+1);
    });
    const topTags=Object.entries(allTags).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const topColors=Object.entries(allColors).sort((a,b)=>b[1]-a[1]).slice(0,4);

    let html=`
    <div class="dna-card">
        <div class="dna-fp">
            <span class="dna-fp-label">Fingerabdruck</span>
            <code class="dna-fp-code">${dnaFingerprint(currentDNA)}</code>
        </div>
        <div class="dna-row">
            <span class="dna-key">Kategorien</span>
            <span class="dna-val">${currentDNA.cats.map(c=>catLabel(c)).join(', ')||'—'}</span>
        </div>
        <div class="dna-row">
            <span class="dna-key">Farben</span>
            <span class="dna-val">${currentDNA.dominantColors.slice(0,4).join(', ')||'—'}</span>
        </div>
        <div class="dna-row">
            <span class="dna-key">Style-Tags</span>
            <div class="desc-tags" style="margin:0">${currentDNA.tags.map(t=>`<span class="desc-tag">${t}</span>`).join('')}</div>
        </div>
    </div>`;

    if(topColors.length){
        html+=`<div class="dna-section-title">Dein Stil-Profil</div>
        <div class="dna-card">
            <div class="dna-row"><span class="dna-key">Häufigste Farben</span><span class="dna-val">${topColors.map(([c,n])=>`${c} (${n}×)`).join(', ')}</span></div>
            <div class="dna-row"><span class="dna-key">Häufige Tags</span><div class="desc-tags" style="margin:0">${topTags.map(([t,n])=>`<span class="desc-tag">${t} ${n}×</span>`).join('')}</div></div>
        </div>`;
    }

    if(similarities.length){
        html+=`<div class="dna-section-title">Ähnliche Outfits</div>`;
        similarities.slice(0,5).forEach(({slot,score})=>{
            const dna=dnaMap[slot.id];
            const bar=Math.round(score);
            html+=`<div class="dna-similar" onclick="switchSlot('${slot.id}');document.getElementById('dnaModal').classList.add('hidden')">
                <div class="dna-sim-top">
                    <span class="dna-sim-name">${slot.pinned?'📌 ':''}${slot.name}</span>
                    <span class="dna-sim-score">${bar}% ähnlich</span>
                </div>
                <div class="dna-sim-bar"><div class="dna-sim-fill" style="width:${bar}%"></div></div>
                <span class="dna-sim-tags">${(dna.tags||[]).slice(0,3).join(' · ')}</span>
            </div>`;
        });
    } else {
        html+=`<div style="padding:12px;opacity:.4;font-size:12px;text-align:center">Keine anderen Outfits zum Vergleichen</div>`;
    }

    res.innerHTML=html;
}

/* ================================================================
   ▸ OUTFIT PLANNER (Kalender)
   Plan outfits per day of the week. Warns on reuse.
================================================================ */

// Storage key
const PLANNER_KEY = 'os_planner_v1';
function loadPlanner(){ try{ return JSON.parse(localStorage.getItem(PLANNER_KEY)||'{}'); }catch{return {};} }
function savePlanner(p){ localStorage.setItem(PLANNER_KEY,JSON.stringify(p)); }

const DAYS_DE = ['Mo','Di','Mi','Do','Fr','Sa','So'];
const DAYS_FULL = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];

// Add planner button
(function addPlannerBtn(){
    const tbRight = document.querySelector('.tb-right');
    if(!tbRight) return;
    const btn=document.createElement('button');
    btn.className='sq-btn'; btn.id='plannerBtn'; btn.title='Outfit Planner';
    btn.innerHTML='📅'; btn.style.cssText='font-size:14px;width:32px;height:32px;';
    tbRight.insertBefore(btn, tbRight.firstChild);
    btn.addEventListener('click',openPlanner);
})();

// Planner modal
(function createPlannerModal(){
    const m=document.createElement('div');
    m.className='modal hidden'; m.id='plannerModal';
    m.innerHTML=`
        <div class="modal-bg" id="plannerBg"></div>
        <div class="modal-box" style="max-width:520px">
            <div class="modal-hd">
                <h2 class="modal-h2">📅 Outfit Planner</h2>
                <button class="modal-close-btn" id="plannerClose">✕</button>
            </div>
            <p style="font-size:12px;color:var(--t2);margin-bottom:14px">Plane deine Outfits für die Woche. Klick auf einen Tag um das aktuelle Outfit zuzuweisen.</p>
            <div class="planner-grid" id="plannerGrid"></div>
            <div class="planner-warning hidden" id="plannerWarn"></div>
        </div>`;
    document.body.appendChild(m);
    document.getElementById('plannerBg').addEventListener('click',()=>m.classList.add('hidden'));
    document.getElementById('plannerClose').addEventListener('click',()=>m.classList.add('hidden'));
})();

function openPlanner(){
    $('plannerModal').classList.remove('hidden');
    renderPlanner();
}

function renderPlanner(){
    const planner = loadPlanner();
    const grid = $('plannerGrid');
    const warn = $('plannerWarn');
    grid.innerHTML='';

    // Check for repeated outfits this week
    const usedSlots = Object.values(planner);
    const repeats = usedSlots.filter((s,i)=>s&&usedSlots.indexOf(s)!==i);
    if(repeats.length){
        const names = repeats.map(sid=>slots.find(s=>s.id===sid)?.name||'?');
        warn.textContent=`⚠ Wiederholt diese Woche: ${[...new Set(names)].join(', ')}`;
        warn.classList.remove('hidden');
    } else { warn.classList.add('hidden'); }

    DAYS_FULL.forEach((dayFull,i)=>{
        const key=DAYS_DE[i];
        const assignedSlotId = planner[key];
        const assignedSlot = assignedSlotId ? slots.find(s=>s.id===assignedSlotId) : null;
        const isToday = (new Date().getDay()+6)%7===i;

        const card=document.createElement('div');
        card.className='planner-day'+(isToday?' planner-today':'');

        const top=document.createElement('div'); top.className='planner-day-top';
        const dayLabel=document.createElement('div'); dayLabel.className='planner-day-label'; dayLabel.textContent=dayFull;
        if(isToday){ const badge=document.createElement('span'); badge.className='planner-today-badge'; badge.textContent='Heute'; dayLabel.appendChild(badge); }
        top.appendChild(dayLabel);

        const outfit=document.createElement('div'); outfit.className='planner-outfit';
        if(assignedSlot){
            const nameSpan=document.createElement('span');
            nameSpan.className='planner-outfit-name planner-outfit-link';
            nameSpan.textContent=assignedSlot.name;
            nameSpan.title='Klicken um zu öffnen';
            nameSpan.addEventListener('click',e=>{
                e.stopPropagation();
                switchSlot(assignedSlot.id);
                document.getElementById('plannerModal').classList.add('hidden');
                toast('📅 '+assignedSlot.name+' geöffnet');
            });
            const clr=document.createElement('button'); clr.className='planner-clr'; clr.textContent='✕'; clr.title='Entfernen';
            clr.addEventListener('click',e=>{ e.stopPropagation(); const p=loadPlanner(); delete p[key]; savePlanner(p); renderPlanner(); toast(`${dayFull} geleert`); });
            outfit.innerHTML='';
            outfit.appendChild(nameSpan); outfit.appendChild(clr);
        } else {
            outfit.innerHTML=`<span class="planner-empty-label">Kein Outfit</span>`;
        }

        const assignBtn=document.createElement('button'); assignBtn.className='planner-assign-btn'; assignBtn.textContent='Aktuelles Outfit zuweisen';
        assignBtn.addEventListener('click',()=>{
            if(!activeSlotId){toast('Kein Outfit aktiv');return;}
            const p=loadPlanner(); p[key]=activeSlotId; savePlanner(p);
            renderPlanner(); toast(`📅 ${currentSlot()?.name||'Outfit'} → ${dayFull}`);
        });

        card.append(top, outfit, assignBtn);
        grid.appendChild(card);
    });
}


/* ================================================================
   ▸ WETTER-INTEGRATION v2 — Animated Premium Weather App
   Open-Meteo API (kostenlos, kein API-Key) + Nominatim geocoding
================================================================ */
(function createWeatherWidget(){
    const tbRight = document.querySelector('.tb-right');
    if(!tbRight) return;

    // ── Toolbar button ──
    const btn = document.createElement('button');
    btn.className = 'icon-btn'; btn.id = 'weatherBtn'; btn.title = 'Wetter';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;
    const exp = document.getElementById('exportBtn');
    if(exp) tbRight.insertBefore(btn, exp); else tbRight.appendChild(btn);
    btn.addEventListener('click', openWeatherModal);

    // ── Modal shell ──
    const m = document.createElement('div');
    m.className = 'modal hidden'; m.id = 'weatherModal';
    m.innerHTML = `
        <div class="modal-bg" id="weatherBg"></div>
        <div class="modal-box">
            <div class="w-app" id="wApp" data-sky="cloudy">
                <div class="w-sky-bg"></div>
                <div class="w-header">
                    <span class="w-title">✦ WETTER</span>
                    <button class="w-close" id="weatherClose">✕</button>
                </div>
                <div class="w-search-row">
                    <input id="weatherCity" type="text" class="w-search-input"
                           placeholder="Stadt eingeben…" autocomplete="off">
                    <button class="w-search-btn" id="weatherSearch">SUCHEN</button>
                </div>
                <div id="weatherResults"></div>
            </div>
        </div>`;
    document.body.appendChild(m);

    document.getElementById('weatherBg').addEventListener('click', closeWeatherModal);
    document.getElementById('weatherClose').addEventListener('click', closeWeatherModal);
    document.getElementById('weatherSearch').addEventListener('click', fetchWeather);
    document.getElementById('weatherCity').addEventListener('keydown', e=>{ if(e.key==='Enter') fetchWeather(); });
})();

function openWeatherModal(){
    const modal = document.getElementById('weatherModal');
    modal.classList.remove('hidden');
    setTimeout(()=>document.getElementById('weatherCity')?.focus(), 50);
    const saved = localStorage.getItem('os_weather_city');
    if(saved){ document.getElementById('weatherCity').value=saved; fetchWeather(); }
}
function closeWeatherModal(){
    document.getElementById('weatherModal').classList.add('hidden');
}

function weatherSkyType(code, temp){
    if(code>=95) return 'thunder';
    if((code>=71&&code<=77)||(code>=85&&code<=86)) return 'snow';
    if(code>=61&&code<=67||code>=51&&code<=57) return 'rain';
    if(code>=45&&code<=48) return 'fog';
    if(code>=2&&code<=3) return 'cloudy';
    if(temp>28) return 'sunny';
    return 'sunny';
}

function buildParticles(sky){
    if(sky==='rain'){
        let html='';
        for(let i=0;i<6;i++){
            const left=10+i*13+Math.random()*8;
            const delay=(Math.random()*1.2).toFixed(2);
            const dur=(1+Math.random()*0.5).toFixed(2);
            html+=`<div class="w-rain-drop w-particle" style="left:${left}%;top:0;animation-delay:${delay}s;animation-duration:${dur}s"></div>`;
        }
        return html;
    }
    if(sky==='snow'){
        const flakes=['❄','❅','❆'];
        let html='';
        for(let i=0;i<5;i++){
            const left=8+i*17+Math.random()*8;
            const delay=(Math.random()*2).toFixed(2);
            const dur=(1.8+Math.random()*0.8).toFixed(2);
            html+=`<div class="w-snow-flake w-particle" style="left:${left}%;top:0;animation-delay:${delay}s;animation-duration:${dur}s">${flakes[i%3]}</div>`;
        }
        return html;
    }
    if(sky==='thunder'){
        return `<div class="w-lightning-bolt">⚡</div>`;
    }
    return '';
}

async function fetchWeather(){
    const city = (document.getElementById('weatherCity').value||'').trim();
    if(!city) return;
    const res = document.getElementById('weatherResults');
    localStorage.setItem('os_weather_city', city);

    res.innerHTML = `
        <div class="w-loading">
            <div class="w-spinner"></div>
            <span class="w-loading-txt">Wird geladen…</span>
        </div>`;

    try {
        // Geocode
        const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`);
        const geoData = await geoResp.json();
        if(!geoData.length){
            res.innerHTML=`<div class="w-empty">
                <div class="w-empty-icon">🌍</div>
                <div class="w-empty-title">Ort nicht gefunden</div>
                <div class="w-empty-sub">Versuche einen anderen Stadtnamen.</div>
            </div>`; return;
        }
        const {lat,lon,display_name} = geoData[0];
        const parts = display_name.split(',');
        const cityName = parts[0].trim();
        const countryName = parts[parts.length-1].trim();

        // Weather
        const wResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relativehumidity_2m&timezone=auto&forecast_days=3&daily=weathercode,temperature_2m_max,temperature_2m_min`);
        const wData = await wResp.json();
        const cur = wData.current;
        const {icon, label, suggestion, sky} = weatherCodeInfo(cur.weathercode, cur.temperature_2m);

        // Update sky gradient
        const wApp = document.getElementById('wApp');
        if(wApp) wApp.setAttribute('data-sky', sky);

        // Particles
        const particles = buildParticles(sky);

        // 3-day forecast
        const dayNames = ['So','Mo','Di','Mi','Do','Fr','Sa'];
        let forecastHtml = '';
        if(wData.daily){
            wData.daily.time.slice(0,3).forEach((date,i)=>{
                const d = new Date(date+'T12:00:00');
                const dn = i===0?'Heute':dayNames[d.getDay()];
                const {icon:fi} = weatherCodeInfo(wData.daily.weathercode[i], wData.daily.temperature_2m_max[i]);
                forecastHtml += `
                <div class="w-fc-day">
                    <div class="w-fc-day-name${i===0?' today':''}">${dn}</div>
                    <span class="w-fc-icon">${fi}</span>
                    <div class="w-fc-temps">
                        <span class="w-fc-hi">${Math.round(wData.daily.temperature_2m_max[i])}°</span>
                        <span class="w-fc-lo"> / ${Math.round(wData.daily.temperature_2m_min[i])}°</span>
                    </div>
                </div>`;
            });
        }

        res.innerHTML = `
        <div class="w-content">
            <div class="w-hero">
                <div class="w-hero-left">
                    <div class="w-city-name">${cityName}</div>
                    <div class="w-country">${countryName}</div>
                    <div class="w-label-pill" style="margin-top:8px">
                        <span class="w-label-dot"></span>${label}
                    </div>
                    <div class="w-feels">Gefühlt ${Math.round(cur.apparent_temperature)}°C</div>
                </div>
                <div class="w-temp-block">
                    <div class="w-icon-canvas">
                        <span class="w-icon-emoji">${icon}</span>
                        ${particles}
                    </div>
                    <div class="w-temp-big">${Math.round(cur.temperature_2m)}°</div>
                </div>
            </div>
            <div class="w-stats">
                <div class="w-stat">
                    <span class="w-stat-icon">💧</span>
                    <span class="w-stat-val">${cur.relativehumidity_2m}%</span>
                    <span class="w-stat-lbl">Luftfeuchte</span>
                </div>
                <div class="w-stat">
                    <span class="w-stat-icon">💨</span>
                    <span class="w-stat-val">${Math.round(cur.windspeed_10m)}</span>
                    <span class="w-stat-lbl">km/h Wind</span>
                </div>
                <div class="w-stat">
                    <span class="w-stat-icon">🌡</span>
                    <span class="w-stat-val">${Math.round(cur.apparent_temperature)}°C</span>
                    <span class="w-stat-lbl">Gefühlt</span>
                </div>
            </div>
            ${forecastHtml ? `<div class="w-forecast">${forecastHtml}</div>` : ''}
            <div class="w-suggestion">
                <span class="w-sug-icon">👗</span>
                <div class="w-sug-body">
                    <div class="w-sug-title">Outfit-Empfehlung</div>
                    <div class="w-sug-text">${suggestion}</div>
                </div>
            </div>
        </div>`;

    } catch(e) {
        res.innerHTML = `<div class="w-empty">
            <div class="w-empty-icon">⚠️</div>
            <div class="w-empty-title">Verbindungsfehler</div>
            <div class="w-empty-sub">${e.message}</div>
        </div>`;
    }
}

function weatherCodeInfo(code, temp){
    const sunny        = code===0||code===1;
    const partlyCloudy = code===2||code===3;
    const foggy        = code>=45&&code<=48;
    const drizzle      = code>=51&&code<=57;
    const rain         = code>=61&&code<=67;
    const snow         = (code>=71&&code<=77)||(code>=85&&code<=86);
    const thunderstorm = code>=95&&code<=99;

    let icon='☀️', label='Klar', suggestion='', sky='sunny';

    if(thunderstorm){ icon='⛈️'; label='Gewitter'; sky='thunder'; }
    else if(snow)   { icon='❄️'; label='Schnee';   sky='snow'; }
    else if(rain)   { icon='🌧️'; label='Regen';    sky='rain'; }
    else if(drizzle){ icon='🌦️'; label='Nieselregen'; sky='rain'; }
    else if(foggy)  { icon='🌫️'; label='Nebel';    sky='fog'; }
    else if(partlyCloudy){ icon='⛅'; label='Bewölkt'; sky='cloudy'; }
    else if(sunny && temp>28){ icon='🌞'; label='Sonnig & heiß'; sky='sunny'; }
    else if(sunny)  { icon='☀️'; label='Sonnig'; sky='sunny'; }

    if(thunderstorm)       suggestion='Wasserdichte Jacke & geschlossene Schuhe empfohlen.';
    else if(snow||temp<0)  suggestion='Winterjacke, Schal & wärmende Schichten — it\'s cold!';
    else if(rain||drizzle) suggestion='Leichte Regenjacke oder Trenchcoat, wasserfeste Schuhe.';
    else if(foggy)         suggestion='Leichte Jacke für die kühle Feuchtigkeit.';
    else if(temp>=28)      suggestion='Leichte, helle Kleidung — weniger ist mehr.';
    else if(temp>=20)      suggestion='T-Shirt-Wetter! Sneakers und leichte Hose passen perfekt.';
    else if(temp>=12)      suggestion='Layering empfohlen — Leichter Pullover oder Jacke.';
    else                   suggestion='Warme Kleidung und eine Jacke sind ratsam.';

    return {icon, label, suggestion, sky};
}