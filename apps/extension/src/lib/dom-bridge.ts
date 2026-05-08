// Programmatically inject + run a DOM snapshot extractor in the active tab.
// Self-contained extractor function (no module imports) so chrome.scripting.executeScript
// can run it in the page world.

export type DomSnapshot = {
  url: string;
  title: string;
  description: string | null;
  visibleText: string;
  truncated: boolean;
  headings: Array<{ tag: string; text: string }>;
  inputs: Array<{
    tag: string;
    type: string;
    name: string | null;
    placeholder: string | null;
    value: string | null;
    label: string | null;
    selector: string;
  }>;
  buttons: Array<{
    text: string;
    ariaLabel: string | null;
    selector: string;
  }>;
  links: Array<{ text: string; href: string }>;
};

function extractDomFn(): DomSnapshot {
  const MAX_TEXT = 4000;
  const MAX_H = 25;
  const MAX_INPUTS = 25;
  const MAX_BUTTONS = 40;
  const MAX_LINKS = 25;
  // Elements to strip before extracting text — these are app chrome, not content
  const NOISE_SELECTOR = [
    'script',
    'style',
    'noscript',
    'svg',
    'template',
    'iframe',
    'link',
    'meta',
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[role="complementary"]',
    '[role="alert"]',
    '[role="dialog"][aria-hidden="true"]',
    '[aria-hidden="true"]',
    '[hidden]',
    '.ads',
    '.advertisement',
    '#cookie-banner',
    '[id*="cookie"][role="dialog"]',
  ].join(',');

  const safeText = (el: Element | null, max = 100): string => {
    if (!el) return '';
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
  };

  const buildSelector = (el: Element, idx: number): string => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const tag = el.tagName.toLowerCase();
    const dt = el.getAttribute('data-testid');
    if (dt) return `${tag}[data-testid="${CSS.escape(dt)}"]`;
    const al = el.getAttribute('aria-label');
    if (al) return `${tag}[aria-label="${CSS.escape(al)}"]`;
    const nm = el.getAttribute('name');
    if (nm) return `${tag}[name="${CSS.escape(nm)}"]`;
    return `${tag}:nth-of-type(${idx + 1})`;
  };

  const labelFor = (input: HTMLElement): string | null => {
    if (input.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (lbl) return safeText(lbl, 80);
    }
    const parent = input.closest('label');
    if (parent) return safeText(parent, 80);
    const al = input.getAttribute('aria-label');
    if (al) return al.slice(0, 80);
    return null;
  };

  const isVisible = (el: Element): boolean => {
    const html = el as HTMLElement;
    if (html.getAttribute('aria-hidden') === 'true') return false;
    if (html.hasAttribute('hidden')) return false;
    if (!html.offsetParent && html.tagName !== 'BODY') {
      const s = window.getComputedStyle(html);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') {
        return false;
      }
    }
    // Element must have non-zero size
    const r = html.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    return true;
  };

  const meta = document.querySelector('meta[name="description"]');
  const og = document.querySelector('meta[property="og:description"]');
  const description = meta?.getAttribute('content') ?? og?.getAttribute('content') ?? null;

  // Pick the most-likely main content root, fall back to body
  const mainRoot: Element =
    document.querySelector('main') ??
    document.querySelector('[role="main"]') ??
    document.querySelector('#main') ??
    document.querySelector('article') ??
    document.querySelector('[role="article"]') ??
    document.body ??
    document.documentElement;

  // Clone + strip noise so we can extract clean text without mutating the page
  let cleanText = '';
  try {
    const clone = mainRoot.cloneNode(true) as Element;
    clone.querySelectorAll(NOISE_SELECTOR).forEach((n) => n.remove());
    cleanText = ((clone as HTMLElement).innerText ?? '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    // Fallback to raw body text if clone fails for any reason (e.g. very old DOM API)
    cleanText = ((document.body?.innerText ?? '') as string)
      .replace(/\s+/g, ' ')
      .trim();
  }
  const truncated = cleanText.length > MAX_TEXT;
  const visibleText = truncated ? cleanText.slice(0, MAX_TEXT) : cleanText;

  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .filter(isVisible)
    .slice(0, MAX_H)
    .map((h) => ({ tag: h.tagName.toLowerCase(), text: safeText(h, 120) }))
    .filter((h) => h.text.length > 0);

  const inputs = Array.from(document.querySelectorAll('input, select, textarea'))
    .filter((el) => isVisible(el) && (el as HTMLInputElement).type !== 'password')
    .slice(0, MAX_INPUTS)
    .map((el, idx) => {
      const html = el as HTMLInputElement;
      const type = html.type ?? 'text';
      return {
        tag: html.tagName.toLowerCase(),
        type,
        name: html.getAttribute('name'),
        placeholder: html.getAttribute('placeholder'),
        value: type === 'password' ? null : html.value ?? null,
        label: labelFor(html),
        selector: buildSelector(html, idx),
      };
    });

  const seenButtonKeys = new Set<string>();
  const buttons = Array.from(
    document.querySelectorAll(
      'button, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="link"]',
    ),
  )
    .filter(isVisible)
    .map((b, idx) => ({
      text: safeText(b, 60),
      ariaLabel: b.getAttribute('aria-label') ?? b.getAttribute('title'),
      selector: buildSelector(b, idx),
    }))
    .filter((b) => b.text.length > 0 || b.ariaLabel)
    .filter((b) => {
      // Dedup by visible label — avoid 20 copies of the same row action button
      const key = `${b.text}|${b.ariaLabel ?? ''}`;
      if (seenButtonKeys.has(key)) return false;
      seenButtonKeys.add(key);
      return true;
    })
    .slice(0, MAX_BUTTONS);

  const seenHrefs = new Set<string>();
  const links = Array.from(document.querySelectorAll('a[href]'))
    .filter(isVisible)
    .map((a) => ({
      text: safeText(a, 60),
      href: (a as HTMLAnchorElement).href,
    }))
    .filter((l) => l.text.length > 0)
    .filter((l) => {
      if (seenHrefs.has(l.href)) return false;
      seenHrefs.add(l.href);
      return true;
    })
    .slice(0, MAX_LINKS);

  return {
    url: location.href,
    title: document.title,
    description,
    visibleText,
    truncated,
    headings,
    inputs,
    buttons,
    links,
  };
}

