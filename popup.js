import {
  CATEGORY_OPTIONS,
  buildSavedItem,
  categoryLabel,
  detectDuplicate,
  formatPrice,
  labelLabel,
  loadItems,
  normalizeUrl,
  saveItems,
} from './lib/storage.js';

const state = {
  candidate: null,
  tabId: null,
  duplicate: null,
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
  duplicateNote: document.getElementById('duplicate-note'),
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
    renderUnsupported('Open a product page to start saving.');
    return;
  }

  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageCandidate,
  });

  state.candidate = enrichCandidate(result?.[0]?.result ?? {}, tab.url);
  const items = await loadItems();
  state.duplicate = detectDuplicate(items, state.candidate.normalizedUrl);
  renderCandidate();
}

function renderCandidate() {
  const candidate = state.candidate;
  if (!candidate) {
    renderUnsupported('No candidate page found.');
    return;
  }

  renderStatus(
    state.duplicate ? 'This page may already be saved.' : 'Ready to save this page.',
    state.duplicate ? 'warning' : 'neutral'
  );
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
  els.saveButton.textContent = state.duplicate ? 'Save again' : 'Save to Pantry';
  els.openDashboardButton.classList.toggle('hidden', !state.duplicate);
  els.continueButton.classList.toggle('hidden', !state.duplicate);

  if (!candidate.isProductLike) {
    els.unsupportedCard.classList.remove('hidden');
  }
}

async function saveCurrentCandidate() {
  if (!state.candidate) return;

  const items = await loadItems();
  const duplicate = detectDuplicate(items, state.candidate.normalizedUrl);
  const candidate = { ...state.candidate, category: els.categorySelect.value };
  const item = buildSavedItem(candidate, duplicate?.id || null);
  await saveItems([item, ...items]);
  state.duplicate = duplicate;

  if (duplicate) {
    renderStatus('Saved again. This item may already be in Pantry.', 'warning');
  } else {
    renderStatus(`Saved. ${labelLabel(item.label)} item added to Pantry.`, 'success');
  }

  els.saveButton.classList.add('hidden');
  els.openDashboardButton.classList.remove('hidden');
  els.continueButton.classList.remove('hidden');
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
}

function renderUnsupported(message) {
  renderStatus(message, 'warning');
  els.unsupportedCard.classList.remove('hidden');
}

function renderStatus(message, tone) {
  els.statusBanner.textContent = message;
  els.statusBanner.className = `status-banner ${tone}`;
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
  const category = raw.category || categorizeProduct(title, merchant, url, raw.isProductLike);
  const tags = deriveTags(title, merchant, url, category);
  return {
    title,
    url,
    normalizedUrl,
    merchant,
    imageUrl: raw.imageUrl || '',
    currentPrice: raw.currentPrice || '',
    currency: 'KRW',
    category,
    tags,
    isProductLike: Boolean(raw.isProductLike),
  };
}

