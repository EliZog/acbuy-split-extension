<div align="center">
  <img src="icon128.png" alt="ACbuy Split Logo" width="128" height="128" />
  <h1>ACbuy Split Order Extension</h1>
  <p><strong>A Chrome extension to seamlessly split ACbuy haul costs among friends!</strong></p>
</div>

## Overview
This extension injects a powerful "Split Parcel" button directly into the ACbuy "My Package" dashboard. When you're ordering a giant haul for multiple people, calculating individual shipping costs and item prices can be an absolute nightmare. 

**ACbuy Split** completely automates this process by cross-referencing your parcel contents with your original order history, pulling in the precise names and prices for every single item, and providing a beautiful drag-and-drop interface to distribute items to multiple people!

## Features
- **Auto-Sync:** Instantly maps parcel items to their original order names and prices.
- **Drag & Drop:** Easily drag products from the main haul pool into individual person buckets.
- **Fair Shipping Calculator:** Automatically grabs the "Actual Payment" shipping cost and divides it equally among everyone in the haul.
- **Live Currency Conversion:** Switch seamlessly between USD, EUR, GBP, AUD, and more with live exchange rates.
- **Customizable:** Rename people buckets, unassign items, handle multiples of the same item flawlessly.
- **Export to CSV:** Export the finalized split directly into a spreadsheet!

## Installation
1. Go to `chrome://extensions/`
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the folder containing this extension.

## Usage
1. Navigate to the [ACbuy My Package](https://www.acbuy.com/member/my-package) page.
2. Ensure you have parcels that are ready or shipped.
3. Click the newly injected **Split Parcel** button in the sidebar or top navigation.
4. Drag and drop items to split the haul!

## Architecture
- `main.js`: Bootstraps the application and manages background task synchronization.
- `scraper.js`: Handles scraping parcel IDs, detail frames, and order histories without interacting with the main UI thread.
- `ui-manager.js`: Houses the logic for injecting the CSS, the split button, and managing the entire drag-and-drop modal state.
- `state.js`: Global state management.

---
*Disclaimer: This extension is a third-party tool and is not officially affiliated with ACbuy.*
