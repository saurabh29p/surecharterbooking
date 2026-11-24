/**
 * The client-facing brand (WEBSITE.md §0). The business profile's brand name wins when set; these are
 * the defaults. Internal names (packages, database, Railway project) deliberately stay "shubhjets".
 */
export const DEFAULT_BRAND = 'Vaanika';

/** "Vaanika is a brand of Indicgems Exim LLP." (exact legal line). */
export function brandLine(brand: string, legalName: string | null | undefined): string {
  return legalName ? `${brand} is a brand of ${legalName}.` : brand;
}

/** WEBSITE.md §7: the agent line, exact wording (with the profile's brand name). */
export function agentLine(brand: string): string {
  return `${brand} arranges charters as an agent. Every flight is operated by a DGCA-approved NSOP operator named in your quote.`;
}

/** WEBSITE.md §7: the payment-safety note, exact wording (with the profile's legal name). */
export function paymentSafetyNote(legalName: string): string {
  return `We only accept payments to ${legalName}’s current account, and we never change bank details by message. Our bank details appear only inside your official quote. If anyone asks you to pay a personal account, call us first.`;
}
