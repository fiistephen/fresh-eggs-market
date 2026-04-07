export const REPORT_CARDS = [
  {
    key: 'sales-summary',
    title: 'Sales Summary',
    description: 'See total sales, profit, and day-by-day movement for the period.',
    icon: '📈',
    accent: 'from-emerald-50 to-white border-emerald-200',
  },
  {
    key: 'sales-by-item',
    title: 'Sales By Item',
    description: 'Compare egg codes and sale types to see what sold best.',
    icon: '🥚',
    accent: 'from-blue-50 to-white border-blue-200',
  },
  {
    key: 'sales-by-category',
    title: 'Sales By Category',
    description: 'Review wholesale, retail, cracked, and write-off performance.',
    icon: '🗂️',
    accent: 'from-amber-50 to-white border-amber-200',
  },
  {
    key: 'sales-by-payment-type',
    title: 'Sales By Payment Type',
    description: 'Check how customers paid and the value from each payment type.',
    icon: '💳',
    accent: 'from-fuchsia-50 to-white border-fuchsia-200',
  },
  {
    key: 'sales-by-employee',
    title: 'Sales By Employee',
    description: 'See who handled sales and how much value each staff member recorded.',
    icon: '👤',
    accent: 'from-sky-50 to-white border-sky-200',
  },
  {
    key: 'receipts',
    title: 'Receipts',
    description: 'Open the receipt log for the selected period and inspect the money trail.',
    icon: '🧾',
    accent: 'from-slate-50 to-white border-slate-200',
  },
];

export function getReportCard(reportType) {
  return REPORT_CARDS.find((card) => card.key === reportType);
}
