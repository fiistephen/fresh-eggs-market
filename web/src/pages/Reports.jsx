import { Link } from 'react-router-dom';
import { REPORT_CARDS } from './reportsCatalog';

// SVG Icons
const BarChartIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="14" />
    <rect x="14" y="7" width="7" height="10" />
  </svg>
);

const PieChartIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2v10h10" />
  </svg>
);

const LineChartIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 17" />
  </svg>
);

const BoxIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);

function getReportIcon(reportType) {
  const iconMap = {
    'executive-summary': <BarChartIcon />,
    'sales-summary': <LineChartIcon />,
    'sales-by-item': <PieChartIcon />,
    'sales-by-category': <PieChartIcon />,
    'sales-by-payment-type': <BarChartIcon />,
    'sales-by-employee': <BarChartIcon />,
    'receipts': <BoxIcon />,
    'batch-summary': <BarChartIcon />,
    'inventory-control': <BoxIcon />,
  };
  return iconMap[reportType] || <BarChartIcon />;
}

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display text-surface-900">Reports</h1>
        <p className="text-body text-surface-600 mt-2">
          Choose the report you want to open. Each report now has its own page so it is easier to read and use.
        </p>
      </div>

      <div className="bg-surface-50 rounded-lg border border-surface-200 p-4 shadow-xs">
        <p className="text-body-medium text-surface-900">How to use this page</p>
        <p className="text-body text-surface-600 mt-1">
          Start by opening one report card. Then choose the date range inside that report page.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {REPORT_CARDS.map((report) => (
          <Link
            key={report.key}
            to={`/reports/${report.key}`}
            className="rounded-lg border border-surface-200 bg-surface-white p-5 hover:shadow-md transition-shadow duration-normal hover:border-brand-300 group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="text-brand-600 group-hover:text-brand-700 transition-colors duration-normal">
                  {getReportIcon(report.key)}
                </div>
                <h2 className="text-title text-surface-900 mt-4">{report.title}</h2>
                <p className="text-body text-surface-600 mt-2">{report.description}</p>
              </div>
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-brand-600 group-hover:translate-x-0.5 transition-transform duration-normal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
