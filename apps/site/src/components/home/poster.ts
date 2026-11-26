import { getImage } from 'astro:assets';
import wide from '../../assets/photos/hero-poster.jpg';
import tall from '../../assets/photos/hero-poster-portrait.jpg';

/**
 * The hero posters (the LCP image): the first frame of the background film, landscape for screens
 * 768 px and wider, portrait below. Hero.astro shows them and pages/index.astro preloads them; both
 * call heroPosters(), so the preloaded files are exactly the ones the page shows.
 * Quality 42 is visually the same as the default on these night scenes and about 30% smaller.
 */
export const POSTER_QUALITY = 42;
export { PHONE, WIDE } from './poster-media';

export const heroPosters = async () => {
  const opts = { quality: POSTER_QUALITY };
  const [wideAvif, wideWebp, tallAvif, tallWebp, fallback] = await Promise.all([
    getImage({ src: wide, format: 'avif', widths: [768, 1024, 1280, 1600], ...opts }),
    getImage({ src: wide, format: 'webp', widths: [768, 1024, 1280, 1600], ...opts }),
    getImage({ src: tall, format: 'avif', widths: [480, 720, 1080], ...opts }),
    getImage({ src: tall, format: 'webp', widths: [480, 720, 1080], ...opts }),
    getImage({ src: wide, format: 'jpg', width: 1280, ...opts }),
  ]);
  return { wideAvif, wideWebp, tallAvif, tallWebp, fallback };
};
