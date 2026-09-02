import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Check, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, getPayDatesForMonth, getBillsForMonth, getBillStatus, monthKey, monthLabel } from '../utils/helpers';

// ── Constants ─────────────────────────────────────────────────────────────────

const FED_BRACKETS = {
  single: [[0,11925,0.10],[11925,48475,0.12],[48475,103350,0.22],[103350,197300,0.24],[197300,250525,0.32],[250525,626350,0.35],[626350,Infinity,0.37]],
  mfj:    [[0,23850,0.10],[23850,96950,0.12],[96950,206700,0.22],[206700,394600,0.24],[394600,501050,0.32],[501050,731200,0.35],[731200,Infinity,0.37]],
  mfs:    [[0,11925,0.10],[11925,48475,0.12],[48475,103350,0.22],[103350,197300,0.24],[197300,250525,0.32],[250525,313200,0.35],[313200,Infinity,0.37]],
  hoh:    [[0,17000,0.10],[17000,64850,0.12],[64850,103350,0.22],[103350,197300,0.24],[197300,250500,0.32],[250500,626350,0.35],[626350,Infinity,0.37]],
};
const STD_DEDUCTIONS_FED = { single: 15000, mfj: 30000, mfs: 15000, hoh: 22500 };

// ── Tax helpers ───────────────────────────────────────────────────────────────

function calcFedTax(taxable, filing) {
  const brackets = FED_BRACKETS[filing] || FED_BRACKETS.single;
  let tax = 0;
  for (const [lo, hi, rate] of brackets) {
    if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
  }
  return Math.max(0, tax);
}

function calcARTax(agi, filing) {
  const stdDed = filing === 'mfj' ? 4400 : 2200;
  const net = Math.max(0, agi - stdDed);
  let tax = 0;
  if (net > 89500) tax += (net - 89500) * 0.049;
  if (net > 23800) tax += (Math.min(net, 89500) - 23800) * 0.044;
  if (net > 14100) tax += (Math.min(net, 23800) - 14100) * 0.034;
  if (net > 10000) tax += (Math.min(net, 14100) - 10000) * 0.03;
  if (net > 5000) tax += (Math.min(net, 10000) - 5000) * 0.02;
  const credits = filing === 'mfj' ? 2 : 1;
  tax = Math.max(0, tax - credits * 29);
  return Math.max(0, tax);
}

const DEDUCTION_TYPES = [
  { type: 'health', label: 'Health Insurance' },
  { type: 'dental', label: 'Dental Insurance' },
  { type: 'vision', label: 'Vision Insurance' },
  { type: '401k', label: '401k / Pre-Tax IRA' },
  { type: 'hsa', label: 'HSA' },
  { type: 'fsa', label: 'FSA' },
  { type: 'life', label: 'Life Insurance' },
  { type: 'ot_adj', label: 'Overtime Adjustment' },
  { type: 'union', label: 'Union Dues' },
  { type: 'garnish', label: 'Child Support / Garnishment' },
  { type: 'other', label: 'Other / Custom' },
];

// Uses grossAmount from income records when available, falls back to amount
function annualFromRecords(income, useGross = true) {
  return income.reduce((s, i) => {
    const mult = i.frequency === 'weekly' ? 52 : i.frequency === 'biweekly' ? 26 : i.frequency === 'semimonthly' ? 24 : 12;
    const amt = useGross
      ? (parseFloat(i.grossAmount) || parseFloat(i.amount) || 0)
      : (parseFloat(i.amount) || 0);
    return s + amt * mult;
  }, 0);
}

// ── IRA helpers ───────────────────────────────────────────────────────────────

function projectIRA({ currentBalance, annualEmployee, annualEmployer, returnPct, years, targetBalance }) {
  const data = [];
  let balance = parseFloat(currentBalance) || 0;
  const rate = (parseFloat(returnPct) || 7) / 100;
  const totalContrib = (parseFloat(annualEmployee) || 0) + (parseFloat(annualEmployer) || 0);
  let hitTargetYear = null;
  for (let y = 1; y <= (parseInt(years) || 30); y++) {
    balance = (balance + totalContrib) * (1 + rate);
    if (targetBalance && !hitTargetYear && balance >= parseFloat(targetBalance)) hitTargetYear = y;
    data.push({ year: y, balance: Math.round(balance) });
  }
  return { data, hitTargetYear };
}

// ── PTO helpers ───────────────────────────────────────────────────────────────

function calcPTOEarned(shifts, jobId, baseDateStr, accrualRate) {
  if (!baseDateStr || !jobId) return 0;
  const baseDate = new Date(baseDateStr + 'T12:00:00');
  return shifts
    .filter((s) => s.jobId === jobId && !s.otExempt && new Date(s.date + 'T12:00:00') > baseDate)
    .reduce((s, sh) => s + sh.hoursWorked, 0) / (parseFloat(accrualRate) || 24);
}

function avgHoursPerWeek(shifts, jobId, weeksBack = 8) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeksBack * 7);
  const recent = shifts.filter((s) => s.jobId === jobId && !s.otExempt && new Date(s.date + 'T12:00:00') >= cutoff);
  if (recent.length === 0) return 0;
  return recent.reduce((s, sh) => s + sh.hoursWorked, 0) / weeksBack;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Label({ children }) {
  return <label className="app-label">{children}</label>;
}

function Input(props) {
  return <input {...props} className="app-input" />;
}

