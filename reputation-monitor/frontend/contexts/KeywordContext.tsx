/**
 * KeywordContext — shared keyword state that persists across all pages.
 *
 * When a user enters a keyword on any page (Dashboard, Talk, YouTube Feed),
 * it is stored here so that navigating between pages does not require
 * re-entering the keyword.  The value is also mirrored to sessionStorage
 * so a page refresh within the same browser session keeps the keyword.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface KeywordContextValue {
  /** The current keyword (what the user sees in the input). */
  keyword: string;
  /** Update the keyword input value. */
  setKeyword: (kw: string) => void;
  /** The keyword that was last submitted / searched. */
  activeKeyword: string;
  /** Commit the current keyword (or a provided keyword) as the active search term. */
  commitKeyword: (kw?: string) => void;
  /** Timeline mode — YYYY-MM-DD start date. Empty string = no filter (real-time mode). */
  startDate: string;
  setStartDate: (d: string) => void;
  /** Timeline mode — YYYY-MM-DD end date. Empty string = no filter (real-time mode). */
  endDate: string;
  setEndDate: (d: string) => void;
  /** True when both startDate and endDate are set. */
  isTimelineMode: boolean;
  /** Clear the timeline filter and return to real-time mode. */
  clearTimeline: () => void;
}

const KeywordContext = createContext<KeywordContextValue>({
  keyword: "",
  setKeyword: () => {},
  activeKeyword: "",
  commitKeyword: () => {},
  startDate: "",
  setStartDate: () => {},
  endDate: "",
  setEndDate: () => {},
  isTimelineMode: false,
  clearTimeline: () => {},
});

const STORAGE_KEY = "repscan_keyword";

export function KeywordProvider({ children }: { children: ReactNode }) {
  const [keyword, setKeywordRaw] = useState("");
  const [activeKeyword, setActiveKeyword] = useState("");
  // Global timeline state — shared across Feed, Talk, and all 8 feature modules
  const [startDate, setStartDateRaw] = useState("");
  const [endDate, setEndDateRaw] = useState("");
  const isTimelineMode = !!(startDate && endDate);

  // Hydrate from sessionStorage on mount (client-side only)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        setKeywordRaw(stored);
        setActiveKeyword(stored);
      }
    } catch {
      // SSR or storage unavailable — ignore
    }
  }, []);

  const setKeyword = useCallback((kw: string) => {
    setKeywordRaw(kw);
  }, []);

  const commitKeyword = useCallback((kw?: string) => {
    const trimmed = (kw ?? keyword).trim();
    if (!trimmed) return;
    setKeywordRaw(trimmed);
    setActiveKeyword(trimmed);
    try {
      sessionStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // ignore
    }
  }, [keyword]);

  const setStartDate = useCallback((d: string) => setStartDateRaw(d), []);
  const setEndDate   = useCallback((d: string) => setEndDateRaw(d), []);
  const clearTimeline = useCallback(() => {
    setStartDateRaw("");
    setEndDateRaw("");
  }, []);

  return (
    <KeywordContext.Provider
      value={{
        keyword, setKeyword, activeKeyword, commitKeyword,
        startDate, setStartDate, endDate, setEndDate,
        isTimelineMode, clearTimeline,
      }}
    >
      {children}
    </KeywordContext.Provider>
  );
}

export function useKeyword() {
  return useContext(KeywordContext);
}
