import { continueRender, delayRender, staticFile } from 'remotion';

export const SERIF = '"Bodoni Moda", "Didot", serif';
export const SANS = 'Manrope, "Helvetica Neue", sans-serif';

const faces: [string, string, FontFaceDescriptors][] = [
  ['Bodoni Moda', 'fonts/BodoniModa.woff2', { style: 'normal', weight: '400 900' }],
  ['Bodoni Moda', 'fonts/BodoniModa-Italic.woff2', { style: 'italic', weight: '400 900' }],
  ['Manrope', 'fonts/Manrope.woff2', { style: 'normal', weight: '200 800' }],
];

let loaded: Promise<void> | null = null;

/** Loads the brand fonts once per tab and holds the render until they are ready. */
export const loadFonts = () => {
  if (loaded) return loaded;
  const handle = delayRender('Loading brand fonts');
  loaded = Promise.all(
    faces.map(([family, file, desc]) => {
      const f = new FontFace(family, `url(${staticFile(file)}) format('woff2')`, desc);
      return f.load().then((ff) => {
        (document.fonts as unknown as { add: (f: FontFace) => void }).add(ff);
      });
    }),
  ).then(() => continueRender(handle));
  return loaded;
};

loadFonts();
