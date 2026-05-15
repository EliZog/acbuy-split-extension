/**
 * scraper.js
 * Logic for hidden iframe DOM crawling, background fetching, and data parsing based on acbuy structure.
 */

import { state } from './state.js';

const IGNORE_IMG = 'https://www.acbuy.com/img/copy.793e45d7.svg';
const DELAY_LIST = 900;
const DELAY_DETAIL = 900;

let SCR_IFR = null;

export function frame() {
    if (SCR_IFR && document.body.contains(SCR_IFR)) {
        document.body.removeChild(SCR_IFR);
    }
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

export function loadInFrame(url, timeout = 8000) {
    return new Promise((res, rej) => {
        const f = frame();
        const t = setTimeout(() => {
            console.warn(`[ACbuy Split] iframe load timeout for ${url}`);
            rej(new Error(`iframe load timeout for ${url}`));
        }, timeout);
        f.onload = () => {
            clearTimeout(t);
            res(f);
        };
        f.onerror = () => {
            clearTimeout(t);
            rej(new Error(`iframe load error for ${url}`));
        };
        f.src = url;
    });
}

export function waitInFrame(f, sel, timeout = 8000) {
    return new Promise((res, rej) => {
        const t0 = performance.now();
        const interval = setInterval(() => {
            try {
                const d = f.contentDocument;
                if (d && d.querySelector(sel)) {
                    clearInterval(interval);
                    return res();
                }
            } catch {}
            if (performance.now() - t0 > timeout) {
                clearInterval(interval);
                return rej(new Error('iframe wait timeout ' + sel));
            }
        }, 200);
    });
}

export async function scrapeParcelIds() {
    const f = await loadInFrame('/member/my-package');
    await waitInFrame(f, '.data-list').catch(() => {});
    await new Promise((r) => setTimeout(r, DELAY_LIST));
    const d = f.contentDocument, ids = new Set();
    if (d) {
        const list = d.querySelector('.data-list');
        if (list) {
            list.querySelectorAll('.no,[class*="no"]').forEach((no) => {
                const m = (no.textContent || '').match(/Parcel\s*No\.?:\s*([A-Z0-9]+)/i);
                if (m) ids.add(m[1]);
            });
            list.querySelectorAll('a[href*="/member/my-package/package-detail"]').forEach((a) => {
                const m = a.href.match(/[?&]ids=([A-Z0-9]+)/i);
                if (m) ids.add(m[1]);
            });
        }
    }
    return Array.from(ids);
}

function extractQtyFromBlock(blk) {
    const cand = blk?.querySelector?.('.quantity, [class*="quantity"], [class*="qty"], .num, .count, .goods-num, td:nth-child(2)');
    const raw = (cand?.textContent || '').trim();
    const m = raw.match(/(\d+)/);
    const n = m ? parseInt(m[1], 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function scrapeParcelDetail(id) {
    const f = await loadInFrame(`/member/my-package/package-detail/package-detail?ids=${encodeURIComponent(id)}`);
    await Promise.race([
        waitInFrame(f, 'table img[src]', 8000),
        waitInFrame(f, '.goods-img img[src]', 8000),
        waitInFrame(f, '[class*="goods"] img[src]', 8000),
        waitInFrame(f, '[class*="item"] img[src]', 8000),
    ]).catch(() => {});
    await new Promise((r) => setTimeout(r, DELAY_DETAIL));

    const d = f.contentDocument;

    let shippingVal = 0;
    try {
        d?.querySelectorAll('.data-amount .amount-item-text')?.forEach((p) => {
            if (/Actual\s*Payment/i.test(p.textContent || '')) {
                const raw = p.querySelector('.price-text')?.textContent || '';
                const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
                if (Number.isFinite(num)) shippingVal = num;
            }
        });
    } catch {}
    state.shipping[id] = shippingVal;

    const imgs = [];
    d?.querySelectorAll('table img[src], .goods-img img[src], [class*="goods"] img[src], [class*="item"] img[src], td img[src]').forEach((x) => imgs.push(x));
    const seen = new Set();
    let idx = 0;
    const items = [];

    imgs.forEach((img) => {
        const src = img.getAttribute('src');
        if (!src) return;
        const abs = new URL(src, location.href).href;
        if (!/^https?:/i.test(abs)) return;
        if (abs === IGNORE_IMG || /\/img\/copy\.793e45d7\.svg$/i.test(abs)) return;
        
        // Ignore ACbuy warehouse photos and UI assets (Parcel external box photos, QC photos, icons, etc)
        if (/oss\.acbuy\.com\/(images|temp)\//i.test(abs)) return;
        if (/www\.acbuy\.com\/img\//i.test(abs)) return;
        
        if (seen.has(abs)) return;
        seen.add(abs);

        const blk = img.closest('.goods-info')?.parentElement || img.parentElement?.parentElement || img.parentElement;
        const nameEl = blk?.querySelector('.info-name,.name,.title,[class*="name"],[class*="title"]');
        const name = (nameEl?.textContent || `Item ${idx + 1}`).trim();
        const qty = extractQtyFromBlock(blk) || 1;
        const itemId = `${id}-I${++idx}`;
        items.push({ id: itemId, name, thumb: abs, parcelId: id });
        state.qty[itemId] = qty;
    });

    if (items.length === 0) {
        console.warn(`[ACbuy Split] WARNING: Found 0 items for parcel ${id}. Dumping DOM info:`);
        const allImgs = d?.querySelectorAll('img') || [];
        allImgs.forEach(img => {
            if (img.src && !img.src.includes('copy.')) {
                console.warn(` - Found img: ${img.src.substring(0, 50)}... Parent classes: ${img.parentElement?.className} | Grandparent: ${img.parentElement?.parentElement?.className}`);
            }
        });
    }

    return { id, items };
}

export async function discover() {
    try {
        console.log('[ACbuy Split] discover() - scraping parcel list...');
        const ids = await scrapeParcelIds();
        console.log('[ACbuy Split] discover() - found parcel IDs:', ids);
        
        // Instantly populate parcels with empty items so the button unlocks
        state.parcels = ids.map(id => ({ id, items: [] }));
        state.dataReady = ids.length > 0;
        
        return ids;
    } catch (e) {
        console.warn('[ACbuy Split] list scrape fail', e);
        state.dataReady = false;
        return [];
    }
}

export async function fetchAllParcelDetails(ids) {
    const parcels = [];
    for (let i = 0; i < ids.length; i++) {
        try {
            console.log(`[ACbuy Split] scraping details for parcel ${i + 1}/${ids.length}: ${ids[i]}`);
            const { id, items } = await scrapeParcelDetail(ids[i]);
            if (items.length) parcels.push({ id, items });
        } catch (e) {
            console.warn('[ACbuy Split] detail scrape fail', ids[i], e);
        }
    }
    state.parcels = parcels;
    state.dataReady = parcels.length > 0;
}

async function setPageSize50InFrame(f) {
    const d = f.contentDocument;
    const wrapper = d.querySelector('.el-pagination__sizes .el-select__wrapper');
    if (!wrapper) return;
    wrapper.dispatchEvent(new f.contentWindow.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 150));
    const opts = [...d.querySelectorAll('[role="listbox"] [role="option"]')];
    const opt50 = opts.find((li) => /50\/page/i.test(li.textContent || ''));
    if (!opt50) return;
    opt50.dispatchEvent(new f.contentWindow.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 700));
}

function parseOrderRows(doc) {
    const results = [];

    // Primary structure matching the provided HTML (.order-item containing multiple .product-item)
    const orderItems = doc.querySelectorAll('.order-list .order-item');
    if (orderItems.length > 0) {
        orderItems.forEach(orderBlock => {
            const orderIdEl = orderBlock.querySelector('.order-info .order');
            let orderIdTxt = (orderIdEl?.textContent || '').replace(/Order No\.:?\s*/i, '').trim();

            const productItems = orderBlock.querySelectorAll('.product-item');
            productItems.forEach(pItem => {
                const nameEl = pItem.querySelector('.info-name, .goods-name, .name, [class*="name"]');
                const name = (nameEl?.textContent || '').trim();

                const priceEl = pItem.querySelector('.goods-price, .price, [class*="price"]');
                const priceTxt = priceEl?.textContent || priceEl?.getAttribute?.('data-price') || '';
                const raw = priceTxt.replace(/\s+/g, ' ').trim();
                const num = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
                const priceValue = Number.isFinite(num) ? num : null;

                const img = pItem.querySelector('img');
                const imgSrc = img ? new URL(img.getAttribute('src'), location.href).href : null;

                if (name || priceValue !== null || imgSrc) {
                    results.push({
                        name,
                        priceText: raw,
                        price: priceValue,
                        img: imgSrc,
                        orderId: orderIdTxt,
                    });
                }
            });
        });
        if (results.length > 0) return results;
    }

    // Fallback for older or generic structures
    const rows = [...doc.querySelectorAll('.order .item, .table .row, [class*="order"] [class*="item"]')];

    const cleanMoney = (txt) => {
        const raw = (txt || '').replace(/\s+/g, ' ').trim();
        const num = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
        return { text: raw, value: Number.isFinite(num) ? num : null };
    };

    rows.forEach((r) => {
        if (r.classList.contains('order-item')) return; // handled above if it had products
        const nameEl = r.querySelector('.name,.goods-name,.product-name,.title,[class*="name"]');
        const name = (nameEl?.textContent || '').trim();
        const priceEl = r.querySelector('.price,.sale-price,[class*="price"]');
        const price = cleanMoney(priceEl?.textContent || priceEl?.getAttribute?.('data-price'));
        const img = r.querySelector('img');
        const imgSrc = img ? new URL(img.getAttribute('src'), location.href).href : null;
        const wrap = r.closest('[data-order-id]') || r.closest('.order-card,.order-block');
        let orderIdTxt = wrap?.getAttribute?.('data-order-id') || (wrap?.querySelector?.('.order-no,.no,.id')?.textContent || '').trim();
        orderIdTxt = orderIdTxt.replace(/Order No\.:?\s*/i, '').trim();

        if (name || price.value !== null || imgSrc) {
            results.push({
                name,
                priceText: price.text,
                price: price.value,
                img: imgSrc,
                orderId: orderIdTxt,
            });
        }
    });
    return results;
}

export async function collectOrderNamesAndPrices() {
    const f = await loadInFrame('/member/order');
    await waitInFrame(f, '.order-list, .table, [class*="order"] [class*="list"]', 12000).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    await setPageSize50InFrame(f);
    const d = f.contentDocument;
    let items = parseOrderRows(d);
    if (items.length === 0) {
        await new Promise((r) => setTimeout(r, 700));
        items = parseOrderRows(d);
    }
    return items;
}

function fileBase(u) {
    try {
        const url = new URL(u, location.href);
        return url.pathname.split('/').pop();
    } catch {
        return u || '';
    }
}


export async function enrichItemsFromOrders() {
    const orders = await collectOrderNamesAndPrices();
    if (!orders.length) return;

    const byImg = new Map();
    orders.forEach((o) => {
        const k = fileBase(o.img || '');
        if (k) byImg.set(k, o);
    });

    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const byName = new Map();
    orders.forEach((o) => {
        const k = norm(o.name);
        if (k) byName.set(k, o);
    });

    state.parcels.forEach((p) => {
        p.items.forEach((it) => {
            const key = fileBase(it.thumb || '');
            const match = byImg.get(key) || byName.get(norm(it.name));
            if (match) {
                it.price = match.price;
                it.priceText = match.priceText;
                if (match.name && (!it.name || match.name.length > it.name.length)) {
                    it.name = match.name;
                }
            }
        });
    });

}

export async function preloadFX() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
        const js = await res.json();
        if (js && js.result === 'success' && js.rates) {
            state.fx.base = 'USD';
            state.fx.rates = js.rates;
            state.fx.loaded = true;
            state.fx.lastAt = Date.now();
        }
    } catch (e) {
        console.warn('FX load failed', e);
    }
}

export function parseLangChange() {
    const el = document.querySelector('.lang-change');
    const raw = (el?.textContent || '').trim();
    const m = raw.match(/\/\s*([A-Z]{3})/);
    return m ? m[1] : null;
}

export async function initBaseCurrency() {
    try {
        await new Promise((res, rej) => {
            const t0 = performance.now();
            (function loop() {
                if (document.querySelector('.lang-change')) return res();
                if (performance.now() - t0 > 8000) return rej();
                requestAnimationFrame(loop);
            })();
        });
        const code = parseLangChange() || 'USD';
        if (!state.fx.baseSite) state.fx.baseSite = code;
        if (!state.fx.cur) state.fx.cur = code;
    } catch {
        if (!state.fx.baseSite) state.fx.baseSite = 'USD';
        if (!state.fx.cur) state.fx.cur = 'USD';
    }
}
