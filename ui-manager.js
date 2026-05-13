import { state, ensurePeopleNames, getActivePersonIndex, curSymbol, convertAmount, fmtMoney, allItems, itemsByParcel, totalItemsInParcel, totalItemsInHaul, sumAllItemPricesUSD, sumAllShippingUSD, visibleParcelIds, sumVisibleShippingUSD, purgeAssignmentsExceptParcels, snapshot, pushUndo, applySnap, doUndo, doRedo } from './state.js';
import { discover, enrichItemsFromOrders, parseLangChange } from './scraper.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function esc(s = '') {
  return s.replace(/[&<>"']/g, (c) =>
  ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c])
  );
}
const SPLIT_LABEL = ' Split Parcel';
const TURQ = '#30b48b';
const getArticle = () => $('.article');
const MOUNT_IDS = {
  host: 'sp-article-host',
  hideWrap: 'sp-original-wrap',
};
const isMounted = () => !!getArticle()?.querySelector(`#${MOUNT_IDS.host}`);



function hideOriginal(article) {
  if (article.querySelector(`#${MOUNT_IDS.hideWrap}`)) return;
  const wrap = document.createElement('div');
  wrap.id = MOUNT_IDS.hideWrap;
  wrap.style.display = 'none';
  while (article.firstChild) {
    wrap.appendChild(article.firstChild);
  }
  article.appendChild(wrap);
}

function showOriginal(article) {
  const wrap = article.querySelector(`#${MOUNT_IDS.hideWrap}`);
  if (!wrap) return;
  const frag = document.createDocumentFragment();
  while (wrap.firstChild) {
    frag.appendChild(wrap.firstChild);
  }
  article.insertBefore(frag, wrap);
  wrap.remove();
}
/* Scroll helpers (for Split Parcel open) */

function getScrollContainer() {
  return document.querySelectorAll('.el-scrollbar__wrap');
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  const scrollers = getScrollContainer();
  scrollers.forEach((scroller) => {
    if (typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      scroller.scrollTop = 0;
    }
  });
}

function observeLangChange(host) {
    const el = $('.lang-change');
    if (!el) return;
    const updateCur = () => {
        const code = parseLangChange() || state.fx.cur || state.fx.baseSite || 'USD';
        state.fx.cur = code;
        renderProducts(host);
        renderPeople(host);
        updateTotalsUI(host);
        updateProductsTitle(host);
    };
    updateCur();
    const mo = new MutationObserver(() => updateCur());
    mo.observe(el, { childList: true, characterData: true, subtree: true });
}

/* ---------------- Split button ---------------- */

function ensureDisabledCSS() {
  if ($('#sp-disabled-css')) return;
  const st = document.createElement('style');
  st.id = 'sp-disabled-css';
  st.textContent = `
    .link.sp-disabled, .link.sp-disabled span.iconfont, .nav-item.sp-disabled{
      color:#aaa!important;
      cursor:default!important;
    }
    .link.sp-disabled:hover, .link.sp-disabled:hover span.iconfont, .nav-item.sp-disabled:hover{
      color:#aaa!important;
      background:none!important;
    }
  `;
  document.head.appendChild(st);
}

function getLinksContainer() {
  return $('.links') || $('.nav .nav-list') || null;
}

export function findSplitBtn() {
  const cont = getLinksContainer();
  if (!cont) return null;
  return (
    [...cont.querySelectorAll('.link,.nav-item')].find(
      (el) => (el.textContent || '').trim() === SPLIT_LABEL.trim()
    ) || null
  );
}

export function setBtnDisabled(btn, dis) {
  if (!btn) return;
  if (dis) {
    btn.setAttribute('aria-disabled', 'true');
    btn.classList.add('sp-disabled');
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.6';
  } else {
    btn.removeAttribute('aria-disabled');
    btn.classList.remove('sp-disabled');
    btn.style.pointerEvents = '';
    btn.style.opacity = '';
  }
}

