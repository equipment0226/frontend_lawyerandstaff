/** A light visual layer: never owns page data, focus, scrolling or history. */
const selector = [
  '.page-heading', '.case-header', '.public-page-title', '.new-chapter-copy',
  '.private-workspace-heading', '.public-section-title', '.public-promise',
  '.metrics > .metric', '.cd-metric', '.cd-panel', '.card', '.court-card',
  '.received-document-card', '.request-item', '.portal-bulk-upload',
  '.public-service-grid > article', '.public-review-grid > article',
  '.guide-intro > div', '.guide-step-grid > article', '.guide-document-grid > article',
  '.public-terms > article', '.public-story > div', '.home-review-preview',
  '.portal-application', '.portal-testing-materials', '.auth-form'
].join(',');
const excluded = 'dialog,[role="dialog"],iframe,[data-motion="off"],.document-original-pane';
const routeFields = ['view', 'page', 'case', 'tab', 'application'];
const routeKey = () => {
  const query = new URLSearchParams(location.search);
  return location.pathname + routeFields.map(key => `${key}=${query.get(key) || ''}`).join('&');
};
function hash(value) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return (result >>> 0).toString(36);
}
function headingLabel(heading) {
  if (!heading) return '';
  const direct = [...heading.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent.trim()).filter(Boolean).join(' ');
  if (direct) return direct;
  const label = heading.cloneNode(true);
  label.querySelectorAll('.badge,.cd-tag,.counter,.nav-count,[data-count],[role="status"],small,svg').forEach(node => node.remove());
  return label.textContent.trim();
}
function identity(element) {
  const own = ['data-motion-key', 'data-id', 'data-request', 'data-case'].map(key => element.getAttribute(key)).find(Boolean);
  const linked = element.querySelector('[data-request],[data-id],[data-case]');
  const linkedId = linked && ['data-request', 'data-id', 'data-case'].map(key => linked.getAttribute(key)).find(Boolean);
  const heading = element.querySelector('.metric-top,.metric-label,.cd-metric-title,.cd-metric-label') || element.querySelector('h1,h2,h3,summary');
  const headingText = headingLabel(heading);
  const classes = [...element.classList].filter(value => !/^(?:is-|status-)|^(?:active|selected|completed|fulfilled|verified|requested|pending|running|withdrawn)$/.test(value)).join('.');
  // Do not include counts, progress labels or the card's whole text. A polling
  // refresh must not replay its entrance. Keys stay hashed in memory only.
  return hash(`${element.tagName}|${classes}|${own || linkedId || headingText || element.getAttribute('aria-label') || ''}`);
}

export function createMotionController(root = document.getElementById('app')) {
  if (!root) return { scan() {}, destroy() {} };
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new Set(), pending = new Map(), animations = new Set();
  let route = routeKey(), frame = 0, pulseTimer = 0, settleTimer = 0, destroyed = false;
  const reduced = () => preference.matches;
  root.dataset.workspaceMotion = reduced() ? 'reduced' : 'ready';

  function reveal(element, key, index = 0) {
    pending.delete(key);
    viewport?.unobserve(element);
    if (!element.isConnected || seen.has(key)) return;
    seen.add(key);
    if (destroyed || reduced() || !element.animate || element.contains(document.activeElement)) return;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const opacity = Number(style.opacity) || 1;
    const animation = element.animate([
      { opacity: opacity * .55, translate: '0 12px' },
      { opacity, translate: style.translate === 'none' ? '0 0' : style.translate }
    ], { duration: 520, delay: Math.min(index, 4) * 40, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    animation.id = 'debtoff-reveal';
    animations.add(animation);
    animation.finished.catch(() => {}).finally(() => animations.delete(animation));
  }
  const viewport = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    let order = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const key = [...pending].find(([, value]) => value === entry.target)?.[0];
      if (key) reveal(entry.target, key, order++);
    }
  }, { threshold: .08, rootMargin: '0px 0px -20px 0px' }) : null;

  function stopPulse() {
    clearTimeout(pulseTimer); clearTimeout(settleTimer);
    document.documentElement.removeAttribute('data-motion-navigation');
  }
  function scan() {
    frame = 0;
    if (destroyed) return;
    const next = routeKey();
    if (next !== route) {
      route = next; seen.clear(); pending.clear(); viewport?.disconnect();
      for (const animation of animations) animation.cancel();
      animations.clear();
    }
    for (const [key, element] of pending) {
      if (!element.isConnected) { viewport?.unobserve(element); pending.delete(key); }
    }
    const duplicates = new Map();
    const candidates = [...root.querySelectorAll(selector)].filter(element => !element.closest(excluded)
      && !(element.matches('.card') && element.querySelector('.received-document-card,.request-item')));
    let order = 0;
    for (const element of candidates) {
      const base = identity(element), occurrence = duplicates.get(base) || 0;
      duplicates.set(base, occurrence + 1);
      const key = `${base}:${occurrence}`;
      if (seen.has(key) || pending.get(key) === element) continue;
      if (pending.has(key)) viewport?.unobserve(pending.get(key));
      if (reduced()) { seen.add(key); continue; }
      if (viewport) { pending.set(key, element); viewport.observe(element); }
      else reveal(element, key, order++);
    }
    if (!root.querySelector('.loading') && document.documentElement.hasAttribute('data-motion-navigation')) {
      clearTimeout(settleTimer); settleTimer = setTimeout(stopPulse, 180);
    }
  }
  function schedule() { if (!frame && !destroyed) frame = requestAnimationFrame(scan); }
  function navigation() {
    if (destroyed) return;
    if (!reduced()) {
      clearTimeout(pulseTimer); clearTimeout(settleTimer);
      document.documentElement.setAttribute('data-motion-navigation', 'pending');
      // This is a brief transition cue, not a fabricated completion percentage.
      // Real request progress remains in the existing loading/status components.
      pulseTimer = setTimeout(stopPulse, 1400);
    }
    schedule();
  }
  function preferenceChanged() {
    root.dataset.workspaceMotion = reduced() ? 'reduced' : 'ready';
    if (reduced()) {
      for (const animation of animations) animation.cancel();
      animations.clear(); viewport?.disconnect(); pending.clear(); stopPulse();
    }
    schedule();
  }
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  for (const name of ['office:before-navigate', 'portal:before-navigate', 'popstate']) window.addEventListener(name, navigation);
  preference.addEventListener('change', preferenceChanged);
  schedule();
  return { scan: schedule, destroy() {
    if (destroyed) return;
    destroyed = true; cancelAnimationFrame(frame); stopPulse();
    observer.disconnect(); viewport?.disconnect(); pending.clear(); seen.clear();
    for (const animation of animations) animation.cancel();
    animations.clear(); preference.removeEventListener('change', preferenceChanged);
    for (const name of ['office:before-navigate', 'portal:before-navigate', 'popstate']) window.removeEventListener(name, navigation);
    delete root.dataset.workspaceMotion;
  } };
}

const singleton = Symbol.for('debtoff.motion');
if (!window[singleton]) window[singleton] = createMotionController();
