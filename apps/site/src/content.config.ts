/**
 * Markdown content (WEBSITE.md §4): add a destination, guide or FAQ by adding a file.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const faq = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/faq' }),
  schema: z.object({
    question: z.string(),
    group: z.enum(['Safety', 'Booking', 'Payment', 'Helicopters', 'Cancellations', 'Planners']),
    order: z.number(),
    /** Position in the home page's "Questions families ask" (five of them); leave out to skip. */
    home: z.number().optional(),
    /** Other pages that show this question. */
    tags: z.array(z.enum(['weddings', 'helicopters', 'planners', 'private'])).default([]),
  }),
});

const destinations = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/destinations' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      order: z.number(),
      title: z.string().max(60),
      description: z.string(),
      image: image(),
      imageAlt: z.string(),
      /** Two approximate times for the home page card, e.g. "Delhi · about 1 hr 15 min". */
      cardTimes: z.array(z.object({ from: z.string(), time: z.string() })),
      /** Approximate flying times from four cities, for the destination page's table. */
      times: z.array(z.object({ from: z.string(), time: z.string() })),
      airport: z.string(),
      season: z.string(),
    }),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    /** The <title>: at most 50 characters, so " | Vaanika" keeps it within 60. */
    seoTitle: z.string().max(50),
    description: z.string(),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    /** The money page this guide sends readers to. */
    moneyPage: z.string(),
    draft: z.boolean().default(true),
  }),
});

const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number(),
    updated: z.coerce.date(),
  }),
});

export const collections = { faq, destinations, guides, legal };
