import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * URL of a file in public/video with a content fingerprint (?v=…). vercel.json caches fingerprinted
 * video URLs for a year, and replacing a video changes its fingerprint, so visitors never keep an old
 * one. Runs at build time (the site builds from apps/site).
 */
export const videoUrl = (file: string) => {
  const v = createHash('sha256').update(readFileSync(resolve('public/video', file))).digest('hex').slice(0, 10);
  return `/video/${file}?v=${v}`;
};
