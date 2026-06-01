/**
 * Single-tenant constants for the Anil Ravipudi dashboard.
 *
 * This is the single source of truth for the client identity.
 * No multi-tenancy — every data request is permanently scoped to Anil.
 */

/** Internal tenant identifier used by API routes and data layer. */
export const ANIL_TENANT_ID = "anil_ravipudi" as const;

/** Display name shown in the UI. */
export const ANIL_DISPLAY_NAME = "Anil Ravipudi" as const;

/** Page / document title. */
export const PAGE_TITLE = "Reputation OS – Anil Ravipudi" as const;