export function injectSplitBtn() {
  const cont = getLinksContainer();
  console.log('[ACbuy Split] injectSplitBtn called. Container found:', !!cont);
  if (!cont) return;
  if (findSplitBtn()) {
      console.log('[ACbuy Split] Button already injected.');
      return;
  }

  const isSidebar = cont.classList.contains('links');
  console.log('[ACbuy Split] Injecting button. isSidebar:', isSidebar);
  const scoped =
    Array.from(cont?.attributes || [])
      .map((a) => a.name)
      .find((n) => n.startsWith('data-v-')) || 'data-v-625bf56a';

  const btn = document.createElement('div');
  btn.setAttribute(scoped, '');
  btn.className = isSidebar ? 'link' : 'nav-item';
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');

  if (isSidebar) {
    const icon = document.createElement('span');
    icon.setAttribute(scoped, '');
    icon.className = 'iconfont icon-user';
    btn.append(icon);
  }
  btn.append(document.createTextNode(SPLIT_LABEL));

  ensureDisabledCSS();
  setBtnDisabled(btn, !state.parcels.length);

  const open = () => {
    if (btn.getAttribute('aria-disabled') === 'true') return;
    const activeSel = isSidebar ? '.link.active' : '.nav-item.active';
    cont.querySelectorAll(activeSel).forEach((n) => n.classList.remove('active'));
    btn.classList.add('active');

    /* Scroll to top as soon as user opens Split Parcel */
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToTop);
    });

    // If data is still loading, mount the UI wrapper and show the loading spinner until it's ready.
    if (state.enrichPromise) {
      mountSplitUI();
      const host = document.getElementById(MOUNT_IDS.host);
      if (host) {
        withLoading(host, async () => {
          await state.enrichPromise;
          // Re-render the internal UI now that data is populated
          mountSplitUI();
        });
      }
    } else {
      mountSplitUI();
      const host = document.getElementById(MOUNT_IDS.host);
      if (host) {
        withLoading(host, async () => {
          await sleep(600);
        });
      }
    }

    setTimeout(() => {
      const host = document.getElementById(MOUNT_IDS.host);
      host?.querySelector('#sp-products')?.scrollTo?.({ top: 0, behavior: 'auto' });
      scrollToTop();
    }, 650);
  };

  ['mousedown', 'mouseup', 'click'].forEach((ev) => {
    btn.addEventListener(
      ev,
      (e) => {
        if (btn.getAttribute('aria-disabled') === 'true') return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (ev === 'click') open();
      },
      true
    );
  });

  btn.addEventListener('keydown', (e) => {
    if (btn.getAttribute('aria-disabled') === 'true') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  if (isSidebar) {
    const gaps = $$('.gap', cont);
    const before = gaps[1] || gaps[0] || null;
    const customTag = [...cont.querySelectorAll('.link')].find((el) =>
      /custom\s*tag/i.test((el.textContent || '').trim())
    );
    if (before) {
      cont.insertBefore(btn, before);
      if (customTag && customTag.nextSibling && customTag.nextSibling !== btn) {
        cont.insertBefore(btn, customTag.nextSibling);
      }
    } else cont.appendChild(btn);
  } else {
    cont.appendChild(btn);
  }

  cont.addEventListener('click', (e) => {
    const link = e.target.closest(isSidebar ? '.link' : '.nav-item');
    if (!link) return;
    if (link !== btn && state.ui.open) {
      unmountSplitUI();
    }
    if (link !== btn) btn.classList.remove('active');
  });
}

/* ---------------- Hidden iframe scraping ---------------- */

let SCR_IFR = null;

function frame() {
  if (SCR_IFR && document.body.contains(SCR_IFR)) return SCR_IFR;
  SCR_IFR = document.createElement('iframe');
  Object.assign(SCR_IFR.style, {
    position: 'fixed',
    left: '-99999px',
    top: '-99999px',
    width: '1px',
    height: '1px',
    opacity: '0',
  });
  SCR_IFR.setAttribute('aria-hidden', 'true');
  document.body.appendChild(SCR_IFR);
  return SCR_IFR;
}

function loadInFrame(url) {
  return new Promise((res) => {
    const f = frame();
    f.onload = () => res(f);
    f.src = url;
  });
}

function waitInFrame(f, sel, timeout = 15000) {
  return new Promise((res, rej) => {
    const t0 = performance.now();
    (function loop() {
      try {
        const d = f.contentDocument;
        if (d && d.querySelector(sel)) return res();
      } catch { }
      if (performance.now() - t0 > timeout)
        return rej(new Error('iframe wait ' + sel));
      requestAnimationFrame(loop);
    })();
  });
}

/* ---------------- UI: top picker helpers ---------------- */

function renderParcelPicker(root) {
  const wrap = root.querySelector('#sp-parcel-pills');
  if (!wrap) return;
  wrap.innerHTML = '';
  state.parcels.forEach((p) => {
    const id = p.id;
    const pill = document.createElement('label');
    pill.className = 'pill';
    pill.setAttribute('tabindex', '0');
    pill.innerHTML = `
      <input type="checkbox" data-pick="${id}">
      <span>${id}</span>
    `;
    const checked = state.ui.selectedParcelIds.has(id);
    if (checked) pill.classList.add('active');
    pill.querySelector('input').checked = checked;
    pill.addEventListener('click', (e) => {
      const cb = pill.querySelector('input');
      const willCheck = !cb.checked;
      cb.checked = willCheck;
      if (willCheck) {
        state.ui.selectedParcelIds.add(id);
        pill.classList.add('active');
      } else {
        state.ui.selectedParcelIds.delete(id);
        pill.classList.remove('active');
      }
      e.preventDefault();
    });
    pill.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        pill.click();
      }
    });
    wrap.appendChild(pill);
  });
}

function showNoData(root) {
  const nd = root.querySelector('#sp-no-data');
  if (nd) nd.style.display = '';
  root.querySelector('.sp-card-wrap').style.display = 'none';
}

function showCard(root) {
  const nd = root.querySelector('#sp-no-data');
  if (nd) nd.style.display = 'none';
  root.querySelector('.sp-card-wrap').style.display = '';
}

function withLoading(root, fn) {
  const box = root.querySelector('#sp-loading');
  if (!box) return Promise.resolve().then(fn);
  const mask = document.createElement('div');
  mask.className = 'el-loading-mask';
  mask.innerHTML = `
    <div class="el-loading-spinner">
      <svg class="circular" viewBox="0 0 50 50">
        <circle class="path" cx="25" cy="25" r="20" fill="none"></circle>
      </svg>
    </div>
  `;
  box.appendChild(mask);
  state.ui.loading = true;
  const minShowMs = 420;
  const t0 = performance.now();
  const done = () => {
    const dt = performance.now() - t0;
    const wait = Math.max(0, minShowMs - dt);
    setTimeout(() => {
      mask.remove();
      state.ui.loading = false;
    }, wait);
  };
  return new Promise((resolve) => requestAnimationFrame(resolve))
    .then(() => Promise.resolve().then(fn))
    .finally(done);
}

