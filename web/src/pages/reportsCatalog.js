export const REPORT_CARDS = [
  {
    key: 'executive-summary',
    title: 'Executive Summary',
    description: 'Open a high-level investor and funder view with the key numbers for the period.',
    icon: '📌',
    accent: 'from-rose-50 to-white border-rose-200',
    group: 'Management',
  },
  {
    key: 'sales-summary',
    title: 'Sales Summary',
    description: 'See total sales, profit, and day-by-day movement for the period.',
    icon: '📈',
    accent: 'from-emerald-50 to-white border-emerald-200',
    group: 'Sales',
  },
  {
    key: 'sales-by-item',
    title: 'Sales By Item',
    description: 'Compare item codes, names, and sale types to see what sold best.',
    icon: '🥚',
    accent: 'from-blue-50 to-white border-blue-200',
    group: 'Sales',
  },
  {
    key: 'sales-by-category',
    title: 'Sales By Category',
    description: 'Review sales value by product category such as FE eggs, crates, or delivery.',
    icon: '🗂️',
    accent: 'from-amber-50 to-white border-amber-200',
    group: 'Sales',
  },
  {
    key: 'sales-by-payment-type',
    title: 'Sales By Payment Type',
    description: 'Check how customers paid and the value from each payment type.',
    icon: '💳',
    accent: 'from-fuchsia-50 to-white border-fuchsia-200',
    group: 'Sales',
  },
  {
    key: 'sales-by-employee',
    title: 'Sales By Employee',
    description: 'See who handled sales and how much value each staff member recorded.',
    icon: '👤',
    accent: 'from-sky-50 to-white border-sky-200',
    group: 'Sales',
  },
  {
    key: 'receipts',
    title: 'Receipts',
    description: 'Open the receipt log for the selected period and inspect the money trail.',
    icon: '🧾',
    accent: 'from-slate-50 to-white border-slate-200',
    group: 'Sales',
  },
  {
    key: 'batch-summary',
    title: 'Batch Summary',
    description: 'Review profit by batch, compare against company target, and spot weak batches quickly.',
    icon: '📦',
    accent: 'from-violet-50 to-white border-violet-200',
    group: 'Operations',
  },
  {
    key: 'inventory-control',
    title: 'Inventory Control',
    description: 'Track active stock, crack alerts, and count issues that need attention.',
    icon: '🚨',
    accent: 'from-orange-50 to-white border-orange-200',
    group: 'Operations',
  },
];

export function getReportCard(reportType) {
  return REPORT_CARDS.find((card) => card.key === reportType);
}
