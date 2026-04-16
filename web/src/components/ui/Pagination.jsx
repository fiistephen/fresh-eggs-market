import Button from './Button';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

/**
 * Standalone pagination bar with page-size selector.
 *
 * Props:
 *   page         – 1-based current page number
 *   pageSize     – rows per page
 *   total        – total row count from API
 *   onChange     – (newPage: number) => void
 *   onPageSizeChange – (newSize: number) => void  (optional — hides the dropdown if omitted)
 *   noun         – label for the items, e.g. "customers" (optional, default "items")
 */
export default function Pagination({ page = 1, pageSize = 25, total = 0, onChange, onPageSizeChange, noun = 'items' }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1 && total <= PAGE_SIZE_OPTIONS[0]) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-4">
      <p className="text-body text-surface-500">
        {total === 0
          ? `No ${noun}`
          : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} ${noun}`}
      </p>
      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="border border-surface-300 rounded-lg px-2 py-1.5 text-body text-surface-700 bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt} / page</option>
            ))}
          </select>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <p className="text-body text-surface-600 whitespace-nowrap">
          Page {page} of {totalPages}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