/* ---------------- Mount UI ---------------- */

function mountSplitUI() {
  const article = getArticle();
  if (!article) return;
  if (isMounted()) return;

  hideOriginal(article);
  const host = document.createElement('div');
  host.id = MOUNT_IDS.host;
  host.innerHTML = `
    <div id="sp-top-picker">
      <span class="muted">Select parcels to split:</span>
      <div class="group" id="sp-parcel-pills"></div>
      <button id="sp-confirm" class="el-button el-button--primary"><span>Confirm</span></button>
      <button id="sp-clear" class="el-button el-button--primary is-plain"><span>Clear</span></button>
    </div>
    <div id="sp-divider"></div>
    <div id="sp-main-area">
      <!-- Restored old widget markup (centered), kept an id for toggling -->
      <div class="no-data" id="sp-no-data" style="height: 200px; display:none;">
        <img class="img" src="/img/no-data.a1782556.svg">
        <div>No further data available</div>
      </div>
      <div id="sp-loading">
        <div class="sp-card-wrap">
          <!-- top-right icon bar -->
          <div class="sp-top-actions">
            <button id="sp-undo" class="el-button el-button--primary is-plain" title="Undo (Ctrl+Z)" aria-label="Undo">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M12 5V1L7 6l5 5V7a5 5 0 110 10h-1v2h1a7 7 0 000-14z" fill="currentColor"/>
              </svg>
            </button>
            <button id="sp-redo" class="el-button el-button--primary is-plain" title="Redo (Ctrl+Y)" aria-label="Redo">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M12 5V1l5 5-5 5V7a5 5 0 100 10h1v2h-1a7 7 0 010-14z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div class="sp-toolbar">
            <div class="left">
              <label class="sp-label">Choose parcel</label>
              <select id="sp-parcel" class="sp-select"></select>
            </div>
            <div class="sp-spacer"></div>
            <div class="right">
              <label class="sp-label">People</label>
              <input id="sp-people" type="number" min="1" max="6" value="${state.people}" class="sp-num">
              <button id="sp-reset" class="el-button el-button--primary is-plain"><span>Reset</span></button>
              <button id="sp-set" class="el-button el-button--primary"><span>Create people</span></button>
            </div>
          </div>
          <div class="sp-two-col">
            <div class="sp-left">
              <div class="sp-top-row">
                <div class="sp-grand">
                  <div class="sp-grand-title"><strong>Grand Total (all parcels): <span id="sp-grand" class="turq"></span></strong></div>
                  <div class="sp-grand-sub">Items <span id="sp-items" class="turq"></span> + Shipping <span id="sp-ship" class="turq"></span></div>
                </div>
                <div class="sp-actions-inline">
                  <button id="sp-add-rest-parcel" class="el-button el-button--primary is-plain"><span>Add rest of parcel</span></button>
                  <button id="sp-add-rest-haul" class="el-button el-button--primary sp-btn-haul"><span>Add rest of haul</span></button>
                </div>
              </div>
              <div class="sp-section-title" id="sp-products-title">
                <span class="st-label">Products</span>
                <span class="muted" id="sp-parcel-shipping"></span>
              </div>
              <div id="sp-products" class="sp-products"></div>
              <div id="sp-items-footer" class="sp-items-footer"></div>
            </div>
            <div class="sp-right">
              <div class="sp-people-header">
                <div class="sp-section-title">People</div>
                <div id="sp-assign-pill" class="sp-assign-pill"></div>
              </div>
              <div id="sp-people-grid" class="sp-people"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const css = document.createElement('style');
  css.textContent = `
    #${MOUNT_IDS.host} .sp-card-wrap{
      position:relative;
      background:#fff;
      border:1px solid #eee;
      border-radius:12px;
      padding:14px; /* keep your base padding */
      padding-top:32px; /* NEW: add headroom for Undo/Redo (36px btn + ~8px top + buffer) */
    }
    /* Center the restored .no-data widget */
    #${MOUNT_IDS.host} .no-data{
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      width:100%;
      text-align:center;
      margin:0 auto;
    }
    #${MOUNT_IDS.host} .no-data .img{
      max-width:160px;
      height:auto;
      margin-bottom:8px;
    }
    /* Top-right button bar */
    #${MOUNT_IDS.host} .sp-top-actions{
      position:absolute;
      top:8px;
      right:8px;
      display:flex;
      gap:8px;
      z-index:2;
    }
    #${MOUNT_IDS.host} .sp-top-actions .el-button{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:8px;
      padding:8px;
      width:36px;
      height:36px;
    }
    #${MOUNT_IDS.host} .sp-top-actions svg{
      width:16px;
      height:16px;
    }
    #${MOUNT_IDS.host} .sp-toolbar{
      display:flex;
      align-items:center;
      gap:12px;
      margin:28px 0 12px;
      flex-wrap:wrap;
    }
    #${MOUNT_IDS.host} .sp-toolbar .left{
      display:flex;
      align-items:center;
      gap:8px;
    }
    #${MOUNT_IDS.host} .sp-toolbar .right{
      display:flex;
      align-items:center;
      gap:8px;
    }
    #${MOUNT_IDS.host} .sp-label{
      font-size:13px;
      color:#555;
    }
    #${MOUNT_IDS.host} .sp-select{
      appearance:auto;
      border:1px solid #dcdfe6;
      border-radius:6px;
      height:34px;
      padding:0 8px;
      min-width:210px;
    }
    #${MOUNT_IDS.host} .sp-num{
      width:70px;
      height:34px;
      border:1px solid #dcdfe6;
      border-radius:6px;
      padding:0 8px;
    }
    #${MOUNT_IDS.host} .sp-spacer{
      flex:1;
    }
    #${MOUNT_IDS.host} .sp-top-row{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:12px;
      margin:4px 0 6px;
      flex-wrap:nowrap;
    }
    #${MOUNT_IDS.host} .person-title{
      font-weight:600;
      font-size:15px;
      display:flex;
      align-items:center;
      gap:8px;
    }
    #${MOUNT_IDS.host} .person .total{
      font-size:18px;
      font-weight:800;
      color:#e53935;
      margin-left:4px;
    }
    #${MOUNT_IDS.host} .person .muted{
      color:#999;
      font-size:13px;
    }
    #${MOUNT_IDS.host} .sp-grand-title{
      color:${TURQ};
      font-weight:700;
      font-size:18px;
    }
    #${MOUNT_IDS.host} .sp-grand-sub{
      color:#666;
      font-size:13px;
    }
    #${MOUNT_IDS.host} .turq{
      color:${TURQ};
      font-weight:700;
    }
    #${MOUNT_IDS.host} .sp-actions-inline{
      display:flex;
      gap:8px;
      align-items:center;
    }
    #${MOUNT_IDS.host} .sp-btn-haul{
      padding:10px 16px;
      font-weight:700;
    }
    #${MOUNT_IDS.host} .sp-two-col{
      display:flex;
      gap:16px;
      align-items:flex-start;
    }
    #${MOUNT_IDS.host} .sp-left{
      flex:0 0 54%;
      min-width:420px;
    }
    #${MOUNT_IDS.host} .sp-right{
      flex:1 1 auto;
    }
    #${MOUNT_IDS.host} .sp-section-title{
      font-weight:600;
      margin:6px 0 8px;
      color:#666;
      display:flex;
      gap:8px;
      align-items:center;
    }
    #${MOUNT_IDS.host} .sp-products{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:12px;
      max-height:calc(100vh - 320px);
      overflow:auto;
      padding-right:4px;
    }
    #${MOUNT_IDS.host} .sp-card{
      border:1px solid #eee;
      border-radius:10px;
      background:#fff;
      padding:10px;
      display:flex;
      align-items:center;
      gap:12px;
      min-height:100px;
      user-select:none;
      transition:opacity .15s ease, filter .15s ease;
    }
    #${MOUNT_IDS.host} .sp-card.depleted{
      opacity:.45;
      filter:grayscale(0.3);
      pointer-events:none;
    }
    #${MOUNT_IDS.host} .sp-thumb{
      width:86px;
      height:86px;
      object-fit:cover;
      border-radius:8px;
      border:1px solid #eee;
      flex:none;
    }
    #${MOUNT_IDS.host} .sp-name{
      font-size:13px;
      line-height:1.3;
      display:-webkit-box;
      -webkit-line-clamp:3;
      -webkit-box-orient:vertical;
      overflow:hidden;
      word-break:break-word;
    }
    #${MOUNT_IDS.host} .sp-price{
      margin-left:auto;
      font-weight:700;
    }
    #${MOUNT_IDS.host} .sp-badge{
      margin-left:6px;
      font-size:12px;
      color:#555;
      background:#f3f4f6;
      border-radius:999px;
      padding:2px 8px;
    }
    #${MOUNT_IDS.host} .sp-card[draggable="true"]{
      cursor:grab;
    }
    #${MOUNT_IDS.host} .sp-card.dragging{
      opacity:.6;
    }
    #${MOUNT_IDS.host} .sp-items-footer{
      margin-top:8px;
      color:#888;
      font-size:12px;
    }
    #${MOUNT_IDS.host} .sp-people-header{
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin-top:6px;
    }
    #${MOUNT_IDS.host} .sp-assign-pill{
      background:rgba(48,180,139,.1);
      color:${TURQ};
      border:1px solid ${TURQ};
      border-radius:999px;
      padding:4px 10px;
      font-size:12px;
      font-weight:600;
    }
    #${MOUNT_IDS.host} .sp-people{
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
      gap:12px;
    }
    #${MOUNT_IDS.host} .person{
      border:2px solid transparent;
      border-radius:10px;
      background:#fff;
      padding:10px;
      min-height:220px;
      transition:border-color .15s ease;
    }
    #${MOUNT_IDS.host} .person.selected{
      border-color:${TURQ};
    }
    #${MOUNT_IDS.host} .person-title .name{
      font-weight:700;
      color:${TURQ};
      cursor:text;
    }
    #${MOUNT_IDS.host} .person-title .total{
      font-weight:700;
      color:${TURQ};
    }
    #${MOUNT_IDS.host} .drop{
      display:flex;
      flex-direction:column;
      gap:8px;
      min-height:130px;
      padding:6px;
      border:2px dashed #ddd;
      border-radius:8px;
      transition:border-color .15s ease, background-color .15s ease;
    }
    #${MOUNT_IDS.host} .drop.hover{
      border-color:${TURQ};
      background:rgba(48,180,139,.06);
    }
    #${MOUNT_IDS.host} .muted{
      color:#888;
      font-size:12px;
    }
    @media (max-width:1100px){
      #${MOUNT_IDS.host} .sp-top-row{ flex-wrap:wrap; }
      #${MOUNT_IDS.host} .sp-two-col{ flex-direction:column; }
      #${MOUNT_IDS.host} .sp-left{ min-width:0; flex:auto; }
      #${MOUNT_IDS.host} .sp-products{ max-height:none; }
    }
    /* top picker + divider */
    #sp-top-picker{
      padding-top:12px;
      display:flex;
      align-items:center;
      gap:12px;
      margin-bottom:8px;
      flex-wrap:wrap;
    }
    #sp-top-picker .group{
      display:grid;
      grid-template-columns:repeat(5,minmax(0,1fr));
      gap:10px;
      width:100%;
      align-items:stretch;
    }
    #sp-top-picker .pill{
      display:flex;
      align-items:center;
      justify-content:center;
      height:40px;
      padding:0 14px;
      border-radius:999px;
      border:2px solid #e2e8f0;
      background:#fff;
      color:#111;
      font-weight:600;
      cursor:pointer;
      user-select:none;
      transition:border-color .15s ease, color .15s ease, box-shadow .15s ease;
    }
    #sp-top-picker .pill input{
      display:none;
    }
    #sp-top-picker .pill:hover{
      box-shadow:0 0 0 3px rgba(0,0,0,.04) inset;
    }
    #sp-top-picker .pill.active{
      border-color:#30b48b;
      color:#30b48b;
      box-shadow:0 0 0 3px rgba(48,180,139,.12) inset;
    }
    #sp-divider{
      height:1px;
      background:#e5e7eb;
      margin:8px 0 12px;
    }
    #sp-loading{
      position:relative;
    }
    #sp-loading .el-loading-mask{
      position:absolute;
      inset:0;
      background:rgba(255,255,255,.6);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:10;
    }
    #sp-loading .el-loading-spinner .circular{
      width:54px;
      height:54px;
    }
    #sp-loading .el-loading-spinner .path{
      stroke:${TURQ};
      stroke-width:4;
      stroke-linecap:round;
      animation: sp-rotate 1.4s linear infinite, sp-dash 1.4s ease-in-out infinite;
    }
    @keyframes sp-rotate{
      100%{ transform:rotate(360deg);}
    }
    @keyframes sp-dash{
      0%{ stroke-dasharray:1,150; stroke-dashoffset:0; }
      50%{ stroke-dasharray:90,150; stroke-dashoffset:-35; }
      100%{ stroke-dasharray:90,150; stroke-dashoffset:-124; }
    }
    @media (max-width:1100px){
      #sp-top-picker .group{ grid-template-columns:repeat(3,minmax(0,1fr)); }
    }
    @media (max-width:640px){
      #sp-top-picker .group{ grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
  `;
  host.appendChild(css);
  getArticle().appendChild(host);
  state.ui.open = true;

  // Build initial <select> with ALL parcels (narrowed by Confirm)
  const sel = host.querySelector('#sp-parcel');
  sel.innerHTML = state.parcels
    .map((p, i) => `<option value="${p.id}" ${i === 0 ? 'selected' : ''}>${p.id}</option>`)
    .join('');

  ensurePeopleNames(state.people);
  renderParcelPicker(host);

  /* Controls */
  host.querySelector('#sp-reset').addEventListener('click', () => {
    pushUndo();
    state.assignQty = {};
    state.ui.activePerson = null;
    renderProducts(host);
    renderPeople(host);
    updateTotalsUI(host);
    updateProductsTitle(host);
    updateItemsFooter(host);
    updateAssigningPill();
  });

  host.querySelector('#sp-undo').addEventListener('click', () => {
    doUndo();
    renderProducts(host);
    renderPeople(host);
    updateTotalsUI(host);
    updateProductsTitle(host);
    updateItemsFooter(host);
    updateAssigningPill();
  });

  host.querySelector('#sp-redo').addEventListener('click', () => {
    doRedo();
    renderProducts(host);
    renderPeople(host);
    updateTotalsUI(host);
    updateProductsTitle(host);
    updateItemsFooter(host);
    updateAssigningPill();
  });

  document.addEventListener('keydown', (e) => {
    const z = e.key.toLowerCase() === 'z';
    const y = e.key.toLowerCase() === 'y';
    const mod = e.ctrlKey || e.metaKey;
    if (mod && z) {
      e.preventDefault();
      doUndo();
      renderProducts(host);
      renderPeople(host);
      updateTotalsUI(host);
      updateProductsTitle(host);
      updateItemsFooter(host);
      updateAssigningPill();
    }
    if (mod && y) {
      e.preventDefault();
      doRedo();
      renderProducts(host);
      renderPeople(host);
      updateTotalsUI(host);
      updateProductsTitle(host);
      updateItemsFooter(host);
      updateAssigningPill();
    }
  });

  host.querySelector('#sp-set').addEventListener('click', () => {
    const n = Math.max(
      1,
      Math.min(6, parseInt(host.querySelector('#sp-people').value || '2', 10))
    );
    state.people = n;
    ensurePeopleNames(n);
    if (state.ui.activePerson == null) state.ui.activePerson = 0;
    renderPeople(host);
    updateTotalsUI(host);
    updateAssigningPill();
  });

  host.querySelector('#sp-add-rest-parcel').addEventListener('click', () => {
    const pid = sel.value || state.parcels[0]?.id;
    pushUndo();
    autoAssignRemaining({ scope: 'parcel', pids: [pid], target: getActivePersonIndex() });
    renderProducts(host);
    renderPeople(host);
    updateTotalsUI(host);
  });

  host.querySelector('#sp-add-rest-haul').addEventListener('click', () => {
    const pids = visibleParcelIds(host);
    pushUndo();
    autoAssignRemaining({ scope: 'haul', pids, target: getActivePersonIndex() });
    renderProducts(host);
    renderPeople(host);
    updateTotalsUI(host);
  });

  sel.addEventListener('change', () => {
    renderProducts(host);
    renderPeople(host);
    updateTotalsUI(host);
    updateProductsTitle(host);
    updateItemsFooter(host);
    updateAssigningPill();
    host.querySelector('#sp-products')?.scrollTo?.({ top: 0, behavior: 'auto' });
  });

  host.querySelector('#sp-confirm').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const picked = Array.from(state.ui.selectedParcelIds || new Set());
    await withLoading(host, async () => {
      const sel = host.querySelector('#sp-parcel');
      if (picked.length === 0) {
        if (sel) sel.innerHTML = '';
        pushUndo();
        state.assignQty = {};
        showNoData(host);
        return;
      }
      if (sel) {
        sel.innerHTML = picked
          .map((id, i) => `<option value="${id}" ${i === 0 ? 'selected' : ''}>${id}</option>`)
          .join('');
        sel.value = picked[0];
      }
      pushUndo();
      purgeAssignmentsExceptParcels(new Set(picked));
      showCard(host);
      renderProducts(host);
      renderPeople(host);
      updateTotalsUI(host);
      updateProductsTitle(host);
      updateItemsFooter(host);
      updateAssigningPill();
      const box = host.querySelector('.sp-products');
      if (box) box.scrollTop = 0;
      // ensure page/container scroller resets too
      scrollToTop();
    });
  });

  host.querySelector('#sp-clear').addEventListener('click', () => {
    state.ui.selectedParcelIds = new Set();
    pushUndo();
    state.assignQty = {};
    const sel = host.querySelector('#sp-parcel');
    if (sel) sel.innerHTML = '';
    renderParcelPicker(host);
    showNoData(host);
  });

  if (!state.ui.selectedParcelIds || state.ui.selectedParcelIds.size === 0) {
    showNoData(host);
  } else {
    const picked = Array.from(state.ui.selectedParcelIds);
    if (sel && picked.length) {
      sel.innerHTML = picked
        .map((id, i) => `<option value="${id}" ${i === 0 ? 'selected' : ''}>${id}</option>`)
        .join('');
    }
    showCard(host);
    renderProducts(host);
    renderPeople(host);
    updateTotalsUI(host);
    updateProductsTitle(host);
    updateItemsFooter(host);
    updateAssigningPill();
  }

  observeLangChange(host);
}

function unmountSplitUI() {
  const article = getArticle();
  if (!article) return;
  const host = article.querySelector(`#${MOUNT_IDS.host}`);
  if (host) host.remove();
  showOriginal(article);
  state.ui.open = false;
}

