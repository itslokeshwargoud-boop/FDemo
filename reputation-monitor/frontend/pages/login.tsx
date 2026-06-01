import { useEffect } from "react";
import { useRouter } from "next/router";

// Auth removed — redirect anyone who hits /login straight to the dashboard.
export default function LoginPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/reputation-os");
  }, [router]);
  return null;
}
