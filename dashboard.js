import {
  CATEGORY_OPTIONS,
  DENSITY_PRESETS,
  LABEL_OPTIONS,
  VIEW_SETTINGS_KEY,
  formatPrice,
  getCategoryMeta,
  getLabelMeta,
  loadItems,
  loadViewSettings,
  saveItems,
  saveViewSettings,
  updateSavedItem,
} from './lib/storage.js';

const STATUS_OPTIONS = ['active', 'archived'];
const DENSITY_ICONS = {
  comfortable: '☰',
  compact: '⊞',
  dense: '⣿',
};

const state = {
  items: [],
  query: '',
  statusFilter: 'active',
  labelFilter: 'all',
  categoryFilter: 'all',
  sort: 'recent',
  density: 'compact',
  selectedId: null,
};

const els = {
  search: document.getElementById('search-input'),
  primaryFilterRowWrapper: document.getElementById('primary-filter-row-wrapper'),
  primaryFilterStrip: document.getElementById('primary-filter-strip'),
  categoryFilterRowWrapper: document.getElementById('category-filter-row-wrapper'),
  categoryFilterStrip: document.getElementById('category-filter-strip'),
  densityControls: document.getElementById('density-controls'),
  sort: document.getElementById('sort-select'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty-state'),
  emptyTitle: document.getElementById('empty-title'),
  emptyCopy: document.getElementById('empty-copy'),
  emptyList: document.getElementById('empty-list'),
  drawer: document.getElementById('drawer'),
  drawerContent: document.getElementById('drawer-content'),
};

boot().catch(console.error);

els.primaryFilterStrip.addEventListener('scroll', () => {
  updateFilterFades();
});

els.categoryFilterStrip.addEventListener('scroll', () => {
  updateFilterFades();
});

window.addEventListener('resize', () => {
  updateFilterFades();
});

els.search.addEventListener('input', (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderAll();
});

els.sort.addEventListener('change', (event) => {
  state.sort = event.target.value;
  render();
});

els.grid.addEventListener('click', (event) => {
  const card = event.target.closest('[data-item-id]');
  if (!card) return;
  state.selectedId = card.dataset.itemId;
  renderDrawer();
});
els.grid.addEventListener('error', handleImageError, true);

els.drawer.addEventListener('click', (event) => {
  if (event.target.dataset.closeDrawer) {
    state.selectedId = null;
    els.drawer.classList.add('hidden');
  }
});
els.drawer.addEventListener('error', handleImageError, true);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.savedItems) {
    state.items = changes.savedItems.newValue || [];
    renderAll();
    renderDrawer();
  }

  if (changes[VIEW_SETTINGS_KEY]) {
    state.density = normalizeDensity(changes[VIEW_SETTINGS_KEY].newValue?.density);
    applyDensity();
    renderDensityControls();
  }
});

async function boot() {
  const [items, viewSettings] = await Promise.all([loadItems(), loadViewSettings()]);
  state.items = items;
  state.density = normalizeDensity(viewSettings.density);
  applyDensity();
  renderAll();
}

function renderAll() {
  renderFilterRows();
  renderDensityControls();
  render();
}

function renderFilterRows() {
  renderPrimaryFilterStrip();
  renderCategoryFilterStrip();
}

function renderPrimaryFilterStrip() {
  const baseItems = getFilteredItems({ excludeStatus: true });
  const statusCounts = {
    active: baseItems.filter((item) => item.status !== 'archived').length,
    archived: baseItems.filter((item) => item.status === 'archived').length,
  };

  const labelBaseItems = getFilteredItems({ excludeLabel: true });
  const chips = [];

  for (const value of STATUS_OPTIONS) {
    const accent = value === 'archived' ? '#a98d73' : '#c96b3b';
    const title =
      value === 'archived'
        ? 'Items you already archived.'
        : 'Items that are still active in your Pantry.';
    chips.push(
      renderChipButton({
        group: 'status',
        value,
        label: value === 'archived' ? 'Archived' : 'Active',
        count: statusCounts[value],
        active: state.statusFilter === value,
        accent,
        title,
      })
    );
  }

  chips.push('<span class="filter-gap" aria-hidden="true"></span>');

  for (const value of LABEL_OPTIONS) {
    const meta = getLabelMeta(value);
    const count = labelBaseItems.filter((item) => item.label === value).length;
    chips.push(
      renderChipButton({
        group: 'label',
        value,
        label: meta.label,
        count,
        active: state.labelFilter === value,
        accent: meta.accent,
        title: `${meta.description} Click again to clear.`,
      })
    );
  }

  els.primaryFilterStrip.innerHTML = chips.join('');

  els.primaryFilterStrip.querySelectorAll('[data-status-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.statusFilter = button.dataset.statusFilter;
      renderAll();
    });
  });

  els.primaryFilterStrip.querySelectorAll('[data-label-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.labelFilter;
      state.labelFilter = state.labelFilter === value ? 'all' : value;
      renderAll();
    });
  });
}

