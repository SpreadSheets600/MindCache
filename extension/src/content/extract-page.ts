import Defuddle from 'defuddle';

export interface PageExtraction {
  title: string;
  author: string;
  description: string;
  content: string;
  contentHtml: string;
  published: string;
  site: string;
  language: string;
  image: string;
  favicon: string;
  wordCount: number;
  schemaOrgData: any;
  metaTags: Array<{ name?: string; property?: string; content: string }>;
  fullHtml: string;
  selection?: string;
  selectionHtml?: string;
  highlights?: Array<{ text: string; content: string; xpath: string }>;
}

const EXCLUDED_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'noscript'];
const BLACKLISTED_PATHS = [
  '/login', '/signup', '/register', '/logout', '/reset-password',
  '/forgot-password', '/subscribe', '/pricing', '/checkout', '/cart',
  '/wp-admin', '/admin', '/login/', '/signup/', '/register/',
  '/auth', '/auth/', '/signin', '/sign-in', '/log-in', '/oauth',
  '/oauth/', '/authorize', '/authenticate', '/sessions',
  '/accounts/login', '/account/login', '/accounts/signup',
  '/password-reset', '/email-verify', '/verify-email',
  '/2fa', '/mfa', '/otp', '/consent',
];

function isBlacklistedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    return BLACKLISTED_PATHS.some(p => path === p || path.startsWith(p + '/'));
  } catch {
    return false;
  }
}

async function flattenShadowDom(doc: Document): Promise<void> {
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_ELEMENT, null);
  const nodes: Element[] = [];
  let node: Element | null;
  while ((node = walker.nextNode() as Element | null)) {
    if (node.shadowRoot) nodes.push(node);
  }
  await Promise.all(nodes.map(async (el) => {
    try {
      if (el.shadowRoot) {
        const flat = el.shadowRoot.innerHTML;
        el.innerHTML = flat;
      }
    } catch {
      // Some shadow roots can't be accessed cross-origin
    }
  }));
}

function removeNoiseElements(doc: Document): void {
  EXCLUDED_TAGS.forEach(tag => {
    doc.querySelectorAll(tag).forEach(el => el.remove());
  });
  doc.querySelectorAll('[role="navigation"], [role="banner"], [role="contentinfo"]').forEach(el => el.remove());
  doc.querySelectorAll('.sidebar, .side-bar, .nav, .navbar, .footer, .cookie').forEach(el => {
    if (typeof el.className === 'string' && (el.className.includes('sidebar') || el.className.includes('nav') || el.className.includes('footer'))) {
      el.remove();
    }
  });
}

function makeUrlsAbsolute(doc: Document): void {
  const base = document.baseURI;
  doc.querySelectorAll('[src], [href]').forEach(el => {
    ['src', 'href', 'srcset'].forEach(attr => {
      const val = el.getAttribute(attr);
      if (!val) return;
      if (attr === 'srcset') {
        const updated = val.split(',').map(part => {
          const [urlPart, ...rest] = part.trim().split(' ');
          try {
            return `${new URL(urlPart, base).href} ${rest.join(' ')}`.trim();
          } catch { return part; }
        }).join(', ');
        el.setAttribute(attr, updated);
      } else if (!val.startsWith('http') && !val.startsWith('data:') && !val.startsWith('#') && !val.startsWith('//')) {
        try { el.setAttribute(attr, new URL(val, base).href); } catch {}
      }
    });
  });
}

function getFavicon(): string {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (link && link.href) return link.href;
  return `${location.origin}/favicon.ico`;
}

function htmlToPlainText(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}

function getSelectionHtml(): string {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return '';
  const range = sel.getRangeAt(0);
  const fragment = range.cloneContents();
  const temp = document.createElement('div');
  temp.appendChild(fragment);
  return temp.innerHTML;
}

function getStoredHighlights(): Array<{ text: string; content: string; xpath: string }> {
  try {
    const raw = localStorage.getItem('mindcache-highlights');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function extractCurrentPage(): Promise<PageExtraction> {
  await flattenShadowDom(document);

  const extractDoc = document.cloneNode(true) as Document;
  removeNoiseElements(extractDoc);
  makeUrlsAbsolute(extractDoc);

  const defuddle = new Defuddle(extractDoc, { url: location.href });

  let result: any;
  try {
    const parseTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('parseAsync timeout')), 8000)
    );
    result = await Promise.race([defuddle.parseAsync(), parseTimeout]);
  } catch {
    result = defuddle.parse();
  }

  const contentHtml = result.content || '';
  const content = htmlToPlainText(contentHtml);

  const metaTags = (result.metaTags || [])
    .filter((tag: any) => tag.content != null)
    .map((tag: any) => {
      const cleaned: { name?: string; property?: string; content: string } = { content: String(tag.content) };
      if (tag.name) cleaned.name = String(tag.name);
      if (tag.property) cleaned.property = String(tag.property);
      return cleaned;
    });

  let schemaOrgData: any = null;
  if (result.schemaOrgData && typeof result.schemaOrgData === 'object' && !Array.isArray(result.schemaOrgData)) {
    schemaOrgData = result.schemaOrgData;
  }

  const highlights = getStoredHighlights().filter(
    (h) => h.text != null && h.content != null && h.xpath != null
  );

  const fullDoc = document.cloneNode(true) as Document;
  fullDoc.querySelectorAll('script, style, noscript').forEach(el => el.remove());
  fullDoc.querySelectorAll('*').forEach(el => el.removeAttribute('style'));
  makeUrlsAbsolute(fullDoc);
  const cleanedFullHtml = fullDoc.documentElement.outerHTML;

  return {
    title: result.title || document.title,
    author: result.author || '',
    description: result.description || '',
    content,
    contentHtml,
    published: result.published || '',
    site: result.site || '',
    language: result.language || '',
    image: result.image || '',
    favicon: getFavicon(),
    wordCount: result.wordCount || 0,
    schemaOrgData,
    metaTags,
    fullHtml: cleanedFullHtml,
    selection: htmlToPlainText(getSelectionHtml()) || undefined,
    selectionHtml: getSelectionHtml() || undefined,
    highlights,
  };
}

export { isBlacklistedUrl };
