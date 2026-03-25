import {
  CATEGORY_OPTIONS,
  applyPriceObservation,
  buildSavedItem,
  categoryLabel,
  detectDuplicate,
  formatPrice,
  labelLabel,
  loadItems,
  normalizeUrl,
  saveItems,
  updateSavedItem,
} from './lib/storage.js';

const state = {
  candidate: null,
  tabId: null,
  duplicate: null,
  duplicatePriceUpdated: false,
};

const els = {
  statusBanner: document.getElementById('status-banner'),
  candidateCard: document.getElementById('candidate-card'),
  candidateImage: document.getElementById('candidate-image'),
  candidatePrice: document.getElementById('candidate-price'),
  candidateMerchant: document.getElementById('candidate-merchant'),
  candidateTitle: document.getElementById('candidate-title'),
  categorySelect: document.getElementById('candidate-category-select'),
  tag1: document.getElementById('candidate-tag-1'),
  tag2: document.getElementById('candidate-tag-2'),
  unsupportedCard: document.getElementById('unsupported-card'),
  unsupportedTitle: document.getElementById('unsupported-title'),
  unsupportedCopy: document.getElementById('unsupported-copy'),
  duplicateNote: document.getElementById('duplicate-note'),
  duplicateTitle: document.getElementById('duplicate-title'),
  duplicateCopy: document.getElementById('duplicate-copy'),
  saveButton: document.getElementById('save-button'),
  openDashboardButton: document.getElementById('open-dashboard-button'),
  continueButton: document.getElementById('continue-button'),
};

init().catch((error) => {
  console.error(error);
  renderStatus('Could not inspect the current page.', 'warning');
});

els.saveButton.addEventListener('click', () => saveCurrentCandidate());
els.openDashboardButton.addEventListener('click', () => openDashboard());
els.continueButton.addEventListener('click', () => window.close());
els.categorySelect.addEventListener('change', (event) => {
  if (!state.candidate) return;
  state.candidate.category = event.target.value;
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab?.id ?? null;

  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    renderUnsupportedState(
      'Open a product page to start saving.',
      'Switch to a product detail page or another web page you want to keep in Pantry.'
    );
    return;
  }

  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageCandidate,
  });

  state.candidate = enrichCandidate(result?.[0]?.result ?? {}, tab.url);
  let items = await loadItems();
  state.duplicate = detectDuplicate(items, state.candidate.normalizedUrl);
  state.duplicatePriceUpdated = false;

  if (state.duplicate && state.candidate.currentPrice && state.candidate.priceSource !== 'none') {
    const nextItems = applyPriceObservation(items, state.duplicate.id, {
      currentPrice: state.candidate.currentPrice,
      currency: state.candidate.currency,
      source: state.candidate.priceSource,
    });
    const nextDuplicate = detectDuplicate(nextItems, state.candidate.normalizedUrl);
    if (didPriceChange(state.duplicate.currentPrice, nextDuplicate?.currentPrice)) {
      await saveItems(nextItems);
      items = nextItems;
      state.duplicatePriceUpdated = true;
    }
    state.duplicate = nextDuplicate;
  }

  renderCandidate();
}

function renderCandidate() {
  const candidate = state.candidate;
  if (!candidate) {
    renderUnsupportedState(
      'No candidate page found.',
      'Switch to a product detail page or save another link later.'
    );
    return;
  }

  const isLinkOnly = candidate.captureMode === 'link';
  const isPartial = candidate.metadataConfidence === 'medium' && !isLinkOnly;
  const statusTone = state.duplicate || isLinkOnly || isPartial ? 'warning' : 'neutral';
  const statusMessage = state.duplicate
    ? 'This page may already be saved.'
    : isLinkOnly
      ? 'Metadata looks partial. You can still save this page as a link.'
      : isPartial
        ? 'We found some product data, but parts of it may need review.'
        : 'Ready to save this page.';

  renderStatus(statusMessage, statusTone);
  els.candidateImage.src = candidate.imageUrl || '';
  els.candidateImage.alt = candidate.title;
  els.candidatePrice.textContent = formatPrice(candidate.currentPrice, candidate.currency);
  els.candidateMerchant.textContent = candidate.merchant;
  els.candidateTitle.textContent = candidate.title;
  els.categorySelect.innerHTML = CATEGORY_OPTIONS.map((value) => {
    const selected = candidate.category === value ? 'selected' : '';
    return `<option value="${value}" ${selected}>${categoryLabel(value)}</option>`;
  }).join('');
  renderTag(els.tag1, candidate.tags[0]);
  renderTag(els.tag2, candidate.tags[1]);
  els.duplicateNote.classList.toggle('hidden', !state.duplicate);
  renderDuplicateNote();
  els.saveButton.textContent = state.duplicate
    ? isLinkOnly
      ? 'Update link'
      : 'Update item'
    : isLinkOnly
      ? 'Save link only'
      : 'Save to Pantry';
  els.openDashboardButton.classList.toggle('hidden', !state.duplicate);
  els.continueButton.classList.toggle('hidden', !state.duplicate);

  if (isLinkOnly) {
    renderUnsupportedState(
      'This page looks more like a reference page.',
      'We will save the title, URL, selected category, and whatever metadata we could confidently extract.'
    );
    return;
  }

  if (isPartial) {
    renderUnsupportedState(
      'Review parsed details before saving.',
      'We found some product signals, but price or product metadata may be incomplete. You can still save and edit later.'
    );
    return;
  }

  els.unsupportedCard.classList.add('hidden');
}