function deriveMerchant(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function categorizeProduct(title, merchant, url, isProductLike) {
  const haystack = `${title} ${merchant} ${url}`.toLowerCase();
  const scores = {
    fashion: getFashionScore(title, merchant),
    living: getLivingScore(title, merchant),
    appliance: getApplianceScore(title, merchant),
    beauty: getBeautyScore(title, merchant),
    food: getFoodScore(title, merchant),
    book: getBookScore(title, merchant),
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
  if (!isProductLike && isMerchantOnlyMatch(haystack, merchant, winningCategory)) return 'other';
  if (winningScore === 1 && !merchantLooksCategorySpecific(merchant, winningCategory)) return 'other';
  return winningCategory;
}

function getFashionScore(title, merchant) {
  const normalizedTitle = String(title || '').toLowerCase();
  const normalizedMerchant = String(merchant || '').toLowerCase();

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
  score += applyWeightedPatterns(normalizedTitle, keywordRules);
  score -= applyWeightedPatterns(normalizedTitle, negativeRules);

  if (basicFashionPattern.test(normalizedTitle) && designKeywordPattern.test(normalizedTitle)) {
    score += 1.0;
  }

  return Math.max(0, score);
}

function getLivingScore(title, merchant) {
  const normalizedTitle = String(title || '').toLowerCase();
  const normalizedMerchant = String(merchant || '').toLowerCase();

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
  score += applyWeightedPatterns(normalizedTitle, keywordRules);
  score -= applyWeightedPatterns(normalizedTitle, negativeRules);


  return Math.max(0, score);
}

function getApplianceScore(title, merchant) {
  const normalizedTitle = String(title || '').toLowerCase();
  const normalizedMerchant = String(merchant || '').toLowerCase();

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
  ];

  const modelPattern = /\b(?=[a-z0-9-]{5,}\b)(?=.*[a-z])(?=.*\d)[a-z0-9-]+\b/i;
  const baseAppliancePattern = /airpods|ipad|phone|monitor|macbook|camera|headphone|speaker|keyboard|vacuum|tablet|watch|tv|refrigerator|washer|humidifier|dryer|styler|mouse|노트북|핸드폰|모니터|카메라|이어폰|헤드폰|스피커|키보드|청소기|태블릿|전자|티비|냉장고|세탁기|가습기|고데기|드라이기|스타일러|마우스|공기청정기/;

  let score = 0;
  score += applyWeightedPatterns(normalizedMerchant, merchantRules);
  score += applyWeightedPatterns(normalizedTitle, baseKeywordRules);
  score -= applyWeightedPatterns(normalizedTitle, negativeRules);

  if (modelPattern.test(normalizedTitle) && baseAppliancePattern.test(normalizedTitle)) {
    score += 2.0;
  }

  return Math.max(0, score);
}


function getBeautyScore(title, merchant) {
  const normalizedTitle = String(title || '').toLowerCase();
  const normalizedMerchant = String(merchant || '').toLowerCase();

  const merchantRules = [
    { pattern: /oliveyoung|sephora|lalavla|stylenanda|innisfree|laneige|hera|aesop|tamburins|olive young|올리브영|세포라|이니스프리|라네즈|헤라|이솝|탬버린즈/, weight: 1 },
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
  score += applyWeightedPatterns(normalizedTitle, keywordRules);

  if (consumableKeywordPattern.test(normalizedTitle) && consumableBrandPattern.test(normalizedTitle)) {
    score += 1.0;
  }

  return Math.max(0, score);
}

function getFoodScore(title, merchant) {
  const normalizedTitle = String(title || '').toLowerCase();
  const normalizedMerchant = String(merchant || '').toLowerCase();

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
  score += applyWeightedPatterns(normalizedTitle, keywordRules);

  if (measurementPattern.test(normalizedTitle) && baseFoodPattern.test(normalizedTitle)) {
    score += 1.5;
  }

  return Math.max(0, score);
}

function getBookScore(title, merchant) {
  const normalizedTitle = String(title || '').toLowerCase();
  const normalizedMerchant = String(merchant || '').toLowerCase();

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
  score += applyWeightedPatterns(normalizedTitle, keywordRules);

  if (merchantRules.some((rule) => rule.pattern.test(normalizedMerchant)) && purposeKeywordPattern.test(normalizedTitle)) {
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
  const title =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector('title')?.textContent ||
    document.querySelector('h1')?.textContent ||
    '';

  const imageUrl =
    document.querySelector('meta[property="og:image"]')?.content ||
    document.querySelector('meta[name="twitter:image"]')?.content ||
    document.querySelector('img')?.src ||
    '';

  const merchant = location.hostname.replace(/^www\./, '');
  const bodyText = document.body?.innerText?.slice(0, 5000) || '';
  const priceMatch = bodyText.match(/([₩$]\s?[\d,]+)|(\d[\d,]{2,}\s?원)/);
  const currentPrice = priceMatch ? priceMatch[0] : '';
  const bodyLower = bodyText.toLowerCase();
  const titleLower = title.toLowerCase();
  const looksLikeBrandPage =
    /brand|about|story|company|기업|브랜드|소개|스토리/.test(titleLower) &&
    !/buy|cart|shop|구매|장바구니|옵션|할인/.test(bodyLower);
  const isProductLike =
    !looksLikeBrandPage &&
    (Boolean(priceMatch) || /product|sku|cart|buy|구매|장바구니|옵션|할인/.test(bodyLower));

  return {
    url: location.href,
    title: title.trim(),
    imageUrl,
    currentPrice,
    merchant,
    isProductLike,
  };
}
