import { useEffect } from "react";
import { useRouter } from "next/router";

/**
 * /dashboard now redirects to /reputation-os.
 * The keyword-based YouTube intelligence features are available
 * inside Reputation OS → Feed.
 */
export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/reputation-os");
  }, [router]);
  return null;
}