function renderCategoryFilterStrip() {
  const categoryBaseItems = getFilteredItems({ excludeCategory: true });
  const chips = [];

  for (const value of CATEGORY_OPTIONS) {
    const meta = getCategoryMeta(value);
    const count = categoryBaseItems.filter((item) => item.category === value).length;
    if (count === 0 && state.categoryFilter !== value) {
      continue;
    }
    chips.push(
      renderChipButton({
        group: 'category',
        value,
        label: meta.label,
        count,
        active: state.categoryFilter === value,
        accent: meta.accent,
        title: meta.description,
      })
    );
  }

  els.categoryFilterStrip.innerHTML = chips.join('');
  els.categoryFilterRowWrapper.classList.toggle('hidden', chips.length === 0);

  els.categoryFilterStrip.querySelectorAll('[data-category-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.categoryFilter;
      state.categoryFilter = state.categoryFilter === value ? 'all' : value;
      renderAll();
      revealSelectedCategoryChip();
    });
  });

  updateFilterFades();
}

function renderDensityControls() {
  els.densityControls.innerHTML = Object.entries(DENSITY_PRESETS).map(([key, preset]) => {
    const active = state.density === key ? 'active' : '';
    const icon = DENSITY_ICONS[key] || '⊞';
    return `
      <button
        class="density-button ${active}"
        data-density="${key}"
        title="${escapeHtml(preset.label)}: ${escapeHtml(preset.description)}"
        aria-label="${escapeHtml(preset.label)} density"
        aria-pressed="${state.density === key ? 'true' : 'false'}"
      >
        <span aria-hidden="true">${icon}</span>
      </button>
    `;
  }).join('');

  els.densityControls.querySelectorAll('[data-density]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nextDensity = normalizeDensity(button.dataset.density);
      if (nextDensity === state.density) return;
      state.density = nextDensity;
      applyDensity();
      renderDensityControls();
      await saveViewSettings({ density: nextDensity });
    });
  });
}

function render() {
  const filtered = getVisibleItems();
  els.grid.innerHTML = filtered.map(renderCard).join('');
  renderEmptyState(filtered);
}

