// Content script — runs in every web page, idle until popup asks for DOM snapshot.

console.log(
  '[browser-agent content] booted on',
  location.hostname,
  new Date().toISOString(),
);

const MAX_TEXT_BYTES = 6000;
const MAX_HEADINGS = 30;
const MAX_INPUTS = 25;
const MAX_BUTTONS = 25;
const MAX_LINKS = 30;

type DomSnapshot = {
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

function safeText(el: Element | null, max = 100): string {
  if (!el) return '';
  const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function buildSelector(el: Element, idx: number): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  const dataTestId = el.getAttribute('data-testid');
  if (dataTestId) return `${tag}[data-testid="${CSS.escape(dataTestId)}"]`;
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
  const name = el.getAttribute('name');
  if (name) return `${tag}[name="${CSS.escape(name)}"]`;
  // Fall back to nth-of-type within parent
  return `${tag}:nth-of-type(${idx + 1})`;
}

function getLabelFor(input: HTMLElement): string | null {
  const id = input.id;
  if (id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (lbl) return safeText(lbl, 80);
  }
  const parentLabel = input.closest('label');
  if (parentLabel) return safeText(parentLabel, 80);
  const ariaLabel = input.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.slice(0, 80);
  return null;
}

function isVisible(el: Element): boolean {
  const html = el as HTMLElement;
  if (!html.offsetParent && html.tagName !== 'BODY') {
    // Some elements (e.g. position:fixed) have no offsetParent but are visible
    const style = window.getComputedStyle(html);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) {
      return false;
    }
  }
  return true;
}

function extractDom(): DomSnapshot {
  const meta = document.querySelector('meta[name="description"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  const description =
    meta?.getAttribute('content') ?? ogDesc?.getAttribute('content') ?? null;

  const rawText = (document.body?.innerText ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const truncated = rawText.length > MAX_TEXT_BYTES;
  const visibleText = truncated
    ? rawText.slice(0, MAX_TEXT_BYTES)
    : rawText;

  const headings = Array.from(
    document.querySelectorAll('h1, h2, h3'),
  )
    .filter(isVisible)
    .slice(0, MAX_HEADINGS)
    .map((h) => ({ tag: h.tagName.toLowerCase(), text: safeText(h, 120) }))
    .filter((h) => h.text.length > 0);

  const inputs = Array.from(
    document.querySelectorAll('input, select, textarea'),
  )
    .filter((el) => isVisible(el) && (el as HTMLInputElement).type !== 'password')
    .slice(0, MAX_INPUTS)
    .map((el, idx) => {
      const html = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const type = (html as HTMLInputElement).type ?? 'text';
      return {
        tag: html.tagName.toLowerCase(),
        type,
        name: html.getAttribute('name'),
        placeholder: html.getAttribute('placeholder'),
        value: type === 'password' ? null : (html.value ?? null),
        label: getLabelFor(html),
        selector: buildSelector(html, idx),
      };
    });

  const buttons = Array.from(
    document.querySelectorAll('button, [role="button"]'),
  )
    .filter(isVisible)
    .slice(0, MAX_BUTTONS)
    .map((b, idx) => ({
      text: safeText(b, 60),
      ariaLabel: b.getAttribute('aria-label'),
      selector: buildSelector(b, idx),
    }))
    .filter((b) => b.text.length > 0 || b.ariaLabel);

  const links = Array.from(document.querySelectorAll('a[href]'))
    .filter(isVisible)
    .slice(0, MAX_LINKS)
    .map((a) => ({
      text: safeText(a, 60),
      href: (a as HTMLAnchorElement).href,
    }))
    .filter((l) => l.text.length > 0);

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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (
    msg &&
    typeof msg === 'object' &&
    'type' in msg &&
    (msg as { type: unknown }).type === 'READ_PAGE'
  ) {
    try {
      const snapshot = extractDom();
      sendResponse({ ok: true, snapshot });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  return false;
});
