# ACbuy Split Order Chrome Extension

This document outlines the implementation plan for the ACbuy Split Order extension.

## Goal

Create a Manifest V3 Chrome Extension with a modular ES Module architecture to allow users to split parcels, calculate individual costs (including pro-rated shipping), and provide a drag-and-drop interface within a Shadow DOM.

## Open Questions

> [!WARNING]
> **Authentication and Iframe Policies**: Does `acbuy.com` allow framing its own pages (i.e. does it lack restrictive `X-Frame-Options` or `Content-Security-Policy: frame-ancestors` headers on `/member/order`)? If it restricts framing, we may need to use `fetch` requests and parse the resulting HTML as text instead of using hidden iframes. 

> [!NOTE]
> **Data Identifiers**: Do items and parcels on `acbuy.com` have unique IDs in their DOM (e.g., `data-id` or tracking numbers) that we can reliably use to map data between the package list, package details, and order list?

## Proposed Changes

### Configuration and Entry Point

#### [NEW] [manifest.json](file:///z:/Development-Projects/acbuy-split-orderv3/manifest.json)
- Manifest V3 configuration.
- Configures `loader.js` as the content script.
- Exposes our ES modules (`main.js`, `scraper.js`, `state.js`, `ui-manager.js`, `styles.css`) as `web_accessible_resources` so they can be imported dynamically and attached to the page.
- Grants `storage` permission for persisting state.

#### [NEW] [loader.js](file:///z:/Development-Projects/acbuy-split-orderv3/loader.js)
- A non-module content script that serves as the entry point.
- Uses dynamic `import(chrome.runtime.getURL('main.js'))` to bootstrap the ES module environment for the extension within the content script context.

---

### Core ES Modules

#### [NEW] [main.js](file:///z:/Development-Projects/acbuy-split-orderv3/main.js)
- **Orchestrator**: Sets up a `MutationObserver` on the body to detect when the user navigates to `/member/my-package` (since it's a SPA).
- Orchestrates the activation sequence: checks for "Received" parcels, triggers background loading via `scraper.js`, and initializes `ui-manager.js` when ready.

#### [NEW] [scraper.js](file:///z:/Development-Projects/acbuy-split-orderv3/scraper.js)
- **DOM Crawling**: Parses the current `/member/my-package` page to find eligible "Received" parcels.
- **Background Fetching**: Uses hidden `<iframe>` (or `fetch()` if iframe is blocked) to load `/member/my-package/package-detail` and `/member/order` invisibly.
- Extracts item names, prices, quantities, and total shipping costs.

#### [NEW] [state.js](file:///z:/Development-Projects/acbuy-split-orderv3/state.js)
- **State Manager**: Central repository for all application state.
- **Quantity Model**: Tracks total available quantities of each item and their assignments to people.
- **Calculations**: Implements the logic: `Total = Sum(Item Prices) + (Total Shipping / Num People)`.
- **Undo/Redo & Persistence**: Implements the State/Memento pattern to allow `Ctrl+Z` and synchronizes with `chrome.storage.local`.

#### [NEW] [ui-manager.js](file:///z:/Development-Projects/acbuy-split-orderv3/ui-manager.js)
- **Shadow DOM**: Wraps the injected UI in a Shadow DOM to isolate styles from `acbuy.com`.
- **Button Injection**: Injects the "Split Parcel" button into the nav/sidebar.
- **Drag-and-Drop System**: Manages drag events for items, moving them to different people's buckets.
- **Depletion Logic**: Applies grayscale and disabled states to items when their remaining quantity hits zero.
- **Auto-Assign (Balancer)**: Logic for the "Add rest of haul" button using a greedy algorithm.
- **Loading UI**: Manages the spinner if the user clicks before background scraping completes.

#### [NEW] [styles.css](file:///z:/Development-Projects/acbuy-split-orderv3/styles.css)
- Contains all styling for the extension, utilizing the requested Turquoise (`#30b48b`) accents.
- Defines classes for standard item cards, grayscale depleted items, drag targets, and badging.

## Verification Plan

### Manual Verification
1. Load the extension in Chrome (`chrome://extensions`, Developer mode, Load unpacked).
2. Navigate to `acbuy.com/member/my-package`.
3. Verify the `MutationObserver` detects the route and finds a "Received" parcel.
4. Verify the "Split Parcel" button appears and becomes clickable.
5. Click the button and verify the UI appears in a Shadow DOM.
6. Test drag-and-drop mechanics (Quantity Model, Depletion Logic, Undo/Redo).
7. Test the "Add rest of haul" greedy algorithm.
8. Verify calculations accurately reflect item prices and pro-rated shipping in CAD.
