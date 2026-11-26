import { getCollection } from 'astro:content';
import { PREVIEW } from '../config/site';

/** Guides still marked draft are shown on previews only, never on the launched site. */
export async function visibleGuides() {
  const all = await getCollection('guides', (g) => PREVIEW || !g.data.draft);
  return all.sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
}

/** The URL of a guide if this build shows it, else null (draft guides are left out of the launched site). */
export async function guideHref(slug: string) {
  return (await visibleGuides()).some((g) => g.id === slug) ? `/guides/${slug}/` : null;
}
