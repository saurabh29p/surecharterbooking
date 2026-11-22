/// <reference types="astro/client" />

/** True on every build except Vercel production: draft banners and the placeholder warning show. */
declare const __PREVIEW__: boolean;
/** True only on a production build with PUBLIC_ALLOW_INDEXING=true (after launch). */
declare const __INDEXABLE__: boolean;

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_API_URL?: string;
  readonly PUBLIC_WHATSAPP_NUMBER?: string;
  readonly PUBLIC_PHONE?: string;
  readonly PUBLIC_GOOGLE_ADS_ID?: string;
}
