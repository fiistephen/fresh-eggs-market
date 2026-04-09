const TONES = {
  info: 'border-info-200 bg-info-50 text-info-700',
  success: 'border-success-200 bg-success-50 text-success-700',
  error: 'border-error-200 bg-error-50 text-error-700',
  neutral: 'border-surface-200 bg-surface-50 text-surface-700',
};

export default function NoticeBanner({ tone = 'neutral', title, children, compact = false }) {
  return (
    <div className={`rounded-lg border px-4 ${compact ? 'py-3' : 'py-4'} ${TONES[tone] || TONES.neutral}`}>
      {title ? <p className="text-body-medium">{title}</p> : null}
      {children ? (
        <div className={`${title ? 'mt-1' : ''} text-body`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
