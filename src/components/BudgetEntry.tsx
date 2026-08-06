// ============================================================
// BudgetEntry.tsx — one month of figures, in about two minutes.
//
// This is the whole reason the module works without a bank connection.
// Monarch and Origin both read a transaction feed; entering 200
// transactions by hand is not a smaller version of that, it is a
// different and impossible task. But the Sankey never needed the
// transactions — it needs category totals, and there are about fifteen.
//
// Category totals are NOT entered. They are sums of the lines below
// them, shown live in each group's header so the user can see the total
// they were going to type appear on its own.
// ============================================================
import { useState } from 'react';
import {
  CATEGORIES, INCOME_SOURCES, childrenOf, computeMonth,
  type CategoryId, type MonthEntry, type SubcategoryId,
} from '../lib/budget';
import { fmtInputCommas, fmtMoney, parseMoneyInput } from '../lib/format';
import './BudgetEntry.css';

type Props = {
  entry: MonthEntry;
  onChange: (next: MonthEntry) => void;
  onReset: () => void;
  collapsed: boolean;
  onToggle: () => void;
};

type GroupId = 'income' | CategoryId;

export function BudgetEntry({ entry, onChange, onReset, collapsed, onToggle }: Props) {
  const [open, setOpen] = useState<GroupId>('income');
  const totals = computeMonth(entry);

  const setIncome = (id: string, raw: string) => {
    const income = { ...entry.income };
    if (raw.trim() === '') delete income[id as keyof typeof income];
    else income[id as keyof typeof income] = parseMoneyInput(raw);
    onChange({ ...entry, income });
  };

  const setSpend = (id: SubcategoryId, raw: string) => {
    const spend = { ...entry.spend };
    // A cleared field becomes ABSENT, not 0. "I have not entered this" and
    // "this really was zero" are different facts, and Vantage already paid
    // for conflating them once.
    if (raw.trim() === '') delete spend[id];
    else spend[id] = parseMoneyInput(raw);
    onChange({ ...entry, spend });
  };

  if (collapsed) {
    return (
      <aside className="be be--collapsed">
        <button className="be-toggle" onClick={onToggle} aria-label="Expand entry panel">›</button>
        <span className="be-collapsed-label">Figures</span>
      </aside>
    );
  }

  return (
    <aside className="be">
      <div className="be-head">
        <h2 className="be-title">This month</h2>
        <button className="be-toggle" onClick={onToggle} aria-label="Collapse entry panel">‹</button>
      </div>

      <div className="be-groups">
        <Group
          id="income" title="Income" open={open === 'income'} onOpen={setOpen}
          total={totals.totalIncome}
        >
          {INCOME_SOURCES.map((s) => (
            <Field
              key={s.id}
              label={s.name}
              hint={s.hint}
              value={entry.income[s.id]}
              onChange={(v) => setIncome(s.id, v)}
            />
          ))}
        </Group>

        {CATEGORIES.map((c) => {
          const t = totals.categories.find((x) => x.id === c.id);
          return (
            <Group
              key={c.id} id={c.id} title={c.name} open={open === c.id} onOpen={setOpen}
              total={t?.total ?? 0} color={c.color}
            >
              {childrenOf(c.id).map((s) => (
                <Field
                  key={s.id}
                  label={s.name}
                  hint={s.fixed ? 'Fixed commitment' : 'Variable'}
                  fixed={s.fixed}
                  value={entry.spend[s.id]}
                  onChange={(v) => setSpend(s.id, v)}
                />
              ))}
            </Group>
          );
        })}
      </div>

      <div className="be-foot">
        {/* Both are derived. Neither can be typed, so neither can be wrong. */}
        <div className="be-derived">
          <span>Expenses</span>
          <span className="tabular">{fmtMoney(totals.totalExpenses)}</span>
        </div>
        <div className={`be-derived is-strong ${totals.savings < 0 ? 'is-neg' : ''}`}>
          <span>{totals.savings < 0 ? 'Shortfall' : 'Saved'}</span>
          <span className="tabular">{fmtMoney(Math.abs(totals.savings))}</span>
        </div>
        <button className="be-reset" onClick={onReset}>Reset to sample</button>
      </div>
    </aside>
  );
}

function Group({ id, title, total, color, open, onOpen, children }: {
  id: GroupId; title: string; total: number; color?: string;
  open: boolean; onOpen: (id: GroupId) => void; children: React.ReactNode;
}) {
  return (
    <div className={`be-group ${open ? 'is-open' : ''}`}>
      <button className="be-group-head" onClick={() => onOpen(open ? ('income' as GroupId) : id)}>
        {color && <span className="be-swatch" style={{ background: color }} />}
        <span className="be-group-title">{title}</span>
        {/* The sum of the lines below, appearing as they are typed. This is
            the number a normal budgeting app asks you to enter twice. */}
        <span className="be-group-total tabular">{total > 0 ? fmtMoney(total) : '—'}</span>
      </button>
      {open && <div className="be-fields">{children}</div>}
    </div>
  );
}

function Field({ label, hint, value, fixed, onChange }: {
  label: string; hint: string; value: number | null | undefined;
  fixed?: boolean; onChange: (raw: string) => void;
}) {
  return (
    <label className="be-field">
      <span className="be-field-label">
        {label}
        {fixed && <span className="be-fixed" title="Hard to change this month">fixed</span>}
      </span>
      <input
        className="be-input tabular"
        inputMode="decimal"
        value={typeof value === 'number' ? fmtInputCommas(value) : ''}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="be-field-hint">{hint}</span>
    </label>
  );
}
