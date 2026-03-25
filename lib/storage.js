export const STORAGE_KEY = 'savedItems';
export const VIEW_SETTINGS_KEY = 'viewSettings';

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
export const LABEL_OPTIONS = ['wishlist', 'gift', 'bookmark'];

export const DENSITY_PRESETS = {
  comfortable: {
    label: 'Comfortable',
    cardMinWidth: '280px',
    description: 'Larger cards with more breathing room.',
  },
  compact: {
    label: 'Compact',
    cardMinWidth: '200px',
    description: 'Balanced density for everyday Pantry browsing.',
  },
  dense: {
    label: 'Dense',
    cardMinWidth: '150px',
    description: 'Smaller cards to scan more items at once.',
  },
};

const DEFAULT_VIEW_SETTINGS = {
  density: 'compact',
};

const CATEGORY_META = {
  fashion: {
    label: 'Fashion',
    emoji: '👕',
    accent: '#b56c6c',
    placeholder: './assets/placeholder-fashion.svg',
    description: 'Clothing, shoes, bags, and accessories.',
  },
  living: {
    label: 'Living',
    emoji: '🪑',
    accent: '#879c7a',
    placeholder: './assets/placeholder-living.svg',
    description: 'Furniture, interior, kitchen, and home goods.',
  },
  appliance: {
    label: 'Appliance',
    emoji: '📱',
    accent: '#6b8cae',
    placeholder: './assets/placeholder-appliance.svg',
    description: 'Electronics, appliances, and digital devices.',
  },
  beauty: {
    label: 'Beauty',
    emoji: '💄',
    accent: '#c17aa7',
    placeholder: './assets/placeholder-beauty.svg',
    description: 'Cosmetics, skincare, fragrance, and beauty tools.',
  },
  food: {
    label: 'Food',
    emoji: '🍽️',
    accent: '#c96b3b',
    placeholder: './assets/placeholder-food.svg',
    description: 'Food, drinks, and supplements.',
  },
  book: {
    label: 'Book',
    emoji: '📚',
    accent: '#8f744d',
    placeholder: './assets/placeholder-book.svg',
    description: 'Books, stationery, and learning materials.',
  },
  other: {
    label: 'Other',
    emoji: '📦',
    accent: '#8c8177',
    placeholder: './assets/placeholder-other.svg',
    description: 'Everything that does not fit another category.',
  },
};

const LABEL_META = {
  wishlist: {
    label: 'Wishlist',
    emoji: '🛒',
    tone: 'wishlist',
    accent: '#879c7a',
    description: 'Items you want to buy later.',
  },
  gift: {
    label: 'Gift',
    emoji: '🎁',
    tone: 'gift',
    accent: '#d4a843',
    description: 'Gift candidates for someone else.',
  },
  bookmark: {
    label: 'Bookmark',
    emoji: '📌',
    tone: 'bookmark',
    accent: '#6b8cae',
    description: 'Saved to keep, compare, or reference later.',
  },
};

function normalizeLabel(label) {
  if (label === 'personal') return 'bookmark';
  return LABEL_OPTIONS.includes(label) ? label : DEFAULT_LABEL;
}

