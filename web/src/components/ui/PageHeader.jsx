export default function PageHeader({ title, description, aside = null, compact = false }) {
  return (
    <div className={`flex flex-col gap-3 ${compact ? 'lg:flex-row lg:items-start lg:justify-between' : 'lg:flex-row lg:items-end lg:justify-between'}`}>
      <div className="min-w-0">
        <h1 className="text-display text-surface-900">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-body text-surface-600">
            {description}
          </p>
        ) : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}
