/**
 * Chili Piper vendor configuration: URL and flow behavior per vendor.
 * Used by get-slots and book-slot to resolve base URL and direct-calendar / form-fill behavior.
 */

const DEFAULT_CINQ_URL =
  process.env.CHILI_PIPER_FORM_URL ||
  'https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice';

const LUXURYPRESENCE_URL =
  process.env.LUXURYPRESENCE_CHILI_PIPER_URL ||
  'https://luxurypresence.chilipiper.com/round-robin/agentadvice-intro--15';

export interface ChiliPiperVendorConfig {
  formUrl: string;
  directCalendar: boolean;
  /** If true, after selecting a slot we must fill guest form (first/last/email) and click Confirm. */
  fillGuestFormAfterSlot: boolean;
}

export const CHILI_PIPER_VENDOR_CONFIG: Record<string, ChiliPiperVendorConfig> = {
  cinq: {
    formUrl: DEFAULT_CINQ_URL,
    directCalendar: false,
    fillGuestFormAfterSlot: false,
  },
  luxurypresence: {
    formUrl: LUXURYPRESENCE_URL,
    directCalendar: true,
    fillGuestFormAfterSlot: true,
  },
};

const DEFAULT_VENDOR = 'cinq';

/**
 * Resolve vendor config by id. Falls back to cinq/default when vendor is missing or unknown.
 */
export function getChiliPiperVendorConfig(vendor?: string | null): ChiliPiperVendorConfig {
  const key = (vendor || '').toLowerCase().trim() || DEFAULT_VENDOR;
  return CHILI_PIPER_VENDOR_CONFIG[key] ?? CHILI_PIPER_VENDOR_CONFIG[DEFAULT_VENDOR];
}
