# Andy Pantry Extension Prototype

This is a no-build MV3 prototype for the Andy Pantry MVP shell.

Implemented:
- Popup-based save flow
- Rule-based category/tag extraction
- Structured price extraction chain: JSON-LD -> meta tags -> microdata -> selector/regex fallback
- Duplicate saves now update the existing item instead of creating a second copy, and old same-URL duplicates are merged on load/save
- Saved items now keep initial/current price metadata and lightweight price change history
- Low-confidence pages can still be saved as link-only entries with warning copy
- Pantry dashboard in a dedicated extension page
- Search, sort, detail drawer, archive, delete
- Separate status, label, and category filters in the dashboard
- Density presets with responsive auto-fill grid cards
- Branded favicon and placeholder fallbacks for missing product images

Load in Chrome:
1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `Business/AndyPantry/extension`
5. Pin `Andy Pantry` to the toolbar for one-click access

Notes:
- This is a prototype shell, not the final WXT/React codebase.
- Data is stored in `chrome.storage.local`.
- Google login and Supabase are not wired yet.
- If category detection is wrong, you can change the category in the popup before saving.
- Unsupported or low-confidence pages still save, but the popup now makes it explicit when the save is effectively link-first.