function parseNumericPrice(value) {
  const number = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function buildPriceChange(initialPrice, currentPrice) {
  const initial = parseNumericPrice(initialPrice);
  const current = parseNumericPrice(currentPrice);
  if (!initial || !current) return null;

  const amount = current - initial;
  if (amount === 0) {
    return { direction: 'same', amount: 0, percent: 0 };
  }

  return {
    direction: amount > 0 ? 'up' : 'down',
    amount: Math.abs(amount),
    percent: Number(((amount / initial) * 100).toFixed(1)),
  };
}

function buildPriceHistoryEntry(price, currency, source = 'captured', checkedAt = new Date().toISOString()) {
  return {
    price,
    currency: currency || 'KRW',
    source,
    checkedAt,
  };
}

function mergePriceHistory(history, entry) {
  const next = Array.isArray(history) ? [...history] : [];
  if (!entry?.price) return next;

  const last = next[next.length - 1];
  if (last && last.price === entry.price && last.currency === entry.currency) {
    next[next.length - 1] = { ...last, checkedAt: entry.checkedAt, source: entry.source };
  } else {
    next.push(entry);
  }

  return next.slice(-24);
}

function normalizeSavedItem(item) {
  const currentPrice = item.currentPrice || '';
  const initialPrice = item.initialPrice || currentPrice || '';
  const lastCheckedAt = item.lastCheckedAt || item.updatedAt || item.createdAt || new Date().toISOString();
  const history = mergePriceHistory(
    item.priceHistory,
    currentPrice ? buildPriceHistoryEntry(currentPrice, item.currency, item.priceSource || 'captured', lastCheckedAt) : null
  );

  return {
    ...item,
    label: normalizeLabel(item.label),
    normalizedUrl: normalizeUrl(item.normalizedUrl || item.url || ''),
    description: item.description || '',
    metaTags: Array.isArray(item.metaTags) ? item.metaTags : [],
    brand: item.brand || '',
    availability: item.availability || '',
    initialPrice,
    lastCheckedAt,
    priceHistory: history,
    priceChange: buildPriceChange(initialPrice, currentPrice),
  };
}

function toTimestamp(value) {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? ts : 0;
}

function firstNonEmpty(items, selector, fallback = '') {
  for (const item of items) {
    const value = selector(item);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return fallback;
}

function mergeListValues(items, selector, limit = 24) {
  const seen = new Set();
  const merged = [];
  for (const item of items) {
    const values = selector(item);
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const normalized = String(value ?? '').trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push(normalized);
    }
  }
  return merged.slice(0, limit);
}

function mergeDuplicateGroup(group) {
  if (group.length === 1) return normalizeSavedItem(group[0]);

  const normalizedGroup = group.map(normalizeSavedItem);
  const oldestFirst = [...normalizedGroup].sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
  const newestFirst = [...normalizedGroup].sort((a, b) => toTimestamp(b.updatedAt || b.createdAt) - toTimestamp(a.updatedAt || a.createdAt));
  const oldest = oldestFirst[0];

  let mergedHistory = [];
  for (const item of oldestFirst) {
    for (const entry of item.priceHistory || []) {
      mergedHistory = mergePriceHistory(mergedHistory, entry);
    }
    if (!item.priceHistory?.length && item.currentPrice) {
      mergedHistory = mergePriceHistory(
        mergedHistory,
        buildPriceHistoryEntry(item.currentPrice, item.currency, item.priceSource || 'captured', item.lastCheckedAt || item.updatedAt || item.createdAt)
      );
    }
  }

  return normalizeSavedItem({
    ...oldest,
    duplicateOfId: null,
    url: firstNonEmpty(newestFirst, (item) => item.url, oldest.url),
    normalizedUrl: normalizeUrl(firstNonEmpty(newestFirst, (item) => item.normalizedUrl || item.url, oldest.normalizedUrl || oldest.url)),
    title: firstNonEmpty(newestFirst, (item) => item.title, oldest.title),
    merchant: firstNonEmpty(newestFirst, (item) => item.merchant, oldest.merchant),
    imageUrl: firstNonEmpty(newestFirst, (item) => item.imageUrl, oldest.imageUrl),
    currentPrice: firstNonEmpty(newestFirst, (item) => item.currentPrice, oldest.currentPrice),
    initialPrice: firstNonEmpty(oldestFirst, (item) => item.initialPrice || item.currentPrice, oldest.initialPrice || oldest.currentPrice),
    currency: firstNonEmpty(newestFirst, (item) => item.currency, oldest.currency),
    priceSource: firstNonEmpty(newestFirst, (item) => item.priceSource, oldest.priceSource),
    lastCheckedAt: firstNonEmpty(newestFirst, (item) => item.lastCheckedAt, oldest.lastCheckedAt),
    createdAt: oldest.createdAt,
    updatedAt: firstNonEmpty(newestFirst, (item) => item.updatedAt, oldest.updatedAt),
    category: firstNonEmpty(newestFirst, (item) => item.category, oldest.category),
    tags: mergeListValues(newestFirst, (item) => item.tags, 12),
    label: firstNonEmpty(newestFirst, (item) => item.label, oldest.label),
    note: firstNonEmpty(newestFirst, (item) => item.note, oldest.note),
    status: firstNonEmpty(newestFirst, (item) => item.status, oldest.status),
    description: firstNonEmpty(newestFirst, (item) => item.description, oldest.description),
    metaTags: mergeListValues(newestFirst, (item) => item.metaTags, 20),
    brand: firstNonEmpty(newestFirst, (item) => item.brand, oldest.brand),
    availability: firstNonEmpty(newestFirst, (item) => item.availability, oldest.availability),
    priceHistory: mergedHistory,
  });
}

function sanitizeItems(items) {
  const normalized = Array.isArray(items) ? items.map(normalizeSavedItem) : [];
  const grouped = new Map();

  for (const item of normalized) {
    const key = item.normalizedUrl || item.url || item.id;
    const group = grouped.get(key) || [];
    group.push(item);
    grouped.set(key, group);
  }

  const merged = Array.from(grouped.values()).map(mergeDuplicateGroup);
  return merged.sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
}

export async function loadItems() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  const sanitized = sanitizeItems(raw);
  if (JSON.stringify(raw) !== JSON.stringify(sanitized)) {
    await chrome.storage.local.set({ [STORAGE_KEY]: sanitized });
  }
  return sanitized;
}

