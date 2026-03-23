# Andy Pantry Extension Prototype

This is a no-build MV3 prototype for the Andy Pantry MVP shell.

Implemented:
- Popup-based save flow
- Rule-based category/tag extraction
- Duplicate save allowed with guidance
- Pantry dashboard in a dedicated extension page
- Search, filter, sort, detail drawer, archive, delete

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
