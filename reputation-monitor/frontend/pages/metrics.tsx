import { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Sidebar from "@/components/Sidebar";
import MetricsView from "@/components/MetricsView";
import { useKeyword } from "@/contexts/KeywordContext";
import { useMetricsAnalyst } from "@/hooks/useMetricsAnalyst";

/* ─── Main Page ───────────────────────────────────────────────────────────── */

export default function MetricsPage() {
  const router = useRouter();
  const shared = useKeyword();
  const metricsAnalyst = useMetricsAnalyst();

  // Pick up keyword from URL query param (overrides shared context)
  useEffect(() => {
    if (router.query.q && typeof router.query.q === "string") {
      shared.commitKeyword(router.query.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.q]);

  // Auto-fetch metrics when shared keyword is available
  useEffect(() => {
    if (shared.activeKeyword.trim()) {
      metricsAnalyst.fetchMetrics(shared.activeKeyword.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.activeKeyword]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const kw = shared.keyword.trim();
    if (!kw) return;
    shared.commitKeyword(kw);
  }

  return (
    <>
      <Head>
        <title>Metrics | REPSCAN</title>
      </Head>

      <div className="flex min-h-screen bg-[#030712]">
        <Sidebar />

        <main className="flex-1 ml-16">
          {/* ── Header ─────────────────────────────────────────── */}
          <header className="sticky top-0 z-30 border-b border-slate-800/60 bg-[#030712]/80 backdrop-blur-md">
            <div className="flex items-center gap-4 px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <h1 className="text-lg font-bold text-white tracking-tight">Metrics</h1>
              </div>

              {/* Keyword search */}
              <form onSubmit={handleSearch} className="flex-1 max-w-lg">
                <div className="relative">
                  <input
                    type="text"
                    value={shared.keyword}
                    onChange={(e) => shared.setKeyword(e.target.value)}
                    placeholder="Search for a brand or topic…"
                    className="w-full rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-2 pl-10 text-sm text-slate-200 placeholder-slate-500 focus:border-rose-500/50 focus:outline-none focus:ring-1 focus:ring-rose-500/30 transition-colors"
                  />
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
              </form>

              {/* Refresh button */}
              {metricsAnalyst.hasLoaded && (
                <button
                  onClick={() => {
                    if (shared.activeKeyword.trim()) {
                      metricsAnalyst.fetchMetrics(shared.activeKeyword.trim());
                    }
                  }}
                  disabled={metricsAnalyst.isLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40"
                  title="Refresh"
                >
                  <svg
                    className={metricsAnalyst.isLoading ? "animate-spin" : ""}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              )}
            </div>
          </header>

          {/* ── Content ────────────────────────────────────────── */}
          <div className="px-6 py-6 max-w-6xl mx-auto">
            <MetricsView
              data={metricsAnalyst.data}
              isLoading={metricsAnalyst.isLoading}
              error={metricsAnalyst.error}
              hasLoaded={metricsAnalyst.hasLoaded}
            />
          </div>
        </main>
      </div>
    </>
  );
}
