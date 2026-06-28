import { useState, useMemo, useEffect } from 'react';
import {
  Briefcase, Clock, ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
  MoreVertical, Check, Calculator, Save, Info, Share2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, monthKey } from '../utils/helpers';
import { calcPaycheck, calcHoursFromShifts, getPayPeriodBounds, getPayPeriodAtOffset } from '../utils/taxCalc';
import Modal from '../components/Modal';

// ── helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

function fmt(date) {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function periodLabel(start, end) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const opts = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

function getLastNDaysEnd(n) {
  const end = today();
  const start = addDays(end, -(n - 1));
  return { start, end };
}

function getThisWeekRange() {
  const now = new Date();
  const dow = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((dow + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getCalendarGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = first.getDay();
  const days = [];
  const prevLast = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--)
    days.push({ date: new Date(year, month - 1, prevLast - i), cur: false });
  for (let d = 1; d <= last.getDate(); d++)
    days.push({ date: new Date(year, month, d), cur: true });
  let n = 1;
  while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, n++), cur: false });
  return days;
}

function getPayPeriodEndsInMonth(job, year, month) {
  if (!job.payPeriodStartDate || !job.payFrequency) return [];
  const freqDays = job.payFrequency === 'weekly' ? 7 : 14;
  const ref = new Date(job.payPeriodStartDate + 'T12:00:00');
  ref.setDate(ref.getDate() + freqDays - 1);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const result = [];
  let pd = new Date(ref);
  while (pd > monthStart) pd = new Date(pd.getTime() - freqDays * 86400000);
  while (pd <= monthEnd) {
    if (pd >= monthStart) result.push(pd.toISOString().slice(0, 10));
    pd = new Date(pd.getTime() + freqDays * 86400000);
  }
  return result;
}

function getActualPaydaysInMonth(job, year, month) {
  if (!job.payDate || !job.payFrequency) return [];
  const freqDays = job.payFrequency === 'weekly' ? 7 : 14;
  const ref = new Date(job.payDate + 'T12:00:00');
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const result = [];
  let pd = new Date(ref);
  while (pd > monthStart) pd = new Date(pd.getTime() - freqDays * 86400000);
  while (pd <= monthEnd) {
    if (pd >= monthStart) result.push(pd.toISOString().slice(0, 10));
    pd = new Date(pd.getTime() + freqDays * 86400000);
  }
  return result;
}

function getWeekStartStr(dateStr, weekStartDay) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  const daysBack = (dow - weekStartDay + 7) % 7;
  const ws = new Date(d);
  ws.setDate(d.getDate() - daysBack);
  return ws.toISOString().slice(0, 10);
}

// ── Shared styled wrappers ────────────────────────────────────────────────────

function Label({ children }) {
  return <label className="app-label">{children}</label>;
}

function Input(props) {
  return <input {...props} className="app-input" />;
}

function Select({ children, ...props }) {
  return (
    <select {...props} className="app-input">
      {children}
    </select>
  );
}

