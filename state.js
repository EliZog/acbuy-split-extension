/**
 * state.js
 * Centralized state manager handling Quantity Model, Undo/Redo, and FX cost calculations.
 */

export const state = {
    dataReady: false,
    parcels: [], // [{id, items:[{id,name,thumb,parcelId,price,priceText}]}]
    shipping: {}, // { parcelId: number } (Actual Payment)
    people: 2,
    peopleNames: [],
    
    // Quantity model
    qty: {}, // total available per itemId, e.g. {"P1-I1": 3}
    assignQty: {}, // per-person units per itemId, e.g. {"P1-I1": {0:2,1:1}}
    
    // Undo/Redo
    undo: [],
    redo: [],
    undoLimit: 40,
    
    ui: {
        open: false,
        activePerson: null,
        selectedParcelIds: new Set(),
        loading: false,
        viewMode: 'compact',
    },
    
    enrichPromise: null,
    
    _lastURL: location.href,
    
    // FX
    fx: {
        base: 'USD', 
        baseSite: null, 
        cur: null, 
        rates: { USD: 1 },
        loaded: false,
        lastAt: 0,
    },
};

export const SYMBOLS = {
    USD: '$', CAD: 'C$', SGD: 'S$', EUR: '€', GBP: '£', CNY: '¥', 
    JPY: '¥', HKD: 'HK$', AUD: 'A$', NZD: 'NZ$', KRW: '₩', PHP: '₱', 
    THB: '฿', MYR: 'RM'
};

export function ensurePeopleNames(n) {
    if (!Array.isArray(state.peopleNames)) state.peopleNames = [];
    for (let i = state.peopleNames.length; i < n; i++) {
        state.peopleNames[i] = `Person ${i + 1}`;
    }
}

export function getActivePersonIndex(withDefault = true) {
    const n = Math.max(1, Math.min(6, state.people || 2));
    const idx = state.ui.activePerson;
    if (Number.isInteger(idx) && idx >= 0 && idx < n) return idx;
    if (!withDefault) return null;
    state.ui.activePerson = 0;
    return 0;
}

export function curSymbol(code) {
    return SYMBOLS[code] || code + ' ';
}

export function convertAmount(n, from = 'USD', to = 'USD') {
    if (!Number.isFinite(n)) return n;
    if (from === to) return n;
    const r = state.fx.rates || {};
    const usd = from === 'USD' ? n : n / (r[from] || 1);
    return to === 'USD' ? usd : usd * (r[to] || 1);
}

export function fmtMoney(n, cur) {
    if (n == null || !isFinite(n)) return '—';
    const s = curSymbol(cur || state.fx.cur || state.fx.baseSite || 'USD');
    return `${s}${(+n).toFixed(2)}`;
}

export function allItems() {
    return state.parcels.flatMap((p) => p.items);
}

export function itemsByParcel(pid) {
    return state.parcels.find((p) => p.id === pid)?.items || [];
}

export function totalItemsInParcel(pid) {
    return itemsByParcel(pid).length;
}

export function totalItemsInHaul() {
    return allItems().length;
}

export function sumAllItemPricesUSD() {
    const from = state.fx.baseSite || 'USD';
    return allItems().reduce((s, it) => s + convertAmount(Number.isFinite(it.price) ? it.price : 0, from, 'USD'), 0);
}

export function sumAllShippingUSD() {
    const from = state.fx.baseSite || 'USD';
    return Object.values(state.shipping).reduce((s, v) => s + convertAmount(Number.isFinite(v) ? v : 0, from, 'USD'), 0);
}

export function visibleParcelIds() {
    return Array.from(state.ui.selectedParcelIds);
}

export function sumVisibleShippingUSD() {
    const from = state.fx.baseSite || 'USD';
    const ids = visibleParcelIds();
    if (!ids.length) return 0;
    return ids.reduce((s, id) => s + convertAmount(Number.isFinite(state.shipping[id]) ? state.shipping[id] : 0, from, 'USD'), 0);
}

export function purgeAssignmentsExceptParcels(parcelIdSet) {
    if (!parcelIdSet || parcelIdSet.size === 0) return;
    const keep = new Set();
    state.parcels.forEach((p) => {
        if (parcelIdSet.has(p.id)) {
            p.items.forEach((it) => keep.add(it.id));
        }
    });
    Object.keys(state.assignQty).forEach((itemId) => {
        if (!keep.has(itemId)) delete state.assignQty[itemId];
    });
}

// Undo / Redo
export function snapshot() {
    return {
        assignQty: JSON.parse(JSON.stringify(state.assignQty || {})),
        activePerson: state.ui.activePerson,
    };
}

export function pushUndo() {
    state.undo.push(snapshot());
    if (state.undo.length > state.undoLimit) state.undo.shift();
    state.redo = [];
}

export function applySnap(snap) {
    state.assignQty = JSON.parse(JSON.stringify(snap.assignQty || {}));
    state.ui.activePerson = snap.activePerson ?? state.ui.activePerson;
}

export function doUndo() {
    if (!state.undo.length) return;
    const cur = snapshot();
    const prev = state.undo.pop();
    state.redo.push(cur);
    applySnap(prev);
}

export function doRedo() {
    if (!state.redo.length) return;
    const cur = snapshot();
    const next = state.redo.pop();
    state.undo.push(cur);
    applySnap(next);
}
