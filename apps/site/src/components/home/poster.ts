/**
 * Encoder quality for the hero poster (the LCP image). Shared by the <Picture> in Hero.astro and the
 * preload in pages/index.astro: they must produce the same file, or the poster downloads twice.
 * 42 is visually the same as the default on this night scene and about 30% smaller.
 */
export const POSTER_QUALITY = 42;
