# UX.md checklist: results (step 14)

Checked on 18 Nov 2026 against the seeded demo data, at 360 × 760 px (a mid-range Android phone size), on
29 screens: login, Today, the weddings board, new wedding, every wedding tab (W-102 and W-104), partners,
a partner, new partner, clients, a client, operators, an operator, new operator, and every Settings page.

How: an automated browser run (Playwright) that, on every screen, measures page width, the size of every
button, link-button, chip, tab and form field, and runs the axe accessibility checks (WCAG 2.1 A and AA).
Speed was measured on the production build with Lighthouse's mobile profile (slow 4G: 150 ms latency,
1.6 Mbps; CPU slowed 4×).

| UX.md §7 item | Result |
| --- | --- |
| Hover, pressed, focus, disabled and loading states | ✓ All buttons go through `SjButton` (hover lift, press scale, focus ring, disabled with a reason, loading with spinner and label). Chips, cards and tabs have hover and pressed states. |
| Visible feedback within 100 ms and a result message | ✓ Optimistic updates with toasts and Undo (Later, Mark flown, partner quick actions, payments). Taps on Today responded in 40 ms (INP). |
| No blank screens, skeletons, no layout jumps | ✓ Skeletons everywhere. Today's layout shift was 0.09 (the GST banner arrived late); **fixed** by showing the last known banner from the first paint: now **0.007** (target < 0.1). |
| Forms validate inline and never lose input | ✓ Field errors from the API shown under each input; input kept. |
| Works at 360 px | ✓ No sideways scrolling on any of the 29 screens. |
| Keyboard and screen readers | ✓ Skip link, visible focus ring on every focused item (checked by tabbing through Today). **Fixed**: three hidden file pickers had no label; the Today tracker's spoken name didn't match its text. axe now reports **no issues** on all 29 screens. |
| Reduced motion | ✓ With "reduce motion" on, transitions drop to 0.01 ms (checked in the browser). |
| Web Vitals (mobile) | ✓ Today: first actions on screen in **1.2 s**, LCP **0.95 s**, CLS **0.007**, INP **40 ms**. Login (cold, nothing cached): LCP **1.8 s**. Targets: LCP < 2.5 s, INP < 200 ms, CLS < 0.1. |

## Fixed in this pass

- **Text contrast** (UX.md §5, 4.5:1): Tabler's grey (4.38:1) and green (2.74:1) were too light on our
  backgrounds. Now #5b606e grey and #1f7a4d green everywhere. The gold wordmark uses the darker gold on white
  (login and setup).
- **Tap targets** (UX.md §1, 44 × 44 px): compact buttons keep their look but have a 44 px tall tap area; filter
  chips, the Partners/Clients switch, the password "Show" button, cancellation-line remove buttons and
  "+ Add a line" are now 44 px. Checkbox rows are tappable across the whole row.
- **Layout jump** from the GST banner (see above).

## Left as is

- One text link inside a sentence on Settings → Import ("partners template") is 40 px tall: links inside a
  sentence are exempt from the target size rule.
- The stylesheet is Tabler's full CSS (about 100 KB compressed). The first load still meets the targets, and it
  is cached afterwards. Trimming it to the parts used is possible later if needed.
