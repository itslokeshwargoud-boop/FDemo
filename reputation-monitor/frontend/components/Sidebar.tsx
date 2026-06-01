"use client";

import Link from "next/link";
import { useRouter } from "next/router";

interface NavItem {
  icon: React.ReactNode;
  label: string;
  href: string;
}

function IconRepOS() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { icon: <IconRepOS />, label: "Reputation OS", href: "/reputation-os" },
];

export default function Sidebar() {
  const router = useRouter();

  function isActive(href: string): boolean {
    if (href === "/dashboard") {
      return router.pathname === "/dashboard" || router.pathname === "/";
    }
    return router.pathname.startsWith(href);
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col border-r border-slate-800/60 bg-[#030712]">
      {/* Brand Icon — Rose to Orange gradient */}
      <div className="flex h-16 items-center justify-center border-b border-slate-800/60">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white font-black text-sm"
          style={{
            background: "linear-gradient(135deg, #f43f5e, #f97316)",
          }}
        >
          RS
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col items-center gap-1 py-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
                active
                  ? "bg-rose-500/15 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                  : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-300"
              }`}
            >
              {/* Active indicator bar */}
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
              )}
              {item.icon}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
