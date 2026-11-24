/**
 * The site's only always-on script: remember the campaign, count WhatsApp/call taps, fade sections
 * in once. Kept small (WEBSITE.md §4: JavaScript ≤ 30 KB per page).
 */
import { attribution, rememberCampaign } from '../lib/attribution';
import { API_URL, GOOGLE_ADS_ID, GOOGLE_ADS_LABELS } from '../config/site';

const storage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/** Attribution for this page, for forms and taps. */
export const currentAttribution = () => attribution(location.pathname, storage(), location.search);

/** Tell the desk about a WhatsApp or call tap. Never blocks the tap. */
function sendTap(kind: 'WHATSAPP' | 'CALL') {
  try {
    const body = JSON.stringify({ kind, ...currentAttribution() });
    const url = `${API_URL}/api/public/events`;
    if (!navigator.sendBeacon?.(url, body)) {
      void fetch(url, { method: 'POST', body, keepalive: true, mode: 'no-cors' }).catch(() => {});
    }
  } catch {
    // Counting a tap must never stop it.
  }
  gtagConversion(kind === 'WHATSAPP' ? 'whatsapp' : 'call');
}

/**
 * Google Ads conversion for a form or tap ("enquiry", "partner", "whatsapp", "call"), only when an Ads
 * id and that conversion's label are configured.
 */
export function gtagConversion(kind: 'enquiry' | 'partner' | 'whatsapp' | 'call') {
  const label = GOOGLE_ADS_LABELS[kind];
  const w = window as unknown as { gtag?: (...a: unknown[]) => void };
  if (GOOGLE_ADS_ID && label)
    w.gtag?.('event', 'conversion', { send_to: `${GOOGLE_ADS_ID}/${label}` });
}

function watchTaps() {
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>('[data-tap]');
      const kind = el?.dataset.tap;
      if (kind === 'WHATSAPP' || kind === 'CALL') sendTap(kind);
    },
    { capture: true },
  );
}

function fadeIn() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));
}

export function startSite() {
  const s = storage();
  if (s) rememberCampaign(location.search, s);
  watchTaps();
  fadeIn();
}
