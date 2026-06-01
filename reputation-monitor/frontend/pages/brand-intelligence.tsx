import { useEffect } from "react";
import { useRouter } from "next/router";

/**
 * /brand-intelligence now redirects to /reputation-os/feed.
 * The YouTube feed is part of the unified Reputation OS dashboard.
 */
export default function BrandIntelligenceRedirect() {
  const router = useRouter();
  useEffect(() => {
    const q = router.query.q;
    const qs = q ? `?q=${encodeURIComponent(String(q))}` : "";
    router.replace(`/reputation-os/feed${qs}`);
  }, [router]);
  return null;
}
