import {
  CATEGORY_OPTIONS,
  LABEL_OPTIONS,
  categoryLabel,
  formatPrice,
  labelLabel,
  loadItems,
  saveItems,
  updateSavedItem,
} from './lib/storage.js';

const state = {
  items: [],
  query: '',
  filter: 'all',
  sort: 'recent',
  selectedId: null,
};

const els = {
  search: document.getElementById('search-input'),
  filterChips: document.getElementById('filter-chips'),
  sort: document.getElementById('sort-select'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty-state'),
  drawer: document.getElementById('drawer'),
  drawerContent: document.getElementById('drawer-content'),
};

boot().catch(console.error);

els.search.addEventListener('input', (event) => {
  state.query = event.target.value.trim().toLowerCase();
  render();
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

els.drawer.addEventListener('click', (event) => {
  if (event.target.dataset.closeDrawer) {
    state.selectedId = null;
    els.drawer.classList.add('hidden');
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.savedItems) return;
  state.items = changes.savedItems.newValue || [];
  render();
  renderDrawer();
});

async function boot() {
  state.items = await loadItems();
  renderFilterChips();
  render();
}

function renderFilterChips() {
  const values = ['all', 'archived', ...CATEGORY_OPTIONS, ...LABEL_OPTIONS];
  els.filterChips.innerHTML = values
    .map((value) => {
      const label =
        value === 'all'
          ? 'All'
          : value === 'archived'
            ? 'Archived'
          : CATEGORY_OPTIONS.includes(value)
            ? categoryLabel(value)
            : labelLabel(value);
      const active = state.filter === value ? 'active' : '';
      const archivedClass = value === 'archived' ? 'archived-chip' : '';
      return `<button class="chip ${archivedClass} ${active}" data-filter="${value}">${label}</button>`;
    })
    .join('');

  els.filterChips.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      renderFilterChips();
      render();
    });
  });
}

function render() {
  const filtered = getVisibleItems();
  els.empty.classList.toggle('hidden', filtered.length > 0 || state.items.length > 0);
  els.grid.innerHTML = filtered.map(renderCard).join('');

  if (state.items.length === 0) {
    els.empty.classList.remove('hidden');
  }
}

function getVisibleItems() {
  let items = [...state.items];

  if (state.filter === 'archived') {
    items = items.filter((item) => item.status === 'archived');
  } else {
    items = items.filter((item) => item.status !== 'archived');
  }

  if (state.filter !== 'all' && state.filter !== 'archived') {
    items = items.filter((item) => item.category === state.filter || item.label === state.filter);
  }

  if (state.query) {
    items = items.filter((item) => {
      const haystack = [
        item.title,
        item.merchant,
        item.category,
        item.label,
        item.note,
        ...(item.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(state.query);
    });
  }

  items.sort((a, b) => {
    if (state.sort === 'price-desc') return numericPrice(b) - numericPrice(a);
    if (state.sort === 'price-asc') return numericPrice(a) - numericPrice(b);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return items;
}

function renderCard(item) {
  return `
    <article class="card" data-item-id="${item.id}">
      <img src="${item.imageUrl || ''}" alt="${escapeHtml(item.title)}" />
      <div class="card-body">
        <p class="card-price">${escapeHtml(formatPrice(item.currentPrice, item.currency))}</p>
        <span class="card-label">${escapeHtml(labelLabel(item.label))}</span>
        <h2 class="card-title">${escapeHtml(item.title)}</h2>
        <p class="card-meta">${escapeHtml(item.merchant)} · ${escapeHtml(categoryLabel(item.category))}</p>
        ${item.duplicateOfId ? '<p class="duplicate-note">May already be saved</p>' : ''}
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
  els.drawerContent.innerHTML = `
    <img class="drawer-image" src="${item.imageUrl || ''}" alt="${escapeHtml(item.title)}" />
    <h2>${escapeHtml(item.title)}</h2>
    <p>${escapeHtml(formatPrice(item.currentPrice, item.currency))} · ${escapeHtml(item.merchant)}</p>
    <div class="field">
      <label>Category</label>
      <select id="drawer-category">${CATEGORY_OPTIONS.map((value) => `<option value="${value}" ${item.category === value ? 'selected' : ''}>${categoryLabel(value)}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Label</label>
      <select id="drawer-label">${LABEL_OPTIONS.map((value) => `<option value="${value}" ${item.label === value ? 'selected' : ''}>${labelLabel(value)}</option>`).join('')}</select>
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
    renderFilterChips();
    render();
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
    if (nextStatus === 'archived' && state.filter !== 'archived') {
      state.selectedId = null;
      render();
      renderDrawer();
      return;
    }
    render();
    renderDrawer();
  });

  document.getElementById('drawer-delete').addEventListener('click', async () => {
    const next = state.items.filter((entry) => entry.id !== item.id);
    await saveItems(next);
    state.items = next;
    state.selectedId = null;
    render();
    renderDrawer();
  });
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
