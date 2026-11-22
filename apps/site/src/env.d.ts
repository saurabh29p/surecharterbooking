/// <reference types="astro/client" />

/** True until launch (PUBLIC_LAUNCHED=true on Vercel production): draft banners and placeholder warnings show. */
declare const __PREVIEW__: boolean;
/** True only on the launched production build. */
declare const __INDEXABLE__: boolean;

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_API_URL?: string;
  readonly PUBLIC_WHATSAPP_NUMBER?: string;
  readonly PUBLIC_PHONE?: string;
  readonly PUBLIC_GOOGLE_ADS_ID?: string;
}
