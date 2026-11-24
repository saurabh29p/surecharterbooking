/**
 * Facts repeated across pages, kept in one place so every page says the same thing (AEO: one
 * consistent set of citable facts). Values marked `verify: true` are estimates listed in VERIFY.md.
 */
import { HELI_PERMISSIONS_LINE } from '../config/company';

/** The Vaanika Standard: the four checks before any quote. */
export const CHECKS = [
  {
    title: 'Operator permit',
    text: 'A valid DGCA Non-Scheduled Operator Permit, checked against the operator’s papers.',
  },
  {
    title: 'The aircraft itself',
    text: 'Registration and airworthiness papers for the exact aircraft in your quote.',
  },
  {
    title: 'Insurance',
    text: 'Current passenger and aircraft insurance, in date for your flight.',
  },
  { title: 'Landing permissions', text: HELI_PERMISSIONS_LINE },
];

/** How it works: four steps. */
export const STEPS = [
  {
    title: 'Tell us the plan',
    text: 'Date, cities, venue and guest count — on WhatsApp or the form.',
  },
  {
    title: 'Get one written quote',
    text: 'The operator, the aircraft and the full price in one document.',
  },
  {
    title: 'Sign and confirm',
    text: 'Accept the terms online; pay by bank transfer to our company account, against a GST invoice.',
  },
  {
    title: 'Fly in',
    text: 'Your coordinator keeps you and your planner updated until you land.',
  },
];

/**
 * Payment schedule (WEBSITE.md §7).
 * [CA TO CONFIRM] the owner's CA confirms this wording, the advance and the receipt-voucher
 * process before launch.
 */
export const PAYMENT_SCHEDULE = [
  {
    when: 'When you accept the quote and sign',
    what: 'An advance, usually about half — at least what the operator asks for.',
  },
  {
    when: '7–10 days before the flight',
    what: 'The balance. For helicopters, the balance only once the permissions are in place.',
  },
  {
    when: 'After the flight',
    what: 'Extras such as waiting time, catering changes or extra legs, invoiced separately.',
  },
];

/** [CA TO CONFIRM] */
export const PAYMENT_METHODS = [
  'Bank transfer (NEFT, RTGS or IMPS) to Indicgems Exim LLP’s current account.',
  'UPI only for small amounts.',
  'We do not accept cash.',
  'A GST invoice for every payment.',
];

export interface AircraftClass {
  name: string;
  seats: string;
  range: string;
  use: string;
}

/** Aircraft classes (estimates: the exact aircraft decides seats and range). */
export const AIRCRAFT_CLASSES: AircraftClass[] = [
  {
    name: 'Helicopter (single engine)',
    seats: 'about 4–5 guests',
    range: 'short hops, about 30–90 minutes',
    use: 'Airport to venue, the bride or groom’s entrance, short joyrides',
  },
  {
    name: 'Helicopter (twin engine)',
    seats: 'up to 5–6 guests',
    range: 'about 1–2 hours',
    use: 'Longer venue transfers, hill and lake venues',
  },
  {
    name: 'Light jet',
    seats: 'about 6–7 guests',
    range: 'about 2–3 hours non-stop',
    use: 'The couple and closest family, metro to Rajasthan or Goa',
  },
  {
    name: 'Midsize jet',
    seats: 'about 7–8 guests',
    range: 'about 3–4 hours non-stop',
    use: 'A family group with luggage, most domestic routes',
  },
  {
    name: 'Super-midsize jet',
    seats: 'about 8–9 guests',
    range: 'about 4–5 hours non-stop',
    use: 'One family side, coast to coast',
  },
  {
    name: 'Heavy jet',
    seats: 'about 12–14 guests',
    range: 'about 6 hours and more',
    use: 'The full VIP circle, room to celebrate',
  },
  {
    name: 'Group charter',
    seats: '50 guests and more',
    range: 'any domestic route',
    use: 'The whole baraat on one departure',
  },
];

/** Who handles each helicopter permission (WEBSITE.md §7: "coordinated", never "guaranteed"). */
export const HELI_PERMISSIONS = [
  {
    who: 'The operator',
    does: 'Checks the landing spot (size, surface, obstacles) and files the landing request.',
  },
  {
    who: 'The venue owner',
    does: 'Gives a written no-objection certificate (NOC) for the helicopter to land on their property.',
  },
  {
    who: 'The district administration',
    does: 'Is informed of the landing and, in practice, gives its approval; police are often told too.',
  },
  {
    who: 'Vaanika',
    does: 'Coordinates all of it with the operator, the venue and your planner, and tells you plainly if it can’t be done.',
  },
];

export const HELI_LIMITS = [
  'Weather: helicopters fly in daylight and in good visibility. Wind, rain or haze can stop a flight.',
  'Elections and VIP movement: the authorities can restrict flights, sometimes at short notice.',
  'No-fly and restricted areas: some places near airports, military areas or monuments are off limits.',
  'The pilot’s decision is final, on the day and in the air.',
];