export type PageActionResult = {
  ok: boolean;
  action?: string;
  value?: string;
  error?: string;
};

function performActionFn(
  action: string,
  selector: string,
  value: string,
  label: string,
): PageActionResult {
  let el: Element | null = null;
  try {
    el = document.querySelector(selector);
  } catch {
    el = null;
  }

  // Fallback 1: text/aria-label/title match for click actions.
  // Includes role-based clickables (Google/Notion/etc use divs with role=option, menuitem)
  // and any [aria-label] / [title] element we then walk up to a clickable ancestor.
  if (!el && label && action === 'click') {
    const txt = label.trim().toLowerCase();
    const isVisible = (n: Element): boolean => {
      const h = n as HTMLElement;
      if (!h.getClientRects || h.getClientRects().length === 0) return false;
      const s = window.getComputedStyle(h);
      return (
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        s.opacity !== '0'
      );
    };
    const clickableSel =
      'a, button, [role="button"], [role="link"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"])';
    const candidates = Array.from(
      document.querySelectorAll(clickableSel),
    ).filter(isVisible);
    const attrEq = (c: Element, a: string) =>
      c.getAttribute(a)?.trim().toLowerCase() === txt;
    const attrIn = (c: Element, a: string) =>
      c.getAttribute(a)?.trim().toLowerCase().includes(txt);
    el =
      candidates.find((c) => attrEq(c, 'aria-label')) ??
      candidates.find((c) => attrEq(c, 'title')) ??
      candidates.find(
        (c) => c.textContent?.trim().toLowerCase() === txt,
      ) ??
      candidates.find((c) => attrIn(c, 'aria-label')) ??
      candidates.find((c) => attrIn(c, 'title')) ??
      candidates.find((c) =>
        c.textContent?.trim().toLowerCase().includes(txt),
      ) ??
      null;

    // Last resort: scan the WHOLE document for any element whose
    // aria-label/title matches, then walk up to the nearest clickable ancestor.
    if (!el) {
      const all = Array.from(
        document.querySelectorAll('[aria-label], [title]'),
      ).filter(isVisible);
      const hit =
        all.find(
          (c) =>
            attrEq(c, 'aria-label') ||
            attrEq(c, 'title'),
        ) ??
        all.find(
          (c) =>
            attrIn(c, 'aria-label') ||
            attrIn(c, 'title'),
        ) ??
        null;
      if (hit) {
        el = (hit.closest(clickableSel) as Element | null) ?? hit;
      }
    }
  }

  // Fallback 2: input matched by label or placeholder for fill actions
  if (!el && label && action === 'fill') {
    const txt = label.trim().toLowerCase();
    const labelEl = Array.from(document.querySelectorAll('label')).find((l) =>
      l.textContent?.trim().toLowerCase().includes(txt),
    );
    if (labelEl) {
      const forId = labelEl.getAttribute('for');
      if (forId) el = document.getElementById(forId);
      if (!el) el = labelEl.querySelector('input, textarea, select');
    }
    if (!el) {
      el = Array.from(
        document.querySelectorAll('input, textarea, select'),
      ).find(
        (i) =>
          i.getAttribute('placeholder')?.toLowerCase().includes(txt) ||
          i.getAttribute('aria-label')?.toLowerCase().includes(txt) ||
          i.getAttribute('name')?.toLowerCase().includes(txt),
      ) ?? null;
    }
  }

  if (!el) {
    return {
      ok: false,
      error: `Element not found by selector "${selector}" or label "${label}"`,
    };
  }

  const html = el as HTMLElement;
  if (action === 'click') {
    html.scrollIntoView({ behavior: 'instant', block: 'center' });

    // Prefer navigation when the target is (or wraps) an <a href>. Synthetic
    // clicks have isTrusted=false; many sites (Google, Notion) gate navigation
    // on trusted events. Direct location assignment bypasses that entirely.
    const anchor =
      html instanceof HTMLAnchorElement
        ? html
        : (html.closest('a[href]') as HTMLAnchorElement | null);
    if (anchor && anchor.href) {
      const target = anchor.target;
      if (target === '_blank' || target === 'new') {
        window.open(anchor.href, '_blank', 'noopener');
      } else {
        window.location.href = anchor.href;
      }
      return { ok: true, action: 'navigated', value: anchor.href };
    }

    // Google/Material/some React apps listen for pointerdown/mousedown rather
    // than click. Dispatch a full pointer→mouse→click sequence + native click().
    const rect = html.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts: PointerEventInit & MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: cx,
      clientY: cy,
      button: 0,
      pointerType: 'mouse',
    };
    try {
      html.dispatchEvent(new PointerEvent('pointerdown', opts));
      html.dispatchEvent(new MouseEvent('mousedown', opts));
      html.dispatchEvent(new PointerEvent('pointerup', opts));
      html.dispatchEvent(new MouseEvent('mouseup', opts));
    } catch {
      // PointerEvent unsupported in some test envs; ignore.
    }
    html.click();
    return { ok: true, action: 'clicked' };
  }
  if (action === 'fill') {
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement
    ) {
      html.scrollIntoView({ behavior: 'instant', block: 'center' });
      html.focus();
      // Use native value setter so React's controlled inputs pick up the change
      const proto =
        el instanceof HTMLInputElement
          ? window.HTMLInputElement.prototype
          : window.HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      html.blur();
      return { ok: true, action: 'filled', value };
    }
    if (el instanceof HTMLSelectElement) {
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, action: 'selected', value };
    }
    // contenteditable (X/Twitter composer, Slack, Discord, Notion-like editors)
    if (
      html.isContentEditable ||
      html.getAttribute('contenteditable') === 'true' ||
      html.getAttribute('role') === 'textbox'
    ) {
      html.scrollIntoView({ behavior: 'instant', block: 'center' });
      html.focus();
      // Place cursor at the end of any existing content
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(html);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        // ignore selection failure
      }
      // execCommand('insertText') triggers input/beforeinput events that
      // React frameworks (Draft.js, Lexical, ProseMirror) listen to.
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, value);
      } catch {
        inserted = false;
      }
      if (!inserted) {
        // Fallback: dispatch beforeinput + manual text insertion
        html.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: value,
          }),
        );
        html.textContent = (html.textContent ?? '') + value;
        html.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: value,
          }),
        );
      }
      return { ok: true, action: 'filled', value };
    }
    return { ok: false, error: 'Element not fillable' };
  }
  if (action === 'submit') {
    const form = html.closest('form');
    if (form) {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
      return { ok: true, action: 'submitted' };
    }
    return { ok: false, error: 'No ancestor form to submit' };
  }
  return { ok: false, error: `Unknown action: ${action}` };
}