async function saveCurrentCandidate() {
  if (!state.candidate) return;

  const items = await loadItems();
  const duplicate = detectDuplicate(items, state.candidate.normalizedUrl);
  const candidate = { ...state.candidate, category: els.categorySelect.value };
  if (duplicate) {
    const observed = candidate.currentPrice && candidate.priceSource !== 'none'
      ? applyPriceObservation(items, duplicate.id, {
          currentPrice: candidate.currentPrice,
          currency: candidate.currency,
          source: candidate.priceSource,
        })
      : items;

    const current = detectDuplicate(observed, candidate.normalizedUrl) || duplicate;
    const merged = updateSavedItem(observed, current.id, {
      title: candidate.title || current.title,
      merchant: candidate.merchant || current.merchant,
      imageUrl: candidate.imageUrl || current.imageUrl,
      category: candidate.category || current.category,
      tags: candidate.tags?.length ? candidate.tags : current.tags,
      description: candidate.description || current.description,
      metaTags: candidate.metaTags?.length ? candidate.metaTags : current.metaTags,
      brand: candidate.brand || current.brand,
      availability: candidate.availability || current.availability,
    });

    await saveItems(merged);
    state.duplicate = detectDuplicate(merged, candidate.normalizedUrl);
    renderStatus(
      candidate.captureMode === 'link'
        ? 'Updated the existing link in Pantry.'
        : 'Updated the existing item in Pantry.',
      'success'
    );
  } else if (candidate.captureMode === 'link') {
    const item = buildSavedItem(candidate, null);
    await saveItems([item, ...items]);
    renderStatus('Saved as a link. Review it later in Pantry.', 'success');
  } else {
    const item = buildSavedItem(candidate, null);
    await saveItems([item, ...items]);
    renderStatus(`Saved. ${labelLabel(item.label)} item added to Pantry.`, 'success');
  }

  renderDuplicateNote();
  els.saveButton.classList.add('hidden');
  els.openDashboardButton.classList.remove('hidden');
  els.continueButton.classList.remove('hidden');
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
}

function renderUnsupportedState(title, copy) {
  renderStatus(title, 'warning');
  els.unsupportedTitle.textContent = title;
  els.unsupportedCopy.textContent = copy;
  els.unsupportedCard.classList.remove('hidden');
}

function renderStatus(message, tone) {
  els.statusBanner.textContent = message;
  els.statusBanner.className = `status-banner ${tone}`;
}

function renderDuplicateNote() {
  if (!state.duplicate) {
    els.duplicateNote.classList.add('hidden');
    return;
  }

  const priceChange = state.duplicate.priceChange;
  const hasMeaningfulChange = state.duplicatePriceUpdated && priceChange && priceChange.direction !== 'same';
  els.duplicateTitle.textContent = hasMeaningfulChange
    ? 'This item already exists, and the price changed.'
    : 'This item is already in Pantry.';

  if (hasMeaningfulChange) {
    const directionLabel = priceChange.direction === 'down' ? 'down' : 'up';
    els.duplicateCopy.textContent = `The saved item price moved ${directionLabel}. Pantry now reflects ${formatPrice(state.duplicate.currentPrice, state.duplicate.currency)}. Saving here will update the existing item.`;
  } else {
    els.duplicateCopy.textContent = 'Saving here will update the existing item instead of creating a duplicate. Open Pantry if you want to review the existing entry first.';
  }
}

function renderTag(el, value) {
  if (!value) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = `#${value}`;
  el.classList.remove('hidden');
}

function enrichCandidate(raw, fallbackUrl) {
  const title = raw.title || 'Untitled page';
  const url = raw.url || fallbackUrl;
  const merchant = raw.merchant || deriveMerchant(url);
  const normalizedUrl = normalizeUrl(url);
  const metadata = {
    brand: raw.brand || '',
    description: raw.description || '',
    metaTags: Array.isArray(raw.metaTags) ? raw.metaTags : [],
  };
  const category = raw.category || categorizeProduct(title, merchant, url, raw.isProductLike, metadata);
  const tags = deriveTags(title, merchant, url, category);
  return {
    title,
    url,
    normalizedUrl,
    merchant,
    imageUrl: raw.imageUrl || '',
    currentPrice: raw.currentPrice || '',
    currency: raw.currency || 'KRW',
    description: raw.description || '',
    metaTags: Array.isArray(raw.metaTags) ? raw.metaTags : [],
    brand: raw.brand || '',
    availability: raw.availability || '',
    category,
    tags,
    isProductLike: Boolean(raw.isProductLike),
    captureMode: raw.captureMode || (raw.isProductLike ? 'item' : 'link'),
    metadataConfidence: raw.metadataConfidence || 'medium',
    priceSource: raw.priceSource || 'none',
  };
}

