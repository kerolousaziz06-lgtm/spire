// ============================================================
// ReconNotice.tsx — "these figures contradict each other".
//
// Errors are arithmetic impossibilities (gross profit above revenue, a
// balance sheet that does not balance). Cautions are unusual but possible
// and never suppress anything. Both name the fields, because the point is
// to send the user to the one number that needs fixing.
// ============================================================
import { FIELD_LABELS, type ReconIssue } from '../lib/analysis';
import './ReconNotice.css';

export function ReconNotice({ issues }: { issues: ReconIssue[] }) {
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.severity === 'error');
  const cautions = issues.filter((i) => i.severity === 'caution');

  return (
    <div className={`recon ${errors.length ? 'recon--error' : 'recon--caution'}`} role="alert">
      <div className="recon-title">
        {errors.length > 0
          ? `${errors.length} figure${errors.length === 1 ? '' : 's'} cannot be right`
          : `${cautions.length} figure${cautions.length === 1 ? '' : 's'} worth checking`}
      </div>
      <ul className="recon-list">
        {[...errors, ...cautions].map((i) => (
          <li key={i.id} className={`recon-item recon-item--${i.severity}`}>
            <span className="recon-fields">
              {i.fields.map((f) => FIELD_LABELS[f]).join(' · ')}
            </span>
            <span className="recon-message">{i.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