export async function performPageAction(
  action: string,
  selector: string,
  value: string,
  label: string,
): Promise<PageActionResult> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return { ok: false, error: 'Cannot query active tab' };
  }
  if (!tab?.id) return { ok: false, error: 'No active tab' };
  if (
    tab.url &&
    (tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:'))
  ) {
    return { ok: false, error: 'Cannot interact with browser internal pages' };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: performActionFn,
      args: [action, selector, value, label],
    });
    const first = results[0];
    if (!first || first.result === undefined) {
      return { ok: false, error: 'Action returned no result' };
    }
    return first.result as PageActionResult;
  } catch (err) {
    return { ok: false, error: `executeScript failed: ${String(err)}` };
  }
}

function scrollAndExtractFn(
  direction: string,
  pixels: number | null,
  prevTextLen: number,
  doScroll: boolean,
): {
  ok: boolean;
  scrollY: number;
  scrollHeight: number;
  atBottom: boolean;
  newContent: string;
  totalTextLen: number;
} {
  if (doScroll) {
    if (direction === 'top') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } else if (direction === 'bottom') {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'instant' as ScrollBehavior,
      });
    } else if (typeof pixels === 'number' && Number.isFinite(pixels)) {
      window.scrollBy({ top: pixels, behavior: 'instant' as ScrollBehavior });
    } else if (direction === 'up') {
      window.scrollBy({
        top: -window.innerHeight * 0.85,
        behavior: 'instant' as ScrollBehavior,
      });
    } else {
      window.scrollBy({
        top: window.innerHeight * 0.85,
        behavior: 'instant' as ScrollBehavior,
      });
    }
  }
  const after = window.scrollY;
  const docH = document.documentElement.scrollHeight;
  const atBottom = after + window.innerHeight >= docH - 4;

  // Return only NEW text since last call. If page text grew, return the tail.
  const fullText = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
  const totalLen = fullText.length;
  const startIdx = Math.max(0, Math.min(prevTextLen, totalLen));
  let newContent = fullText.slice(startIdx);
  // Cap delta to keep per-call payload bounded
  const MAX_DELTA = 2000;
  if (newContent.length > MAX_DELTA) {
    newContent = newContent.slice(0, MAX_DELTA);
  }

  return {
    ok: true,
    scrollY: after,
    scrollHeight: docH,
    atBottom,
    newContent,
    totalTextLen: totalLen,
  };
}

export type ScrollResult = {
  ok: boolean;
  scrollY?: number;
  atBottom?: boolean;
  newContent?: string;
  totalTextLen?: number;
  scrollCount?: number;
  error?: string;
};

// Track per-tab text length so we only send NEW content each scroll call.
const lastTextLenByTab = new Map<number, number>();

const MAX_ALL_SCROLLS = 12;
const MAX_ACCUMULATED_BYTES = 6000;