function Sel({ children, ...props }) {
  return <select {...props} className="app-input">{children}</select>;
}

function Card({ children, style }) {
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem', ...style }}>
      {children}
    </div>
  );
}

function Row({ label, value, color, large }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0' }}>
      <span style={{ fontSize: large ? '1rem' : '0.875rem', color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: large ? '1.0625rem' : '0.9375rem', fontWeight: large ? 800 : 600, color: color || 'var(--text)' }}>{value}</span>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      style={{ width: '2.75rem', height: '1.5rem', borderRadius: '9999px', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
        backgroundColor: value ? 'var(--accent)' : 'var(--border2)' }}>
      <span style={{ position: 'absolute', top: '2px', width: '1.125rem', height: '1.125rem', borderRadius: '9999px', backgroundColor: '#fff', transition: 'left 0.2s',
        left: value ? 'calc(100% - 1.25rem)' : '2px' }} />
    </button>
  );
}

// ── Tax Tab ───────────────────────────────────────────────────────────────────

function TaxTab({ s, onChange, income, jobs }) {
  const update = (key, val) => onChange({ ...s, tax: { ...s.tax, [key]: val } });

  const grossFromRecords = annualFromRecords(income, true);
  const netFromRecords = annualFromRecords(income, false);
  const grossIncome = s.tax.useIncomeData ? grossFromRecords : (parseFloat(s.tax.manualGrossIncome) || 0);

  const autoIRADeduction = useMemo(() => {
    return jobs.reduce((sum, job) => {
      const periods = job.payFrequency === 'weekly' ? 52 : 26;
      if (job.iraType === 'percent' && job.iraPercent > 0) {
        return sum + (grossIncome / periods) * (job.iraPercent / 100) * periods;
      }
      return sum + (job.iraPerPeriod || 0) * periods;
    }, 0);
  }, [jobs, grossIncome]);

  // Deductions list
  const deductions = s.tax.deductions || [];
  const addDeduction = (type) => {
    if (!type) return;
    const preset = DEDUCTION_TYPES.find((d) => d.type === type);
    update('deductions', [...deductions, { id: Date.now(), type, label: preset?.label || 'Deduction', annualAmount: '' }]);
  };
  const updateDeduction = (id, field, val) =>
    update('deductions', deductions.map((d) => d.id === id ? { ...d, [field]: val } : d));
  const removeDeduction = (id) =>
    update('deductions', deductions.filter((d) => d.id !== id));
  const manualDeductionsTotal = deductions.reduce((s, d) => s + (parseFloat(d.annualAmount) || 0), 0);

  const preTaxDeductions = autoIRADeduction + manualDeductionsTotal;
  const agi = Math.max(0, grossIncome - preTaxDeductions);
  const deductionAmt = s.tax.useStandardDeduction
    ? (STD_DEDUCTIONS_FED[s.tax.filingStatus] || 15000)
    : (parseFloat(s.tax.itemizedDeductions) || 0);
  const fedTaxable = Math.max(0, agi - deductionAmt);

  const fedTax = calcFedTax(fedTaxable, s.tax.filingStatus);
  const ctc = (parseInt(s.tax.dependentsUnder17) || 0) * 2000;
  const otherCredits = parseFloat(s.tax.otherCredits) || 0;
  const fedNet = Math.max(0, fedTax - ctc - otherCredits);
  const arTax = calcARTax(agi, s.tax.filingStatus);

  // Withholding: default to calculated expected (= tax owed); manual entry overrides for accuracy
  const fedWithheldManual = s.tax.manualFedWithheld !== '' ? parseFloat(s.tax.manualFedWithheld) : null;
  const arWithheldManual = s.tax.manualStateWithheld !== '' ? parseFloat(s.tax.manualStateWithheld) : null;
  const fedWithheld = fedWithheldManual ?? fedNet;
  const arWithheld = arWithheldManual ?? arTax;
  const fedDiff = fedWithheld - fedNet;
  const arDiff = arWithheld - arTax;
  const usingAutoWithholding = fedWithheldManual === null && arWithheldManual === null;

  const effRate = grossIncome > 0 ? ((fedNet / grossIncome) * 100).toFixed(1) : '0.0';
  const marginalRate = (() => {
    const brackets = FED_BRACKETS[s.tax.filingStatus] || FED_BRACKETS.single;
    let rate = 0.10;
    for (const [lo, , r] of brackets) { if (fedTaxable > lo) rate = r; }
    return (rate * 100).toFixed(0);
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Card>
        <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.75rem' }}>Tax Settings · 2025 Brackets</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <Label>Filing Status</Label>
            <Sel value={s.tax.filingStatus} onChange={(e) => update('filingStatus', e.target.value)}>
              <option value="single">Single</option>
              <option value="mfj">Married Filing Jointly</option>
              <option value="mfs">Married Filing Separately</option>
              <option value="hoh">Head of Household</option>
            </Sel>
          </div>

          {/* Income source */}
          <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: s.tax.useIncomeData && income.length > 0 ? '0.625rem' : 0 }}>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>Use Income Records</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
                  {s.tax.useIncomeData
                    ? income.length > 0 ? `${income.length} record${income.length !== 1 ? 's' : ''} found` : 'No income records — enter manually'
                    : 'Enter income manually below'}
                </p>
              </div>
              <Toggle value={s.tax.useIncomeData} onChange={(v) => update('useIncomeData', v)} />
            </div>
            {s.tax.useIncomeData && income.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.625rem' }}>
                <div>
                  <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)' }}>Annual Gross</p>
                  <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9375rem' }}>{formatCurrency(grossFromRecords)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)' }}>Annual Net</p>
                  <p style={{ fontWeight: 700, color: 'var(--positive-text)', fontSize: '0.9375rem' }}>{formatCurrency(netFromRecords)}</p>
                </div>
              </div>
            )}
          </div>

          {(!s.tax.useIncomeData || income.length === 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <Label>Annual Gross Income</Label>
                <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Before taxes</p>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
                  <Input type="number" min="0" step="1" placeholder="75000" value={s.tax.manualGrossIncome}
                    onChange={(e) => update('manualGrossIncome', e.target.value)} style={{ paddingLeft: '1.75rem' }} />
                </div>
              </div>
              <div>
                <Label>Annual Net Income</Label>
                <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Take-home (reference)</p>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
                  <Input type="number" min="0" step="1" placeholder="55000" value={s.tax.manualNetIncome || ''}
                    onChange={(e) => update('manualNetIncome', e.target.value)} style={{ paddingLeft: '1.75rem' }} />
                </div>
              </div>
            </div>
          )}

          {/* Pre-tax deductions */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <Label>Pre-Tax Deductions</Label>
              {preTaxDeductions > 0 && (
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)' }}>
                  {formatCurrency(preTaxDeductions)}/yr
                </span>
              )}
            </div>
            {autoIRADeduction > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginBottom: '0.5rem', padding: '0.375rem 0.625rem', backgroundColor: 'var(--surface2)', borderRadius: '0.5rem' }}>
                IRA from job settings: {formatCurrency(autoIRADeduction)}/yr (auto-included)
              </div>
            )}
            {deductions.map((d) => (
              <div key={d.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text)', fontWeight: 500 }}>{d.label}</span>
                <div style={{ position: 'relative', width: '8rem', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '0.875rem' }}>$</span>
                  <Input type="number" min="0" step="1" placeholder="0"
                    value={d.annualAmount}
                    onChange={(e) => updateDeduction(d.id, 'annualAmount', e.target.value)}
                    style={{ paddingLeft: '1.625rem', paddingRight: '0.5rem' }} />
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--subtle)', flexShrink: 0 }}>/yr</span>
                <button type="button" onClick={() => removeDeduction(d.id)}
                  style={{ flexShrink: 0, width: '1.75rem', height: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.5rem', border: 'none', backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>
                  ×
                </button>
              </div>
            ))}
            <Sel value="" onChange={(e) => { addDeduction(e.target.value); e.target.value = ''; }}
              style={{ color: deductions.length === 0 ? 'var(--muted)' : undefined }}>
              <option value="">+ Add deduction…</option>
              {DEDUCTION_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </Sel>
          </div>

          {/* Fed/itemized deduction */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
              <Label>Federal Deduction</Label>
              <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.5rem', padding: '0.125rem', gap: '0.125rem' }}>
                {[['standard', 'Standard'], ['itemized', 'Itemized']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => update('useStandardDeduction', v === 'standard')}
                    style={{ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                      backgroundColor: (v === 'standard') === s.tax.useStandardDeduction ? 'var(--accent)' : 'transparent',
                      color: (v === 'standard') === s.tax.useStandardDeduction ? '#fff' : 'var(--muted)' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {s.tax.useStandardDeduction ? (
              <div className="app-input" style={{ color: 'var(--subtle)', cursor: 'default' }}>
                {formatCurrency(STD_DEDUCTIONS_FED[s.tax.filingStatus] || 15000)} (2025 standard)
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
                <Input type="number" min="0" step="1" placeholder="0" value={s.tax.itemizedDeductions}
                  onChange={(e) => update('itemizedDeductions', e.target.value)} style={{ paddingLeft: '1.75rem' }} />
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <Label>Dependents Under 17</Label>
              <Input type="number" min="0" step="1" placeholder="0" value={s.tax.dependentsUnder17}
                onChange={(e) => update('dependentsUnder17', e.target.value)} />
              <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>$2,000 CTC each</p>
            </div>
            <div>
              <Label>Other Credits ($)</Label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
                <Input type="number" min="0" step="1" placeholder="0" value={s.tax.otherCredits}
                  onChange={(e) => update('otherCredits', e.target.value)} style={{ paddingLeft: '1.75rem' }} />
              </div>
            </div>
          </div>

          {/* Withholding */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div>
                <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>Withholding (Full Year)</p>
                {usingAutoWithholding && grossIncome > 0 && (
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                    Auto-estimated from brackets · Enter actual for best accuracy
                  </p>
                )}
              </div>
              {!usingAutoWithholding && (
                <button type="button"
                  onClick={() => { update('manualFedWithheld', ''); onChange({ ...s, tax: { ...s.tax, manualFedWithheld: '', manualStateWithheld: '' } }); }}
                  style={{ fontSize: '0.7rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Reset to auto
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <Label>Federal Withheld</Label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
                  <Input type="number" min="0" step="1"
                    placeholder={grossIncome > 0 ? Math.round(fedNet).toString() : '0'}
                    value={s.tax.manualFedWithheld}
                    onChange={(e) => update('manualFedWithheld', e.target.value)}
                    style={{ paddingLeft: '1.75rem' }} />
                </div>
              </div>
              <div>
                <Label>AR State Withheld</Label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
                  <Input type="number" min="0" step="1"
                    placeholder={grossIncome > 0 ? Math.round(arTax).toString() : '0'}
                    value={s.tax.manualStateWithheld}
                    onChange={(e) => update('manualStateWithheld', e.target.value)}
                    style={{ paddingLeft: '1.75rem' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {grossIncome > 0 && (
        <Card>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.75rem' }}>Estimated 2025 Tax Return</p>

          <Row label="Gross Income" value={formatCurrency(grossIncome)} />
          {preTaxDeductions > 0 && (
            <>
              {autoIRADeduction > 0 && <Row label="IRA / Job deductions" value={`−${formatCurrency(autoIRADeduction)}`} color="var(--danger)" />}
              {deductions.filter((d) => parseFloat(d.annualAmount) > 0).map((d) => (
                <Row key={d.id} label={d.label} value={`−${formatCurrency(parseFloat(d.annualAmount))}`} color="var(--danger)" />
              ))}
            </>
          )}
          <Row label="Adjusted Gross Income (AGI)" value={formatCurrency(agi)} />
          <Row label={`${s.tax.useStandardDeduction ? 'Standard' : 'Itemized'} Deduction`} value={`−${formatCurrency(deductionAmt)}`} color="var(--danger)" />
          <Row label="Federal Taxable Income" value={formatCurrency(fedTaxable)} />

          <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.75rem' }}>
              <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', marginBottom: '0.5rem' }}>Federal</p>
              <Row label="Tax owed" value={formatCurrency(fedTax)} />
              {ctc > 0 && <Row label="Child Tax Credit" value={`−${formatCurrency(ctc)}`} color="var(--positive-text)" />}
              {otherCredits > 0 && <Row label="Other credits" value={`−${formatCurrency(otherCredits)}`} color="var(--positive-text)" />}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.375rem', paddingTop: '0.375rem' }}>
                <Row label="Net tax" value={formatCurrency(fedNet)} large />
                <Row label={fedWithheldManual !== null ? 'Withheld (actual)' : 'Withheld (est.)'} value={formatCurrency(fedWithheld)} />
              </div>
              <div style={{ marginTop: '0.5rem', padding: '0.5rem', borderRadius: '0.5rem', textAlign: 'center',
                backgroundColor: fedDiff >= 0 ? 'var(--positive-soft)' : 'rgba(239,68,68,0.1)' }}>
                <p style={{ fontSize: '0.65rem', color: 'var(--subtle)' }}>{fedDiff >= 0 ? 'Est. Refund' : 'Est. Owe'}</p>
                <p style={{ fontSize: '1.125rem', fontWeight: 800, color: fedDiff >= 0 ? 'var(--positive-text)' : 'var(--danger)' }}>
                  {formatCurrency(Math.abs(fedDiff))}
                </p>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.75rem' }}>
              <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', marginBottom: '0.5rem' }}>Arkansas</p>
              <Row label="AR AGI" value={formatCurrency(agi)} />
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.375rem', paddingTop: '0.375rem' }}>
                <Row label="Tax owed" value={formatCurrency(arTax)} large />
                <Row label={arWithheldManual !== null ? 'Withheld (actual)' : 'Withheld (est.)'} value={formatCurrency(arWithheld)} />
              </div>
              <div style={{ marginTop: '0.5rem', padding: '0.5rem', borderRadius: '0.5rem', textAlign: 'center',
                backgroundColor: arDiff >= 0 ? 'var(--positive-soft)' : 'rgba(239,68,68,0.1)' }}>
                <p style={{ fontSize: '0.65rem', color: 'var(--subtle)' }}>{arDiff >= 0 ? 'Est. Refund' : 'Est. Owe'}</p>
                <p style={{ fontSize: '1.125rem', fontWeight: 800, color: arDiff >= 0 ? 'var(--positive-text)' : 'var(--danger)' }}>
                  {formatCurrency(Math.abs(arDiff))}
                </p>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.75rem', display: 'flex', gap: '0.75rem' }}>
            {[['Effective Rate', `${effRate}%`], ['Marginal Rate', `${marginalRate}%`], ['Total Tax', formatCurrency(fedNet + arTax)]].map(([l, v]) => (
              <div key={l} style={{ flex: 1, textAlign: 'center' }}>
                <p style={{ fontSize: '0.65rem', color: 'var(--subtle)' }}>{l}</p>
                <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>{v}</p>
              </div>
            ))}
          </div>

          {usingAutoWithholding && (
            <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.75rem', textAlign: 'center' }}>
              Refund/owe based on estimated withholding · Enter actual YTD amounts above for accuracy
            </p>
          )}
          <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.375rem', textAlign: 'center' }}>
            2025 federal &amp; Arkansas brackets. Estimates only — consult a tax professional.
          </p>
        </Card>
      )}
    </div>
  );
}

// ── IRA Tab ───────────────────────────────────────────────────────────────────

function IRATab({ s, onChange, jobs }) {
  const update = (key, val) => onChange({ ...s, ira: { ...s.ira, [key]: val } });
  const [showTable, setShowTable] = useState(false);

  const jobIRAContrib = useMemo(() => {
    if (!s.ira.useJobIRA) return 0;
    return jobs.reduce((sum, job) => {
      const periods = job.payFrequency === 'weekly' ? 52 : 26;
      if (job.iraType === 'amount') return sum + (job.iraPerPeriod || 0) * periods;
      return sum;
    }, 0);
  }, [jobs, s.ira.useJobIRA]);

  const hasPercentIRA = jobs.some((j) => j.iraType === 'percent' && j.iraPercent > 0);
  const annualEmployee = s.ira.useJobIRA && jobIRAContrib > 0 ? jobIRAContrib : (parseFloat(s.ira.manualAnnualContribution) || 0);
  const annualEmployer = annualEmployee * ((parseFloat(s.ira.employerMatchPercent) || 0) / 100);

  const { data, hitTargetYear } = useMemo(() => projectIRA({
    currentBalance: s.ira.currentBalance,
    annualEmployee,
    annualEmployer,
    returnPct: s.ira.expectedReturnPercent,
    years: s.ira.projectionYears,
    targetBalance: s.ira.targetBalance || null,
  }), [s.ira, annualEmployee, annualEmployer]);

  const years = parseInt(s.ira.projectionYears) || 30;
  const finalBalance = data[data.length - 1]?.balance || 0;

  const formatBig = (n) => {
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return formatCurrency(n);
  };

  const chartData = useMemo(() => {
    const step = Math.max(1, Math.floor(data.length / 20));
    return data.filter((_, i) => i % step === 0 || i === data.length - 1);
  }, [data]);

  const showManualContrib = !s.ira.useJobIRA || (s.ira.useJobIRA && jobIRAContrib === 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Card>
        <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.75rem' }}>IRA / 401k Settings</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <Label>Current Balance</Label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
                <Input type="number" min="0" step="1" placeholder="0" value={s.ira.currentBalance}
                  onChange={(e) => update('currentBalance', e.target.value)} style={{ paddingLeft: '1.75rem' }} />
              </div>
            </div>
            <div>
              <Label>Current Age</Label>
              <Input type="number" min="18" max="80" step="1" placeholder="30" value={s.ira.currentAge}
                onChange={(e) => update('currentAge', e.target.value)} />
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>Use Job IRA Settings</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
                {s.ira.useJobIRA
                  ? jobIRAContrib > 0 ? `${formatCurrency(jobIRAContrib)}/yr from jobs`
                    : hasPercentIRA ? 'Enter annual contrib (%-based requires manual)' : 'No fixed IRA in job settings'
                  : 'Enter annual contribution manually'}
              </p>
            </div>
            <Toggle value={s.ira.useJobIRA} onChange={(v) => update('useJobIRA', v)} />
          </div>

          {showManualContrib && (
            <div>
              <Label>Annual Employee Contribution</Label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
                <Input type="number" min="0" step="1" placeholder="3500" value={s.ira.manualAnnualContribution}
                  onChange={(e) => update('manualAnnualContribution', e.target.value)} style={{ paddingLeft: '1.75rem' }} />
              </div>
            </div>
          )}

          <div>
            <Label>Employer Match</Label>
            <div style={{ position: 'relative' }}>
              <Input type="number" min="0" max="200" step="1" placeholder="100" value={s.ira.employerMatchPercent}
                onChange={(e) => update('employerMatchPercent', e.target.value)} style={{ paddingRight: '2rem' }} />
              <span style={{ position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>%</span>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>100% = employer matches your full contribution</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <Label>Expected Return</Label>
              <div style={{ position: 'relative' }}>
                <Input type="number" min="0" max="30" step="0.5" placeholder="7" value={s.ira.expectedReturnPercent}
                  onChange={(e) => update('expectedReturnPercent', e.target.value)} style={{ paddingRight: '2rem' }} />
                <span style={{ position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>%</span>
              </div>
            </div>
            <div>
              <Label>Projection Years</Label>
              <Input type="number" min="1" max="50" step="1" placeholder="30" value={s.ira.projectionYears}
                onChange={(e) => update('projectionYears', e.target.value)} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.5rem', padding: '0.125rem', gap: '0.125rem' }}>
              {[['traditional', 'Traditional (pre-tax)'], ['roth', 'Roth (post-tax)']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => update('iraType', v)}
                  style={{ flex: 1, padding: '0.375rem 0.5rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                    backgroundColor: s.ira.iraType === v ? 'var(--accent)' : 'transparent',
                    color: s.ira.iraType === v ? '#fff' : 'var(--muted)' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Target Balance (optional)</Label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
              <Input type="number" min="0" step="1000" placeholder="1000000" value={s.ira.targetBalance}
                onChange={(e) => update('targetBalance', e.target.value)} style={{ paddingLeft: '1.75rem' }} />
            </div>
          </div>
        </div>
      </Card>

      {(parseFloat(s.ira.currentBalance) > 0 || annualEmployee > 0) && data.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Card>
              <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>In {years} Years</p>
              <p style={{ fontSize: '1.375rem', fontWeight: 900, color: 'var(--positive-text)' }}>{formatBig(finalBalance)}</p>
              {s.ira.currentAge && <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>Age {parseInt(s.ira.currentAge) + years}</p>}
            </Card>
            <Card>
              <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Annual Contribution</p>
              <p style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text)' }}>{formatCurrency(annualEmployee + annualEmployer)}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
                {formatCurrency(annualEmployee)} you + {formatCurrency(annualEmployer)} employer
              </p>
            </Card>
          </div>

          {hitTargetYear && (
            <div style={{ backgroundColor: 'var(--positive-soft)', border: '1px solid var(--positive-text)', borderRadius: '0.875rem', padding: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Check size={18} style={{ color: 'var(--positive-text)', flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, color: 'var(--positive-text)' }}>Hits {formatBig(parseFloat(s.ira.targetBalance))} in year {hitTargetYear}</p>
                {s.ira.currentAge && <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>At age {parseInt(s.ira.currentAge) + hitTargetYear}</p>}
              </div>
            </div>
          )}

          <Card>
            <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.75rem' }}>Balance Projection</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--subtle)' }} tickLine={false}
                  label={{ value: 'Year', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'var(--subtle)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--subtle)' }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.8125rem' }}
                  formatter={(v) => [formatBig(v), 'Balance']}
                  labelFormatter={(y) => `Year ${y}${s.ira.currentAge ? ` (Age ${parseInt(s.ira.currentAge) + y})` : ''}`}
                />
                <Line type="monotone" dataKey="balance" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <button onClick={() => setShowTable(!showTable)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', padding: '0.625rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.875rem', fontWeight: 600 }}>
            {showTable ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showTable ? 'Hide' : 'Show'} Year-by-Year Table
          </button>

          {showTable && (
            <Card>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Year', s.ira.currentAge ? 'Age' : null, 'Annual Contrib', 'Balance'].filter(Boolean).map((h) => (
                        <th key={h} style={{ textAlign: h === 'Year' || h === 'Age' ? 'left' : 'right', padding: '0.375rem 0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.year} style={{ borderBottom: '1px solid var(--border)', backgroundColor: hitTargetYear === row.year ? 'var(--positive-soft)' : 'transparent' }}>
                        <td style={{ padding: '0.375rem 0.5rem', color: 'var(--muted)', fontWeight: hitTargetYear === row.year ? 700 : 400 }}>{row.year}</td>
                        {s.ira.currentAge && <td style={{ padding: '0.375rem 0.5rem', color: 'var(--muted)' }}>{parseInt(s.ira.currentAge) + row.year}</td>}
                        <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: 'var(--text)' }}>{formatCurrency(annualEmployee + annualEmployer)}</td>
                        <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', fontWeight: 700, color: hitTargetYear === row.year ? 'var(--positive-text)' : 'var(--text)' }}>{formatBig(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ── PTO Tab ───────────────────────────────────────────────────────────────────

function PTOTab({ s, onChange, jobs, shifts }) {
  const update = (key, val) => onChange({ ...s, pto: { ...s.pto, [key]: val } });

  const selectedJob = jobs.find((j) => j.id === s.pto.jobId) || jobs[0];
  const jobId = selectedJob?.id || '';
  const accrualRate = selectedJob?.ptoAccrualRate || parseFloat(s.pto.accrualRate) || 24;
  const hoursPerShift = parseFloat(s.pto.hoursPerShift) || 24;

  const earnedSinceBase = useMemo(() => calcPTOEarned(shifts, jobId, s.pto.baseDate, accrualRate), [shifts, jobId, s.pto.baseDate, accrualRate]);
  const baseBalance = parseFloat(s.pto.baseBalance) || 0;
  const rawPTO = baseBalance + earnedSinceBase;
  const capHours = s.pto.capHours ? parseFloat(s.pto.capHours) : Infinity;
  const currentPTO = Math.min(rawPTO, capHours);
  const targetHours = s.pto.targetHours ? parseFloat(s.pto.targetHours) : null;

  const weeklyHours = useMemo(() => avgHoursPerWeek(shifts, jobId, 8), [shifts, jobId]);
  const weeklyPTO = weeklyHours / accrualRate;
  const weeksToTarget = targetHours && weeklyPTO > 0 ? Math.max(0, (targetHours - currentPTO) / weeklyPTO) : null;

  const targetDate = weeksToTarget !== null ? (() => {
    const d = new Date();
    d.setDate(d.getDate() + Math.round(weeksToTarget * 7));
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  })() : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Card>
        <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.75rem' }}>PTO Settings</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {jobs.length > 1 && (
            <div>
              <Label>Job</Label>
              <Sel value={s.pto.jobId || jobId} onChange={(e) => update('jobId', e.target.value)}>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
              </Sel>
            </div>
          )}

          {selectedJob?.ptoAccrualRate ? (
            <div style={{ backgroundColor: 'var(--positive-soft)', border: '1px solid var(--positive-text)', borderRadius: '0.75rem', padding: '0.625rem 0.875rem' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--positive-text)', fontWeight: 600 }}>
                Accrual from job settings: 1 PTO hr per {selectedJob.ptoAccrualRate} worked hrs
              </p>
            </div>
          ) : (
            <div>
              <Label>Accrual Rate (worked hrs per 1 PTO hr)</Label>
              <Input type="number" min="1" step="1" placeholder="24" value={s.pto.accrualRate}
                onChange={(e) => update('accrualRate', e.target.value)} />
              <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>e.g. 24 = earn 1 PTO hr per 24 worked hrs</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <Label>Base Date</Label>
              <Input type="date" value={s.pto.baseDate} onChange={(e) => update('baseDate', e.target.value)} />
              <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>From last pay stub</p>
            </div>
            <div>
              <Label>Balance on Base Date</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.0" value={s.pto.baseBalance}
                onChange={(e) => update('baseBalance', e.target.value)} />
              <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>Hours from pay stub</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <Label>Accrual Cap (hours)</Label>
              <Input type="number" min="0" step="1" placeholder="No cap" value={s.pto.capHours}
                onChange={(e) => update('capHours', e.target.value)} />
            </div>
            <div>
              <Label>Hours Per Shift</Label>
              <Input type="number" min="1" step="0.5" placeholder="24" value={s.pto.hoursPerShift}
                onChange={(e) => update('hoursPerShift', e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Target Hours (optional)</Label>
            <Input type="number" min="0" step="1" placeholder="72" value={s.pto.targetHours}
              onChange={(e) => update('targetHours', e.target.value)} />
            <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>When do you want to have this much PTO?</p>
          </div>
        </div>
      </Card>

      {s.pto.baseDate && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Card>
              <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Current Est. PTO</p>
              <p style={{ fontSize: '1.375rem', fontWeight: 900, color: 'var(--accent-text)' }}>{currentPTO.toFixed(2)}h</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>{(currentPTO / hoursPerShift).toFixed(2)} shifts</p>
              {currentPTO >= capHours && capHours < Infinity && (
                <p style={{ fontSize: '0.7rem', color: 'var(--warn)', marginTop: '0.25rem', fontWeight: 600 }}>At accrual cap</p>
              )}
            </Card>
            <Card>
              <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Earned Since Base</p>
              <p style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text)' }}>{earnedSinceBase.toFixed(2)}h</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
                {weeklyHours > 0 ? `+${weeklyPTO.toFixed(2)}h/wk avg` : 'No recent shifts'}
              </p>
            </Card>
          </div>

          {targetHours && (
            <div style={{ backgroundColor: currentPTO >= targetHours ? 'var(--positive-soft)' : 'var(--surface2)', border: `1px solid ${currentPTO >= targetHours ? 'var(--positive-text)' : 'var(--border)'}`, borderRadius: '0.875rem', padding: '0.875rem' }}>
              {currentPTO >= targetHours ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Check size={18} style={{ color: 'var(--positive-text)', flexShrink: 0 }} />
                  <p style={{ fontWeight: 700, color: 'var(--positive-text)' }}>Already at target of {targetHours}h!</p>
                </div>
              ) : weeklyPTO > 0 ? (
                <>
                  <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9375rem', marginBottom: '0.25rem' }}>
                    {Math.round(weeksToTarget)} weeks to {targetHours}h target
                  </p>
                  {targetDate && <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>Est. by {targetDate}</p>}
                  <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>
                    Based on {weeklyHours.toFixed(1)}h/wk avg (last 8 weeks)
                  </p>
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--subtle)', marginBottom: '0.25rem' }}>
                      <span>{currentPTO.toFixed(1)}h</span><span>{targetHours}h</span>
                    </div>
                    <div style={{ height: '0.5rem', backgroundColor: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (currentPTO / targetHours) * 100)}%`, backgroundColor: 'var(--accent)', borderRadius: '9999px', transition: 'width 0.3s' }} />
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: '0.25rem', textAlign: 'right' }}>
                      {((currentPTO / targetHours) * 100).toFixed(0)}%
                    </p>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>No recent shifts — log shifts to project target date</p>
              )}
            </div>
          )}

          <Card>
            <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.625rem' }}>Breakdown</p>
            <Row label="Base balance" value={`${baseBalance.toFixed(2)}h`} />
            <Row label={`Earned since ${s.pto.baseDate}`} value={`+${earnedSinceBase.toFixed(2)}h`} color="var(--positive-text)" />
            {capHours < Infinity && <Row label="Accrual cap" value={`${capHours}h`} />}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.375rem', paddingTop: '0.375rem' }}>
              <Row label="Current est. balance" value={`${currentPTO.toFixed(2)}h · ${(currentPTO / hoursPerShift).toFixed(2)} shifts`} large />
            </div>
          </Card>

          {weeklyHours === 0 && (
            <div style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid var(--warn)', borderRadius: '0.875rem', padding: '0.875rem', fontSize: '0.8125rem', color: 'var(--warn)' }}>
              No shifts logged in the last 8 weeks for this job. Log shifts to see weekly accrual and target projections.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Planning Tools content (embeddable in other pages) ────────────────────────

function mkShift(mk, offset) {
  const [y, m] = mk.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + offset, 1));
}

function CashFlowContent() {
  const { income, bills, selectedMonth: mk, setSelectedMonth: setMk } = useApp();

  const payEvents = useMemo(() => {
    const [y, m] = mk.split('-').map(Number);
    const events = [];
    income.filter((i) => i.isRecurring || i.month === mk).forEach((item) => {
      if (!item.startDate || item.frequency === 'monthly') {
        events.push({ date: new Date(y, m - 1, 1), amount: item.amount, source: item.source || 'Income' });
      } else {
        getPayDatesForMonth(item, mk).forEach((d) =>
          events.push({ date: d, amount: item.amount, source: item.source || 'Income' })
        );
      }
    });
    return events.sort((a, b) => a.date - b.date);
  }, [income, mk]);

  const billEvents = useMemo(() => {
    const [y, m] = mk.split('-').map(Number);
    return getBillsForMonth(bills, mk)
      .filter((b) => b.dueDay)
      .map((b) => ({
        date: new Date(y, m - 1, b.dueDay),
        day: b.dueDay,
        amount: b.amount,
        name: b.name,
        status: getBillStatus(b, mk),
      }))
      .sort((a, b) => a.day - b.day);
  }, [bills, mk]);

  const windows = useMemo(() => {
    if (!payEvents.length) return [];
    return payEvents.map((pay, i) => {
      const nextPay = payEvents[i + 1];
      const dueBills = billEvents.filter((b) => b.date >= pay.date && (!nextPay || b.date < nextPay.date));
      const totalBills = dueBills.reduce((s, b) => s + b.amount, 0);
      return { payDate: pay.date, amount: pay.amount, source: pay.source, bills: dueBills, totalBills, net: pay.amount - totalBills };
    });
  }, [payEvents, billEvents]);

  const uncoveredBills = payEvents.length > 0 ? billEvents.filter((b) => b.date < payEvents[0].date) : [];
  const totalPaychecks = payEvents.reduce((s, p) => s + p.amount, 0);
  const totalBillsAmt = billEvents.reduce((s, b) => s + b.amount, 0);
  const fmtDay = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button onClick={() => setMk((prev) => mkShift(prev, -1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text)' }}>{monthLabel(mk)}</span>
        <button onClick={() => setMk((prev) => mkShift(prev, 1))} style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '0.875rem' }}>
          <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Paychecks</p>
          <p style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--positive-text)' }}>{formatCurrency(totalPaychecks)}</p>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.25rem' }}>{payEvents.length} check{payEvents.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '0.875rem' }}>
          <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', marginBottom: '0.25rem' }}>Bills</p>
          <p style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)' }}>{formatCurrency(totalBillsAmt)}</p>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.25rem' }}>{billEvents.length} bill{billEvents.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {payEvents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem' }}>
          <Wallet size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.375rem' }}>No paychecks found for this month.</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>Add income with a start date and weekly/biweekly frequency to see paycheck coverage.</p>
        </div>
      ) : (
        <>
          {uncoveredBills.length > 0 && (
            <div style={{ backgroundColor: 'rgba(244,63,94,0.08)', border: '1px solid var(--danger)', borderRadius: '1rem', padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--danger)', marginBottom: '0.5rem' }}>Before first paycheck</p>
              {uncoveredBills.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderTop: i > 0 ? '1px solid rgba(244,63,94,0.15)' : 'none' }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text)' }}>{b.name} <span style={{ fontSize: '0.7rem', color: 'var(--subtle)' }}>due {b.day}</span></span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(b.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {windows.map((w, i) => (
            <div key={i} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: w.bills.length > 0 ? '0.75rem' : 0 }}>
                <div>
                  <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>{fmtDay(w.payDate)}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.125rem' }}>{w.source}</p>
                </div>
                <p style={{ fontSize: '1.125rem', fontWeight: 900, color: 'var(--positive-text)' }}>+{formatCurrency(w.amount)}</p>
              </div>
              {w.bills.length > 0 ? (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.625rem' }}>
                  {w.bills.map((b, j) => (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
                      <div>
                        <span style={{ fontSize: '0.8125rem', color: b.status === 'paid' ? 'var(--muted)' : 'var(--text)', textDecoration: b.status === 'paid' ? 'line-through' : 'none' }}>{b.name}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginLeft: '0.375rem' }}>due {b.day}</span>
                      </div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: b.status === 'paid' ? 'var(--muted)' : 'var(--text)' }}>-{formatCurrency(b.amount)}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)' }}>Remaining</span>
                    <span style={{ fontSize: '1rem', fontWeight: 900, color: w.net >= 0 ? 'var(--positive-text)' : 'var(--danger)' }}>{formatCurrency(w.net)}</span>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', paddingTop: '0.375rem', borderTop: '1px solid var(--border)' }}>No bills due before next paycheck</p>
              )}
            </div>
          ))}

          <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '1rem', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--muted)' }}>Income − Bills</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 900, color: (totalPaychecks - totalBillsAmt) >= 0 ? 'var(--positive-text)' : 'var(--danger)' }}>
              {formatCurrency(totalPaychecks - totalBillsAmt)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const TABS = [
  { key: 'tax', label: 'Tax' },
  { key: 'ira', label: 'IRA' },
  { key: 'pto', label: 'PTO' },
  { key: 'cashflow', label: 'Cash Flow' },
];

export function PlanningContent() {
  const { planningSettings, updatePlanningSettings, income, jobs, shifts } = useApp();
  const [activeTab, setActiveTab] = useState('tax');

  return (
    <div>
      <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.25rem', gap: '0.25rem', marginBottom: '1rem' }}>
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{ flex: 1, padding: '0.625rem 0', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              backgroundColor: activeTab === key ? 'var(--surface)' : 'transparent',
              color: activeTab === key ? 'var(--text)' : 'var(--subtle)',
              boxShadow: activeTab === key ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        {activeTab === 'tax' && <TaxTab s={planningSettings} onChange={updatePlanningSettings} income={income} jobs={jobs} />}
        {activeTab === 'ira' && <IRATab s={planningSettings} onChange={updatePlanningSettings} jobs={jobs} />}
        {activeTab === 'pto' && <PTOTab s={planningSettings} onChange={updatePlanningSettings} jobs={jobs} shifts={shifts} />}
        {activeTab === 'cashflow' && <CashFlowContent />}
      </div>
    </div>
  );
}

// ── Standalone Planning page ──────────────────────────────────────────────────

export default function Planning() {
  return (
    <div style={{ paddingBottom: '5rem', minHeight: '100svh', backgroundColor: 'var(--bg)' }}>
      <div style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '1rem 1rem 0.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', marginBottom: '0.875rem' }}>Planning Tools</h1>
      </div>
      <div style={{ padding: '1rem' }}>
        <PlanningContent />
      </div>
    </div>
  );
}
