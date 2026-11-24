import { getCollection } from 'astro:content';
import { PREVIEW } from '../config/site';

/** Guides still marked draft are shown on previews only, never on the launched site. */
export async function visibleGuides() {
  const all = await getCollection('guides', (g) => PREVIEW || !g.data.draft);
  return all.sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
}
