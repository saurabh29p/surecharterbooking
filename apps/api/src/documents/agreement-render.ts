import {
  AGREEMENT_LABELS,
  DRAFT_WATERMARK,
  PLACEHOLDERS,
  type AgreementKind,
} from '@shubhjets/shared';
import { documentHtml } from './brand.js';
import { renderTemplate, type PlaceholderValues } from './markdown.js';

export interface AgreementRenderInput {
  kind: AgreementKind;
  body: string;
  values: PlaceholderValues;
  brandName: string;
  logo?: string | null;
  /** Shown under the title, e.g. "Operator A · Version 2". */
  subtitle?: string | null;
  /** DRAFT watermark until the template is lawyer-approved; PREVIEW for previews. */
  watermark: string | null;
}

/** An agreement as a branded A4 HTML page, plus the placeholders it had no value for. */
export function agreementHtml(input: AgreementRenderInput) {
  const { html, missing } = renderTemplate(input.body, PLACEHOLDERS[input.kind], input.values);
  return {
    html: documentHtml({
      title: AGREEMENT_LABELS[input.kind],
      subtitle: input.subtitle,
      brandName: input.brandName,
      logo: input.logo,
      bodyHtml: html,
      watermark: input.watermark,
      page: 'A4',
      // The template's own "# TITLE" repeats the document title; keep it, but smaller.
      css: `.doc-title { display: none; } main > h1:first-of-type { margin-top: 8mm; }`,
    }),
    missing,
  };
}

export { DRAFT_WATERMARK };