/* ---------------- Rendering ---------------- */

function remainingUnits(itemId) {
  const total = state.qty[itemId] || 1;
  const map = state.assignQty[itemId] || {};
  const used = Object.values(map).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  return Math.max(0, total - used);
}

function getCurrentSelectPid(root) {
  const sel = root.querySelector('#sp-parcel');
  return sel ? sel.value : null;
}

export function renderProducts(root) {
  const pid = getCurrentSelectPid(root);
  const items = itemsByParcel(pid);
  const box = root.querySelector('#sp-products');
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML =
      '<div class="muted" style="padding:20px;text-align:center;">No items</div>';
  } else {
    const from = state.fx.baseSite || 'USD';
    const toCur = state.fx.cur || from;
    items.forEach((it) => {
      const rem = remainingUnits(it.id);
      const card = document.createElement('div');
      card.className = 'sp-card';
      card.dataset.itemId = it.id;

      const img = document.createElement('img');
      img.className = 'sp-thumb';
      img.src = it.thumb;
      img.alt = it.name || 'Item';
      img.draggable = false;

      const txt = document.createElement('div');
      txt.style.flex = '1';
      const nameDiv = document.createElement('div');
      nameDiv.className = 'sp-name';
      nameDiv.textContent = it.name || '';
      txt.appendChild(nameDiv);

      const totalQty = state.qty[it.id] || 1;
      const badge = document.createElement('span');
      badge.className = 'sp-badge';
      if (rem > 0 && totalQty > 1) {
        badge.textContent = `× ${rem} left`;
        txt.appendChild(badge);
      }
      if (rem === 0) {
        badge.textContent = 'depleted';
        txt.appendChild(badge);
      }

      const price = document.createElement('div');
      price.className = 'sp-price';
      if (Number.isFinite(it.price)) {
        const amtUSD = convertAmount(it.price, from, 'USD');
        const amtCur = convertAmount(amtUSD, 'USD', toCur);
        price.textContent = fmtMoney(amtCur, toCur);
      }

      card.append(img, txt, price);

      if (rem > 0) {
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', it.id);
          try {
            e.dataTransfer.setDragImage(card, 10, 10);
          } catch { }
          requestAnimationFrame(() => card.classList.add('dragging'));
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
      } else {
        card.classList.add('depleted');
      }

      box.appendChild(card);
    });
  }
  updateItemsFooter(root);
}

