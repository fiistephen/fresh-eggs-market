import { Link } from 'react-router-dom';
import { REPORT_CARDS } from './reportsCatalog';

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose the report you want to open. Each report now has its own page so it is easier to read and use.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-medium text-gray-900">How to use this page</p>
        <p className="text-sm text-gray-600 mt-1">
          Start by opening one report card. Then choose the date range inside that report page.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {REPORT_CARDS.map((report) => (
          <Link
            key={report.key}
            to={`/reports/${report.key}`}
            className={`rounded-2xl border bg-gradient-to-br ${report.accent} p-5 hover:shadow-md transition-shadow`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-3xl" aria-hidden="true">{report.icon}</span>
                <h2 className="text-lg font-semibold text-gray-900 mt-4">{report.title}</h2>
                <p className="text-sm text-gray-600 mt-2">{report.description}</p>
              </div>
              <span className="text-brand-600 text-sm font-medium">Open</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
