import { convertAmount, curSymbol, state } from './state.js';
import { DEBUG_TEST_IMAGE } from './assets.js';

let uiMounted = false;

export function initProductSheet() {
    if (uiMounted) return;
    uiMounted = true;

    // Inject Styles
    const style = document.createElement('style');
    style.textContent = `
        #acbuy-product-sheet-ui {
            position: fixed;
            top: 20px;
            right: -360px;
            width: 320px;
            background: white;
            box-shadow: 0 12px 40px rgba(0,0,0,0.18);
            border-radius: 16px;
            z-index: 9999999;
            padding: 24px;
            transition: right 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: flex;
            flex-direction: column;
            gap: 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            border: 1px solid #eee;
        }
        #acbuy-product-sheet-ui.open {
            right: 20px;
        }
        .acbuy-sheet-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #f0f0f0;
            padding-bottom: 12px;
        }
        .acbuy-sheet-title {
            font-size: 18px;
            font-weight: 700;
            color: #1a1a1a;
            margin: 0;
        }
        .acbuy-sheet-close {
            background: #f0f0f0;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #666;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        .acbuy-sheet-close:hover {
            background: #e0e0e0;
            color: #333;
        }
        .acbuy-sheet-preview {
            display: flex;
            flex-direction: column;
            gap: 16px;
            background: #fafafa;
            padding: 16px;
            border-radius: 14px;
            border: 1px solid #f0f0f0;
        }
        .acbuy-sheet-preview-top {
            display: flex;
            gap: 16px;
        }
        .acbuy-img-container {
            position: relative;
            flex-shrink: 0;
        }
        .acbuy-sheet-preview img {
            width: 80px;
            height: 80px;
            object-fit: cover;
            border-radius: 10px;
            border: 1px solid #e0e0e0;
            background: white;
        }
        .acbuy-sheet-preview-info {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
            flex-grow: 1;
        }
        .acbuy-sheet-preview-title {
            font-size: 14px;
            font-weight: 600;
            color: #222;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            margin-bottom: 8px;
        }
        .acbuy-sheet-preview-price {
            font-size: 18px;
            font-weight: 800;
            color: #31b38c;
        }
        .acbuy-specs-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding-top: 12px;
            border-top: 1px dashed #e0e0e0;
        }
        .acbuy-spec-row {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: #555;
            padding: 4px 0;
        }
        .acbuy-spec-label {
            font-weight: 600;
            color: #888;
        }
        .acbuy-spec-value {
            font-weight: 500;
            color: #333;
            text-align: right;
        }
        .copyable {
            cursor: pointer;
            position: relative;
            transition: all 0.2s;
            border-radius: 6px;
        }
        .copyable:hover {
            background: rgba(49, 179, 140, 0.08);
            outline: 1px solid rgba(49, 179, 140, 0.2);
        }
        .copyable:active {
            transform: scale(0.97);
        }
        .copy-toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: #333;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            pointer-events: none;
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            z-index: 10000000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .copy-toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        .acbuy-sheet-intent {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .acbuy-sheet-intent label {
            font-size: 14px;
            font-weight: 600;
            color: #444;
        }
        .acbuy-sheet-intent select {
            padding: 12px;
            border-radius: 10px;
            border: 1px solid #ddd;
            font-size: 14px;
            outline: none;
            background: #fff;
            cursor: pointer;
            transition: border-color 0.2s;
        }
        .acbuy-sheet-intent select:focus {
            border-color: #31b38c;
        }
        .acbuy-sheet-btn {
            background: #31b38c;
            color: white;
            border: none;
            border-radius: 10px;
            padding: 14px;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            box-shadow: 0 4px 12px rgba(49, 179, 140, 0.3);
        }
        .acbuy-sheet-btn:hover {
            background: #289675;
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(49, 179, 140, 0.4);
        }
        .acbuy-sheet-btn:active {
            transform: translateY(0);
        }
    `;
    document.head.appendChild(style);

    // Watch for size/color selections
    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('.type-item, .size-item, .color-item, .sku-item, .el-radio, [data-v-8ab20568].type-item');
        if (target) {
            setTimeout(() => {
                checkAndShowUI();
            }, 300);
        }
    });
}