export function updateProductsTitle(root) {
  const pid = getCurrentSelectPid(root);
  const ship = Number.isFinite(state.shipping[pid]) ? state.shipping[pid] : null;
  const from = state.fx.baseSite || 'USD';
  const toCur = state.fx.cur || from;
  const el = root.querySelector('#sp-parcel-shipping');
  if (el) {
    if (ship == null) el.textContent = '';
    else {
      const sUSD = convertAmount(ship, from, 'USD');
      const sCur = convertAmount(sUSD, 'USD', toCur);
      el.textContent = ` • Parcel shipping: ${fmtMoney(sCur, toCur)}`;
    }
  }
}

function updateItemsFooter(root) {
  const pid = getCurrentSelectPid(root);
  root.querySelector('#sp-items-footer').textContent = `This parcel: ${totalItemsInParcel(
    pid
  )} • All parcels: ${totalItemsInHaul()}`;
}

function makeEditableNameSpan(idx) {
  const span = document.createElement('span');
  span.className = 'name';
  span.textContent = state.peopleNames[idx] || `Person ${idx + 1}`;
  span.title = 'Double-click to rename';
  const startEdit = () => {
    const input = document.createElement('input');
    input.className = 'edit';
    input.value = span.textContent;
    span.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const v = input.value.trim() || `Person ${idx + 1}`;
      state.peopleNames[idx] = v;
      const replacement = makeEditableNameSpan(idx);
      input.replaceWith(replacement);
      updateAssigningPill();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
    });
    input.addEventListener('blur', commit);
  };
  span.addEventListener('dblclick', startEdit);
  return span;
}

