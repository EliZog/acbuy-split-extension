(async () => {
    try {
        const src = chrome.runtime.getURL('main.js');
        const main = await import(src);
        if (main.init) {
            main.init();
        }
    } catch (e) {
        console.error('ACbuy Split Order Extension failed to load module:', e);
    }
})();
