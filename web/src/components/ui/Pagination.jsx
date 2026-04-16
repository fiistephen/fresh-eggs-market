import Button from './Button';

/**
 * Standalone pagination bar.
 *
 * Props:
 *   page       – 1-based current page number
 *   pageSize   – rows per page
 *   total      – total row count from API
 *   onChange   – (newPage: number) => void
 *   noun       – label for the items, e.g. "customers" (optional, default "items")
 */
export default function Pagination({ page = 1, pageSize = 25, total = 0, onChange, noun = 'items' }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-4">
      <p className="text-body text-surface-500">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {noun}
      </p>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <p className="text-body text-surface-600">
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