export function renderPeople(root) {
  const grid = root.querySelector('#sp-people-grid');
  grid.innerHTML = '';
  const n = Math.max(1, Math.min(6, state.people || 2));
  ensurePeopleNames(n);

  const by = Array.from({ length: n }, () => []);
  Object.keys(state.assignQty).forEach((itemId) => {
    const map = state.assignQty[itemId] || {};
    Object.entries(map).forEach(([person, units]) => {
      for (let k = 0; k < units; k++) {
        by[+person].push(itemId);
      }
    });
  });

  const from = state.fx.baseSite || 'USD';
  const toCur = state.fx.cur || from;
  const shipVisibleUSD = sumVisibleShippingUSD(root);
  const shippingShareUSD = shipVisibleUSD / n;

  for (let i = 0; i < n; i++) {
    let personItemsUSD = 0;
    by[i].forEach((itemId) => {
      const it = allItems().find((t) => t.id === itemId);
      if (it && Number.isFinite(it.price)) {
        personItemsUSD += convertAmount(it.price, from, 'USD');
      }
    });
    const personTotalUSD = personItemsUSD + shippingShareUSD;
    const personTotalCur = convertAmount(personTotalUSD, 'USD', toCur);

    const card = document.createElement('div');
    card.className = 'person' + (state.ui.activePerson === i ? ' selected' : '');
    card.dataset.person = String(i);

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
    const left = document.createElement('div');
    left.className = 'person-title';
    const nameSpan = makeEditableNameSpan(i);
    const totalSpan = document.createElement('span');
    totalSpan.className = 'total';
    totalSpan.textContent = ' — ' + fmtMoney(personTotalCur, toCur);
    left.append(nameSpan, totalSpan);
    const right = document.createElement('div');
    right.className = 'muted';
    right.textContent = `${by[i].length} item(s)`;
    header.append(left, right);

    const dz = document.createElement('div');
    dz.className = 'drop';
    dz.dataset.person = i;
    const allow = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
    };
    dz.addEventListener('dragenter', (e) => {
      allow(e);
      dz.classList.add('hover');
    });
    dz.addEventListener('dragover', (e) => {
      allow(e);
      dz.classList.add('hover');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('hover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const itemId = e.dataTransfer.getData('text/plain');
      if (!itemId) return;
      const rem = remainingUnits(itemId);
      if (rem <= 0) return;
      pushUndo();
      if (!state.assignQty[itemId]) state.assignQty[itemId] = {};
      state.assignQty[itemId][i] = (state.assignQty[itemId][i] || 0) + 1;
      dz.classList.remove('hover');
      if (state.ui.activePerson == null) state.ui.activePerson = i;
      renderPeople(root);
      renderProducts(root);
      updateTotalsUI(root);
    });

    by[i].forEach((itemId) => {
      const it = allItems().find((t) => t.id === itemId);
      if (!it) return;
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.innerHTML = `
        <img src="${it.thumb}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #eee">
        <div style="flex:1;min-width:0;font-size:13px;">${esc(it.name)}</div>
        <button class="el-button el-button--primary is-plain" data-unassign="${it.id}" style="padding:4px 8px;"><span>Remove</span></button>
      `;
      row.querySelector('[data-unassign]').addEventListener('click', () => {
        pushUndo();
        const map = state.assignQty[it.id] || {};
        if (map[i] > 0) {
          map[i]--;
          if (map[i] === 0) delete map[i];
        }
        if (Object.keys(map).length === 0) delete state.assignQty[it.id];
        renderPeople(root);
        renderProducts(root);
        updateTotalsUI(root);
      });
      dz.appendChild(row);
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-unassign]')) return;
      state.ui.activePerson = i;
      grid.querySelectorAll('.person').forEach((p) => p.classList.remove('selected'));
      card.classList.add('selected');
      updateAssigningPill();
    });

    card.append(header, dz);
    grid.appendChild(card);
  }
  updateAssigningPill();
}

