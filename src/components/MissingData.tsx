// ============================================================
// MissingData.tsx — what an analysis shows when it cannot run.
//
// "Skip, never fake." When a required figure is absent the analysis is
// not computed from zeros and is not rated; this states plainly what it
// needs. Naming the fields matters: the alternative is a blank panel
// that looks broken rather than one that looks incomplete.
// ============================================================
import { FIELD_LABELS, type CompanyField } from '../lib/analysis';
import './MissingData.css';

type Props = {
  /** What could not be produced, e.g. "the DCF valuation". */
  what: string;
  fields: CompanyField[];
};

export function MissingData({ what, fields }: Props) {
  if (fields.length === 0) return null;
  return (
    <div className="missing" role="status">
      <div className="missing-title">Not enough data for {what}</div>
      <p className="missing-body">
        Enter {fields.length === 1 ? 'this figure' : 'these figures'} in the sidebar and it will
        appear. Nothing is estimated on your behalf.
      </p>
      <ul className="missing-list">
        {fields.map((f) => (
          <li key={f}>{FIELD_LABELS[f]}</li>
        ))}
      </ul>
    </div>
  );
}