export async function scrollAllAndCollect(): Promise<ScrollResult> {
  let accumulated = '';
  let lastResult: ScrollResult | null = null;
  let scrollCount = 0;

  for (let i = 0; i < MAX_ALL_SCROLLS; i++) {
    const r = await scrollActiveTab('down', null);
    lastResult = r;
    if (!r.ok) break;
    scrollCount++;
    if (r.newContent && r.newContent.length > 0) {
      accumulated += `\n---\n${r.newContent}`;
    }
    if (accumulated.length > MAX_ACCUMULATED_BYTES) break;
    if (r.atBottom) break;
    // No new content for 2 consecutive scrolls = page exhausted
    if (i > 0 && (!r.newContent || r.newContent.length === 0)) break;
  }

  return {
    ok: lastResult?.ok ?? false,
    scrollY: lastResult?.scrollY,
    atBottom: lastResult?.atBottom,
    newContent: accumulated.slice(0, MAX_ACCUMULATED_BYTES),
    totalTextLen: lastResult?.totalTextLen,
    scrollCount,
  };
}

export async function scrollActiveTab(
  direction: string,
  pixels: number | null,
): Promise<ScrollResult> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return { ok: false, error: 'Cannot query active tab' };
  }
  if (!tab?.id) return { ok: false, error: 'No active tab' };
  if (
    tab.url &&
    (tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:'))
  ) {
    return { ok: false, error: 'Cannot scroll browser internal pages' };
  }

  try {
    // Wait briefly BEFORE re-extracting so infinite-scroll content settles
    const prevLen = lastTextLenByTab.get(tab.id) ?? 0;
    // 1) Scroll
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrollAndExtractFn,
      args: [direction, pixels, prevLen, true],
    });
    // 2) Wait for infinite-scroll content to load
    await new Promise((r) => setTimeout(r, 700));
    // 3) Re-extract delta after content settled (no scroll this time)
    const finalResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrollAndExtractFn,
      args: [direction, pixels, prevLen, false],
    });
    const finalResult = finalResults[0]?.result;
    if (!finalResult) return { ok: false, error: 'Scroll returned no result' };
    lastTextLenByTab.set(tab.id, finalResult.totalTextLen);

    return {
      ok: true,
      scrollY: finalResult.scrollY,
      atBottom: finalResult.atBottom,
      newContent: finalResult.newContent,
      totalTextLen: finalResult.totalTextLen,
    };
  } catch (err) {
    return { ok: false, error: `executeScript failed: ${String(err)}` };
  }
}

export type Tweet = {
  author: string;
  handle: string;
  text: string;
  time: string;
  link: string | null;
  pinned: boolean;
  isRetweet: boolean;
  metrics: {
    replies: number | null;
    reposts: number | null;
    likes: number | null;
    views: number | null;
    bookmarks: number | null;
  };
};