function getVisibleItems() {
  const items = getFilteredItems();
  items.sort((a, b) => {
    if (state.sort === 'price-desc') return numericPrice(b) - numericPrice(a);
    if (state.sort === 'price-asc') return numericPrice(a) - numericPrice(b);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return items;
}

function buildSearchAliases(item) {
  const source = [
    item.title,
    item.merchant,
    item.category,
    item.note,
    item.description,
    item.brand,
    ...(item.tags || []),
    ...(item.metaTags || []),
  ]
    .join(' ')
    .toLowerCase();

  const aliases = new Set();

  if (
    /espresso|coffee maker|coffee machine|에스프레소|커피\s?머신|브루어|커피메이커|드립머신|에스프레소머신/.test(source)
  ) {
    aliases.add('커피머신');
    aliases.add('커피 머신');
    aliases.add('coffee machine');
    aliases.add('espresso machine');
    aliases.add('에스프레소머신');
  }

  if (
    /cream|lotion|moisturizer|hydrating|hydration|moisture|보습|수분|크림|로션|보습크림|수분크림/.test(source)
  ) {
    aliases.add('보습');
    aliases.add('수분');
    aliases.add('moisturizing');
    aliases.add('hydration');
    aliases.add('moisture');
  }

  return Array.from(aliases);
}

function renderCard(item) {
  const labelMeta = getLabelMeta(item.label);
  const categoryMeta = getCategoryMeta(item.category);
  const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3) : [];
  const fallbackSrc = getFallbackImage(item.category);
  const imageSrc = item.imageUrl || fallbackSrc;
  const priceChange = getPriceChangeSummary(item);
  const availability = renderAvailability(item.availability);

  return `
    <article class="card" data-item-id="${item.id}">
      <img
        class="card-image"
        src="${escapeHtml(imageSrc)}"
        data-fallback-src="${escapeHtml(fallbackSrc)}"
        alt="${escapeHtml(item.title)}"
        loading="lazy"
      />
      <div class="card-body">
        <div class="card-price-row">
          <p class="card-price">${escapeHtml(formatPrice(item.currentPrice, item.currency))}</p>
          ${renderInitialPrice(item)}
        </div>
        ${priceChange ? `<p class="card-price-change card-price-change-${priceChange.direction}">${escapeHtml(priceChange.label)}</p>` : ''}
        <div class="card-label-row">
          <span class="card-label card-label-${escapeHtml(labelMeta.tone)}">${escapeHtml(labelMeta.emoji)} ${escapeHtml(labelMeta.label)}</span>
          ${item.duplicateOfId ? '<span class="card-flag">Saved before</span>' : ''}
        </div>
        <h2 class="card-title">${escapeHtml(item.title)}</h2>
        <p class="card-meta">${escapeHtml(item.merchant)} · ${escapeHtml(categoryMeta.emoji)} ${escapeHtml(categoryMeta.label)}${availability ? ` · ${escapeHtml(availability)}` : ''}</p>
        ${renderTagSection(tags)}
      </div>
    </article>
  `;
}

function renderDrawer() {
  if (!state.selectedId) {
    els.drawer.classList.add('hidden');
    return;
  }

  const item = state.items.find((entry) => entry.id === state.selectedId);
  if (!item) {
    els.drawer.classList.add('hidden');
    return;
  }

  els.drawer.classList.remove('hidden');
  const labelMeta = getLabelMeta(item.label);
  const categoryMeta = getCategoryMeta(item.category);
  const fallbackSrc = getFallbackImage(item.category);
  const availability = renderAvailability(item.availability);
  els.drawerContent.innerHTML = `
    <img
      class="drawer-image"
      src="${escapeHtml(item.imageUrl || fallbackSrc)}"
      data-fallback-src="${escapeHtml(fallbackSrc)}"
      alt="${escapeHtml(item.title)}"
    />
    <div class="drawer-label-row">
      <span class="card-label card-label-${escapeHtml(labelMeta.tone)}">${escapeHtml(labelMeta.emoji)} ${escapeHtml(labelMeta.label)}</span>
      <span class="drawer-status">${item.status === 'archived' ? 'Archived' : 'Active'}</span>
    </div>
    <h2>${escapeHtml(item.title)}</h2>
    <p class="drawer-meta">${escapeHtml(formatPrice(item.currentPrice, item.currency))} · ${escapeHtml(item.merchant)} · ${escapeHtml(categoryMeta.emoji)} ${escapeHtml(categoryMeta.label)}${availability ? ` · ${escapeHtml(availability)}` : ''}</p>
    <div class="field">
      <label>Category</label>
      <select id="drawer-category">${CATEGORY_OPTIONS.map((value) => {
        const meta = getCategoryMeta(value);
        return `<option value="${value}" ${item.category === value ? 'selected' : ''}>${escapeHtml(meta.emoji)} ${escapeHtml(meta.label)}</option>`;
      }).join('')}</select>
    </div>
    <div class="field">
      <label>Label</label>
      <select id="drawer-label">${LABEL_OPTIONS.map((value) => {
        const meta = getLabelMeta(value);
        return `<option value="${value}" ${item.label === value ? 'selected' : ''}>${escapeHtml(meta.emoji)} ${escapeHtml(meta.label)}</option>`;
      }).join('')}</select>
    </div>
    <div class="field">
      <label>Note</label>
      <textarea id="drawer-note" rows="4">${escapeHtml(item.note || '')}</textarea>
    </div>
    <div class="drawer-actions">
      <button class="btn primary" id="drawer-save">Save</button>
      <button class="btn" id="drawer-open">Open Link</button>
      <button class="btn secondary-tone" id="drawer-archive">${item.status === 'archived' ? 'Unarchive' : 'Archive'}</button>
      <button class="btn warn" id="drawer-delete">Delete</button>
    </div>
  `;

  document.getElementById('drawer-save').addEventListener('click', async () => {
    const category = document.getElementById('drawer-category').value;
    const label = document.getElementById('drawer-label').value;
    const note = document.getElementById('drawer-note').value;
    const next = updateSavedItem(state.items, item.id, { category, label, note });
    await saveItems(next);
    state.items = next;
    state.selectedId = null;
    renderAll();
    renderDrawer();
  });

  document.getElementById('drawer-open').addEventListener('click', () => {
    chrome.tabs.create({ url: item.url });
  });

  document.getElementById('drawer-archive').addEventListener('click', async () => {
    const nextStatus = item.status === 'archived' ? 'active' : 'archived';
    const next = updateSavedItem(state.items, item.id, { status: nextStatus });
    await saveItems(next);
    state.items = next;
    if (
      (nextStatus === 'archived' && state.statusFilter !== 'archived') ||
      (nextStatus === 'active' && state.statusFilter === 'archived')
    ) {
      state.selectedId = null;
      renderAll();
      renderDrawer();
      return;
    }
    renderAll();
    renderDrawer();
  });

  document.getElementById('drawer-delete').addEventListener('click', async () => {
    const next = state.items.filter((entry) => entry.id !== item.id);
    await saveItems(next);
    state.items = next;
    state.selectedId = null;
    renderAll();
    renderDrawer();
  });
}

function getFilteredItems({
  excludeStatus = false,
  excludeLabel = false,
  excludeCategory = false,
  excludeQuery = false,
} = {}) {
  let items = [...state.items];

  if (!excludeStatus) {
    items = items.filter((item) => {
      if (state.statusFilter === 'archived') {
        return item.status === 'archived';
      }
      return item.status !== 'archived';
    });
  }

  if (!excludeLabel && state.labelFilter !== 'all') {
    items = items.filter((item) => item.label === state.labelFilter);
  }

  if (!excludeCategory && state.categoryFilter !== 'all') {
    items = items.filter((item) => item.category === state.categoryFilter);
  }

  if (!excludeQuery && state.query) {
    items = items.filter((item) => {
      const haystack = [
        item.title,
        item.merchant,
        item.category,
        item.label,
        item.note,
        item.description,
        item.brand,
        item.availability,
        ...(item.tags || []),
        ...(item.metaTags || []),
        ...buildSearchAliases(item),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(state.query);
    });
  }

  return items;
}

function renderEmptyState(filtered) {
  const hasItems = state.items.length > 0;
  const hasResults = filtered.length > 0;
  els.empty.classList.toggle('hidden', hasResults);

  if (hasResults) return;

  if (!hasItems) {
    els.emptyTitle.textContent = 'Your Pantry is empty.';
    els.emptyCopy.textContent = 'Start by saving products from pages you already browse.';
    els.emptyList.classList.remove('hidden');
    return;
  }

  els.emptyTitle.textContent = 'Nothing matches these filters.';
  els.emptyCopy.textContent = 'Try a different status, label, category, or search term to widen the results.';
  els.emptyList.classList.add('hidden');
}

function renderChipButton({ group, value, label, count, active, accent, title }) {
  const activeClass = active ? 'active' : '';
  return `
    <button
      class="chip ${activeClass}"
      data-${group}-filter="${value}"
      title="${escapeHtml(title)}"
      style="--chip-accent: ${accent};"
    >
      <span class="chip-text">${escapeHtml(label)}</span>
      <span class="count-badge">${count}</span>
    </button>
  `;
}

function renderTagSection(tags) {
  if (!tags.length) return '';
  return `
    <div class="card-divider"></div>
    <div class="tag-row">
      ${tags.map((tag) => `<span class="tag-chip">#${escapeHtml(tag)}</span>`).join('')}
    </div>
  `;
}

function renderAvailability(value) {
  const text = String(value || '').trim();
  return text.length > 0 && text.length <= 32 ? text : '';
}

function renderInitialPrice(item) {
  if (!item.initialPrice || item.initialPrice === item.currentPrice) return '';
  return `<span class="card-price-initial">${escapeHtml(formatPrice(item.initialPrice, item.currency))}</span>`;
}

function getPriceChangeSummary(item) {
  const priceChange = item.priceChange;
  if (!priceChange || priceChange.direction === 'same') return null;
  const percent = Math.abs(priceChange.percent).toFixed(1).replace(/\.0$/, '');
  return {
    direction: priceChange.direction,
    label: `${priceChange.direction === 'down' ? '▼' : '▲'} ${percent}%`,
  };
}

function updateScrollFade(wrapper, strip) {
  if (!wrapper || !strip) return;

  const overflow = strip.scrollWidth - strip.clientWidth > 4;
  const atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4;

  wrapper.classList.toggle('has-overflow', overflow);
  wrapper.classList.toggle('is-end', atEnd);
}

function updateFilterFades() {
  updateScrollFade(els.primaryFilterRowWrapper, els.primaryFilterStrip);
  updateScrollFade(els.categoryFilterRowWrapper, els.categoryFilterStrip);
}

function revealSelectedCategoryChip() {
  if (state.categoryFilter === 'all') return;
  const chip = els.categoryFilterStrip.querySelector(`[data-category-filter="${state.categoryFilter}"]`);
  if (!chip) return;
  chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

function normalizeDensity(value) {
  return DENSITY_PRESETS[value] ? value : 'compact';
}

function applyDensity() {
  const preset = DENSITY_PRESETS[state.density] || DENSITY_PRESETS.compact;
  document.documentElement.style.setProperty('--card-min-width', preset.cardMinWidth);
}

function getFallbackImage(category) {
  return getCategoryMeta(category).placeholder || './assets/placeholder-default.svg';
}

function handleImageError(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  const fallback = image.dataset.fallbackSrc || './assets/placeholder-default.svg';
  if (image.dataset.fallbackApplied === 'true') return;
  image.dataset.fallbackApplied = 'true';
  image.src = fallback;
}

function numericPrice(item) {
  const number = Number(String(item.currentPrice || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
