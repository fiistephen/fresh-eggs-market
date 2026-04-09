/**
 * Design-system Table component.
 *
 * Usage:
 *   <Table
 *     columns={[{ key: 'name', label: 'Name' }, { key: 'amount', label: 'Amount', align: 'right' }]}
 *     data={rows}
 *     renderRow={(row) => (
 *       <Table.Row key={row.id}>
 *         <Table.Cell>{row.name}</Table.Cell>
 *         <Table.Cell align="right">{row.amount}</Table.Cell>
 *       </Table.Row>
 *     )}
 *     onRowClick={(row) => openDetail(row)}
 *     emptyMessage="No transactions found"
 *     compact
 *   />
 */
import Button from './Button';

export default function Table({
  columns = [],
  data = [],
  renderRow,
  onRowClick,
  emptyMessage = 'No data',
  emptyIcon,
  compact = false,
  stickyHeader = true,
  className = '',
  // Pagination
  page,
  pageSize,
  total,
  onPageChange,
}) {
  const rowHeight = compact ? 'h-9' : 'h-11';
  const hasPagination = typeof page === 'number' && typeof total === 'number' && onPageChange;
  const totalPages = hasPagination ? Math.ceil(total / pageSize) : 0;
  const showingFrom = hasPagination ? page * pageSize + 1 : 0;
  const showingTo = hasPagination ? Math.min((page + 1) * pageSize, total) : 0;

  return (
    <div className={`w-full ${className}`}>
      <div className="overflow-x-auto custom-scrollbar rounded-lg border border-surface-200">
        <table className="w-full">
          <thead>
            <tr className={`bg-surface-50 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`
                    ${rowHeight} px-3
                    text-overline text-surface-500 uppercase tracking-wider
                    text-${col.align || 'left'}
                    border-b border-surface-200
                    ${col.width ? `w-[${col.width}]` : ''}
                    ${col.className || ''}
                  `.trim()}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12">
                  {emptyIcon && <div className="text-surface-300 mb-2">{emptyIcon}</div>}
                  <p className="text-body text-surface-500">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              data.map((row, i) =>
                renderRow ? renderRow(row, i) : (
                  <tr
                    key={row.id || i}
                    onClick={() => onRowClick?.(row)}
                    className={`
                      ${rowHeight} border-b border-surface-100 last:border-b-0
                      ${onRowClick ? 'cursor-pointer hover:bg-surface-50' : ''}
                      transition-colors duration-fast
                    `}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 text-body text-surface-800 text-${col.align || 'left'}`}
                      >
                        {col.render ? col.render(row[col.key], row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {hasPagination && total > 0 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-caption text-surface-500">
            {showingFrom}–{showingTo} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Sub-components for custom renderRow usage */
Table.Row = function TableRow({ children, className = '', flash = false, onClick, ...props }) {
  return (
    <tr
      onClick={onClick}
      className={`
        border-b border-surface-100 last:border-b-0
        ${onClick ? 'cursor-pointer hover:bg-surface-50' : ''}
        transition-colors duration-fast
        ${flash ? 'animate-row-flash' : ''}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </tr>
  );
};

Table.Cell = function TableCell({ children, align = 'left', compact, className = '', ...props }) {
  return (
    <td
      className={`
        ${compact ? 'h-9' : 'h-11'} px-3
        text-body text-surface-800
        text-${align}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </td>
  );
};
