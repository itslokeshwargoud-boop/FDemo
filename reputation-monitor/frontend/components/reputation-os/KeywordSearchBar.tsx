/**
 * KeywordSearchBar — Reusable keyword search input used in
 * the unified Reputation OS dashboard (Feed page, etc.).
 */

interface KeywordSearchBarProps {
  keyword: string;
  onKeywordChange: (value: string) => void;
  onSearch: (e: React.FormEvent) => void;
  isLoading?: boolean;
  placeholder?: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
}

export default function KeywordSearchBar({
  keyword,
  onKeywordChange,
  onSearch,
  isLoading = false,
  placeholder = "Search YouTube for a keyword…",
  suggestions = [],
  onSuggestionClick,
}: KeywordSearchBarProps) {
  return (
    <div className="space-y-2">
      <form onSubmit={onSearch} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder={placeholder}
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
        <button
          type="submit"
          disabled={!keyword.trim() || isLoading}
          className="h-10 rounded-xl bg-rose-500 px-5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {isLoading ? "Searching…" : "Search"}
        </button>
      </form>

      {/* Suggestion chips */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestionClick?.(s)}
              className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:border-rose-500/30 transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
