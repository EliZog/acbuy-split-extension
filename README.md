<div align="center">
  <img src="icon128.png" alt="ACbuy Split Logo" width="128" height="128" />
  <h1>ACbuy Split Order Extension</h1>
  <p><strong>A premium Chrome extension to seamlessly split ACbuy haul costs with precision and style.</strong></p>
</div>

## Overview
**ACbuy Split** transforms the complex task of splitting large shipping hauls into a smooth, visual experience. When ordering for multiple people, calculating individual shipping shares and item totals is traditionally a spreadsheet nightmare. 

This extension automates that entire workflow by cross-referencing parcel contents with your original order history, pulling in precise names, photos, and prices, and providing a high-end drag-and-drop interface to distribute costs fairly.

## Features
- **Dynamic View Modes:** Toggle between **Grid**, **List**, and **Compact** modes for assigned items. Perfect for scanning large hauls or focusing on dense data.
- **Auto-Enrichment:** Automatically maps cryptic parcel item names to their original, readable product names and photos from your order history.
- **Smart Loading:** Features a synchronized background scraper and cinematic loading overlays that wait for data enrichment before revealing the UI.
- **GPU-Accelerated Visuals:** Premium breathing animations and smooth transitions optimized for zero stutter and high performance.
- **Fair Shipping Logic:** Automatically captures the "Actual Payment" shipping cost for selected parcels and divides it equally among everyone.
- **Live FX Engine:** Seamlessly converts between USD, CNY, EUR, GBP, and more with real-time exchange rates.
- **Drag & Drop Workflow:** Intuitive visual assignment of items to customizable "Person" buckets.

## Installation
1.  Download or clone this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (top right).
4.  Click **Load unpacked** and select the extension directory.

## Usage
1.  Navigate to your [ACbuy My Package](https://www.acbuy.com/member/my-package) page.
2.  Locate the glowing **Split Parcel** button in the sidebar (in the gap section).
3.  Select the parcels you wish to split from the top chip-selection area.
4.  Hit **Confirm Split** and wait for the smooth transition.
5.  Set the number of people and drag items to assign them. Use the **View Toggles** to adjust density!

## Architecture
- **`main.js`**: Core bootstrapper and background task coordinator.
- **`ui-manager.js`**: Premium UI logic, CSS injection, and state-driven rendering.
- **`scraper.js`**: Headless data extraction for parcels and order histories.
- **`state.js`**: Centralized state management with full Undo/Redo support.
- **`product-sheet.js`**: Specialized logic for handling detailed product views.

---
*Disclaimer: This extension is a third-party tool and is not officially affiliated with ACbuy.*
