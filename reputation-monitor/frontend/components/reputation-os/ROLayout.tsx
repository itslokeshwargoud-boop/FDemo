import { useState, useEffect } from "react";
import ROSidebar from "./ROSidebar";
import { ANIL_DISPLAY_NAME, PAGE_TITLE } from "@/lib/constants";
import Head from "next/head";

interface ROLayoutProps {
  children: React.ReactNode;
  activeModule: string;
}

const MODULE_TITLES: Record<string, string> = {
  overview: "Overview",
  talk: "Talk",
  feed: "Feed",
  alerts: "Alerts",
  narratives: "Narratives",
  influencers: "Influencers",
  authenticity: "Threat Sense",
  actions: "DDR",
  predictions: "Predictions",
  campaigns: "Campaigns",
  mbi: "Movie Buzz Indexer",
};

export default function ROLayout({ children, activeModule }: ROLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Auto-collapse on mobile
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setCollapsed(e.matches);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Set timestamp on mount
  useEffect(() => {
    setLastUpdated(new Date().toLocaleTimeString());
  }, []);

  const moduleTitle = MODULE_TITLES[activeModule] ?? activeModule;

  return (
    <div className="min-h-screen bg-[#030712]">
      <Head>
        <title>{PAGE_TITLE}</title>
      </Head>
      <ROSidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((p) => !p)}
        activeModule={activeModule}
      />

      {/* Main content area */}
      <div
        className={`transition-all duration-300 ${
          collapsed ? "pl-16" : "pl-64"
        }`}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-800/60 bg-[#030712]/80 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white">
              {moduleTitle}
            </span>
            <span className="rounded-full bg-slate-800/60 px-2.5 py-0.5 text-xs text-slate-400">
              {ANIL_DISPLAY_NAME}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="hidden sm:block text-xs text-slate-500">
                Last updated: {lastUpdated}
              </span>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