function updateAssigningPill() {
  const pill = $('#sp-assign-pill');
  if (!pill) return;
  const idx = getActivePersonIndex(false);
  pill.textContent =
    idx == null
      ? 'Assigning to: —'
      : `Assigning to: ${state.peopleNames[idx] || `Person ${idx + 1}`}`;
}

export function updateTotalsUI(root) {
  const itemsAllUSD = sumAllItemPricesUSD();
  const shipAllUSD = sumAllShippingUSD();
  const grandAllUSD = itemsAllUSD + shipAllUSD;
  const toCur = state.fx.cur || state.fx.baseSite || 'USD';
  $('#sp-grand').textContent = fmtMoney(convertAmount(grandAllUSD, 'USD', toCur), toCur);
  $('#sp-items').textContent = fmtMoney(convertAmount(itemsAllUSD, 'USD', toCur), toCur);
  $('#sp-ship').textContent = fmtMoney(convertAmount(shipAllUSD, 'USD', toCur), toCur);
}

/* ---------------- Auto-assign respecting quantities ---------------- */

function autoAssignRemaining({ scope = 'haul', pids = [], target = null } = {}) {
  const n = Math.max(1, Math.min(6, state.people || 2));
  const inScope = new Set(
    Array.isArray(pids) && pids.length ? pids : state.parcels.map((p) => p.id)
  );
  const candidates = [];
  allItems().forEach((it) => {
    if (!inScope.has(it.parcelId)) return;
    let rem = remainingUnits(it.id);
    for (let k = 0; k < rem; k++) {
      candidates.push(it.id);
    }
  });
  if (candidates.length === 0) return;

  pushUndo();
  if (Number.isInteger(target) && target >= 0 && target < n) {
    candidates.forEach((itemId) => {
      if (!state.assignQty[itemId]) state.assignQty[itemId] = {};
      state.assignQty[itemId][target] = (state.assignQty[itemId][target] || 0) + 1;
    });
    return;
  }

  const from = state.fx.baseSite || 'USD';
  const totals = Array.from({ length: n }, () => 0);
  Object.entries(state.assignQty).forEach(([itemId, map]) => {
    const it = allItems().find((t) => t.id === itemId);
    if (!it || !Number.isFinite(it.price)) return;
    const priceUSD = convertAmount(it.price, from, 'USD');
    Object.entries(map).forEach(([pi, units]) => {
      totals[+pi] += priceUSD * units;
    });
  });

  candidates.forEach((itemId) => {
    const it = allItems().find((t) => t.id === itemId);
    const priceUSD = Number.isFinite(it?.price)
      ? convertAmount(it.price, from, 'USD')
      : 0;
    let best = 0;
    for (let i = 1; i < n; i++) if (totals[i] < totals[best]) best = i;
    if (!state.assignQty[itemId]) state.assignQty[itemId] = {};
    state.assignQty[itemId][best] = (state.assignQty[itemId][best] || 0) + 1;
    totals[best] += priceUSD;
  });
}

