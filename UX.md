# UX.md — Interaction and feel standards (desk + website)

Both the internal desk (`BRIEF.md`) and the public website (`WEBSITE.md`) must feel alive, fast and premium.
Nothing should feel dead: every tap, click and change gives instant, visible feedback.
Follow this file for every screen and component. If something here conflicts with speed or accessibility, speed and accessibility win.

## 1. Every interactive element looks and feels interactive
- **Five states for every button, link, card and input:** default, hover, pressed, focus, disabled (+ loading where it does work).
  - **Hover (desktop):** clear change within 120–180 ms: slight lift (translateY −1 to −2 px) and/or brighter background, deeper shadow or gold glow; cursor is a pointer.
  - **Pressed:** immediate response (≤ 50 ms): scale to 0.97–0.98 and darker shade, so the tap is felt on phones too.
  - **Focus:** visible focus ring (2 px, brand gold or blue, offset 2 px) for keyboard users; never remove outlines without a replacement.
  - **Disabled:** visibly muted, `cursor: not-allowed`, and a short reason on hover/tap (e.g. "Verify operator documents first").
  - **Loading:** the button keeps its width, shows a small spinner and changes its label ("Sending…"); it can't be double-clicked.
- Primary actions look primary (solid, high contrast); secondary are outlined; destructive are clearly marked.
- Links in text are underlined or clearly coloured, with a hover change.
- Cards that open something lift slightly on hover and show an arrow or chevron.
- Touch targets at least 44 × 44 px; at least 8 px between tap targets.

## 2. Instant feedback for every action
- **Respond within 100 ms** to any input (Interaction to Next Paint under 200 ms).
- **Optimistic updates** for safe actions (status changes, notes, ticking a task): update the UI at once, roll back with an error message if the server fails.
- **Toasts** for results: "Quote shared on WhatsApp", "Saved", "Couldn't save — retry". Bottom on mobile, top-right on desktop, auto-hide after 4 s, with **Undo** for reversible actions.
- **Skeleton loaders** (not blank screens or full-page spinners) while data loads; keep layout stable (no content jumping).
- **Inline validation** on forms: as soon as a field is left, show what's wrong and how to fix it; keep the user's input on error.
- **Confirm only truly destructive or irreversible actions** with a short dialog that says exactly what will happen; everything else uses Undo instead of "Are you sure?".
- **Success moments**: a small check animation when a wedding is confirmed, payment recorded or quote shared (tasteful, under 600 ms).

## 3. Motion
- Durations: micro-interactions 120–200 ms; panels, drawers and modals 200–300 ms; page transitions ≤ 250 ms. Easing: ease-out for entering, ease-in for leaving.
- Animate only `transform` and `opacity` for smoothness (60 fps on mid-range Android phones).
- Lists: new items fade/slide in; removed items collapse smoothly.
- Respect `prefers-reduced-motion`: replace movement with simple fades or no animation.
- Motion must explain something (where a thing came from or went); no decorative motion inside the desk except success moments.

## 4. Mobile-first behaviour (I mostly use my phone)
- **Sticky bottom action bar** on detail screens with the 1–2 main actions (e.g. "Share quote", "Record payment").
- **Swipe actions** on list cards where it helps (e.g. swipe a Today action to mark done / snooze), always with a visible button alternative.
- Bottom sheets instead of full-screen modals for quick inputs.
- Pull-to-refresh on Today and lists.
- Number keypad for amounts, phone keypad for phones, date pickers for dates.
- Works one-handed: main actions reachable by the thumb.
- Fast on 4G: first screen interactive in under 2.5 s; cache recent data so screens open instantly offline-first where safe.

## 5. Clarity
- Every screen has one obvious main action.
- **Empty states** explain what goes here and offer the first action ("No weddings yet — Paste a WhatsApp enquiry").
- **Error states** say what happened in plain words and how to fix it; never show raw error codes alone.
- Status uses colour **and** text/icon (never colour alone); colours meet 4.5:1 contrast for text.
- Money and dates always in Indian formats (₹24.0L, 12 Dec 2026, IST).
- Desktop keyboard shortcuts in the desk: `N` new wedding, `/` search, `?` shortcut list.

## 6. Website-specific (in addition to the above)
- Buttons: gold pill buttons lift and gain a soft gold glow on hover; outlined buttons fill gently on hover; all press down on tap.
- Route and partner cards: lift, border turns gold, arrow nudges right on hover.
- Sections fade up as they enter the viewport (once, not on every scroll).
- Sticky WhatsApp button pulses gently once after 5 s, then stays still.
- Smooth anchor scrolling; header shrinks and gains a backdrop blur after scrolling.
- Images/graphics never cause layout shift (reserve space).

## 7. Quality checklist (must pass before any screen is "done")
- [ ] Every interactive element has hover, pressed, focus, disabled (and loading where relevant) states.
- [ ] Every action gives visible feedback within 100 ms and a result message.
- [ ] No blank loading screens; skeletons used; no layout jumps.
- [ ] Forms validate inline and never lose input.
- [ ] Works and feels good at 360 px wide on a mid-range Android phone.
- [ ] Keyboard navigable with visible focus; screen-reader labels on icon buttons.
- [ ] Reduced-motion mode respected.
- [ ] Lighthouse / Web Vitals: LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on mobile.