// ── Job Form ─────────────────────────────────────────────────────────────────

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function JobForm({ initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    hourlyRate: '',
    otRate: '',
    otRateAuto: true,
    normalShiftHours: '8',
    payFrequency: 'biweekly',
    weekStartDay: 0,
    payPeriodStartDate: '',
    payDate: '',
    filingStatus: 'single',
    iraType: 'amount',
    iraPerPeriod: '',
    iraPercent: '',
    ptoAccrualRate: '',
    includeInAvailability: true,
    ...initial,
    otRateAuto: initial.otRateAuto !== false,
    includeInAvailability: initial.includeInAvailability !== false,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const autoOT = form.hourlyRate ? (parseFloat(form.hourlyRate) * 1.5).toFixed(2) : '';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.hourlyRate) return;
    const rate = parseFloat(form.hourlyRate);
    const otRate = form.otRateAuto ? rate * 1.5 : parseFloat(form.otRate) || rate * 1.5;
    onSave({
      ...form,
      hourlyRate: rate,
      otRate: Math.round(otRate * 100) / 100,
      normalShiftHours: parseFloat(form.normalShiftHours) || 8,
      weekStartDay: parseInt(form.weekStartDay) || 0,
      iraType: form.iraType,
      iraPerPeriod: form.iraType === 'amount' ? (parseFloat(form.iraPerPeriod) || 0) : 0,
      iraPercent: form.iraType === 'percent' ? (parseFloat(form.iraPercent) || 0) : 0,
      ptoAccrualRate: parseFloat(form.ptoAccrualRate) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <Label>Job Name *</Label>
        <Input placeholder="e.g. Amazon, EMS, Side Gig" value={form.name}
          onChange={(e) => set('name', e.target.value)} required />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <Label>Hourly Rate *</Label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '1rem' }}>$</span>
            <Input type="number" min="0" step="0.01" placeholder="18.50" value={form.hourlyRate}
              onChange={(e) => set('hourlyRate', e.target.value)} required
              style={{ paddingLeft: '1.75rem' }} />
          </div>
        </div>
        <div>
          <Label>Shift Hours</Label>
          <Input type="number" min="1" max="72" step="0.5" placeholder="8" value={form.normalShiftHours}
            onChange={(e) => set('normalShiftHours', e.target.value)} />
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
          <Label>OT Rate</Label>
          <button type="button" onClick={() => set('otRateAuto', !form.otRateAuto)}
            style={{ fontSize: '0.75rem', color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {form.otRateAuto ? `Auto (1.5× = $${autoOT || '—'})` : 'Use auto 1.5×'}
          </button>
        </div>
        {!form.otRateAuto ? (
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
            <Input type="number" min="0" step="0.01" placeholder={autoOT || '27.75'} value={form.otRate}
              onChange={(e) => set('otRate', e.target.value)} style={{ paddingLeft: '1.75rem' }} />
          </div>
        ) : (
          <div className="app-input" style={{ color: 'var(--subtle)', cursor: 'default' }}>
            {autoOT ? `$${autoOT}/hr (auto)` : 'Enter hourly rate above'}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <Label>Pay Frequency</Label>
          <Select value={form.payFrequency} onChange={(e) => set('payFrequency', e.target.value)}>
            <option value="biweekly">Biweekly</option>
            <option value="weekly">Weekly</option>
          </Select>
        </div>
        <div>
          <Label>OT Week Starts</Label>
          <Select value={form.weekStartDay} onChange={(e) => set('weekStartDay', e.target.value)}>
            {WEEK_DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </Select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <Label>Filing Status</Label>
          <Select value={form.filingStatus} onChange={(e) => set('filingStatus', e.target.value)}>
            <option value="single">Single</option>
            <option value="mfj">Married (Joint)</option>
          </Select>
        </div>
        <div>
          <Label>Pay Period Start Date</Label>
          <Input type="date" value={form.payPeriodStartDate}
            onChange={(e) => set('payPeriodStartDate', e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Payday Date</Label>
        <Input type="date" value={form.payDate}
          onChange={(e) => set('payDate', e.target.value)} />
        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>
          Date wages are actually paid — repeats every {form.payFrequency === 'weekly' ? '7' : '14'} days
        </p>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
          <Label>IRA / 401k (optional)</Label>
          <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.5rem', padding: '0.125rem', gap: '0.125rem' }}>
            {['amount', 'percent'].map((t) => (
              <button key={t} type="button" onClick={() => set('iraType', t)}
                style={{ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                  backgroundColor: form.iraType === t ? 'var(--accent)' : 'transparent',
                  color: form.iraType === t ? '#fff' : 'var(--muted)' }}>
                {t === 'amount' ? '$' : '%'}
              </button>
            ))}
          </div>
        </div>
        {form.iraType === 'amount' ? (
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.iraPerPeriod}
              onChange={(e) => set('iraPerPeriod', e.target.value)} style={{ paddingLeft: '1.75rem' }} />
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <Input type="number" min="0" max="100" step="0.1" placeholder="5.0" value={form.iraPercent}
              onChange={(e) => set('iraPercent', e.target.value)} style={{ paddingRight: '2rem' }} />
            <span style={{ position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>%</span>
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>
          {form.iraType === 'percent' ? 'Deducted as % of gross pay (pre-tax)' : 'Flat amount per paycheck (pre-tax)'}
        </p>
      </div>

      <div>
        <Label>PTO Accrual Rate (optional)</Label>
        <Input type="number" min="1" step="0.5" placeholder="24" value={form.ptoAccrualRate}
          onChange={(e) => set('ptoAccrualRate', e.target.value)} />
        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>
          Worked hours per 1 PTO hour earned (e.g. 24 = 1 PTO hr per 24 worked hrs)
        </p>
      </div>

      <div style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text)' }}>Factor into Availability</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>Include this job's pay estimates in budget availability</p>
        </div>
        <button type="button" onClick={() => set('includeInAvailability', !form.includeInAvailability)}
          style={{ width: '2.75rem', height: '1.5rem', borderRadius: '9999px', border: 'none', cursor: 'pointer', transition: 'background 0.2s', position: 'relative', flexShrink: 0,
            backgroundColor: form.includeInAvailability ? 'var(--accent)' : 'var(--border2)' }}>
          <span style={{ position: 'absolute', top: '2px', width: '1.125rem', height: '1.125rem', borderRadius: '9999px', backgroundColor: '#fff', transition: 'left 0.2s',
            left: form.includeInAvailability ? 'calc(100% - 1.25rem)' : '2px' }} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '0.5rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary">Cancel</button>
        <button type="submit" className="app-btn-primary">Save Job</button>
      </div>
    </form>
  );
}

// ── Shift Form ────────────────────────────────────────────────────────────────

const NOTIF_OFFSETS = [
  { label: '15 min before', value: '15' },
  { label: '30 min before', value: '30' },
  { label: '1 hour before', value: '60' },
  { label: '2 hours before', value: '120' },
];

function ShiftForm({ initial = {}, jobs, onSave, onCancel, previousLocations = [] }) {
  const [form, setForm] = useState({
    date: today(),
    jobId: jobs[0]?.id || '',
    hoursWorked: '',
    startTime: '',
    endTime: '',
    location: '',
    notificationEnabled: false,
    notificationOffsetMinutes: '30',
    notes: '',
    otExempt: false,
    ...initial,
  });

  const set = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    if (k === 'startTime' || k === 'endTime') {
      const s = k === 'startTime' ? v : f.startTime;
      const e = k === 'endTime' ? v : f.endTime;
      if (s && e) {
        const [sh, sm] = s.split(':').map(Number);
        const [eh, em] = e.split(':').map(Number);
        let diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff <= 0) diff += 24 * 60;
        next.hoursWorked = String(Math.round(diff / 15) * 0.25);
      }
    }
    return next;
  });

  const selectedJob = jobs.find((j) => j.id === form.jobId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.jobId || !form.hoursWorked) return;
    onSave({
      ...form,
      hoursWorked: parseFloat(form.hoursWorked),
      location: form.location.trim() || null,
      notificationOffsetMinutes: parseInt(form.notificationOffsetMinutes) || 30,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <Label>Date</Label>
        <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
      </div>

      {jobs.length > 1 && (
        <div>
          <Label>Job</Label>
          <Select value={form.jobId} onChange={(e) => set('jobId', e.target.value)}>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </Select>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <Label>Start Time</Label>
          <Input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
        </div>
        <div>
          <Label>End Time</Label>
          <Input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
        </div>
      </div>

      <div>
        <Label>
          Hours Worked
          {selectedJob && <span style={{ color: 'var(--subtle)', marginLeft: '0.25rem', fontSize: '0.75rem' }}>(normal: {selectedJob.normalShiftHours}h)</span>}
          {form.startTime && form.endTime && <span style={{ color: 'var(--accent-text)', marginLeft: '0.25rem', fontSize: '0.75rem' }}>auto-calculated</span>}
        </Label>
        <Input type="number" min="0" max="72" step="0.25" placeholder="8.0" value={form.hoursWorked}
          onChange={(e) => set('hoursWorked', e.target.value)} required
          style={{ fontSize: '1.5rem', textAlign: 'center', fontWeight: '700' }} />
      </div>

      <div>
        <Label>Location (optional)</Label>
        {previousLocations.length > 0 && (
          <datalist id="shift-locations">
            {previousLocations.map((loc) => <option key={loc} value={loc} />)}
          </datalist>
        )}
        <Input placeholder="e.g. Main Station, HQ, Remote" value={form.location}
          onChange={(e) => set('location', e.target.value)}
          list={previousLocations.length > 0 ? 'shift-locations' : undefined} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.75rem 1rem' }}>
        <div>
          <p style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text)' }}>OT Exempt</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>PTO, holiday — won't count toward OT threshold</p>
        </div>
        <button type="button" onClick={() => set('otExempt', !form.otExempt)}
          style={{ width: '2.75rem', height: '1.5rem', borderRadius: '9999px', border: 'none', cursor: 'pointer', transition: 'background 0.2s', position: 'relative', flexShrink: 0,
            backgroundColor: form.otExempt ? 'var(--warn)' : 'var(--border2)' }}>
          <span style={{ position: 'absolute', top: '2px', width: '1.125rem', height: '1.125rem', borderRadius: '9999px', backgroundColor: '#fff', transition: 'left 0.2s',
            left: form.otExempt ? 'calc(100% - 1.25rem)' : '2px' }} />
        </button>
      </div>

      <div style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: form.notificationEnabled ? '0.75rem' : 0 }}>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text)' }}>Shift Reminder</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>
              {form.startTime ? `Notify before ${form.startTime}` : 'Set start time to enable'}
            </p>
          </div>
          <button type="button" onClick={() => set('notificationEnabled', !form.notificationEnabled)}
            disabled={!form.startTime}
            style={{ width: '2.75rem', height: '1.5rem', borderRadius: '9999px', border: 'none', cursor: form.startTime ? 'pointer' : 'not-allowed', transition: 'background 0.2s', position: 'relative', flexShrink: 0, opacity: form.startTime ? 1 : 0.4,
              backgroundColor: form.notificationEnabled && form.startTime ? 'var(--accent)' : 'var(--border2)' }}>
            <span style={{ position: 'absolute', top: '2px', width: '1.125rem', height: '1.125rem', borderRadius: '9999px', backgroundColor: '#fff', transition: 'left 0.2s',
              left: form.notificationEnabled && form.startTime ? 'calc(100% - 1.25rem)' : '2px' }} />
          </button>
        </div>
        {form.notificationEnabled && form.startTime && (
          <div>
            <Label>Notify me</Label>
            <Select value={form.notificationOffsetMinutes} onChange={(e) => set('notificationOffsetMinutes', e.target.value)}>
              {NOTIF_OFFSETS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        )}
      </div>

      <div>
        <Label>Notes (optional)</Label>
        <Input placeholder="e.g. PTO, covered a shift, short day" value={form.notes}
          onChange={(e) => set('notes', e.target.value)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '0.5rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary">Cancel</button>
        <button type="submit" className="app-btn-primary">Log Shift</button>
      </div>
    </form>
  );
}

// ── Pay Breakdown ─────────────────────────────────────────────────────────────

function PayRow({ label, value, color, size = 'sm', prefix = '' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0' }}>
      <span style={{ fontSize: size === 'sm' ? '0.875rem' : '1rem', color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: size === 'sm' ? '0.875rem' : '1rem', fontWeight: size === 'lg' ? '800' : '600', color: color || 'var(--text)' }}>
        {prefix}{formatCurrency(value)}
      </span>
    </div>
  );
}

function PayBreakdown({ result }) {
  const effRate = result.grossPay > 0 ? ((result.totalDeductions / result.grossPay) * 100).toFixed(1) : 0;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
      {/* Earnings */}
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.5rem' }}>Earnings</p>
        <PayRow label={`Regular (${result.regularHours}h)`} value={result.regularPay} />
        {result.overtimeHours > 0 && (
          <PayRow label={`Overtime (${result.overtimeHours}h)`} value={result.otPay} color="var(--warn)" />
        )}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
          <PayRow label="Gross Pay" value={result.grossPay} size="lg" />
        </div>
      </div>

      {/* Deductions */}
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.5rem' }}>Deductions</p>
        {result.iraDeduction > 0 && (
          <PayRow label={`IRA / 401k (pre-tax${result.iraPercent > 0 ? ` · ${result.iraPercent}%` : ''})`} value={result.iraDeduction} color="var(--danger)" prefix="-" />
        )}
        {result.iraDeduction > 0 && (
          <div style={{ padding: '0.25rem 0' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>FIT/SIT taxable: {formatCurrency(result.fitTaxable)}</span>
          </div>
        )}
        <PayRow label="Federal Income Tax (FIT)" value={result.fit} color="var(--danger)" prefix="-" />
        <PayRow label="Social Security (FICA 6.2%)" value={result.fica} color="var(--danger)" prefix="-" />
        <PayRow label="Medicare (MEDI 1.45%)" value={result.medi} color="var(--danger)" prefix="-" />
        <PayRow label="AR State Income Tax (SIT)" value={result.sitAR} color="var(--danger)" prefix="-" />
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
          <PayRow label="Total Deductions" value={result.totalDeductions} color="var(--danger)" prefix="-" />
        </div>
      </div>

      {/* Net */}
      <div style={{ padding: '1rem', backgroundColor: 'var(--positive-soft)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text)' }}>Est. Net Pay</span>
          <span style={{ fontSize: '1.75rem', fontWeight: '900', color: 'var(--positive-text)' }}>{formatCurrency(result.netPay)}</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          {effRate}% effective deduction rate
        </p>
      </div>
    </div>
  );
}

// ── Shift Calendar View ───────────────────────────────────────────────────────

function ShiftCalendarView({ jobs, shifts, onAddShift }) {
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);

  const grid = useMemo(() => getCalendarGrid(calYear, calMonth), [calYear, calMonth]);

  const shiftsByDate = useMemo(() => {
    const map = {};
    shifts.forEach((sh) => {
      if (!map[sh.date]) map[sh.date] = [];
      map[sh.date].push(sh);
    });
    return map;
  }, [shifts]);

  const weeks = useMemo(() => {
    const rows = [];
    for (let i = 0; i < grid.length; i += 7) {
      const row = grid.slice(i, i + 7);
      const totalH = row.reduce((s, { date }) => {
        const ds = date.toISOString().slice(0, 10);
        return s + (shiftsByDate[ds] || []).reduce((a, sh) => a + (sh.otExempt ? 0 : sh.hoursWorked), 0);
      }, 0);
      rows.push({ row, totalH });
    }
    return rows;
  }, [grid, shiftsByDate]);

  const todayStr = now.toISOString().slice(0, 10);
  const monthName = new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const nav = (dir) => {
    setSelectedDate(null);
    setCalMonth((m) => {
      const nm = m + dir;
      if (nm < 0) { setCalYear((y) => y - 1); return 11; }
      if (nm > 11) { setCalYear((y) => y + 1); return 0; }
      return nm;
    });
  };

  const selectedShifts = useMemo(() => {
    if (!selectedDate) return [];
    return (shiftsByDate[selectedDate] || []).map((sh) => ({
      ...sh,
      jobName: jobs.find((j) => j.id === sh.jobId)?.name || 'Unknown',
    }));
  }, [selectedDate, shiftsByDate, jobs]);

  const btnStyle = { padding: '0.375rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
        <button onClick={() => nav(-1)} style={btnStyle}><ChevronLeft size={18} /></button>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 700, color: 'var(--text)', fontSize: '0.9375rem' }}>{monthName}</span>
        <button onClick={() => nav(1)} style={btnStyle}><ChevronRight size={18} /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
        {DOW_LABELS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.625rem', fontWeight: 700, color: 'var(--subtle)', paddingBottom: '0.25rem' }}>{d}</div>
        ))}
      </div>

      {weeks.map(({ row, totalH }, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '2px' }}>
          {row.map(({ date, cur }) => {
            const ds = date.toISOString().slice(0, 10);
            const hours = (shiftsByDate[ds] || []).reduce((s, sh) => s + sh.hoursWorked, 0);
            const isToday = ds === todayStr;
            const hasShift = hours > 0 && cur;
            const isSelected = ds === selectedDate;

            let bg = 'transparent';
            let hourColor = 'var(--text)';
            if (hasShift) {
              if (totalH > 40) { bg = 'rgba(239,68,68,0.18)'; hourColor = 'var(--danger)'; }
              else if (totalH > 32) { bg = 'rgba(245,158,11,0.18)'; hourColor = 'var(--warn)'; }
              else { bg = 'var(--accent-soft)'; hourColor = 'var(--accent-text)'; }
            }

            return (
              <button
                key={ds}
                onClick={() => { if (!cur) return; setSelectedDate(isSelected ? null : ds); }}
                disabled={!cur}
                style={{
                  borderRadius: '0.375rem', backgroundColor: isSelected ? 'var(--surface2)' : bg,
                  border: isSelected ? '1.5px solid var(--accent-text)' : isToday ? '1.5px solid var(--accent)' : '1px solid transparent',
                  padding: '0.2rem 0.125rem', minHeight: '2.25rem',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.125rem',
                  cursor: cur ? 'pointer' : 'default', background: isSelected ? 'var(--surface2)' : bg,
                }}>
                <span style={{ fontSize: '0.6875rem', fontWeight: isToday ? 800 : 500, color: cur ? (isToday ? 'var(--accent-text)' : 'var(--muted)') : 'var(--border2)' }}>
                  {date.getDate()}
                </span>
                {hasShift && (
                  <span style={{ fontSize: '0.625rem', fontWeight: 800, color: hourColor }}>{hours}h</span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {/* Selected date detail panel */}
      {selectedDate && (
        <div style={{ marginTop: '0.75rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
            <button onClick={() => setSelectedDate(null)} style={{ color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
          </div>
          {selectedShifts.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.625rem' }}>
              {selectedShifts.map((sh) => (
                <div key={sh.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface2)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>{sh.jobName}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {sh.otExempt && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--warn)', backgroundColor: 'rgba(245,158,11,0.15)', padding: '0.125rem 0.375rem', borderRadius: '0.375rem' }}>OT Exempt</span>}
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent-text)' }}>{sh.hoursWorked}h</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginBottom: '0.625rem' }}>No shifts logged for this day</p>
          )}
          <button
            onClick={() => { onAddShift(selectedDate); setSelectedDate(null); }}
            style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}>
            <Plus size={14} /> Log Shift for This Day
          </button>
        </div>
      )}

      {weeks.some((w) => w.totalH > 0) && (
        <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {weeks.map(({ row, totalH }, wi) => {
            if (totalH === 0) return null;
            const firstCur = row.find((c) => c.cur);
            if (!firstCur) return null;
            const weekLabel = firstCur.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const pct = Math.min(100, (totalH / 40) * 100);
            const barColor = totalH > 40 ? 'var(--danger)' : totalH > 32 ? 'var(--warn)' : 'var(--positive-text)';
            return (
              <div key={wi}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--muted)', marginBottom: '0.1875rem' }}>
                  <span>Wk of {weekLabel}</span>
                  <span style={{ fontWeight: 700, color: barColor }}>{totalH}h{totalH > 40 ? ' · OT' : totalH > 32 ? ' · near OT' : ''}</span>
                </div>
                <div style={{ height: '0.3125rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: '9999px' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.875rem', flexWrap: 'wrap' }}>
        {[['var(--accent-soft)', 'var(--accent-text)', '≤32h'], ['rgba(245,158,11,0.18)', 'var(--warn)', '32–40h'], ['rgba(239,68,68,0.18)', 'var(--danger)', '>40h (OT)']].map(([bg, c, lbl]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <div style={{ width: '0.75rem', height: '0.75rem', borderRadius: '0.25rem', backgroundColor: bg, border: `1.5px solid ${c}` }} />
            <span style={{ fontSize: '0.6875rem', color: 'var(--subtle)' }}>{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Job Calendar View ─────────────────────────────────────────────────────────

function JobCalendarView({ job, shifts, onAddShift }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const grid = getCalendarGrid(year, month);
  const todayStr = today();
  const jobShiftDates = new Set(shifts.filter((s) => s.jobId === job.id).map((s) => s.date));
  const payPeriodEnds = new Set(getPayPeriodEndsInMonth(job, year, month));
  const actualPaydays = new Set(getActualPaydaysInMonth(job, year, month));

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <button onClick={prevMonth} style={{ padding: '0.375rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', borderRadius: '0.5rem' }}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text)' }}>{monthName}</span>
        <button onClick={nextMonth} style={{ padding: '0.375rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', borderRadius: '0.5rem' }}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '0.25rem' }}>
        {DOW_LABELS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: '700', color: 'var(--subtle)', padding: '0.25rem 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {grid.map(({ date, cur }, i) => {
          const ds = date.toISOString().slice(0, 10);
          const isToday = ds === todayStr;
          const hasShift = jobShiftDates.has(ds);
          const isPayday = actualPaydays.has(ds);
          const isPayPeriodEnd = payPeriodEnds.has(ds);
          const dotColor = isPayday ? 'var(--positive-text)' : isPayPeriodEnd ? '#3b82f6' : null;
          const borderColor = isPayday ? 'var(--positive-text)' : isPayPeriodEnd ? '#3b82f6' : isToday ? 'var(--accent)' : 'transparent';
          return (
            <button key={i} onClick={() => cur && onAddShift(ds)}
              disabled={!cur}
              style={{
                padding: '0.25rem',
                borderRadius: '0.5rem',
                textAlign: 'center',
                fontSize: '0.8125rem',
                fontWeight: isToday ? '800' : '500',
                border: `${(isPayday || isPayPeriodEnd || isToday) && cur ? '2px' : '1px'} solid ${cur ? borderColor : 'transparent'}`,
                backgroundColor: hasShift && cur ? 'var(--accent)' : isToday && cur ? 'var(--surface2)' : 'transparent',
                color: hasShift && cur ? '#fff' : cur ? 'var(--text)' : 'var(--border2)',
                cursor: cur ? 'pointer' : 'default',
                position: 'relative',
              }}>
              {date.getDate()}
              {dotColor && cur && (
                <span style={{ position: 'absolute', bottom: '2px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '9999px', backgroundColor: dotColor, display: 'block' }} />
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--subtle)', flexWrap: 'wrap' }}>
        {job.payDate && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: 'var(--positive-text)' }} /> Payday
          </span>
        )}
        {job.payPeriodStartDate && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: '#3b82f6' }} /> End of Pay Period
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '0.2rem', backgroundColor: 'var(--accent)' }} /> Shift Logged
        </span>
      </div>
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────────────────────────

function JobCard({ job, onEdit, onDelete, shifts, onAddShift }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const otRate = job.otRate || job.hourlyRate * 1.5;

  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.75rem', backgroundColor: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Briefcase size={18} style={{ color: 'var(--accent-text)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: '700', color: 'var(--text)', fontSize: '1rem' }}>{job.name}</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginTop: '0.125rem' }}>
            {formatCurrency(job.hourlyRate)}/hr · OT {formatCurrency(otRate)}/hr
          </p>
        </div>
        <button onClick={() => setShowCal(!showCal)}
          style={{ color: showCal ? 'var(--accent-text)' : 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', marginTop: '-0.125rem', flexShrink: 0 }}
          title="Toggle calendar">
          <Clock size={17} />
        </button>
        <button onClick={() => setMenuOpen(!menuOpen)}
          style={{ color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', marginTop: '-0.125rem', flexShrink: 0 }}>
          <MoreVertical size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
        {[
          `${job.normalShiftHours}h shift`,
          job.payFrequency.charAt(0).toUpperCase() + job.payFrequency.slice(1),
          job.filingStatus === 'mfj' ? 'Married (Joint)' : 'Single',
          `OT week: ${WEEK_DAYS[job.weekStartDay ?? 0]}`,
          job.iraType === 'percent' && job.iraPercent > 0 ? `IRA ${job.iraPercent}%` : null,
          job.iraType !== 'percent' && job.iraPerPeriod > 0 ? `IRA ${formatCurrency(job.iraPerPeriod)}/pay` : null,
          job.ptoAccrualRate > 0 ? `PTO 1h per ${job.ptoAccrualRate}h` : null,
          job.includeInAvailability === false ? 'Excluded from budget' : null,
        ].filter(Boolean).map((t) => (
          <span key={t} style={{ fontSize: '0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', padding: '0.25rem 0.625rem', borderRadius: '0.5rem' }}>
            {t}
          </span>
        ))}
      </div>

      {showCal && (
        <JobCalendarView job={job} shifts={shifts} onAddShift={(ds) => onAddShift(ds, job.id)} />
      )}

      {menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
          <div style={{ position: 'absolute', right: '0.75rem', top: '3rem', zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '9rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <button onClick={() => { onEdit(job); setMenuOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => { onDelete(job.id); setMenuOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Bulk Shift Form ───────────────────────────────────────────────────────────

function BulkShiftForm({ jobs, shifts, onSave, onCancel }) {
  const [jobId, setJobId] = useState(jobs[0]?.id || '');
  const [preset, setPreset] = useState('current');
  const [range, setRange] = useState(() => {
    const j = jobs[0];
    if (j) { const pp = getPayPeriodBounds(j); if (pp) return pp.current; }
    return getLastNDaysEnd(14);
  });
  const [rows, setRows] = useState({});

  const job = jobs.find((j) => j.id === jobId);
  const payPeriods = job ? getPayPeriodBounds(job) : null;

  const PRESETS = [
    ...(payPeriods
      ? [{ label: 'Current Period', key: 'current' }, { label: 'Prev Period', key: 'previous' }]
      : [{ label: 'Last 7 days', key: '7d' }, { label: 'Last 14 days', key: '14d' }]),
    { label: 'This Week', key: 'week' },
    { label: 'Custom', key: 'custom' },
  ];

  useEffect(() => {
    if (preset === 'current' && payPeriods) setRange(payPeriods.current);
    else if (preset === 'previous' && payPeriods) setRange(payPeriods.previous);
    else if (preset === '7d') setRange(getLastNDaysEnd(7));
    else if (preset === '14d') setRange(getLastNDaysEnd(14));
    else if (preset === 'week') setRange(getThisWeekRange());
  }, [preset, jobId]);

  const dates = useMemo(() => {
    if (!range.start || !range.end) return [];
    const arr = [];
    let d = range.start;
    while (d <= range.end) { arr.push(d); d = addDays(d, 1); }
    return arr;
  }, [range]);

  useEffect(() => {
    setRows(() => {
      const next = {};
      dates.forEach((d) => {
        const existing = shifts.find((s) => s.jobId === jobId && s.date === d);
        next[d] = existing
          ? { hours: String(existing.hoursWorked), otExempt: existing.otExempt || false, notes: existing.notes || '', existingId: existing.id }
          : { hours: '', otExempt: false, notes: '', existingId: null };
      });
      return next;
    });
  }, [dates, jobId]);

  const setRow = (date, key, val) => setRows((r) => ({ ...r, [date]: { ...r[date], [key]: val } }));

  const filledCount = dates.filter((d) => rows[d]?.hours && parseFloat(rows[d].hours) > 0).length;

  const handleSubmit = (e) => {
    e.preventDefault();
    const toSave = dates
      .filter((d) => rows[d]?.hours && parseFloat(rows[d].hours) > 0)
      .map((d) => ({
        date: d, jobId,
        hoursWorked: parseFloat(rows[d].hours),
        otExempt: rows[d]?.otExempt || false,
        notes: rows[d]?.notes || '',
        existingId: rows[d]?.existingId || null,
      }));
    onSave(toSave);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {jobs.length > 1 && (
        <div>
          <Label>Job</Label>
          <Select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </Select>
        </div>
      )}

      <div>
        <Label>Pay Period</Label>
        {payPeriods && (
          <p style={{ fontSize: '0.7rem', color: 'var(--positive-text)', fontWeight: 600, marginBottom: '0.375rem' }}>
            Auto-calculated from saved pay cycle
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem', marginBottom: '0.5rem' }}>
          {PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPreset(p.key)}
              style={{ padding: '0.5rem', borderRadius: '0.625rem', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${preset === p.key ? 'var(--accent)' : 'var(--border)'}`,
                backgroundColor: preset === p.key ? 'var(--accent-soft)' : 'var(--surface2)',
                color: preset === p.key ? 'var(--accent-text)' : 'var(--muted)' }}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div><Label>Start</Label><Input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} /></div>
            <div><Label>End</Label><Input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} /></div>
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', textAlign: 'center' }}>
          {range.start && range.end ? periodLabel(range.start, range.end) : ''}
        </p>
      </div>

      {dates.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '0.875rem', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 5rem 3.5rem', gap: '0.375rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)' }}>Date</p>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', textAlign: 'center' }}>Hours</p>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--subtle)', textAlign: 'center' }}>OT Ex</p>
          </div>
          {dates.map((d, i) => {
            const row = rows[d] || { hours: '', otExempt: false };
            const hasHours = row.hours && parseFloat(row.hours) > 0;
            return (
              <div key={d} style={{ display: 'grid', gridTemplateColumns: '1fr 5rem 3.5rem', gap: '0.375rem', alignItems: 'center',
                padding: '0.375rem 0.75rem',
                backgroundColor: hasHours ? 'var(--surface2)' : 'transparent',
                borderBottom: i < dates.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <p style={{ fontSize: '0.875rem', color: hasHours ? 'var(--text)' : 'var(--subtle)', fontWeight: hasHours ? 600 : 400 }}>
                  {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                <input type="number" min="0" max="24" step="0.5"
                  placeholder={String(job?.normalShiftHours || 8)}
                  value={row.hours}
                  onChange={(e) => setRow(d, 'hours', e.target.value)}
                  style={{ textAlign: 'center', padding: '0.375rem 0.25rem', borderRadius: '0.5rem',
                    border: '1px solid var(--border)', backgroundColor: 'var(--surface)',
                    color: 'var(--text)', fontSize: '0.875rem', fontWeight: 700, width: '100%' }} />
                <button type="button" onClick={() => setRow(d, 'otExempt', !row.otExempt)}
                  style={{ width: '2.5rem', height: '1.375rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
                    transition: 'background 0.15s', position: 'relative', margin: '0 auto', display: 'block',
                    backgroundColor: row.otExempt ? 'var(--warn)' : 'var(--border2)' }}>
                  <span style={{ position: 'absolute', top: '2px', width: '1rem', height: '1rem', borderRadius: '9999px', backgroundColor: '#fff',
                    transition: 'left 0.15s', left: row.otExempt ? 'calc(100% - 1.125rem)' : '2px' }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary">Cancel</button>
        <button type="submit" className="app-btn-primary" disabled={filledCount === 0}>
          <Plus size={15} /> Log {filledCount > 0 ? `${filledCount} Shift${filledCount !== 1 ? 's' : ''}` : 'Shifts'}
        </button>
      </div>
    </form>
  );
}

// ── Actual Pay Prompt ─────────────────────────────────────────────────────────

function ActualPayPrompt({ jobId, periodStart, periodEnd, onSave }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    const v = parseFloat(input);
    if (!v || v <= 0) return;
    onSave({ jobId, periodStart, periodEnd, amount: v });
    setOpen(false);
    setInput('');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ marginTop: '0.5rem', width: '100%', padding: '0.5rem', borderRadius: '0.625rem', border: '1px dashed var(--border)', backgroundColor: 'transparent', color: 'var(--subtle)', fontSize: '0.8125rem', cursor: 'pointer' }}
      >
        + Log actual deposit
      </button>
    );
  }

  return (
    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <input
        type="number" step="0.01" min="0" autoFocus
        placeholder="Actual deposit"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '0.625rem', border: '1px solid var(--border)', backgroundColor: 'var(--surface2)', color: 'var(--text)', fontSize: '0.9375rem' }}
      />
      <button onClick={handleSave} disabled={!parseFloat(input)} className="app-btn-primary" style={{ padding: '0.5rem 0.875rem', fontSize: '0.875rem' }}>Save</button>
      <button onClick={() => setOpen(false)} className="app-btn-secondary" style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>✕</button>
    </div>
  );
}

// ── Hours Tab ─────────────────────────────────────────────────────────────────

function HoursTab({ jobs, shifts, addShift, updateShift, deleteShift, bulkSaveShifts, paycheckActuals, addPaycheckActual }) {
  const [logDate, setLogDate] = useState(today());
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [editShift, setEditShift] = useState(null);
  const [calView, setCalView] = useState(true);
  const [periodOffset, setPeriodOffset] = useState(0);
  const previousLocations = useMemo(() => {
    const seen = new Set();
    return [...shifts]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((s) => s.location)
      .filter((loc) => loc && !seen.has(loc) && seen.add(loc));
  }, [shifts]);

  const recentShifts = useMemo(() =>
    [...shifts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
    [shifts]);

  const shiftsOnDate = shifts.filter((s) => s.date === logDate);

  const weekSummary = useMemo(() => {
    return jobs.map((job) => {
      const weekStartDay = job.weekStartDay ?? 0;
      const weekStartStr = getWeekStartStr(today(), weekStartDay);
      const weekEndStr = addDays(weekStartStr, 6);
      const hours = shifts
        .filter((sh) => sh.jobId === job.id && !sh.otExempt && sh.date >= weekStartStr && sh.date <= weekEndStr)
        .reduce((s, sh) => s + sh.hoursWorked, 0);
      return { job, hours };
    }).filter(({ hours }) => hours > 0);
  }, [jobs, shifts]);

  if (jobs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
        <Briefcase size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3, display: 'block' }} />
        <p style={{ fontWeight: '600', color: 'var(--muted)', marginBottom: '0.25rem' }}>No jobs yet</p>
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)' }}>Add a job from the Jobs tab first</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.625rem', padding: '0.1875rem', gap: '0.125rem' }}>
          {[['Calendar', true], ['List', false]].map(([lbl, v]) => (
            <button key={lbl} onClick={() => setCalView(v)}
              style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                backgroundColor: calView === v ? 'var(--surface)' : 'transparent',
                color: calView === v ? 'var(--text)' : 'var(--subtle)' }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {calView ? (
        <>
          <ShiftCalendarView
            jobs={jobs}
            shifts={shifts}
            onAddShift={(date) => { setLogDate(date); setShowShiftForm(true); }}
          />
          {/* Pay period earnings summary */}
          {(() => {
            const summaries = jobs.map((job) => {
              const period = getPayPeriodAtOffset(job, periodOffset);
              if (!period) return null;
              const { start, end } = period;
              const periodShifts = shifts.filter((s) => s.jobId === job.id && s.date >= start && s.date <= end);
              // Preserve existing behavior: hide current-period jobs with no shifts logged
              if (periodOffset === 0 && periodShifts.length === 0) return null;
              const hasShifts = periodShifts.length > 0;
              const { regularHours, overtimeHours } = hasShifts ? calcHoursFromShifts(periodShifts, job) : { regularHours: 0, overtimeHours: 0 };
              const result = hasShifts ? calcPaycheck({ job, regularHours, overtimeHours }) : null;
              const actual = hasShifts ? (paycheckActuals || []).find((a) => a.jobId === job.id && a.periodStart === start) : null;
              return { job, result, start, end, actual, hasShifts };
            }).filter(Boolean);
            if (summaries.length === 0) return null;
            const isCurrentPeriod = periodOffset === 0;
            return (
              <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.125rem' }}>
                  <button
                    onClick={() => setPeriodOffset((o) => o - 1)}
                    aria-label="Previous pay period"
                    style={{ padding: '0.25rem', borderRadius: '0.5rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <p style={{ flex: 1, textAlign: 'center', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)' }}>
                    {isCurrentPeriod ? 'Current Pay Period Estimate' : 'Pay Period Estimate'}
                  </p>
                  <button
                    onClick={() => setPeriodOffset((o) => o + 1)}
                    aria-label="Next pay period"
                    disabled={periodOffset >= 0}
                    style={{ padding: '0.25rem', borderRadius: '0.5rem', color: periodOffset >= 0 ? 'var(--border)' : 'var(--muted)', background: 'none', border: 'none', cursor: periodOffset >= 0 ? 'default' : 'pointer', flexShrink: 0 }}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
                {summaries.map(({ job, result, start, end, actual, hasShifts }) => {
                  const delta = actual && result ? actual.amount - result.netPay : null;
                  return (
                    <div key={job.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>{job.name}</span>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--subtle)' }}>{periodLabel(start, end)}</span>
                      </div>
                      {hasShifts ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div style={{ textAlign: 'center', backgroundColor: 'var(--surface2)', borderRadius: '0.625rem', padding: '0.625rem 0.5rem' }}>
                              <p style={{ fontSize: '0.6rem', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Est. Gross</p>
                              <p style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--text)' }}>{formatCurrency(result.grossPay)}</p>
                            </div>
                            <div style={{ textAlign: 'center', backgroundColor: 'var(--positive-soft)', borderRadius: '0.625rem', padding: '0.625rem 0.5rem', border: '1px solid rgba(16,185,129,0.2)' }}>
                              <p style={{ fontSize: '0.6rem', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Est. Net</p>
                              <p style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--positive-text)' }}>{formatCurrency(result.netPay)}</p>
                            </div>
                          </div>
                          {result.overtimeHours > 0 && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--warn)', marginTop: '0.375rem', textAlign: 'center' }}>
                              {result.regularHours}h reg + {result.overtimeHours}h OT
                            </p>
                          )}
                          {/* Actual deposit comparison */}
                          {actual ? (
                            <div style={{ marginTop: '0.5rem', padding: '0.625rem', backgroundColor: 'var(--surface2)', borderRadius: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                              <div>
                                <p style={{ fontSize: '0.6rem', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Actual Deposit</p>
                                <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>{formatCurrency(actual.amount)}</p>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '0.6rem', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>vs. Estimate</p>
                                <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: delta >= 0 ? 'var(--positive-text)' : 'var(--danger)' }}>
                                  {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
                                </p>
                              </div>
                            </div>
                          ) : addPaycheckActual && isCurrentPeriod ? (
                            <ActualPayPrompt jobId={job.id} periodStart={start} periodEnd={end} onSave={addPaycheckActual} />
                          ) : null}
                        </>
                      ) : (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', textAlign: 'center', padding: '0.75rem 0' }}>
                          No shifts logged for this period
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      ) : (
        <>
          {/* Date nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => setLogDate(addDays(logDate, -1))}
          style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)}
          style={{ flex: 1, textAlign: 'center', background: 'none', border: 'none', color: 'var(--text)', fontWeight: '700', fontSize: '1rem', outline: 'none', cursor: 'pointer' }} />
        <button onClick={() => setLogDate(addDays(logDate, 1))}
          style={{ padding: '0.5rem', borderRadius: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Shifts on this date */}
      {shiftsOnDate.map((sh) => {
        const job = jobs.find((j) => j.id === sh.jobId);
        return (
          <div key={sh.id} style={{ backgroundColor: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <p style={{ fontWeight: '600', color: 'var(--text)', fontSize: '0.9375rem' }}>{job?.name || 'Unknown'}</p>
                {sh.otExempt && <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--warn)', backgroundColor: 'rgba(245,158,11,0.15)', padding: '0.125rem 0.375rem', borderRadius: '0.375rem' }}>OT Exempt</span>}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.125rem' }}>
  {sh.startTime && sh.endTime ? `${sh.startTime}–${sh.endTime} · ` : ''}{sh.hoursWorked}h{sh.location ? ` · ${sh.location}` : ''}{sh.notes ? ` · ${sh.notes}` : ''}
</p>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button onClick={() => setEditShift(sh)} style={{ padding: '0.375rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Pencil size={15} /></button>
              <button onClick={() => deleteShift(sh.id)} style={{ padding: '0.375rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}><Trash2 size={15} /></button>
            </div>
          </div>
        );
      })}

      {shiftsOnDate.length === 0 && (
        <div style={{ backgroundColor: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: '0.875rem', padding: '1rem', textAlign: 'center', marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--subtle)' }}>No shift logged for this date</p>
        </div>
      )}

      {weekSummary.length > 0 && (
        <div style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.75rem', marginBottom: '0.75rem' }}>
          {weekSummary.map(({ job, hours }) => {
            const toOT = Math.max(0, 40 - hours);
            const pct = Math.min(100, (hours / 40) * 100);
            const overOT = hours >= 40;
            return (
              <div key={job.id} style={{ marginBottom: weekSummary.length > 1 ? '0.5rem' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text)' }}>
                    {jobs.length > 1 ? job.name : 'This week'}
                  </span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: overOT ? 'var(--danger)' : hours > 32 ? 'var(--warn)' : 'var(--text)' }}>
                    {hours}h{overOT ? ' · In OT' : ` · ${toOT}h to OT`}
                  </span>
                </div>
                <div style={{ height: '4px', borderRadius: '9999px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: '9999px', transition: 'width 0.3s',
                    backgroundColor: overOT ? 'var(--danger)' : hours > 32 ? 'var(--warn)' : 'var(--accent)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button onClick={() => setShowShiftForm(true)} className="app-btn-primary">
          <Plus size={16} /> Log Shift
        </button>
        <button onClick={() => setShowBulkForm(true)} className="app-btn-secondary">
          <Plus size={16} /> Bulk Log
        </button>
      </div>

      {/* Recent shifts */}
      {recentShifts.length > 0 && (
        <div>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.75rem', padding: '0 0.25rem' }}>Recent Shifts</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentShifts.map((sh) => {
              const job = jobs.find((j) => j.id === sh.jobId);
              return (
                <div key={sh.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <p style={{ fontSize: '0.9375rem', fontWeight: '600', color: 'var(--text)' }}>{fmt(sh.date)}</p>
                      {jobs.length > 1 && <span style={{ fontSize: '0.6875rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem' }}>{job?.name}</span>}
                      {sh.otExempt && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--warn)', backgroundColor: 'rgba(245,158,11,0.15)', padding: '0.125rem 0.375rem', borderRadius: '0.375rem' }}>OT Exempt</span>}
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>
  {sh.startTime && sh.endTime ? `${sh.startTime}–${sh.endTime} · ` : ''}{sh.hoursWorked}h{sh.location ? ` · ${sh.location}` : ''}{sh.notes ? ` · ${sh.notes}` : ''}
</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={() => setEditShift(sh)} style={{ padding: '0.375rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}><Pencil size={14} /></button>
                    <button onClick={() => deleteShift(sh.id)} style={{ padding: '0.375rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

        </>
      )}

      {showShiftForm && (
        <Modal title="Log Shift" onClose={() => setShowShiftForm(false)}>
          <ShiftForm initial={{ date: logDate }} jobs={jobs} previousLocations={previousLocations}
            onSave={(d) => { addShift(d); setShowShiftForm(false); }}
            onCancel={() => setShowShiftForm(false)} />
        </Modal>
      )}
      {showBulkForm && (
        <Modal title="Bulk Log Shifts" onClose={() => setShowBulkForm(false)}>
          <BulkShiftForm
            jobs={jobs}
            shifts={shifts}
            onSave={(entries) => {
              bulkSaveShifts(entries);
              setShowBulkForm(false);
            }}
            onCancel={() => setShowBulkForm(false)}
          />
        </Modal>
      )}
      {editShift && (
        <Modal title="Edit Shift" onClose={() => setEditShift(null)}>
          <ShiftForm initial={editShift} jobs={jobs} previousLocations={previousLocations}
            onSave={(d) => { updateShift(editShift.id, d); setEditShift(null); }}
            onCancel={() => setEditShift(null)} />
        </Modal>
      )}
    </div>
  );
}

// ── Estimate Tab ──────────────────────────────────────────────────────────────

function EstimateTab({ jobs, shifts, addIncome }) {
  const [selectedJobId, setSelectedJobId] = useState(jobs[0]?.id || '');
  const [preset, setPreset] = useState('current');
  const [range, setRange] = useState(() => getLastNDaysEnd(14));
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [periodOffset, setPeriodOffset] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);

  const job = jobs.find((j) => j.id === selectedJobId);
  const payPeriods = job ? getPayPeriodBounds(job) : null;

  const PRESETS = [
    ...(payPeriods ? [
      { label: 'Current Period', key: 'current' },
      { label: 'Previous Period', key: 'previous' },
    ] : [
      { label: 'Last 7 days', key: '7d' },
      { label: 'Last 14 days', key: '14d' },
    ]),
    { label: 'This Week', key: 'week' },
    { label: 'Custom', key: 'custom' },
  ];

  // Keep range in sync when job or preset changes
  useEffect(() => {
    if (preset === 'current' && payPeriods) {
      const p = getPayPeriodAtOffset(job, periodOffset);
      if (p) setRange(p);
    } else if (preset === 'previous' && payPeriods) setRange(payPeriods.previous);
    else if (preset === '7d') setRange(getLastNDaysEnd(7));
    else if (preset === '14d') setRange(getLastNDaysEnd(14));
    else if (preset === 'week') setRange(getThisWeekRange());
  }, [preset, selectedJobId, periodOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoAdvance || !job || !payPeriods || preset !== 'current') return;
    const nextP = getPayPeriodAtOffset(job, periodOffset + 1);
    if (!nextP) return;
    const hasNext = shifts.some((s) => s.jobId === job.id && s.date >= nextP.start && s.date <= nextP.end);
    if (hasNext) setPeriodOffset((o) => o + 1);
  }, [autoAdvance, shifts, job?.id, preset]); // eslint-disable-line react-hooks/exhaustive-deps

  const periodShifts = useMemo(() =>
    shifts.filter((s) => s.jobId === selectedJobId && s.date >= range.start && s.date <= range.end),
    [shifts, selectedJobId, range]);

  const { regularHours, overtimeHours } = useMemo(() =>
    periodShifts.length > 0 ? calcHoursFromShifts(periodShifts, job || {}) : { regularHours: 0, overtimeHours: 0 },
    [periodShifts, job]);

  const result = useMemo(() => {
    if (!job || (regularHours === 0 && overtimeHours === 0)) return null;
    return calcPaycheck({ job, regularHours, overtimeHours });
  }, [job, regularHours, overtimeHours]);

  function handlePreset(key) {
    setPreset(key);
    setSaved(false);
  }

  function handleJobChange(id) {
    setSelectedJobId(id);
    setSaved(false);
    setPreset('current');
    setPeriodOffset(0);
  }

  function handleSave() {
    if (!result || !job) return;
    const mk = monthKey(new Date(range.end + 'T12:00:00'));
    addIncome({
      source: `${job.name} — Paycheck Est.`,
      amount: result.netPay,
      frequency: 'monthly',
      isRecurring: false,
      month: mk,
      person: 'me',
      notes: `${periodLabel(range.start, range.end)} · Gross ${formatCurrency(result.grossPay)}`,
      isWorkTimeEntry: true,
      jobId: job.id,
      grossPay: result.grossPay,
      payPeriodStart: range.start,
      payPeriodEnd: range.end,
      includeInAvailability: job.includeInAvailability !== false,
    });
    setSaved(true);
  }

  function buildExportText() {
    if (!result || !job) return '';
    const effRate = result.grossPay > 0 ? ((result.totalDeductions / result.grossPay) * 100).toFixed(1) : 0;
    const lines = [
      `Paycheck Estimate — ${job.name}`,
      `Period: ${periodLabel(range.start, range.end)}`,
      '',
      'Earnings',
      `  Regular (${result.regularHours}h):  ${formatCurrency(result.regularPay)}`,
      ...(result.overtimeHours > 0 ? [`  Overtime (${result.overtimeHours}h):  ${formatCurrency(result.otPay)}`] : []),
      `  Gross Pay:  ${formatCurrency(result.grossPay)}`,
      '',
      'Deductions',
      ...(result.iraDeduction > 0 ? [`  IRA/401k:  -${formatCurrency(result.iraDeduction)}`] : []),
      `  Federal Income Tax:  -${formatCurrency(result.fit)}`,
      `  Social Security:  -${formatCurrency(result.fica)}`,
      `  Medicare:  -${formatCurrency(result.medi)}`,
      `  AR State Tax:  -${formatCurrency(result.sitAR)}`,
      `  Total Deductions:  -${formatCurrency(result.totalDeductions)}`,
      '',
      `Est. Net Pay:  ${formatCurrency(result.netPay)}`,
      `(${effRate}% effective deduction rate)`,
    ];
    return lines.join('\n');
  }

  async function handleShare() {
    const text = buildExportText();
    if (!text) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Paycheck Estimate', text }); return; } catch (_) {}
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (jobs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
        <Calculator size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3, display: 'block' }} />
        <p style={{ fontWeight: '600', color: 'var(--muted)', marginBottom: '0.25rem' }}>No jobs yet</p>
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)' }}>Add a job from the Jobs tab to estimate your paycheck</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 1rem' }}>
      {/* Job selector */}
      {jobs.length > 1 && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.5rem' }}>Job</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {jobs.map((j) => (
              <button key={j.id} onClick={() => handleJobChange(j.id)}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '600', border: 'none', cursor: 'pointer',
                  backgroundColor: selectedJobId === j.id ? 'var(--accent)' : 'var(--surface2)',
                  color: selectedJobId === j.id ? '#fff' : 'var(--muted)' }}>
                {j.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Period */}
      <div style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.5rem' }}>Pay Period</p>
        {payPeriods && preset === 'current' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button type="button" onClick={() => { setPeriodOffset((o) => o - 1); setSaved(false); }}
              style={{ padding: '0.375rem', borderRadius: '0.625rem', color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', cursor: 'pointer' }}>
              <ChevronLeft size={16} />
            </button>
            <p style={{ flex: 1, fontSize: '0.75rem', color: 'var(--positive-text)', fontWeight: '600', textAlign: 'center' }}>
              {periodOffset === 0 ? 'Current pay period' : periodOffset > 0 ? `+${periodOffset} period${periodOffset !== 1 ? 's' : ''}` : `${periodOffset} period${periodOffset !== -1 ? 's' : ''}`}
            </p>
            <button type="button" onClick={() => { setPeriodOffset((o) => o + 1); setSaved(false); }}
              style={{ padding: '0.375rem', borderRadius: '0.625rem', color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', cursor: 'pointer' }}>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        {payPeriods && preset !== 'current' && (
          <p style={{ fontSize: '0.75rem', color: 'var(--positive-text)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Auto-calculated from your payroll cycle
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => handlePreset(p.key)}
              style={{ padding: '0.625rem', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '600', border: `1px solid ${preset === p.key ? 'var(--accent)' : 'var(--border)'}`,
                backgroundColor: preset === p.key ? 'var(--accent-soft)' : 'var(--surface2)',
                color: preset === p.key ? 'var(--accent-text)' : 'var(--muted)', cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>
        {payPeriods && preset === 'current' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.5rem 0.875rem', marginBottom: '0.5rem' }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>Auto-advance if next period has hours</p>
            <button type="button" onClick={() => setAutoAdvance((v) => !v)}
              style={{ width: '2.5rem', height: '1.375rem', borderRadius: '9999px', border: 'none', cursor: 'pointer', transition: 'background 0.2s', position: 'relative', flexShrink: 0,
                backgroundColor: autoAdvance ? 'var(--accent)' : 'var(--border2)' }}>
              <span style={{ position: 'absolute', top: '2px', width: '1rem', height: '1rem', borderRadius: '9999px', backgroundColor: '#fff', transition: 'left 0.2s',
                left: autoAdvance ? 'calc(100% - 1.125rem)' : '2px' }} />
            </button>
          </div>
        )}
        {preset === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div>
              <Label>Start</Label>
              <Input type="date" value={range.start} onChange={(e) => { setRange((r) => ({ ...r, start: e.target.value })); setSaved(false); }} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="date" value={range.end} onChange={(e) => { setRange((r) => ({ ...r, end: e.target.value })); setSaved(false); }} />
            </div>
          </div>
        )}
        <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', textAlign: 'center' }}>{periodLabel(range.start, range.end)}</p>
        {job && job.includeInAvailability === false && (
          <p style={{ fontSize: '0.75rem', color: 'var(--warn)', textAlign: 'center', marginTop: '0.25rem', fontWeight: '600' }}>
            This job is excluded from availability calculation
          </p>
        )}
      </div>

      {/* Hours summary */}
      {periodShifts.length > 0 ? (
        <div style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Shifts logged</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>
              {regularHours}h regular{overtimeHours > 0 ? ` + ${overtimeHours}h OT` : ''} · {periodShifts.length} days
            </p>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--text)' }}>{regularHours + overtimeHours}h</p>
        </div>
      ) : (
        <div style={{ border: '1px dashed var(--border)', borderRadius: '0.875rem', padding: '1.5rem', textAlign: 'center', marginBottom: '1rem' }}>
          <Clock size={28} style={{ margin: '0 auto 0.5rem', color: 'var(--subtle)', display: 'block' }} />
          <p style={{ fontSize: '0.875rem', color: 'var(--subtle)' }}>No shifts for this period — log hours first</p>
        </div>
      )}

      {/* Breakdown */}
      {result && (
        <>
          <PayBreakdown result={result} />
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: '1.4' }}>
              <Info size={11} style={{ display: 'inline', marginRight: '0.25rem', verticalAlign: 'middle', opacity: 0.6 }} />
              Estimates use 2025 IRS Pub 15-T and AR DFA withholding tables. Actual amounts depend on your W-4.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: saved ? '1fr' : '1fr auto', gap: '0.5rem', marginTop: '0' }}>
            {saved ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem', borderRadius: '0.875rem', backgroundColor: 'var(--positive-soft)', color: 'var(--positive-text)', fontWeight: '700' }}>
                <Check size={16} /> Saved to Income
              </div>
            ) : (
              <button onClick={handleSave} className="app-btn-primary"
                style={{ backgroundColor: 'var(--positive)', marginTop: '0' }}>
                <Save size={18} /> Save to Income
              </button>
            )}
            <button onClick={handleShare}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.875rem 1rem', borderRadius: '0.875rem', border: '1px solid var(--border)', backgroundColor: 'var(--surface2)', color: copied ? 'var(--positive-text)' : 'var(--muted)', fontWeight: '700', fontSize: '0.875rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {copied ? <><Check size={16} /> Copied!</> : <><Share2 size={16} /> Share</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Quick Calc Tab ────────────────────────────────────────────────────────────

function QuickCalcTab({ jobs, shifts }) {
  const [selectedJobId, setSelectedJobId] = useState(jobs[0]?.id || '');
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState('');

  const job = jobs.find((j) => j.id === selectedJobId);

  const weekHours = useMemo(() => {
    if (!job) return 0;
    const weekStart = getWeekStartStr(date, job.weekStartDay ?? 0);
    const weekEnd = addDays(weekStart, 6);
    return shifts
      .filter((sh) => sh.jobId === job.id && sh.date >= weekStart && sh.date <= weekEnd)
      .reduce((s, sh) => s + sh.hoursWorked, 0);
  }, [job, date, shifts]);

  const result = useMemo(() => {
    const h = parseFloat(hours);
    if (!job || !h || h <= 0) return null;
    const regularCap = Math.max(0, 40 - weekHours);
    const regularHours = Math.min(h, regularCap);
    const overtimeHours = Math.max(0, h - regularCap);
    return calcPaycheck({ job, regularHours, overtimeHours });
  }, [job, hours, weekHours]);

  if (jobs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
        <Calculator size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3, display: 'block' }} />
        <p style={{ fontWeight: '600', color: 'var(--muted)', marginBottom: '0.25rem' }}>No jobs yet</p>
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)' }}>Add a job from the Jobs tab first</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 1rem' }}>
      {jobs.length > 1 && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--subtle)', marginBottom: '0.5rem' }}>Job</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {jobs.map((j) => (
              <button key={j.id} onClick={() => setSelectedJobId(j.id)}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '600', border: 'none', cursor: 'pointer',
                  backgroundColor: selectedJobId === j.id ? 'var(--accent)' : 'var(--surface2)',
                  color: selectedJobId === j.id ? '#fff' : 'var(--muted)' }}>
                {j.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <Label>Shift Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Shift Hours</Label>
          <Input type="number" min="0" max="72" step="0.5" placeholder={job?.normalShiftHours || '8'}
            value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Already logged this week</span>
          <span style={{ fontSize: '1.125rem', fontWeight: 800, color: weekHours >= 40 ? 'var(--danger)' : weekHours > 32 ? 'var(--warn)' : 'var(--text)' }}>{weekHours}h</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>
          {weekHours >= 40 ? 'Entire shift would be at OT rate' : `${Math.max(0, 40 - weekHours)}h remaining before OT threshold`}
        </p>
      </div>

      {result ? (
        <>
          <PayBreakdown result={result} />
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--surface2)', borderRadius: '0.75rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: '1.4' }}>
              <Info size={11} style={{ display: 'inline', marginRight: '0.25rem', verticalAlign: 'middle', opacity: 0.6 }} />
              Quick estimate · not logged · taxes calculated for this shift in isolation
            </p>
          </div>
        </>
      ) : (
        <div style={{ border: '1px dashed var(--border)', borderRadius: '0.875rem', padding: '2rem', textAlign: 'center' }}>
          <Calculator size={32} style={{ margin: '0 auto 0.5rem', color: 'var(--subtle)', display: 'block', opacity: 0.5 }} />
          <p style={{ fontSize: '0.875rem', color: 'var(--subtle)' }}>Enter hours above to see an instant pay estimate</p>
        </div>
      )}
    </div>
  );
}

// ── Page tabs ─────────────────────────────────────────────────────────────────

const TABS = ['jobs', 'hours', 'estimate', 'quick'];
const TAB_LABELS = { jobs: 'Jobs', hours: 'Hours', estimate: 'Estimate', quick: 'Quick' };

function SegmentedControl({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.25rem', gap: '0.25rem' }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          style={{
            flex: 1, padding: '0.625rem 0', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: '700',
            border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            backgroundColor: value === o ? 'var(--surface)' : 'transparent',
            color: value === o ? 'var(--text)' : 'var(--subtle)',
            boxShadow: value === o ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
          }}>
          {TAB_LABELS[o]}
        </button>
      ))}
    </div>
  );
}

// ── Page Content (also exported for embedding) ────────────────────────────────

export function WorkTimeContent() {
  const { jobs, addJob, updateJob, deleteJob, shifts, addShift, updateShift, deleteShift, bulkSaveShifts, addIncome, paycheckActuals, addPaycheckActual } = useApp();
  const [tab, setTab] = useState(() => {
    const s = localStorage.getItem('workTimeTab');
    return TABS.includes(s) ? s : 'jobs';
  });
  const [showJobForm, setShowJobForm] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [calShiftPreset, setCalShiftPreset] = useState(null);

  return (
    <>
      <div style={{ padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <SegmentedControl value={tab} onChange={(t) => { setTab(t); localStorage.setItem('workTimeTab', t); }} options={TABS} />
        </div>
        {tab === 'jobs' && jobs.length > 0 && (
          <button onClick={() => setShowJobForm(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>
            <Plus size={16} /> Add Job
          </button>
        )}
      </div>

      <div style={{ marginTop: '0.25rem' }}>
        {tab === 'jobs' && (
          <div style={{ padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {jobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                <Briefcase size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
                <p style={{ fontWeight: '700', color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>No jobs added yet</p>
                <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Add a job to start tracking your hours and paycheck</p>
                <button onClick={() => setShowJobForm(true)} className="app-btn-primary"
                  style={{ maxWidth: '14rem', margin: '0 auto' }}>
                  <Plus size={18} /> Add First Job
                </button>
              </div>
            ) : (
              <>
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} onEdit={setEditJob} onDelete={deleteJob}
                    shifts={shifts} onAddShift={(date, jobId) => setCalShiftPreset({ date, jobId })} />
                ))}
                <button onClick={() => setShowJobForm(true)}
                  style={{ padding: '0.875rem', border: '1px dashed var(--border)', borderRadius: '0.875rem', color: 'var(--muted)', background: 'none', cursor: 'pointer', fontSize: '0.9375rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <Plus size={16} /> Add Another Job
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'hours' && (
          <HoursTab jobs={jobs} shifts={shifts} addShift={addShift} updateShift={updateShift} deleteShift={deleteShift} bulkSaveShifts={bulkSaveShifts} paycheckActuals={paycheckActuals} addPaycheckActual={addPaycheckActual} />
        )}

        {tab === 'estimate' && (
          <EstimateTab jobs={jobs} shifts={shifts} addIncome={addIncome} />
        )}

        {tab === 'quick' && (
          <QuickCalcTab jobs={jobs} shifts={shifts} />
        )}
      </div>

      {showJobForm && (
        <Modal title="Add Job" onClose={() => setShowJobForm(false)}>
          <JobForm onSave={(d) => { addJob(d); setShowJobForm(false); }} onCancel={() => setShowJobForm(false)} />
        </Modal>
      )}
      {editJob && (
        <Modal title="Edit Job" onClose={() => setEditJob(null)}>
          <JobForm initial={editJob} onSave={(d) => { updateJob(editJob.id, d); setEditJob(null); }} onCancel={() => setEditJob(null)} />
        </Modal>
      )}
      {calShiftPreset && (
        <Modal title="Log Shift" onClose={() => setCalShiftPreset(null)}>
          <ShiftForm
            initial={{ date: calShiftPreset.date, jobId: calShiftPreset.jobId }}
            jobs={jobs}
            previousLocations={[...new Set(shifts.map((s) => s.location).filter(Boolean))]}
            onSave={(d) => { addShift(d); setCalShiftPreset(null); }}
            onCancel={() => setCalShiftPreset(null)}
          />
        </Modal>
      )}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function WorkTime() {
  return (
    <div className="app-page">
      <div className="app-header">
        <h1 style={{ fontSize: '1.625rem', fontWeight: '900', color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '1rem' }}>Work Time</h1>
      </div>
      <WorkTimeContent />
    </div>
  );
}
