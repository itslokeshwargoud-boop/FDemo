import { createContext, useContext, type ReactNode } from "react";
import { ANIL_TENANT_ID, ANIL_DISPLAY_NAME } from "@/lib/constants";

/**
 * Single-tenant context — permanently scoped to Anil Ravipudi.
 * No switching, no selection, no multi-tenancy.
 */

interface TenantContextValue {
  tenantId: string;
  tenantName: string;
}

const TenantContext = createContext<TenantContextValue>({
  tenantId: ANIL_TENANT_ID,
  tenantName: ANIL_DISPLAY_NAME,
});

export function TenantProvider({ children }: { children: ReactNode }) {
  return (
    <TenantContext.Provider
      value={{ tenantId: ANIL_TENANT_ID, tenantName: ANIL_DISPLAY_NAME }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