/* ---------------- Router + member force reload ---------------- */

function maybeForceMemberReload(prevURL, curURL) {
  try {
    const prev = new URL(prevURL, location.origin);
    const cur = new URL(curURL, location.origin);
    const wasMember = /^\/member(\/|$)/i.test(prev.pathname);
    const nowMember = /^\/member(\/|$)/i.test(cur.pathname);
    if (!wasMember && nowMember) {
      const key = 'sp:reloaded:' + cur.pathname;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        location.reload();
      }
    }
  } catch { }
}

export function watchApp() {
  const apply = () => {
    injectSplitBtn();
    const b = findSplitBtn();
    if (b) setBtnDisabled(b, !state.parcels.length);
    if (state.ui.open && !getArticle()?.querySelector(`#${MOUNT_IDS.host}`)) {
      mountSplitUI();
    }
  };
  apply();

  const mo = new MutationObserver(() => {
    clearTimeout(watchApp._t);
    watchApp._t = setTimeout(apply, 120);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  const ps = history.pushState,
    rs = history.replaceState;
  const onRoute = () => {
    const prev = state._lastURL,
      cur = location.href;
    maybeForceMemberReload(prev, cur);
    state._lastURL = cur;
    setTimeout(apply, 0);
  };
  history.pushState = function () {
    ps.apply(this, arguments);
    onRoute();
  };
  history.replaceState = function () {
    rs.apply(this, arguments);
    onRoute();
  };
  window.addEventListener('popstate', onRoute);

  if (!watchApp._poll) {
    watchApp._poll = setInterval(() => {
      const cur = location.href;
      if (cur !== state._lastURL) {
        maybeForceMemberReload(state._lastURL, cur);
        state._lastURL = cur;
        apply();
      }
    }, 800);
  }
}

/* ---------------- Currency watcher ---------------- */

