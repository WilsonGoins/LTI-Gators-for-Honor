// This hook manages all state related to filtering, sorting, and searching quizzes

import { useState, useMemo, useCallback } from "react";
import { Quiz, SortKey } from "@/lib/types";
import {
  DEFAULT_FILTERS,
  getActiveFilterCount,
  type FilterState,
} from "@/components/filter-dropdown";


interface UseFilteredQuizzesReturn {
  filteredQuizzes: Quiz[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  sortKey: SortKey;
  sortAsc: boolean;
  handleSort: (key: SortKey) => void;
  hasActiveFilters: boolean;
}


export function useFilteredQuizzes(
  quizzes: Quiz[]
): UseFilteredQuizzesReturn {
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("dueAt");
  const [sortAsc, setSortAsc] = useState(true);

  // filtered + sorted list 
  const filteredQuizzes = useMemo(() => {
    let result = [...quizzes];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((quiz) =>
        quiz.title.toLowerCase().includes(q)
      );
    }

    // SEB status (show all when neither is checked)
    const hasSebFilter = filters.sebActive || filters.sebNone;
    if (hasSebFilter) {
      result = result.filter((quiz) => {
        if (filters.sebActive && quiz.sebConfigured) return true;
        if (filters.sebNone && !quiz.sebConfigured) return true;
        return false;
      });
    }

    // Publish status (show all when neither is checked)
    const hasPubFilter = filters.published || filters.draft;
    if (hasPubFilter) {
      result = result.filter((quiz) => {
        if (filters.published && quiz.published) return true;
        if (filters.draft && !quiz.published) return true;
        return false;
      });
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "dueAt":
          if (!a.dueAt && !b.dueAt) cmp = 0;
          else if (!a.dueAt) cmp = 1;
          else if (!b.dueAt) cmp = -1;
          else
            cmp =
              new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
          break;
        case "sebConfigured":
          cmp = (a.sebConfigured ? 1 : 0) - (b.sebConfigured ? 1 : 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [quizzes, searchQuery, filters, sortKey, sortAsc]);

  // Sort handler 
  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortAsc((prev) => !prev);
      } else {
        setSortKey(key);
        setSortAsc(true);
      }
    },
    [sortKey]
  );

  const hasActiveFilters = getActiveFilterCount(filters) > 0;

  return {
    filteredQuizzes,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    sortKey,
    sortAsc,
    handleSort,
    hasActiveFilters,
  };
}