function extractTweetsFn(): Tweet[] {
  // Parse counts from X's button aria-labels: "12 replies" / "1.2K reposts" / "45 Likes"
  const parseCount = (raw: string | null | undefined): number | null => {
    if (!raw) return null;
    const m = raw.match(/([\d,.]+)\s*([KMB]?)/i);
    if (!m) return null;
    const num = parseFloat((m[1] ?? '').replace(/,/g, ''));
    if (Number.isNaN(num)) return null;
    const suffix = (m[2] ?? '').toUpperCase();
    if (suffix === 'K') return Math.round(num * 1000);
    if (suffix === 'M') return Math.round(num * 1_000_000);
    if (suffix === 'B') return Math.round(num * 1_000_000_000);
    return Math.round(num);
  };

  const getMetric = (a: Element, testid: string): number | null => {
    const btn = a.querySelector(`[data-testid="${testid}"]`);
    if (!btn) return null;
    const aria = btn.getAttribute('aria-label');
    return parseCount(aria);
  };

  const tweets: Tweet[] = [];
  const articles = document.querySelectorAll(
    'article[role="article"], article[data-testid="tweet"], [data-testid="cellInnerDiv"] article',
  );
  const seen = new Set<string>();
  for (const a of articles) {
    // Skip promoted/ad tweets
    if (a.querySelector('[data-testid="placementTracking"]')) continue;

    const textEl = a.querySelector('[data-testid="tweetText"]');
    const text = (textEl?.textContent ?? '').replace(/\s+/g, ' ').trim();
    // We allow empty-text tweets (image-only / video-only / pure retweet)
    // but require at least an author or time signal so we know it's a tweet.

    const userNameContainer = a.querySelector('[data-testid="User-Name"]');
    const userText = (userNameContainer?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    let author = userText;
    let handle = '';
    const handleMatch = userText.match(/@([A-Za-z0-9_]+)/);
    if (handleMatch) {
      handle = `@${handleMatch[1]}`;
      author = userText.split('@')[0]?.trim() ?? '';
    }

    const timeEl = a.querySelector('time');
    const time = timeEl?.getAttribute('datetime') ?? '';

    if (!text && !handle && !time) continue; // not a real tweet article

    const linkEl = a.querySelector('a[href*="/status/"]') as
      | HTMLAnchorElement
      | null;
    const link = linkEl?.href ?? null;

    // Pinned indicator: socialContext span with "Pinned" text
    const socialCtx =
      a.querySelector('[data-testid="socialContext"]')?.textContent ?? '';
    const pinned = /pinned/i.test(socialCtx);
    const isRetweet = /reposted|retweeted/i.test(socialCtx);

    // Metrics from aria-labels of action buttons
    const replies = getMetric(a, 'reply');
    const reposts = getMetric(a, 'retweet');
    const likes = getMetric(a, 'like') ?? getMetric(a, 'unlike');
    const bookmarks =
      getMetric(a, 'bookmark') ?? getMetric(a, 'removeBookmark');

    // View count: in the analytics link's aria-label or text content
    const analyticsLink = a.querySelector(
      'a[href*="/analytics"], [data-testid="analytics"]',
    );
    const views = analyticsLink
      ? parseCount(
          analyticsLink.getAttribute('aria-label') ??
            analyticsLink.textContent,
        )
      : null;

    const dedupeKey = link ?? `${handle}|${text.slice(0, 80)}|${time}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    tweets.push({
      author: author.slice(0, 60),
      handle,
      text: text.length > 500 ? `${text.slice(0, 500)}…` : text,
      time,
      link,
      pinned,
      isRetweet,
      metrics: { replies, reposts, likes, views, bookmarks },
    });
  }
  return tweets.slice(0, 30);
}

// X macro: post a tweet end-to-end as a single page-world script.
// Self-contained — runs entirely in the page so React state updates correctly
// without bouncing through pageAction multiple times. executeScript supports
// async functions and awaits the returned promise.
async function xPostTweetFn(
  text: string,
): Promise<{ ok: boolean; step: string; error?: string }> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Find the closest mounted compose form. Returns BOTH the textarea and its
  // matching post button so we never mix inline + modal selectors. On home
  // page, the inline composer at top is `tweetButtonInline`; in the modal
  // (after clicking SideNav New Tweet), it's `tweetButton`. Picking the
  // wrong one leaves a stray modal open after submit.
  const findComposer = (): {
    textarea: HTMLElement | null;
    postBtn: HTMLElement | null;
    kind: 'modal' | 'inline' | null;
  } => {
    // Modal takes precedence — if it's open we're committed to it
    const modalRoot = document.querySelector(
      '[role="dialog"][aria-labelledby] [data-testid="tweetTextarea_0"], [aria-modal="true"] [data-testid="tweetTextarea_0"]',
    );
    if (modalRoot) {
      const modal = modalRoot.closest(
        '[role="dialog"], [aria-modal="true"]',
      );
      const textarea =
        (modalRoot as HTMLElement) ??
        (modal?.querySelector(
          '[data-testid="tweetTextarea_0"]',
        ) as HTMLElement | null);
      const postBtn = modal?.querySelector(
        'button[data-testid="tweetButton"]',
      ) as HTMLElement | null;
      return { textarea, postBtn, kind: 'modal' };
    }
    // Otherwise use the inline composer if present (home page top)
    const inlineTextarea = document.querySelector(
      '[data-testid="tweetTextarea_0"]',
    ) as HTMLElement | null;
    if (inlineTextarea) {
      const inlinePostBtn = document.querySelector(
        'button[data-testid="tweetButtonInline"]',
      ) as HTMLElement | null;
      return {
        textarea: inlineTextarea,
        postBtn: inlinePostBtn,
        kind: 'inline',
      };
    }
    return { textarea: null, postBtn: null, kind: null };
  };

  try {
    // Step 1: ensure a composer is mounted — only click the SideNav button
    // if NEITHER the inline composer nor a modal is already present.
    let composer = findComposer();
    if (!composer.textarea) {
      const composeBtn = (document.querySelector(
        'a[data-testid="SideNav_NewTweet_Button"]',
      ) ??
        document.querySelector('a[href="/compose/post"]') ??
        document.querySelector(
          '[data-testid="SideNav_NewTweet_Button"]',
        )) as HTMLElement | null;
      if (composeBtn) composeBtn.click();
      // Wait up to 3s for the composer (modal) to render
      for (let i = 0; i < 30; i++) {
        await sleep(100);
        composer = findComposer();
        if (composer.textarea) break;
      }
    }
    if (!composer.textarea) {
      return {
        ok: false,
        step: 'open-compose',
        error: 'Compose textarea did not render after 3s',
      };
    }

    // Step 2: focus + insert text. Draft.js (X's editor) handles `\n`
    // unreliably inside a single execCommand('insertText') call — newlines
    // can be swallowed or trigger spurious state changes. Split on \n and
    // insert each line individually with explicit paragraph breaks between.
    const textarea = composer.textarea;
    textarea.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textarea);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      // ignore selection errors
    }

    const insertLine = (line: string): boolean => {
      if (line.length === 0) return true;
      let ok = false;
      try {
        ok = document.execCommand('insertText', false, line);
      } catch {
        ok = false;
      }
      if (!ok) {
        textarea.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: line,
          }),
        );
        textarea.textContent = (textarea.textContent ?? '') + line;
        textarea.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: line,
          }),
        );
      }
      return true;
    };

    const insertParagraphBreak = () => {
      // Try `insertParagraph` first (proper paragraph), fall back to
      // `insertLineBreak` (soft <br>), then to keyboard Enter event.
      let ok = false;
      try {
        ok = document.execCommand('insertParagraph');
      } catch {
        ok = false;
      }
      if (ok) return;
      try {
        ok = document.execCommand('insertLineBreak');
      } catch {
        ok = false;
      }
      if (ok) return;
      // Last resort: synthesize Enter key. Inside compose modal, Enter
      // adds a paragraph break — Cmd+Enter is what submits.
      const opts = {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      } as KeyboardEventInit;
      textarea.dispatchEvent(new KeyboardEvent('keydown', opts));
      textarea.dispatchEvent(new KeyboardEvent('keypress', opts));
      textarea.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertParagraph',
        }),
      );
      textarea.dispatchEvent(new KeyboardEvent('keyup', opts));
    };

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) insertParagraphBreak();
      const line = lines[i];
      if (line) insertLine(line);
    }
    // Tiny pause so the editor's React state catches up before we look
    // for the (now-enabled) Post button.
    await sleep(50);

    // Step 3: wait for the SAME-KIND post button (inline OR modal) to enable.
    // Mixing kinds is what caused the leftover-modal bug.
    let postBtn: HTMLElement | null = null;
    for (let i = 0; i < 30; i++) {
      const c = findComposer();
      if (
        c.kind === composer.kind &&
        c.postBtn &&
        !c.postBtn.hasAttribute('disabled')
      ) {
        postBtn = c.postBtn;
        break;
      }
      await sleep(100);
    }
    if (!postBtn) {
      return {
        ok: false,
        step: 'find-post-button',
        error:
          'Post button not enabled after 3s — text may not have registered',
      };
    }
    postBtn.click();
    return { ok: true, step: `posted-via-${composer.kind}` };
  } catch (e) {
    return { ok: false, step: 'unknown', error: String(e) };
  }
}

export async function xPostTweet(text: string): Promise<{
  ok: boolean;
  step?: string;
  error?: string;
}> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return { ok: false, error: 'Cannot query active tab' };
  }
  if (!tab?.id) return { ok: false, error: 'No active tab' };
  if (
    !tab.url ||
    (!tab.url.includes('x.com') && !tab.url.includes('twitter.com'))
  ) {
    return { ok: false, error: 'xPostTweet only works on x.com / twitter.com' };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: xPostTweetFn,
      args: [text],
      world: 'MAIN',
    });
    const r = results[0]?.result as
      | { ok: boolean; step?: string; error?: string }
      | undefined;
    if (!r) return { ok: false, error: 'Macro returned no result' };
    return r;
  } catch (e) {
    return { ok: false, error: `executeScript failed: ${String(e)}` };
  }
}

// X macro: like a tweet by URL or, if already on a tweet page, the visible one.
function xLikeTweetFn(): { ok: boolean; error?: string } {
  // Try main tweet's like button (data-testid="like" or "unlike")
  const btn = (document.querySelector('button[data-testid="like"]') ??
    document.querySelector('button[data-testid="unlike"]')) as
    | HTMLElement
    | null;
  if (!btn) return { ok: false, error: 'Like button not found' };
  // If already liked (testid is "unlike"), don't toggle off
  if (btn.getAttribute('data-testid') === 'unlike') {
    return { ok: true, error: 'already liked' };
  }
  btn.click();
  return { ok: true };
}

// X macro: reply to the visible tweet with given text. Must be on a tweet
// permalink page (/.../status/<id>) where the reply box is visible inline.
async function xReplyTweetFn(
  text: string,
): Promise<{ ok: boolean; step: string; error?: string }> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    // Reply box on permalink is the same tweetTextarea_0 selector but already
    // mounted (no compose-button click needed). If not present, click reply
    // button on the main tweet.
    let textarea = document.querySelector(
      'div[data-testid="tweetTextarea_0"]',
    ) as HTMLElement | null;
    if (!textarea) {
      const replyBtn = document.querySelector(
        'button[data-testid="reply"]',
      ) as HTMLElement | null;
      if (replyBtn) replyBtn.click();
      for (let i = 0; i < 30; i++) {
        textarea = document.querySelector(
          'div[data-testid="tweetTextarea_0"]',
        );
        if (textarea) break;
        await sleep(100);
      }
    }
    if (!textarea) {
      return {
        ok: false,
        step: 'open-reply',
        error: 'Reply textarea not found',
      };
    }
    textarea.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textarea);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      // ignore
    }
    // Insert line-by-line so Draft.js handles \n via insertParagraph
    // instead of choking on embedded newlines (causes lost text).
    const insertLineRep = (line: string): void => {
      if (line.length === 0) return;
      let ok = false;
      try {
        ok = document.execCommand('insertText', false, line);
      } catch {
        ok = false;
      }
      if (!ok) {
        textarea.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: line,
          }),
        );
        textarea.textContent = (textarea.textContent ?? '') + line;
        textarea.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: line,
          }),
        );
      }
    };
    const insertParagraphRep = (): void => {
      try {
        if (document.execCommand('insertParagraph')) return;
      } catch {
        // ignore
      }
      try {
        if (document.execCommand('insertLineBreak')) return;
      } catch {
        // ignore
      }
      const opts = {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      } as KeyboardEventInit;
      textarea.dispatchEvent(new KeyboardEvent('keydown', opts));
      textarea.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertParagraph',
        }),
      );
      textarea.dispatchEvent(new KeyboardEvent('keyup', opts));
    };
    const replyLines = text.split('\n');
    for (let i = 0; i < replyLines.length; i++) {
      if (i > 0) insertParagraphRep();
      const ln = replyLines[i];
      if (ln) insertLineRep(ln);
    }
    await sleep(50);
    let postBtn: HTMLElement | null = null;
    for (let i = 0; i < 30; i++) {
      const candidates = [
        'button[data-testid="tweetButtonInline"]',
        'button[data-testid="tweetButton"]',
      ];
      for (const sel of candidates) {
        const b = document.querySelector(sel) as HTMLElement | null;
        if (b && !b.hasAttribute('disabled')) {
          postBtn = b;
          break;
        }
      }
      if (postBtn) break;
      await sleep(100);
    }
    if (!postBtn) {
      return {
        ok: false,
        step: 'find-reply-button',
        error: 'Reply button not enabled',
      };
    }
    postBtn.click();
    return { ok: true, step: 'replied' };
  } catch (e) {
    return { ok: false, step: 'unknown', error: String(e) };
  }
}

export async function xReplyTweet(text: string): Promise<{
  ok: boolean;
  step?: string;
  error?: string;
}> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return { ok: false, error: 'Cannot query active tab' };
  }
  if (!tab?.id) return { ok: false, error: 'No active tab' };
  if (
    !tab.url ||
    (!tab.url.includes('x.com') && !tab.url.includes('twitter.com'))
  ) {
    return { ok: false, error: 'xReplyTweet only works on x.com / twitter.com' };
  }
  if (!/\/status\//.test(tab.url)) {
    return {
      ok: false,
      error: 'Must be on a tweet permalink page (/...status/...)',
    };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: xReplyTweetFn,
      args: [text],
      world: 'MAIN',
    });
    const r = results[0]?.result as
      | { ok: boolean; step?: string; error?: string }
      | undefined;
    return r ?? { ok: false, error: 'Macro returned no result' };
  } catch (e) {
    return { ok: false, error: `executeScript failed: ${String(e)}` };
  }
}

// X macro: retweet (repost) the visible tweet. Two clicks: retweet icon then
// "Repost" confirmation in the popup menu.
async function xRetweetTweetFn(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const btn = (document.querySelector(
    'button[data-testid="retweet"]',
  ) ?? document.querySelector('button[data-testid="unretweet"]')) as
    | HTMLElement
    | null;
  if (!btn) return { ok: false, error: 'Retweet button not found' };
  if (btn.getAttribute('data-testid') === 'unretweet') {
    return { ok: true, error: 'already retweeted' };
  }
  btn.click();
  // X opens a small menu with "Repost" and "Quote". Click "Repost".
  for (let i = 0; i < 20; i++) {
    const confirm = document.querySelector(
      '[data-testid="retweetConfirm"]',
    ) as HTMLElement | null;
    if (confirm) {
      confirm.click();
      return { ok: true };
    }
    await sleep(100);
  }
  return { ok: false, error: 'Repost confirmation menu did not appear' };
}

export async function xRetweetTweet(): Promise<{
  ok: boolean;
  error?: string;
}> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return { ok: false, error: 'Cannot query active tab' };
  }
  if (!tab?.id) return { ok: false, error: 'No active tab' };
  if (
    !tab.url ||
    (!tab.url.includes('x.com') && !tab.url.includes('twitter.com'))
  ) {
    return { ok: false, error: 'xRetweetTweet only works on x.com' };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: xRetweetTweetFn,
      args: [],
      world: 'MAIN',
    });
    return (
      (results[0]?.result as { ok: boolean; error?: string }) ?? {
        ok: false,
        error: 'No result',
      }
    );
  } catch (e) {
    return { ok: false, error: `executeScript failed: ${String(e)}` };
  }
}

// Read tool: extract the focused tweet on a permalink page (the one whose
// status URL matches the page URL). Returns the same shape as extractTweets.
function xExtractCurrentTweetFn(): Tweet | null {
  // Reuse extractTweetsFn-style logic but pick only the article whose status
  // link matches location.pathname.
  const wanted = location.pathname;
  const articles = document.querySelectorAll(
    'article[role="article"], article[data-testid="tweet"]',
  );
  for (const a of articles) {
    const link = a.querySelector('a[href*="/status/"]') as
      | HTMLAnchorElement
      | null;
    if (!link) continue;
    try {
      const u = new URL(link.href);
      if (u.pathname !== wanted) continue;
    } catch {
      continue;
    }
    const textEl = a.querySelector('[data-testid="tweetText"]');
    const text = (textEl?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const userNameContainer = a.querySelector('[data-testid="User-Name"]');
    const userText = (userNameContainer?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    let author = userText;
    let handle = '';
    const handleMatch = userText.match(/@([A-Za-z0-9_]+)/);
    if (handleMatch) {
      handle = `@${handleMatch[1]}`;
      author = userText.split('@')[0]?.trim() ?? '';
    }
    const timeEl = a.querySelector('time');
    const time = timeEl?.getAttribute('datetime') ?? '';
    const parseCount = (raw: string | null | undefined): number | null => {
      if (!raw) return null;
      const m = raw.match(/([\d,.]+)\s*([KMB]?)/i);
      if (!m) return null;
      const num = parseFloat((m[1] ?? '').replace(/,/g, ''));
      if (Number.isNaN(num)) return null;
      const suffix = (m[2] ?? '').toUpperCase();
      if (suffix === 'K') return Math.round(num * 1000);
      if (suffix === 'M') return Math.round(num * 1_000_000);
      if (suffix === 'B') return Math.round(num * 1_000_000_000);
      return Math.round(num);
    };
    const getMetric = (testid: string): number | null => {
      const btn = a.querySelector(`[data-testid="${testid}"]`);
      if (!btn) return null;
      return parseCount(btn.getAttribute('aria-label'));
    };
    return {
      author: author.slice(0, 60),
      handle,
      text: text.length > 800 ? `${text.slice(0, 800)}…` : text,
      time,
      link: link.href,
      pinned: false,
      isRetweet: false,
      metrics: {
        replies: getMetric('reply'),
        reposts: getMetric('retweet') ?? getMetric('unretweet'),
        likes: getMetric('like') ?? getMetric('unlike'),
        bookmarks: getMetric('bookmark') ?? getMetric('removeBookmark'),
        views: null,
      },
    };
  }
  return null;
}

export async function xExtractCurrentTweet(): Promise<{
  ok: boolean;
  tweet?: Tweet;
  error?: string;
}> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return { ok: false, error: 'Cannot query active tab' };
  }
  if (!tab?.id) return { ok: false, error: 'No active tab' };
  if (
    !tab.url ||
    (!tab.url.includes('x.com') && !tab.url.includes('twitter.com'))
  ) {
    return {
      ok: false,
      error: 'xExtractCurrentTweet only works on x.com',
    };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: xExtractCurrentTweetFn,
    });
    const tweet = results[0]?.result as Tweet | null | undefined;
    if (!tweet) return { ok: false, error: 'No focused tweet detected' };
    return { ok: true, tweet };
  } catch (e) {
    return { ok: false, error: `executeScript failed: ${String(e)}` };
  }
}

export async function xLikeTweet(): Promise<{ ok: boolean; error?: string }> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return { ok: false, error: 'Cannot query active tab' };
  }
  if (!tab?.id) return { ok: false, error: 'No active tab' };
  if (
    !tab.url ||
    (!tab.url.includes('x.com') && !tab.url.includes('twitter.com'))
  ) {
    return { ok: false, error: 'xLikeTweet only works on x.com / twitter.com' };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: xLikeTweetFn,
    });
    const r = results[0]?.result as
      | { ok: boolean; error?: string }
      | undefined;
    return r ?? { ok: false, error: 'Macro returned no result' };
  } catch (e) {
    return { ok: false, error: `executeScript failed: ${String(e)}` };
  }
}

export async function extractTweetsFromActiveTab(): Promise<{
  ok: boolean;
  tweets?: Tweet[];
  error?: string;
}> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return { ok: false, error: 'Cannot query active tab' };
  }
  if (!tab?.id) return { ok: false, error: 'No active tab' };
  if (
    !tab.url ||
    (!tab.url.includes('x.com') && !tab.url.includes('twitter.com'))
  ) {
    return { ok: false, error: 'extractTweets only works on x.com / twitter.com' };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractTweetsFn,
    });
    const tweets = results[0]?.result;
    if (!tweets) return { ok: false, error: 'Extractor returned no result' };
    return { ok: true, tweets };
  } catch (err) {
    return { ok: false, error: `executeScript failed: ${String(err)}` };
  }
}

export async function readActiveTabDom(): Promise<DomSnapshot | null> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return null;
  }
  if (!tab?.id) return null;
  if (
    tab.url &&
    (tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('arc://'))
  ) {
    return null;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractDomFn,
    });
    const first = results[0];
    if (!first || !first.result) return null;
    return first.result as DomSnapshot;
  } catch (err) {
    console.warn('[dom-bridge] executeScript failed', err);
    return null;
  }
}

// Run a site-specific DOM extractor function in the page world via
// chrome.scripting.executeScript. The function MUST be self-contained — no
// closures over module variables, no imports — because it gets serialized.
export async function runCustomExtractor<T>(
  fn: () => T,
): Promise<T | null> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return null;
  }
  if (!tab?.id) return null;
  if (
    tab.url &&
    (tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('arc://'))
  ) {
    return null;
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fn,
    });
    const first = results[0];
    if (!first) return null;
    return (first.result ?? null) as T | null;
  } catch (err) {
    console.warn('[dom-bridge] custom extractor failed', err);
    return null;
  }
}

// Returns the live, fully-rendered HTML of the page (post-JS hydration).
// This is the actual DOM serialized — different from view-source which shows
// the original server response. Includes shadow-host elements but NOT shadow
// roots' contents (those need recursive walk; out of scope for now).
function extractRawHtmlFn(): {
  url: string;
  title: string;
  doctype: string;
  html: string;
} {
  const dt = document.doctype;
  const doctype = dt
    ? `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''}${
        dt.systemId ? ` "${dt.systemId}"` : ''
      }>`
    : '';
  return {
    url: location.href,
    title: document.title,
    doctype,
    html: document.documentElement.outerHTML,
  };
}

export type RawHtmlSnapshot = {
  url: string;
  title: string;
  doctype: string;
  html: string;
};

export async function readActiveTabHtml(): Promise<RawHtmlSnapshot | null> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    return null;
  }
  if (!tab?.id) return null;
  if (
    tab.url &&
    (tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('arc://'))
  ) {
    return null;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractRawHtmlFn,
    });
    const first = results[0];
    if (!first || !first.result) return null;
    return first.result as RawHtmlSnapshot;
  } catch (err) {
    console.warn('[dom-bridge] executeScript html failed', err);
    return null;
  }
}
