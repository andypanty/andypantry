const config = window.ANDY_PANTRY_SITE_CONFIG || {};

function isPlaceholder(value) {
  return typeof value !== 'string' || value.includes('[placeholder') || value.includes('[support') || value.includes('[homepage') || value.includes('[chrome-web-store');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value;
}

function setHref(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.setAttribute('href', value);
}

function setHrefAll(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.setAttribute('href', value);
  });
}

function initializePlaceholders() {
  setText('site-name', config.siteName || 'Andy Pantry');
  setText('support-email-text', config.supportEmail || '[support-email-placeholder]');
  setText('homepage-url-text', config.homepageUrl || '[homepage-url-placeholder]');

  if (config.supportEmail) {
    setHref('support-email-link', isPlaceholder(config.supportEmail) ? '#' : `mailto:${config.supportEmail}`);
  }

  if (config.homepageUrl) {
    setHref('homepage-link', isPlaceholder(config.homepageUrl) ? '#' : config.homepageUrl);
  }

  if (config.privacyUrl) {
    setHrefAll('[data-link="privacy"]', config.privacyUrl);
  }

  if (config.supportUrl) {
    setHrefAll('[data-link="support"]', config.supportUrl);
  }

  if (config.chromeStoreUrl) {
    const href = isPlaceholder(config.chromeStoreUrl) ? '#' : config.chromeStoreUrl;
    document.querySelectorAll('[data-store-link]').forEach((element) => {
      element.setAttribute('href', href);
    });
  }

  const warning = document.getElementById('publish-warning');
  if (!warning) return;

  const unresolved = [config.supportEmail, config.homepageUrl, config.chromeStoreUrl].some(isPlaceholder);
  warning.hidden = !unresolved;
}

function setYear() {
  const target = document.getElementById('current-year');
  if (!target) return;
  target.textContent = String(new Date().getFullYear());
}

initializePlaceholders();
setYear();
