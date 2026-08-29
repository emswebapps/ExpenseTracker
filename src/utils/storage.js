const KEYS = {
  BILLS: 'bt_bills',
  INCOME: 'bt_income',
  BUDGET: 'bt_budget',
  SETTINGS: 'bt_settings',
  NOTES: 'bt_notes',
  DEBTS: 'bt_debts',
  SAVINGS: 'bt_savings',
  COMMITMENTS: 'bt_commitments',
  PURCHASES: 'bt_purchases',
  PLANNED_EXPENSES: 'bt_planned_expenses',
  JOBS: 'bt_jobs',
  SHIFTS: 'bt_shifts',
  BUDGET_CATEGORIES: 'bt_budget_categories',
  BUDGET_SPENDS: 'bt_budget_spends',
  AGREEMENTS: 'bt_agreements',
  NET_WORTH_HISTORY: 'bt_nw_history',
  SHOPPING_LISTS: 'bt_shopping_lists',
  SHOPPING_ITEMS: 'bt_shopping_items',
  PLANNING_SETTINGS: 'bt_planning_settings',
  RECURRING_TEMPLATES: 'bt_recurring_templates',
  PAYCHECK_ACTUALS: 'bt_paycheck_actuals',
  NOTIF_PREFS: 'bt_notif_prefs',
  PROJECTS: 'bt_projects',
  VAULT_DOCUMENTS: 'bt_vault_docs',
  BILL_STICKY_NOTES: 'bt_bill_sticky_notes',
  CRASH_SESSIONS: 'bt_crash_sessions',
  CRASH_DRAFTS: 'bt_crash_drafts',
  CRASH_ANCHORS: 'bt_crash_anchors',
  CRASH_KIT: 'bt_crash_kit',
  CRASH_DOSES: 'bt_crash_doses',
  CRASH_MEDS: 'bt_crash_meds',
  CRASH_BEHAVIORS: 'bt_crash_behaviors',
};

function get(key) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

