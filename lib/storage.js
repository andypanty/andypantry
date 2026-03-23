export const STORAGE_KEY = 'savedItems';

export const DEFAULT_LABEL = 'wishlist';
export const DEFAULT_STATUS = 'active';
export const CATEGORY_OPTIONS = [
  'fashion',
  'living',
  'appliance',
  'beauty',
  'food',
  'book',
  'other',
];
export const LABEL_OPTIONS = ['wishlist', 'gift', 'personal'];

export async function loadItems() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

export async function saveItems(items) {
  await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    const params = new URLSearchParams(url.search);
    const filtered = [];
    for (const [key, value] of params.entries()) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith('utm_') ||
        lower === 'fbclid' ||
        lower === 'gclid' ||
        lower === 'igshid' ||
        lower === 'ref' ||
        lower === 'source'
      ) {
        continue;
      }
      filtered.push([key, value]);
    }
    filtered.sort((a, b) => a[0].localeCompare(b[0]));
    url.search = filtered.length ? `?${new URLSearchParams(filtered).toString()}` : '';
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function detectDuplicate(items, normalizedUrl) {
  return items.find((item) => item.normalizedUrl === normalizedUrl) || null;
}

export function buildSavedItem(candidate, duplicateOfId = null) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    duplicateOfId,
    url: candidate.url,
    normalizedUrl: candidate.normalizedUrl,
    title: candidate.title,
    merchant: candidate.merchant,
    imageUrl: candidate.imageUrl,
    currentPrice: candidate.currentPrice,
    currency: candidate.currency || 'KRW',
    category: candidate.category || 'other',
    tags: candidate.tags || [],
    label: DEFAULT_LABEL,
    note: '',
    status: DEFAULT_STATUS,
    createdAt: now,
    updatedAt: now
  };
}

export function updateSavedItem(items, id, patch) {
  const now = new Date().toISOString();
  return items.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: now } : item));
}

export function formatPrice(value, currency = 'KRW') {
  if (value === null || value === undefined || value === '') return 'Price unknown';
  const number = Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(number)) return String(value);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(number);
  } catch {
    return String(value);
  }
}

export function categoryLabel(category) {
  const map = {
    fashion: 'Fashion',
    living: 'Living',
    appliance: 'Appliance',
    beauty: 'Beauty',
    food: 'Food',
    book: 'Book',
    other: 'Other',
  };
  return map[category] || 'Other';
}

export function labelLabel(label) {
  const map = {
    wishlist: 'Wishlist',
    gift: 'Gift',
    personal: 'Personal',
  };
  return map[label] || 'Wishlist';
}
