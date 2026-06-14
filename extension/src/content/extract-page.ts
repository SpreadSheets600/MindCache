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
  const defuddle = new Defuddle(document, { url: location.href });
  const result = await defuddle.parseAsync();

  const contentHtml = result.content || '';
  const content = htmlToPlainText(contentHtml);

  const metaTags = (result.metaTags || [])
    .filter((tag) => tag.content != null)
    .map((tag) => {
      const cleaned: { name?: string; property?: string; content: string } = { content: tag.content ?? '' };
      if (tag.name) cleaned.name = tag.name;
      if (tag.property) cleaned.property = tag.property;
      return cleaned;
    });

  let schemaOrgData: any = null;
  if (result.schemaOrgData && typeof result.schemaOrgData === 'object' && !Array.isArray(result.schemaOrgData)) {
    schemaOrgData = result.schemaOrgData;
  }

  const highlights = getStoredHighlights().filter(
    (h) => h.text != null && h.content != null && h.xpath != null
  );

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
    fullHtml: document.documentElement.outerHTML,
    selection: htmlToPlainText(getSelectionHtml()) || undefined,
    selectionHtml: getSelectionHtml() || undefined,
    highlights,
  };
}
