import { useEffect } from "react";
import { useRouter } from "next/router";

/**
 * /talk now redirects to /reputation-os/talk.
 * Talk is integrated into the unified Reputation OS layout.
 */
export default function TalkRedirect() {
  const router = useRouter();
  useEffect(() => {
    // Forward any query params (e.g. ?q=keyword)
    const query = router.query;
    const qs = Object.keys(query).length
      ? "?" + new URLSearchParams(query as Record<string, string>).toString()
      : "";
    router.replace(`/reputation-os/talk${qs}`);
  }, [router]);
  return null;
}