export async function saveItems(items) {
  await chrome.storage.local.set({ [STORAGE_KEY]: sanitizeItems(items) });
}

export async function loadViewSettings() {
  const result = await chrome.storage.local.get(VIEW_SETTINGS_KEY);
  const saved = result[VIEW_SETTINGS_KEY] || {};
  return {
    ...DEFAULT_VIEW_SETTINGS,
    ...saved,
    density: DENSITY_PRESETS[saved.density] ? saved.density : DEFAULT_VIEW_SETTINGS.density,
  };
}

export async function saveViewSettings(patch) {
  const next = {
    ...(await loadViewSettings()),
    ...patch,
  };
  if (!DENSITY_PRESETS[next.density]) {
    next.density = DEFAULT_VIEW_SETTINGS.density;
  }
  await chrome.storage.local.set({ [VIEW_SETTINGS_KEY]: next });
  return next;
}

export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    const normalizedHost = url.hostname.replace(/^www\./, '').toLowerCase();

    // Naver product detail pages are identity-stable by pathname.
    if (
      /(^|\.)naver\.com$/.test(normalizedHost) &&
      /\/products\/\d+/i.test(url.pathname)
    ) {
      url.search = '';
      return url.toString();
    }

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
        lower === 'source' ||
        lower === 'napm'
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
  const target = normalizeUrl(normalizedUrl || '');
  return items.find((item) => normalizeUrl(item.normalizedUrl || item.url || '') === target) || null;
}

export function buildSavedItem(candidate, duplicateOfId = null) {
  const now = new Date().toISOString();
  const initialPrice = candidate.currentPrice || '';
  return {
    id: crypto.randomUUID(),
    duplicateOfId,
    url: candidate.url,
    normalizedUrl: candidate.normalizedUrl,
    title: candidate.title,
    merchant: candidate.merchant,
    imageUrl: candidate.imageUrl,
    currentPrice: candidate.currentPrice,
    initialPrice,
    currency: candidate.currency || 'KRW',
    priceSource: candidate.priceSource || 'none',
    description: candidate.description || '',
    metaTags: Array.isArray(candidate.metaTags) ? candidate.metaTags : [],
    brand: candidate.brand || '',
    availability: candidate.availability || '',
    lastCheckedAt: candidate.currentPrice ? now : '',
    priceHistory: candidate.currentPrice
      ? [buildPriceHistoryEntry(candidate.currentPrice, candidate.currency || 'KRW', candidate.priceSource || 'captured', now)]
      : [],
    priceChange: buildPriceChange(initialPrice, candidate.currentPrice),
    category: candidate.category || 'other',
    tags: candidate.tags || [],
    label: DEFAULT_LABEL,
    note: '',
    status: DEFAULT_STATUS,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateSavedItem(items, id, patch) {
  const now = new Date().toISOString();
  const nextPatch = {
    ...patch,
    ...(Object.prototype.hasOwnProperty.call(patch, 'label') ? { label: normalizeLabel(patch.label) } : {}),
  };
  return items.map((item) => (item.id === id ? { ...item, ...nextPatch, updatedAt: now } : item));
}

export function applyPriceObservation(items, id, observation) {
  const checkedAt = observation.checkedAt || new Date().toISOString();
  return items.map((item) => {
    if (item.id !== id) return normalizeSavedItem(item);

    const normalized = normalizeSavedItem(item);
    const nextCurrentPrice = observation.currentPrice || normalized.currentPrice;
    const nextCurrency = observation.currency || normalized.currency || 'KRW';
    const nextHistory = mergePriceHistory(
      normalized.priceHistory,
      nextCurrentPrice
        ? buildPriceHistoryEntry(nextCurrentPrice, nextCurrency, observation.source || normalized.priceSource || 'observed', checkedAt)
        : null
    );

    return normalizeSavedItem({
      ...normalized,
      currentPrice: nextCurrentPrice,
      currency: nextCurrency,
      priceSource: observation.source || normalized.priceSource || 'observed',
      lastCheckedAt: checkedAt,
      priceHistory: nextHistory,
    });
  });
}

export function formatPrice(value, currency = 'KRW') {
  if (value === null || value === undefined || value === '') return 'Price unknown';
  const number = Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(number)) return String(value);
  try {
    return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(number);
  } catch {
    return String(value);
  }
}

export function getCategoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.other;
}

export function getLabelMeta(label) {
  return LABEL_META[normalizeLabel(label)] || LABEL_META[DEFAULT_LABEL];
}

export function categoryLabel(category) {
  return getCategoryMeta(category).label;
}

export function labelLabel(label) {
  return getLabelMeta(label).label;
}
