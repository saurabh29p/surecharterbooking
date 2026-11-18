import MarkdownIt from 'markdown-it';
import type { PlaceholderDef } from '@shubhjets/shared';
import { esc } from './brand.js';

// Raw HTML in templates is shown as text, never run; links are not auto-created.
const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });

export interface PlaceholderValues {
  /** Plain-text values; null or empty = missing. */
  text: Record<string, string | null | undefined>;
  /** Ready-made, already-escaped HTML for table placeholders. */
  blocks: Record<string, string | null | undefined>;
}

export interface RenderedTemplate {
  html: string;
  /** Labels of the placeholders that had no value. */
  missing: string[];
}

const PLACEHOLDER_RE = /\{\{\s*([a-z_.]+)\s*\}\}/g;

/**
 * Markdown → HTML with {{placeholders}} filled in. Placeholders become inert tokens before the
 * Markdown is rendered and are replaced afterwards, so values are always escaped and can never
 * change the document's structure. A missing value is shown as a red "[Label]" mark.
 */
export function renderTemplate(
  body: string,
  defs: readonly PlaceholderDef[],
  values: PlaceholderValues,
): RenderedTemplate {
  const tokens: Array<{ token: string; key: string }> = [];
  const src = body.replace(PLACEHOLDER_RE, (_m, key: string) => {
    const token = `SJPH${String(tokens.length).padStart(5, '0')}X`;
    tokens.push({ token, key });
    return token;
  });
  let html = md.render(src);
  const missing = new Set<string>();
  for (const { token, key } of tokens) {
    const def = defs.find((d) => d.key === key);
    const label = def?.label ?? key;
    const mark = `<span class="missing">[${esc(label)}]</span>`;
    if (def?.block) {
      const block = values.blocks[key];
      if (!block) missing.add(label);
      // A block placeholder stands alone, so markdown wrapped it in a paragraph.
      const out = block ?? `<p>${mark}</p>`;
      html = html.includes(`<p>${token}</p>`)
        ? html.replace(`<p>${token}</p>`, () => out)
        : html.replace(token, () => block ?? mark);
    } else {
      const v = values.text[key];
      if (v === null || v === undefined || v.trim() === '') {
        missing.add(label);
        html = html.replace(token, () => mark);
      } else {
        const text = esc(v.trim()).replace(/\n+/g, '<br>');
        html = html.replace(token, () => text);
      }
    }
  }
  return { html, missing: [...missing] };
}