function deriveMerchant(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function didPriceChange(previousPrice, nextPrice) {
  return Number(String(previousPrice || '').replace(/[^\d.-]/g, '')) !== Number(String(nextPrice || '').replace(/[^\d.-]/g, ''));
}

function buildClassificationText(title, merchant, url, metadata = {}) {
  return [
    title,
    merchant,
    url,
    metadata.brand || '',
    metadata.description || '',
    ...(metadata.metaTags || []),
  ]
    .join(' ')
    .toLowerCase();
}

function categorizeProduct(title, merchant, url, isProductLike, metadata = {}) {
  const haystack = buildClassificationText(title, merchant, url, metadata);
  const merchantSignal = `${merchant} ${metadata.brand || ''}`.toLowerCase();
  const scores = {
    fashion: getFashionScore(haystack, merchantSignal),
    living: getLivingScore(haystack, merchantSignal),
    appliance: getApplianceScore(haystack, merchantSignal),
    beauty: getBeautyScore(haystack, merchantSignal),
    food: getFoodScore(haystack, merchantSignal),
    book: getBookScore(haystack, merchantSignal),
  };

  const entries = Object.entries(scores);
  const maxScore = Math.max(...entries.map(([, score]) => score));
  if (maxScore === 0) return 'other';

  const ranked = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  const winningScore = ranked[0][1];
  const winningCategory = ranked[0][0];
  const topTies = entries.filter(([, score]) => score === winningScore);

  if (topTies.length > 1) return 'other';
  if (!isProductLike && isMerchantOnlyMatch(haystack, merchantSignal, winningCategory)) return 'other';
  if (winningScore === 1 && !merchantLooksCategorySpecific(merchantSignal, winningCategory)) return 'other';
  return winningCategory;
}

function getFashionScore(normalizedText, normalizedMerchant) {
  const merchantRules = [
    { pattern: /musinsa|29cm|wconcept|zigzag|ably|무신사|지그재그|에이블리/, weight: 1 },
  ];

  const keywordRules = [
    { pattern: /jacket|coat|shirt|pants|dress|bag|shoe|skirt|hoodie|sneaker|sandal|cardigan|jeans/, weight: 1 },
    { pattern: /재킷|셔츠|바지|드레스|가방|신발|스커트|후드|니트|청바지|데님|원피스|가디건/, weight: 1 },
    { pattern: /t[\s-]?shirt|underwear/, weight: 1 },
    { pattern: /티셔츠|반팔|맨투맨|속옷|양말|목걸이|반지/, weight: 1 },
    { pattern: /악세사리|액세서리|accessor(?:y|ies)/, weight: 0.5 },
  ];

  const negativeRules = [
    { pattern: /케이스|case/, weight: 1.5 },
    { pattern: /커버|cover/, weight: 1.5 },
    { pattern: /파우치|pouch/, weight: 1.5 },
  ];

  const basicFashionPattern =
    /t[\s-]?shirt|티셔츠|반팔|맨투맨|hoodie|sweatshirt|셔츠|jacket|coat|dress|skirt|pants|jeans|underwear|속옷/;
  const designKeywordPattern =
    /오버핏|레터링|자체제작|한글|로고|크롭|숏슬리브|\bot\b/;

  let score = 0;
  score += applyWeightedPatterns(normalizedMerchant, merchantRules);
  score += applyWeightedPatterns(normalizedText, keywordRules);
  score -= applyWeightedPatterns(normalizedText, negativeRules);

  if (basicFashionPattern.test(normalizedText) && designKeywordPattern.test(normalizedText)) {
    score += 1.0;
  }

  return Math.max(0, score);
}

function getLivingScore(normalizedText, normalizedMerchant) {
  const merchantRules = [
    { pattern: /ikea|iloom|hanssem|todayhouse|ohou|오늘의집|이케아|한샘|일룸/, weight: 1 },
  ];

  const keywordRules = [
    { pattern: /chair|table|sofa|lamp|kitchen|living|interior|shelf|desk|bedding|curtain|storage|mattress|bed|drawer|cabinet|hanger/, weight: 1 },
    { pattern: /의자|테이블|소파|조명|주방|리빙|인테리어|가구|선반|책상|침구|커튼|수납|매트리스|침대|서랍장|캐비닛|행거|식탁/, weight: 1 },
    { pattern: /plate|pot|pan|frying pan|towel|rug|blanket|cushion|vase|dish|kitchenware/, weight: 1 },
    { pattern: /그릇|냄비|프라이팬|수건|러그|이불|쿠션|화병|식기/, weight: 1 },
  ];

  const negativeRules = [
    { pattern: /스마트|\biot\b|무선|블루투스|\bled\b|\busb\b|전동/, weight: 1.5 },
    { pattern: /smart|wireless|bluetooth/, weight: 1.5 },
  ];

  let score = 0;
  score += applyWeightedPatterns(normalizedMerchant, merchantRules);
  score += applyWeightedPatterns(normalizedText, keywordRules);
  score -= applyWeightedPatterns(normalizedText, negativeRules);


  return Math.max(0, score);
}

function getApplianceScore(normalizedText, normalizedMerchant) {
  const merchantRules = [
    { pattern: /apple|samsung|lg|sony|bose|canon|nikon|dyson|himart|etland|하이마트|전자랜드/, weight: 1 },
  ];

  const baseKeywordRules = [
    { pattern: /airpods|ipad|phone|monitor|macbook|camera|headphone|speaker|keyboard|vacuum|tablet|watch|tv|refrigerator|washer|humidifier|dryer|styler|mouse/, weight: 1 },
    { pattern: /노트북|핸드폰|모니터|카메라|이어폰|헤드폰|스피커|키보드|청소기|태블릿|전자|티비|냉장고|세탁기|가습기|고데기|드라이기|스타일러|마우스|공기청정기/, weight: 1 },
  ];

  const negativeRules = [
    { pattern: /케이스|case/, weight: 1.0 },
    { pattern: /커버|cover/, weight: 1.0 },
    { pattern: /필름|film/, weight: 1.0 },
    { pattern: /파우치|pouch/, weight: 1.0 },
    { pattern: /airwrap|hair\s?care|hair\s?dryer|hair\s?styler|헤어케어|헤어\s?드라이어|헤어드라이어|고데기|컬링|멀티\s?스타일러|멀티스타일러/, weight: 1.5 },
  ];

  const modelPattern = /\b(?=[a-z0-9-]{5,}\b)(?=.*[a-z])(?=.*\d)[a-z0-9-]+\b/i;
  const baseAppliancePattern = /airpods|ipad|phone|monitor|macbook|camera|headphone|speaker|keyboard|vacuum|tablet|watch|tv|refrigerator|washer|humidifier|dryer|styler|mouse|노트북|핸드폰|모니터|카메라|이어폰|헤드폰|스피커|키보드|청소기|태블릿|전자|티비|냉장고|세탁기|가습기|고데기|드라이기|스타일러|마우스|공기청정기/;

  let score = 0;
  score += applyWeightedPatterns(normalizedMerchant, merchantRules);
  score += applyWeightedPatterns(normalizedText, baseKeywordRules);
  score -= applyWeightedPatterns(normalizedText, negativeRules);

  if (modelPattern.test(normalizedText) && baseAppliancePattern.test(normalizedText)) {
    score += 2.0;
  }

  return Math.max(0, score);
}


function getBeautyScore(normalizedText, normalizedMerchant) {
  const merchantRules = [
    { pattern: /oliveyoung|sephora|lalavla|stylenanda|innisfree|laneige|hera|aesop|tamburins|dyson|olive young|올리브영|세포라|이니스프리|라네즈|헤라|이솝|탬버린즈|다이슨/, weight: 1 },
  ];

  const strongKeywordRules = [
    { pattern: /cream|serum|perfume|skincare|cleanser|toner|mask|makeup|sunscreen|cushion|lotion|essence|ampoule|mist|hand cream|body lotion|body wash|moisturizer/, weight: 1.5 },
    { pattern: /크림|세럼|향수|스킨케어|클렌저|토너|마스크팩|메이크업|선크림|쿠션|로션|에센스|앰플|미스트|핸드크림|바디로션|바디워시|보습/, weight: 1.5 },
    { pattern: /shaver|razor|grooming|epilator|beauty device|beauty tool|airwrap|hair\s?care|hair\s?dryer|hair\s?styler|styling tool|curling|straightener/, weight: 1.5 },
    { pattern: /면도기|전기면도기|쉐이버|제모기|뷰티디바이스|미용기기|뷰티기기|마사지기|안마기|갈바닉|브이라인|리프팅기|에어랩|헤어케어|헤어\s?드라이어|헤어드라이어|스타일링|고데기|컬링|멀티\s?스타일러|멀티스타일러/, weight: 1.5 },
  ];

  const keywordRules = [
    { pattern: /cream|serum|lip|perfume|skincare|cleanser|toner|mask|makeup|sunscreen|cushion|lotion|essence|ampoule|mist|foam|balm|body wash|body lotion|hand cream|shampoo|conditioner/, weight: 1 },
    { pattern: /크림|세럼|립|향수|스킨케어|클렌저|토너|마스크팩|메이크업|선크림|쿠션|로션|에센스|앰플|미스트|폼클렌저|밤|바디워시|바디로션|핸드크림|샴푸|컨디셔너|화장품/, weight: 1 },
    { pattern: /lens|contact lens|brush|puff|shaving|razor/, weight: 1 },
    { pattern: /콘택트렌즈|원데이렌즈|렌즈|바슈롬|소프렌|클라렌|브러쉬|퍼프|면도기|쉐이빙/, weight: 1 },
    { pattern: /beauty/, weight: 0.5 },
    { pattern: /뷰티/, weight: 0.5 },
  ];

  const consumableKeywordPattern = /lens|contact lens|콘택트렌즈|원데이렌즈|렌즈/;
  const consumableBrandPattern = /바슈롬|소프렌|클라렌|bausch lomb|soflens|claran/;

  let score = 0;
  score += applyWeightedPatterns(normalizedMerchant, merchantRules);
  score += applyWeightedPatterns(normalizedText, strongKeywordRules);
  score += applyWeightedPatterns(normalizedText, keywordRules);

  if (consumableKeywordPattern.test(normalizedText) && consumableBrandPattern.test(normalizedText)) {
    score += 1.0;
  }

  return Math.max(0, score);
}

function getFoodScore(normalizedText, normalizedMerchant) {
  const merchantRules = [
    { pattern: /marketkurly|kurly|coupangeats|baemin|yogiyo|ssg|emart|컬리|배달의민족|요기요|이마트/, weight: 1 },
  ];

  const keywordRules = [
    { pattern: /coffee|tea|snack|food|grocery|cookie|chocolate|protein|beverage|olive oil|cereal|meat|fruit|vegetable|vitamin|mealkit/, weight: 1 },
    { pattern: /커피|차|간식|식품|식료품|쿠키|초콜릿|프로틴|음료|올리브오일|시리얼|과일|채소|고기|생선|영양제|비타민|밀키트|생수/, weight: 1 },
  ];

  const measurementPattern = /\b\d+\s?(g|kg|ml|l)\b|\d+\s?(팩|입|캡슐)\b/i;
  const baseFoodPattern =
    /coffee|tea|snack|food|grocery|cookie|chocolate|protein|beverage|olive oil|cereal|meat|fruit|vegetable|vitamin|mealkit|커피|차|간식|식품|식료품|쿠키|초콜릿|프로틴|음료|올리브오일|시리얼|과일|채소|고기|생선|영양제|비타민|밀키트|생수/;

  let score = 0;
  score += applyWeightedPatterns(normalizedMerchant, merchantRules);
  score += applyWeightedPatterns(normalizedText, keywordRules);

  if (measurementPattern.test(normalizedText) && baseFoodPattern.test(normalizedText)) {
    score += 1.5;
  }

  return Math.max(0, score);
}

function getBookScore(normalizedText, normalizedMerchant) {
  const merchantRules = [
    { pattern: /yes24|kyobobook|aladin|교보문고|알라딘/, weight: 1 },
  ];

  const keywordRules = [
    { pattern: /book|novel|essay|magazine|ebook|hardcover|paperback/, weight: 1 },
    { pattern: /도서|책|소설|에세이|매거진|전자책/, weight: 1 },
    { pattern: /stationery|diary|pen|note|textbook/, weight: 1 },
    { pattern: /문구|다이어리|펜|노트|수험서|교재|어학|비즈니스|마케팅|투자/, weight: 1 },
  ];

  const purposeKeywordPattern = /교재|수험서|어학|영어|비즈니스|마케팅|투자/;
  let score = 0;
  score += applyWeightedPatterns(normalizedMerchant, merchantRules);
  score += applyWeightedPatterns(normalizedText, keywordRules);

  if (merchantRules.some((rule) => rule.pattern.test(normalizedMerchant)) && purposeKeywordPattern.test(normalizedText)) {
    score += 1.5;
  }

  return Math.max(0, score);
}

function applyWeightedPatterns(text, rules) {
  return rules.reduce((score, rule) => score + (rule.pattern.test(text) ? rule.weight : 0), 0);
}

function countMatches(haystack, patterns) {
  return patterns.reduce((score, pattern) => score + (pattern.test(haystack) ? 1 : 0), 0);
}

function merchantLooksCategorySpecific(merchant, category) {
  const normalized = merchant.toLowerCase();
  const merchantHints = {
    fashion: /musinsa|29cm|wconcept|zigzag|ably/,
    living: /ikea|iloom|hanssem|todayhouse|ohou/,
    appliance: /apple|samsung|lg|sony|dyson|canon|nikon/,
    beauty: /oliveyoung|sephora|lalavla|stylenanda|innisfree|laneige|hera|aesop|tamburins/,
    food: /kurly|marketkurly|baemin|yogiyo|ssg|emart/,
    book: /yes24|kyobobook|aladin/,
  };
  return merchantHints[category]?.test(normalized) ?? false;
}

function isMerchantOnlyMatch(haystack, merchant, category) {
  const normalizedMerchant = merchant.toLowerCase();
  const merchantMatched = merchantLooksCategorySpecific(normalizedMerchant, category);
  if (!merchantMatched) return false;

  const merchantlessHaystack = haystack.replaceAll(normalizedMerchant, ' ');
  const keywordHints = {
    fashion: /jacket|coat|shirt|pants|dress|bag|shoe|t[\s-]?shirt|underwear|socks?|accessor(?:y|ies)|necklace|ring|재킷|셔츠|바지|드레스|가방|신발|티셔츠|반팔|맨투맨|속옷|양말|악세사리|액세서리|목걸이|반지/,
    living: /chair|table|sofa|lamp|kitchen|interior|plate|pot|pan|towel|rug|blanket|cushion|vase|dish|의자|테이블|소파|조명|주방|인테리어|가구|선반|침대|그릇|냄비|프라이팬|수건|러그|이불|쿠션|화병|식기/,
    appliance: /airpods|ipad|phone|monitor|macbook|camera|headphone|speaker|keyboard|vacuum|tablet|watch|tv|refrigerator|washer|humidifier|dryer|styler|mouse|노트북|핸드폰|모니터|카메라|이어폰|가전|티비|냉장고|세탁기|가습기|고데기|드라이기|스타일러|마우스|공기청정기/,
    beauty: /cream|serum|lip|perfume|skincare|cleanser|toner|mask|makeup|sunscreen|cushion|lotion|essence|ampoule|mist|lens|contact lens|brush|puff|shaving|razor|폼클렌저|쿠션|에센스|앰플|화장품|향수|뷰티|콘택트렌즈|원데이렌즈|렌즈|바슈롬|소프렌|클라렌|브러쉬|퍼프|면도기|쉐이빙/,
    food: /coffee|tea|snack|food|grocery|cookie|chocolate|protein|beverage|olive oil|cereal|meat|fruit|vegetable|vitamin|mealkit|커피|차|간식|식품|식료품|쿠키|초콜릿|프로틴|음료|올리브오일|시리얼|과일|채소|고기|생선|영양제|비타민|밀키트|생수/,
    book: /book|novel|essay|magazine|stationery|diary|pen|note|textbook|도서|책|소설|에세이|문구|다이어리|펜|노트|수험서|교재|어학|비즈니스|마케팅|투자/,
  };
  return !(keywordHints[category]?.test(merchantlessHaystack) ?? false);
}

function deriveTags(title, merchant, url, category) {
  const haystack = `${title} ${merchant} ${url}`.toLowerCase();
  const tags = new Set();
  const rules = [
    ['gift', /(gift|present|선물|집들이)/],
    ['black', /(black|블랙)/],
    ['white', /(white|ivory|화이트|아이보리)/],
    ['beige', /(beige|베이지)/],
    ['jacket', /(jacket|재킷)/],
    ['winter', /(winter|겨울)/],
    ['kitchen', /(kitchen|주방)/],
    ['living', /(living|리빙|가구)/],
  ];

  for (const [tag, pattern] of rules) {
    if (pattern.test(haystack)) tags.add(tag);
  }

  if (category && category !== 'other') tags.add(category);
  return Array.from(tags).slice(0, 5);
}

function extractPageCandidate() {
  function cleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function toAbsoluteUrl(value) {
    const cleaned = cleanText(value);
    if (!cleaned) return '';
    try {
      return new URL(cleaned, location.href).href;
    } catch {
      return cleaned;
    }
  }

  function firstMeta(selectors) {
    for (const selector of selectors) {
      const content = cleanText(document.querySelector(selector)?.content);
      if (content) return content;
    }
    return '';
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const content = cleanText(document.querySelector(selector)?.textContent);
      if (content) return content;
    }
    return '';
  }

  function normalizeCurrency(value) {
    const upper = cleanText(value).toUpperCase();
    if (!upper) return '';
    if (upper === '₩' || upper.includes('KRW') || /원/.test(value)) return 'KRW';
    if (upper === '$' || upper.includes('USD')) return 'USD';
    if (upper === '€' || upper.includes('EUR')) return 'EUR';
    if (upper === '£' || upper.includes('GBP')) return 'GBP';
    return /^[A-Z]{3}$/.test(upper) ? upper : '';
  }

  function normalizeMetaTagValue(value) {
    return cleanText(value)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function appendMetaTags(set, value) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => appendMetaTags(set, entry));
      return;
    }
    if (typeof value === 'object') {
      appendMetaTags(set, value.name || value['@id'] || value.value || value.text || value['@value']);
      return;
    }

    const raw = normalizeMetaTagValue(value);
    if (!raw) return;
    raw
      .split(/[|,;]+/)
      .map((entry) => normalizeMetaTagValue(entry))
      .filter(Boolean)
      .forEach((entry) => set.add(entry));
  }

  function extractBrandName(value) {
    if (!value) return '';
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = extractBrandName(entry);
        if (found) return found;
      }
      return '';
    }
    if (typeof value === 'string') return cleanText(value);
    if (typeof value === 'object') {
      return cleanText(value.name || value.brand || value['@id'] || value.legalName || value.value || value.text);
    }
    return '';
  }

  function normalizeAvailability(value) {
    const raw = cleanText(value);
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (/instock|in stock|available|재고\s*있|판매\s*중|구매\s*가능/.test(lower)) return 'In stock';
    if (/outofstock|out of stock|sold out|unavailable|품절/.test(lower)) return 'Out of stock';
    if (/preorder|pre-order|예약\s*판매|사전\s*주문/.test(lower)) return 'Pre-order';
    if (/backorder|back order/.test(lower)) return 'Backorder';
    if (/limitedavailability|limited availability|한정/.test(lower)) return 'Limited availability';
    if (/discontinued|판매\s*중지/.test(lower)) return 'Discontinued';
    return raw;
  }

  function extractAvailabilityValue(value) {
    if (!value) return '';
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = extractAvailabilityValue(entry);
        if (found) return found;
      }
      return '';
    }
    if (typeof value === 'object') {
      return normalizeAvailability(value.availability || value.itemAvailability || value.value || value['@id']);
    }
    return normalizeAvailability(value);
  }

  function inferCurrencyFromPrice(value) {
    if (/[$]|USD/i.test(value)) return 'USD';
    if (/[€]|EUR/i.test(value)) return 'EUR';
    if (/[£]|GBP/i.test(value)) return 'GBP';
    return 'KRW';
  }

  function normalizePrice(value) {
    const raw = cleanText(value);
    if (!raw) return '';
    const match = raw.match(/(?:₩|\$|€|£)?\s?\d[\d,]*(?:\.\d+)?\s?(?:원|KRW|USD|EUR|GBP)?/i);
    return cleanText(match ? match[0] : raw);
  }

  function makePriceCandidate(rawPrice, currency, source) {
    const price = normalizePrice(rawPrice);
    if (!price) return null;
    return {
      price,
      currency: normalizeCurrency(currency) || inferCurrencyFromPrice(price),
      source,
    };
  }

  function hasProductType(node) {
    const rawType = node?.['@type'];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    return types.some((value) => typeof value === 'string' && value.toLowerCase().includes('product'));
  }

  function walkJson(node, visitor) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((entry) => walkJson(entry, visitor));
      return;
    }
    if (typeof node !== 'object') return;

    visitor(node);

    Object.values(node).forEach((value) => {
      if (value && typeof value === 'object') {
        walkJson(value, visitor);
      }
    });
  }

  function extractOfferPrice(offer) {
    if (!offer) return null;
    if (Array.isArray(offer)) {
      for (const entry of offer) {
        const found = extractOfferPrice(entry);
        if (found) return found;
      }
      return null;
    }
    if (typeof offer !== 'object') return null;

    const direct =
      makePriceCandidate(offer.price, offer.priceCurrency, 'jsonld') ||
      makePriceCandidate(offer.lowPrice, offer.priceCurrency, 'jsonld') ||
      makePriceCandidate(offer.highPrice, offer.priceCurrency, 'jsonld');
    if (direct) return direct;

    const spec = offer.priceSpecification;
    if (!spec) return null;

    if (Array.isArray(spec)) {
      for (const entry of spec) {
        const found = extractOfferPrice(entry);
        if (found) return found;
      }
      return null;
    }

    return (
      makePriceCandidate(spec.price, spec.priceCurrency, 'jsonld') ||
      makePriceCandidate(spec.minPrice, spec.priceCurrency, 'jsonld') ||
      makePriceCandidate(spec.maxPrice, spec.priceCurrency, 'jsonld')
    );
  }

  function extractJsonLdProductData() {
    const summary = {
      title: '',
      imageUrl: '',
      description: '',
      brand: '',
      availability: '',
      metaTags: new Set(),
      price: null,
      hasProductSignal: false,
    };

    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      const raw = cleanText(script.textContent);
      if (!raw) return;

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      walkJson(parsed, (node) => {
        const productLike = hasProductType(node) || Boolean(node?.offers && (node?.name || node?.sku || node?.brand));
        if (!productLike) return;

        summary.hasProductSignal = true;

        if (!summary.title) {
          summary.title = cleanText(node.name);
        }

        if (!summary.description) {
          summary.description = cleanText(node.description);
        }

        if (!summary.brand) {
          summary.brand = extractBrandName(node.brand) || extractBrandName(node.manufacturer) || extractBrandName(node.seller);
        }

        if (!summary.availability) {
          summary.availability = extractAvailabilityValue(node.offers);
        }

        appendMetaTags(summary.metaTags, node.keywords);
        appendMetaTags(summary.metaTags, node.category);

        if (!summary.imageUrl) {
          const image = Array.isArray(node.image) ? node.image[0] : node.image;
          if (typeof image === 'string') {
            summary.imageUrl = toAbsoluteUrl(image);
          } else if (image && typeof image.url === 'string') {
            summary.imageUrl = toAbsoluteUrl(image.url);
          }
        }

        if (!summary.price) {
          summary.price =
            extractOfferPrice(node.offers) ||
            makePriceCandidate(node.price, node.priceCurrency, 'jsonld');
        }
      });
    });

    return summary;
  }

  function extractMetaTags() {
    const tags = new Set();
    const selectors = [
      'meta[name="keywords"]',
      'meta[name="news_keywords"]',
      'meta[property="article:tag"]',
      'meta[name="article:tag"]',
      'meta[property="product:tag"]',
      'meta[name="product:tag"]',
      'meta[property="product:category"]',
      'meta[name="product:category"]',
      'meta[name="category"]',
    ];

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((meta) => {
        appendMetaTags(tags, meta.getAttribute('content'));
      });
    }

    return Array.from(tags).slice(0, 12);
  }

  function extractMetaPrice() {
    return (
      makePriceCandidate(
        firstMeta([
          'meta[property="product:price:amount"]',
          'meta[name="product:price:amount"]',
          'meta[property="og:price:amount"]',
        ]),
        firstMeta([
          'meta[property="product:price:currency"]',
          'meta[name="product:price:currency"]',
          'meta[property="og:price:currency"]',
        ]),
        'meta'
      ) ||
      null
    );
  }

  function extractMicrodataPrice() {
    const priceEl = document.querySelector('[itemprop="price"]');
    const currencyEl = document.querySelector('[itemprop="priceCurrency"]');
    if (!priceEl) return null;
    return makePriceCandidate(
      priceEl.getAttribute('content') || priceEl.textContent,
      currencyEl?.getAttribute('content') || currencyEl?.textContent || '',
      'microdata'
    );
  }

  function extractSelectorPrice() {
    const selectorList = [
      '[data-price]',
      '[data-testid*="price" i]',
      '[aria-label*="price" i]',
      '[class*="sale" i]',
      '[class*="price" i]',
      '[id*="price" i]',
    ];
    const seen = new Set();
    const candidates = [];

    for (const selector of selectorList) {
      for (const element of document.querySelectorAll(selector)) {
        const raw =
          element.getAttribute('data-price') ||
          element.getAttribute('content') ||
          element.textContent;
        const text = cleanText(raw);
        if (!text || seen.has(text)) continue;
        seen.add(text);

        if (!/(?:₩|\$|€|£|\bKRW\b|\bUSD\b|\bEUR\b|\bGBP\b|\d[\d,]{2,}\s?원)/i.test(text)) {
          continue;
        }

        const context = cleanText(
          [
            element.getAttribute('class') || '',
            element.getAttribute('id') || '',
            element.getAttribute('aria-label') || '',
            element.closest('[class]')?.getAttribute('class') || '',
            element.parentElement?.textContent || '',
          ].join(' ')
        ).toLowerCase();

        if (/배송|shipping|review|후기|point|적립/i.test(context) && !/(?:₩|\$|€|£)/.test(text)) {
          continue;
        }

        const candidate = makePriceCandidate(text, '', 'selector');
        if (!candidate) continue;

        let score = 0;
        if (/판매가|sale price|price|current price|최저가|현재가/.test(context)) score += 5;
        if (/sale|current|final|selling|price/.test(context)) score += 3;
        if (/쿠폰|coupon|혜택|benefit|카드|card|membership|멤버십|최대적립|적립|포인트/.test(context)) score -= 5;
        if (/정가|소비자가|원가|before|list price|strike|discount rate/.test(context)) score -= 3;
        if (element.hasAttribute('data-price')) score += 2;

        candidates.push({ ...candidate, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function extractRegexPrice(text) {
    const matches = [
      ...text.matchAll(/(?:₩\s?\d[\d,]*(?:\.\d+)?)|(?:USD|EUR|GBP|KRW)\s?\d[\d,]*(?:\.\d+)?|(?:\d[\d,]{3,}(?:\.\d+)?\s?원)/gi),
    ];

    for (const match of matches) {
      const raw = cleanText(match[0]);
      if (!raw) continue;
      if (/년|월|일/.test(raw)) continue;
      const candidate = makePriceCandidate(raw, '', 'regex');
      if (candidate) return candidate;
    }

    return null;
  }

  const jsonLd = extractJsonLdProductData();
  const metaTags = new Set([
    ...Array.from(jsonLd.metaTags || []),
    ...extractMetaTags(),
  ]);
  const title =
    jsonLd.title ||
    firstMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    firstText(['title', 'h1']) ||
    '';
  const imageUrl =
    jsonLd.imageUrl ||
    toAbsoluteUrl(firstMeta(['meta[property="og:image"]', 'meta[name="twitter:image"]'])) ||
    toAbsoluteUrl(document.querySelector('img')?.src || '');
  const priceCandidate =
    jsonLd.price ||
    extractMetaPrice() ||
    extractMicrodataPrice() ||
    extractSelectorPrice() ||
    extractRegexPrice(document.body?.innerText?.slice(0, 8000) || '');

  const merchant = location.hostname.replace(/^www\./, '');
  const bodyText = cleanText(document.body?.innerText?.slice(0, 8000) || '');
  const bodyLower = bodyText.toLowerCase();
  const titleLower = cleanText(title).toLowerCase();
  const ogType = firstMeta(['meta[property="og:type"]']).toLowerCase();
  const hasMicrodataProduct = Boolean(
    document.querySelector('[itemtype*="schema.org/Product" i], [itemtype*="Product" i]')
  );
  const hasStructuredProductSignal = jsonLd.hasProductSignal || ogType.includes('product') || hasMicrodataProduct;
  const keywordProductSignal = /product|sku|cart|buy|구매|장바구니|옵션|할인|판매가|재고|상세/.test(bodyLower);
  const looksLikeBrandPage =
    /brand|about|story|company|기업|브랜드|소개|스토리/.test(titleLower) &&
    !/buy|cart|shop|구매|장바구니|옵션|할인|판매가/.test(bodyLower);

  let confidenceScore = 0;
  if (title) confidenceScore += 1;
  if (imageUrl) confidenceScore += 1;
  if (hasStructuredProductSignal) confidenceScore += 3;
  if (keywordProductSignal) confidenceScore += 1;
  if (priceCandidate) confidenceScore += priceCandidate.source === 'regex' ? 1 : 2;
  if (looksLikeBrandPage) confidenceScore -= 3;

  const isProductLike =
    !looksLikeBrandPage &&
    (hasStructuredProductSignal || keywordProductSignal || Boolean(priceCandidate && priceCandidate.source !== 'regex'));
  const metadataConfidence = confidenceScore >= 5 ? 'high' : confidenceScore >= 3 ? 'medium' : 'low';
  const captureMode = isProductLike || metadataConfidence !== 'low' ? 'item' : 'link';
  const shouldKeepPrice =
    Boolean(priceCandidate) &&
    !looksLikeBrandPage &&
    (captureMode === 'item' || ['jsonld', 'meta', 'microdata', 'selector'].includes(priceCandidate.source));

  return {
    url: location.href,
    title: cleanText(title),
    imageUrl,
    currentPrice: shouldKeepPrice ? priceCandidate?.price || '' : '',
    currency: shouldKeepPrice ? priceCandidate?.currency || 'KRW' : 'KRW',
    merchant,
    isProductLike,
    metadataConfidence,
    captureMode,
    priceSource: shouldKeepPrice ? priceCandidate?.source || 'none' : 'none',
    description: jsonLd.description || firstMeta(['meta[property="og:description"]', 'meta[name="description"]']),
    metaTags: Array.from(metaTags).filter(Boolean).slice(0, 12),
    brand: jsonLd.brand || firstMeta(['meta[property="product:brand"]', 'meta[name="product:brand"]', 'meta[name="brand"]']),
    availability:
      jsonLd.availability ||
      normalizeAvailability(
        firstMeta([
          'meta[property="product:availability"]',
          'meta[name="product:availability"]',
          'meta[property="og:availability"]',
          'meta[name="availability"]',
        ])
      ),
  };
}