function set(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const CRASH_KIT_SCALARS = {
  partnerName: '',
  timerMinutes: 30,
  brakeVariantId: 'short',
  brakePhrase: '',
  notifyOnTimerEnd: true,
  // Dose timing. Defaults are the user's own reported pattern; the app only
  // ever does arithmetic on a time they entered, and never advises on
  // medication.
  doseTracking: true,
  onsetHours: 4,
  durationHours: 5,
  agreementText: '',
  warningSigns: null,
  menu: null,
  removedSigns: [],
};

const DEFAULT_SETTINGS = {
  spouseEnabled: true,
  spouseName: '',
  myName: '',
  monthlySpendingBudget: 0,
  monthlySavingsTarget: 0,
  lightMode: false,
  purchasesInAvailable: false,
  shareToken: null,
  sharePin: '3419',
  dashboardSections: {
    tasks: true,
    pinnedNotes: true,
    savings: true,
    commitments: false,
    billsStatus: true,
    spending: true,
    nextPaycheck: true,
    payDates: true,
    plannedExpenses: false,
    netWorth: true,
    spendingTrend: true,
    topCategories: true,
    spendingByPerson: true,
    envelopes: true,
    agreements: false,
    crash: true,
  },
};

export const storage = {
  getBills: () => get(KEYS.BILLS) || [],
  setBills: (bills) => set(KEYS.BILLS, bills),

  getIncome: () => get(KEYS.INCOME) || [],
  setIncome: (income) => set(KEYS.INCOME, income),

  getBudget: () => get(KEYS.BUDGET) || {},
  setBudget: (budget) => set(KEYS.BUDGET, budget),

  getSettings: () => ({ ...DEFAULT_SETTINGS, ...(get(KEYS.SETTINGS) || {}) }),
  setSettings: (settings) => set(KEYS.SETTINGS, settings),

  getNotes: () => get(KEYS.NOTES) || [],
  setNotes: (notes) => set(KEYS.NOTES, notes),

  getDebts: () => get(KEYS.DEBTS) || [],
  setDebts: (debts) => set(KEYS.DEBTS, debts),

  getSavings: () => get(KEYS.SAVINGS) || [],
  setSavings: (s) => set(KEYS.SAVINGS, s),

  getCommitments: () => get(KEYS.COMMITMENTS) || [],
  setCommitments: (c) => set(KEYS.COMMITMENTS, c),

  getPurchases: () => get(KEYS.PURCHASES) || [],
  setPurchases: (p) => set(KEYS.PURCHASES, p),

  getPlannedExpenses: () => get(KEYS.PLANNED_EXPENSES) || [],
  setPlannedExpenses: (p) => set(KEYS.PLANNED_EXPENSES, p),

  getJobs: () => get(KEYS.JOBS) || [],
  setJobs: (v) => set(KEYS.JOBS, v),

  getShifts: () => get(KEYS.SHIFTS) || [],
  setShifts: (v) => set(KEYS.SHIFTS, v),

  getBudgetCategories: () => get(KEYS.BUDGET_CATEGORIES) || [],
  setBudgetCategories: (v) => set(KEYS.BUDGET_CATEGORIES, v),

  getBudgetSpends: () => get(KEYS.BUDGET_SPENDS) || [],
  setBudgetSpends: (v) => set(KEYS.BUDGET_SPENDS, v),

  getAgreements: () => get(KEYS.AGREEMENTS) || [],
  setAgreements: (v) => set(KEYS.AGREEMENTS, v),

  getNetWorthHistory: () => get(KEYS.NET_WORTH_HISTORY) || [],
  setNetWorthHistory: (v) => set(KEYS.NET_WORTH_HISTORY, v),

  getShoppingLists: () => get(KEYS.SHOPPING_LISTS) || [],
  setShoppingLists: (v) => set(KEYS.SHOPPING_LISTS, v),
  getShoppingItems: () => get(KEYS.SHOPPING_ITEMS) || [],
  setShoppingItems: (v) => set(KEYS.SHOPPING_ITEMS, v),

  getRecurringTemplates: () => get(KEYS.RECURRING_TEMPLATES) || [],
  setRecurringTemplates: (v) => set(KEYS.RECURRING_TEMPLATES, v),

  getPaycheckActuals: () => get(KEYS.PAYCHECK_ACTUALS) || [],
  setPaycheckActuals: (v) => set(KEYS.PAYCHECK_ACTUALS, v),

  getProjects: () => get(KEYS.PROJECTS) || [],
  setProjects: (v) => set(KEYS.PROJECTS, v),

  getVaultDocuments: () => get(KEYS.VAULT_DOCUMENTS) || [],
  setVaultDocuments: (v) => set(KEYS.VAULT_DOCUMENTS, v),

  getBillStickyNotes: () => get(KEYS.BILL_STICKY_NOTES) || {},
  setBillStickyNotes: (v) => set(KEYS.BILL_STICKY_NOTES, v),

  getNotifPrefs: () => {
    const saved = get(KEYS.NOTIF_PREFS) || {};
    return {
      bills: { overdue: true, dayBefore: true, sameDay: true, ...(saved.bills || {}) },
      commitments: { expiring: true, daysBefore: 3, ...(saved.commitments || {}) },
      todos: { enabled: true, defaultLeadMinutes: 0, ...(saved.todos || {}) },
      shifts: { reminder: false, reminderTime: '18:00', ...(saved.shifts || {}) },
      goals: { enabled: true, ...(saved.goals || {}) },
      // Local/push only, deliberately absent from the email group below: the
      // body says the 30 minutes are up and nothing about what happened.
      // `crashNote` is the one that fires as the window actually opens and
      // opens onto the anchors. The three med flags below are the only place
      // this app nudges about medication at all, and every one of them is off
      // in a single tap.
      crash: {
        timerEnd: true, windowHeadsUp: true, escrowOpened: true, crashNote: true,
        doseDue: true, ruleReminders: true, refillLow: true,
        ...(saved.crash || {}),
      },
      projects: { enabled: true, ...(saved.projects || {}) },
      // When the once-a-day summary goes out, in your own time zone. Governs
      // both the daily push batch and the daily email digest.
      daily: { time: '08:00', ...(saved.daily || {}) },
      // Email is its own channel: `enabled` turns it on, and each flag below
      // picks what lands in the inbox, independently of the push toggles.
      email: {
        enabled: false, address: '',
        tasks: true, taskLeadMinutes: 60,
        bills: true, commitments: true, goals: true, projects: true, workLog: true,
        ...(saved.email || {}),
      },
    };
  },
  setNotifPrefs: (v) => set(KEYS.NOTIF_PREFS, v),

  getPlanningSettings: () => ({
    tax: {
      filingStatus: 'single',
      useStandardDeduction: true,
      itemizedDeductions: 0,
      extraPreTaxDeductions: 0,
      dependentsUnder17: 0,
      otherCredits: 0,
      useIncomeData: true,
      manualGrossIncome: '',
      manualFedWithheld: '',
      manualStateWithheld: '',
    },
    ira: {
      currentBalance: '',
      currentAge: '',
      useJobIRA: true,
      manualAnnualContribution: '',
      employerMatchPercent: 100,
      expectedReturnPercent: 7,
      iraType: 'traditional',
      projectionYears: 30,
      targetBalance: '',
    },
    pto: {
      jobId: '',
      baseDate: '',
      baseBalance: '',
      accrualRate: 24,
      capHours: '',
      targetHours: '',
      hoursPerShift: 24,
    },
    ...(get(KEYS.PLANNING_SETTINGS) || {}),
    tax: { ...{ filingStatus: 'single', useStandardDeduction: true, itemizedDeductions: 0, deductions: [], dependentsUnder17: 0, otherCredits: 0, useIncomeData: true, manualGrossIncome: '', manualNetIncome: '', manualFedWithheld: '', manualStateWithheld: '' }, ...((get(KEYS.PLANNING_SETTINGS) || {}).tax || {}) },
    ira: { ...{ currentBalance: '', currentAge: '', useJobIRA: true, manualAnnualContribution: '', employerMatchPercent: 100, expectedReturnPercent: 7, iraType: 'traditional', projectionYears: 30, targetBalance: '' }, ...((get(KEYS.PLANNING_SETTINGS) || {}).ira || {}) },
    pto: { ...{ jobId: '', baseDate: '', baseBalance: '', accrualRate: 24, capHours: '', targetHours: '', hoursPerShift: 24 }, ...((get(KEYS.PLANNING_SETTINGS) || {}).pto || {}) },
  }),
  setPlanningSettings: (v) => set(KEYS.PLANNING_SETTINGS, v),

  getCrashSessions: () => get(KEYS.CRASH_SESSIONS) || [],
  setCrashSessions: (v) => set(KEYS.CRASH_SESSIONS, v),

  getCrashDrafts: () => get(KEYS.CRASH_DRAFTS) || [],
  setCrashDrafts: (v) => set(KEYS.CRASH_DRAFTS, v),

  getCrashAnchors: () => get(KEYS.CRASH_ANCHORS) || [],
  setCrashAnchors: (v) => set(KEYS.CRASH_ANCHORS, v),

  getCrashKit: () => ({ ...CRASH_KIT_SCALARS, ...(get(KEYS.CRASH_KIT) || {}) }),
  setCrashKit: (v) => set(KEYS.CRASH_KIT, v),

  getCrashDoses: () => get(KEYS.CRASH_DOSES) || [],
  setCrashDoses: (v) => set(KEYS.CRASH_DOSES, v),

  getCrashMeds: () => get(KEYS.CRASH_MEDS) || [],
  setCrashMeds: (v) => set(KEYS.CRASH_MEDS, v),

  getCrashBehaviors: () => get(KEYS.CRASH_BEHAVIORS) || [],
  setCrashBehaviors: (v) => set(KEYS.CRASH_BEHAVIORS, v),
};
