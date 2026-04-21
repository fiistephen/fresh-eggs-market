import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Sync a tab/view name with the URL search parameter `?tab=<value>`.
 * Pressing the browser back button restores the previous tab.
 *
 * @param {string} defaultTab  – tab key to use when no ?tab is present
 * @param {string[]} validTabs – whitelist; unknown values fall back to defaultTab
 * @returns {[string, (tab: string) => void]}
 */
export function useTabParam(defaultTab, validTabs) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const activeTab = raw && validTabs.includes(raw) ? raw : defaultTab;

  const setTab = useCallback(
    (tab) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (tab === defaultTab) {
          next.delete('tab');
        } else {
          next.set('tab', tab);
        }
        return next;
      });
    },
    [defaultTab, setSearchParams],
  );

  return [activeTab, setTab];
}
