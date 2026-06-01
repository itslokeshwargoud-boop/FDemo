import type { AppProps } from "next/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { KeywordProvider } from "@/contexts/KeywordContext";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <KeywordProvider>
        <Component {...pageProps} />
      </KeywordProvider>
    </QueryClientProvider>
  );
}
