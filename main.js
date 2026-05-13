import { state } from './state.js';
import { discover, fetchAllParcelDetails, enrichItemsFromOrders, preloadFX, initBaseCurrency } from './scraper.js';
import { injectSplitBtn, watchApp, renderProducts, renderPeople, updateTotalsUI, updateProductsTitle, findSplitBtn, setBtnDisabled } from './ui-manager.js';

const $ = (s, r = document) => r.querySelector(s);
const getArticle = () => $('.article');



export async function init() {
    try {
        console.log('[ACbuy Split] Booting global extension...');
        
        // Start watching the DOM and injecting the button immediately
        injectSplitBtn();
        watchApp();
        
        // Run background tasks concurrently
        const bgTasks = async () => {
            console.log('[ACbuy Split] Starting bg tasks...');
            
            console.log('[ACbuy Split] 1. Starting preloadFX');
            await preloadFX();
            console.log('[ACbuy Split] 1. Finished preloadFX');
            
            console.log('[ACbuy Split] 2. Starting initBaseCurrency');
            await initBaseCurrency();
            console.log('[ACbuy Split] 2. Finished initBaseCurrency');
            
            console.log('[ACbuy Split] 3. Starting discover (fetching IDs only)');
            const ids = await discover();
            console.log('[ACbuy Split] 3. Finished discover');
            
            // At this point, `state.parcels` has the IDs, so we can ENABLE the button immediately!
            console.log('[ACbuy Split] Parcels found (IDs only):', state.parcels.length);
            setBtnDisabled(findSplitBtn(), !state.parcels.length);
            
            // Push the slow scraping steps to the enrich promise
            console.log('[ACbuy Split] 4. Starting slow fetching and enrichment in background...');
            state.enrichPromise = (async () => {
                await fetchAllParcelDetails(ids);
                await enrichItemsFromOrders();
            })();
            
            await state.enrichPromise;
            console.log('[ACbuy Split] 4. Finished slow fetching and enrichment');
        };
        
        bgTasks().catch(e => console.warn('Background tasks error:', e));

        const artMO = new MutationObserver(() => {
            if (!getArticle() && state.ui.open) {
                state.ui.open = false;
            }
        });
        artMO.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
        console.warn('Split Parcel init error', e);
    }
}
