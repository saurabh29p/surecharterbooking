/**
 * Social sharing images (1200 × 630), made at build time from the logo kit and the page photos
 * (WEBSITE.md §9): the logo on midnight for most pages, or the page's photo with the logo.
 */
import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const asset = (p: string) => resolve(process.cwd(), 'src/assets', p);

/** Page name → photo (null: the logo on midnight). */
const IMAGES: Record<string, string | null> = {
  vaanika: null,
  weddings: 'photos/private-jet-sunset.jpg',
  'helicopter-arrivals': 'photos/helicopter-sunset.jpg',
  shreeji: 'photos/shreeji-arrival-composite.jpg',
  destinations: 'photos/udaipur-night.jpg',
  udaipur: 'photos/udaipur-golden.jpg',
  jaipur: 'photos/jaipur.jpg',
  goa: 'photos/goa.jpg',
  aircraft: 'photos/jet-cabin.jpg',
  'private-charter': 'photos/private-jet-vip.jpg',
  'for-planners': 'photos/marigold.jpg',
};

export function getStaticPaths() {
  return Object.keys(IMAGES).map((name) => ({ params: { name } }));
}

async function logoOnMidnight(): Promise<Buffer> {
  const logo = await sharp(
    await readFile(asset('logo/vaanika-stacked-colour-transparent-for-dark-bg.svg')),
    {
      density: 300,
    },
  )
    .resize({ height: 420 })
    .png()
    .toBuffer();
  const glow = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#1E2546"/><stop offset="1" stop-color="#0B1020"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="0" y="${H - 6}" width="${W}" height="6" fill="#B8924A"/></svg>`,
  );
  return sharp(glow)
    .composite([{ input: logo, gravity: 'centre' }])
    .jpeg({ quality: 86 })
    .toBuffer();
}

async function photoWithLogo(photo: string): Promise<Buffer> {
  const base = await sharp(await readFile(asset(photo)))
    .resize(W, H, { fit: 'cover' })
    .toBuffer();
  // Darken the lower part so the logo reads on bright photos; stock photos say "Illustrative".
  const shade = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="s" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#05070F" stop-opacity="0.95"/><stop offset="0.38" stop-color="#05070F" stop-opacity="0.78"/><stop offset="0.75" stop-color="#05070F" stop-opacity="0.15"/><stop offset="1" stop-color="#05070F" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#s)"/><text x="${W - 28}" y="${H - 26}" text-anchor="end" font-family="sans-serif" font-size="18" letter-spacing="1.5" fill="#E8E2D4" fill-opacity="0.75">Illustrative</text></svg>`,
  );
  const logo = await sharp(
    await readFile(asset('logo/vaanika-horizontal-colour-transparent-for-dark-bg.svg')),
    { density: 300 },
  )
    .resize({ height: 170 })
    .png()
    .toBuffer();
  return sharp(base)
    .composite([
      { input: shade, top: 0, left: 0 },
      { input: logo, left: 30, top: H - 170 - 30 },
    ])
    .jpeg({ quality: 84 })
    .toBuffer();
}

export const GET: APIRoute = async ({ params }) => {
  const photo = IMAGES[params.name as string];
  const body = photo ? await photoWithLogo(photo) : await logoOnMidnight();
  return new Response(new Uint8Array(body), { headers: { 'content-type': 'image/jpeg' } });
};