function showToast(text) {
    let toast = document.getElementById('acbuy-copy-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'acbuy-copy-toast';
        toast.className = 'copy-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

function scrapeProductData() {
    // 1. Try to find active variant image first
    const activeVariantImg = document.querySelector('.type-item.active img, .size-item-img.active img, [data-v-8ab20568].type-item.active img');
    const mainImgEl = document.querySelector('.middle .img, .imgPopper img, .gallery-wrap img, .product-img img, img.img');
    const imgUrl = activeVariantImg ? activeVariantImg.src : (mainImgEl ? mainImgEl.src : '');

    // Priority selectors for title
    const titleEl = document.querySelector('.g-name, .goods-title, .product-title, .detail-info .title, .info-container .title, h1');
    let title = titleEl ? titleEl.textContent.trim() : '';
    
    // If we still don't have a title, try to find the first large text element in the info section
    if (!title) {
        const fallbackTitle = document.querySelector('.info-section h1, .product-info h2');
        if (fallbackTitle) title = fallbackTitle.textContent.trim();
    }
    
    // Final fallback, but strip generic ACbuy branding
    if (!title) {
        title = document.title.replace(/-\s*ACbuy.*/i, '').replace(/Shop on TaoBao.*/i, '').trim();
    }

    let usdPrice = null;
    const priceText = document.querySelector('.g-price')?.textContent || '';
    const usdMatch = priceText.match(/USD\s*\$?([\d\.]+)/i);

    if (usdMatch) {
        usdPrice = parseFloat(usdMatch[1]);
    } else {
        const cnyMatch = priceText.match(/CNY\s*[¥\$]?([\d\.]+)/i);
        if (cnyMatch) {
            usdPrice = convertAmount(parseFloat(cnyMatch[1]), 'CNY', 'USD');
        }
    }

    let priceStr = '$0.00';
    if (usdPrice) {
        priceStr = `$${usdPrice.toFixed(2)}`;
    }

    // 2. Scrape all specifications
    const specs = [];
    const typeLists = document.querySelectorAll('.type-list');
    typeLists.forEach(el => {
        const titleEl = el.querySelector('.title');
        if (!titleEl) return;
        
        // Clone and remove span to get clean label
        const titleClone = titleEl.cloneNode(true);
        const span = titleClone.querySelector('span');
        const value = span ? span.textContent.trim() : '';
        if (span) span.remove();
        const label = titleClone.textContent.trim().replace(/:$/, '');
        
        if (label && value) {
            specs.push({ label, value });
        }
    });

    return {
        url: location.href,
        title,
        imgUrl,
        price: priceStr,
        specs
    };
}

function checkAndShowUI() {
    const data = scrapeProductData();
    if (data.specs.length === 0) return; 

    mountSlideOutUI(data);
}

function mountSlideOutUI(data) {
    let container = document.getElementById('acbuy-product-sheet-ui');
    if (!container) {
        container = document.createElement('div');
        container.id = 'acbuy-product-sheet-ui';
        document.body.appendChild(container);
    }

    const specsHtml = data.specs.map(spec => `
        <div class="acbuy-spec-row copyable" data-copy-val="${spec.value}">
            <span class="acbuy-spec-label">${spec.label}</span>
            <span class="acbuy-spec-value">${spec.value}</span>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="acbuy-sheet-header">
            <h3 class="acbuy-sheet-title">Copy to Sheet</h3>
            <button class="acbuy-sheet-close" title="Close widget">&times;</button>
        </div>
        <div class="acbuy-sheet-preview">
            <div class="acbuy-sheet-preview-top">
                <div class="acbuy-img-container copyable" data-copy-type="image" data-copy-val="${data.imgUrl}">
                    <img src="${data.imgUrl}" alt="Preview">
                </div>
                <div class="acbuy-sheet-preview-info">
                    <div class="acbuy-sheet-preview-title copyable" data-copy-val="${data.title}" title="${data.title}">${data.title}</div>
                    <div class="acbuy-sheet-preview-price copyable" data-copy-val="${data.price}">${data.price}</div>
                </div>
            </div>
            <div class="acbuy-specs-list">
                ${specsHtml}
            </div>
        </div>
        <div class="acbuy-sheet-intent">
            <label for="acbuy-intent-select">Purchase Intent</label>
            <select id="acbuy-intent-select">
                <option value="Will Buy">Will Buy</option>
                <option value="Considering">Considering Buying</option>
                <option value="Interested">Interested</option>
            </select>
        </div>
        <button class="acbuy-sheet-btn" id="acbuy-copy-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy Everything
        </button>
    `;

    setTimeout(() => container.classList.add('open'), 100);

    container.querySelector('.acbuy-sheet-close').onclick = () => {
        container.classList.remove('open');
    };

    // Handle Individual Copying
    container.addEventListener('click', async (e) => {
        const copyable = e.target.closest('.copyable');
        if (!copyable) return;

        const val = copyable.dataset.copyVal;
        const type = copyable.dataset.copyType;

        try {
            await navigator.clipboard.writeText(val);
            if (type === 'image') {
                showToast('Image Link Copied!');
            } else {
                showToast(`${val.substring(0, 25)}${val.length > 25 ? '...' : ''} Copied!`);
            }
        } catch (err) {
            console.error('Copy failed', err);
            // Fallback for non-secure contexts or failed write
            const el = document.createElement('textarea');
            el.value = val;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            showToast('Copied (Fallback)!');
        }
    });

    const btn = container.querySelector('#acbuy-copy-btn');
    btn.addEventListener('click', async () => {
        const intentSelect = document.getElementById('acbuy-intent-select');
        const intentText = intentSelect.value;
        const intentColor = intentText === 'Will Buy' ? '#d4edda' : (intentText === 'Considering' ? '#fff3cd' : '#f8f9fa');

        const imageDataUrl = data.imgUrl; 
        const specsMeta = data.specs.map(s => `${s.label}: ${s.value}`).join(' / ');

        const htmlTemplate = `
            <table style="border-collapse: collapse; width: 100%; border: 1px solid #ddd; font-family: Arial, sans-serif;">
                <tr style="background-color: {{INTENT_COLOR}};">
                    <td style="padding: 12px; border: 1px solid #ddd; width: 80px;">
                        <img src="{{IMAGE}}" width="60" height="60" style="display: block; border-radius: 4px;">
                    </td>
                    <td style="padding: 12px; border: 1px solid #ddd;">
                        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">{{TITLE}}</div>
                        <div style="color: #666; font-size: 12px;">{{META}}</div>
                        <div style="margin-top: 8px; font-weight: bold; color: #31b38c;">{{PRICE}}</div>
                        <div style="margin-top: 4px; font-size: 11px; color: #888;">Status: {{INTENT_TEXT}}</div>
                    </td>
                </tr>
            </table>
        `;

        const htmlStr = htmlTemplate
            .replace('{{TITLE}}', escapeHtml(data.title))
            .replace('{{META}}', escapeHtml(specsMeta))
            .replace('{{IMAGE}}', imageDataUrl)
            .replace('{{PRICE}}', escapeHtml(data.price))
            .replace('{{INTENT_TEXT}}', escapeHtml(intentText))
            .replace('{{INTENT_COLOR}}', intentColor);

        try {
            const blobHtml = new Blob([htmlStr], { type: 'text/html' });
            const blobText = new Blob([data.title], { type: 'text/plain' });

            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': blobHtml,
                    'text/plain': blobText
                })
            ]);

            const originalText = btn.innerHTML;
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Everything Copied!`;
            btn.style.background = '#28a745';

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
            }, 2000);

        } catch (err) {
            console.error('[ACbuy Split] Clipboard write failed', err);
            alert('Failed to copy. Please ensure your browser permits clipboard access.');
        }
    });
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
