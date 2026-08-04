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
};
