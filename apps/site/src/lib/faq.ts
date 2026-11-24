import { getCollection, type CollectionEntry } from 'astro:content';
import { faqJsonLd } from './jsonld';

type Tag = 'weddings' | 'helicopters' | 'planners' | 'private';

const GROUP_ORDER = ['Safety', 'Booking', 'Payment', 'Helicopters', 'Cancellations', 'Planners'];

export async function faqsFor(tag: Tag): Promise<CollectionEntry<'faq'>[]> {
  return sortFaqs(await getCollection('faq', (f) => f.data.tags.includes(tag)));
}

export function sortFaqs(items: CollectionEntry<'faq'>[]) {
  return items.sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.data.group) - GROUP_ORDER.indexOf(b.data.group) ||
      a.data.order - b.data.order,
  );
}

export const faqLd = (items: CollectionEntry<'faq'>[]) =>
  faqJsonLd(items.map((i) => ({ question: i.data.question, answer: i.body ?? '' })));
