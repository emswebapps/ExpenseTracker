import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { storage } from '../utils/storage';
import {
  saveUserData, loadUserData, saveSharedView, saveFCMToken,
  saveListShare, setListShareRevoked, deleteListShare, subscribeListShare,
} from '../utils/firestoreSync';
import { generateId, currentMonthKey, getBillStatus, nextBillStatus, isTaskList } from '../utils/helpers';
import { notificationPermission, requestNotificationPermission, sendNotification, computeDueAt, todoReminderAt, localTodayISO, registerFCMToken, onForegroundMessage, scheduleShiftNotification, cancelShiftNotification } from '../utils/notifications';
import { planWeeks, weeklyConfig, refileByDate } from '../pages/lists/weeks.js';

const AppContext = createContext(null);

const PERMANENT_BUDGET_CATEGORIES = [
  { name: 'Gas', monthlyLimit: 200 },
  { name: 'Groceries', monthlyLimit: 400 },
  { name: 'Leisure', monthlyLimit: 272 },
  { name: 'Misc', monthlyLimit: 100 },
  { name: 'Personal Allowances', monthlyLimit: 900 },
  { name: 'Work Food Allowance', monthlyLimit: 200 },
];

/**
 * Debounce Firestore writes so rapid changes don't spam the DB.
 *
 * Patches are MERGED across the window rather than replaced. Two writes to
 * different slices inside the same 1.5 seconds is not a rare case — logging a
 * dose also counts one out of that medication's supply, and closing a session
 * also resolves the drafts held under it — and with plain replace semantics the
 * earlier slice was silently dropped from the cloud copy while localStorage
 * kept it, which is the worst shape a sync bug can have: invisible on the
 * device that made the change.
 *
 * Merging is safe for the same-slice case too, since a repeated key simply
 * takes the newer value, and `saveUserData` already writes with `{merge:true}`.
 */
// How long a local write to the lists is given to settle before a guest's edit
// is adopted over the top of it.
const LOCAL_WRITE_SETTLE_MS = 3000;

/** Firestore's hard per-document limit. Not a setting — it's the platform's. */
export const DOC_SIZE_LIMIT = 1024 * 1024;

function useDebounce(fn, delay = 1500) {
  const timer = useRef(null);
  const pending = useRef(null);
  return useCallback((patch) => {
    pending.current = { ...(pending.current || {}), ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const merged = pending.current;
      pending.current = null;
      fn(merged);
    }, delay);
  }, [fn, delay]);
}

export function AppProvider({ children, uid }) {
  const [bills, setBillsState] = useState(() => storage.getBills());
  const [income, setIncomeState] = useState(() => storage.getIncome());
  const [budget, setBudgetState] = useState(() => storage.getBudget());
  const [settings, setSettingsState] = useState(() => storage.getSettings());
  const [notes, setNotesState] = useState(() => storage.getNotes());
  const [debts, setDebtsState] = useState(() => storage.getDebts());
  const [savings, setSavingsState] = useState(() => storage.getSavings());
  const [commitments, setCommitmentsState] = useState(() => storage.getCommitments());
  const [purchases, setPurchasesState] = useState(() => storage.getPurchases());
  const [plannedExpenses, setPlannedExpensesState] = useState(() => storage.getPlannedExpenses());
  const [jobs, setJobsState] = useState(() => storage.getJobs());
  const [shifts, setShiftsState] = useState(() => storage.getShifts());
  const [budgetCategories, setBudgetCategoriesState] = useState(() => storage.getBudgetCategories());
  const [budgetSpends, setBudgetSpendsState] = useState(() => storage.getBudgetSpends());
  const [agreements, setAgreementsState] = useState(() => storage.getAgreements());
  const [shoppingLists, setShoppingListsState] = useState(() => storage.getShoppingLists());
  const [shoppingItems, setShoppingItemsState] = useState(() => storage.getShoppingItems());
  const [planningSettings, setPlanningSettingsState] = useState(() => storage.getPlanningSettings());
  const [recurringTemplates, setRecurringTemplatesState] = useState(() => storage.getRecurringTemplates());
  const [paycheckActuals, setPaycheckActualsState] = useState(() => storage.getPaycheckActuals());
  const [notifPrefs, setNotifPrefsState] = useState(() => storage.getNotifPrefs());
  const [fcmToken, setFcmToken] = useState(() => localStorage.getItem('bt_fcm_token') || null);
  const [projects, setProjectsState] = useState(() => storage.getProjects());
  const [vaultDocuments, setVaultDocumentsState] = useState(() => storage.getVaultDocuments());
  const [billStickyNotes, setBillStickyNotesState] = useState(() => storage.getBillStickyNotes());
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [testMode, setTestMode] = useState(false);
  // Selected month shared across all pages so toggling the month on one page
  // (e.g. Bills) carries over to every other page (Dashboard, Income, etc.)
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthKey());
  const testModeRef = useRef(false);
  const testModeSnapshot = useRef(null);

  // Use refs to always have fresh values for the save function
  const stateRef = useRef({});
  stateRef.current = { bills, income, budget, settings, notes, debts, savings, commitments, purchases, plannedExpenses, jobs, shifts, budgetCategories, budgetSpends, agreements, shoppingLists, shoppingItems, planningSettings, recurringTemplates, paycheckActuals, notifPrefs, fcmToken, projects, vaultDocuments, billStickyNotes };

  // Load from Firestore on login
  useEffect(() => {
    if (!uid) return;
    setCloudLoaded(false);
    loadUserData(uid).then((data) => {
      if (data) {
        // Hydrate all state from Firestore (Firestore is source of truth)
        const s = stateRef.current.settings;
        if (data.bills) { setBillsState(data.bills); storage.setBills(data.bills); }
        if (data.income) { setIncomeState(data.income); storage.setIncome(data.income); }
        if (data.budget) { setBudgetState(data.budget); storage.setBudget(data.budget); }
        if (data.settings) { setSettingsState({ ...s, ...data.settings }); storage.setSettings({ ...s, ...data.settings }); }
        if (data.notes) { setNotesState(data.notes); storage.setNotes(data.notes); }
        if (data.debts) { setDebtsState(data.debts); storage.setDebts(data.debts); }
        if (data.savings) { setSavingsState(data.savings); storage.setSavings(data.savings); }
        if (data.commitments) { setCommitmentsState(data.commitments); storage.setCommitments(data.commitments); }
        if (data.purchases) { setPurchasesState(data.purchases); storage.setPurchases(data.purchases); }
        if (data.plannedExpenses) { setPlannedExpensesState(data.plannedExpenses); storage.setPlannedExpenses(data.plannedExpenses); }
        if (data.jobs) { setJobsState(data.jobs); storage.setJobs(data.jobs); }
        if (data.shifts) { setShiftsState(data.shifts); storage.setShifts(data.shifts); }
        if (data.budgetCategories) { setBudgetCategoriesState(data.budgetCategories); storage.setBudgetCategories(data.budgetCategories); }
        if (data.budgetSpends) { setBudgetSpendsState(data.budgetSpends); storage.setBudgetSpends(data.budgetSpends); }
        if (data.agreements) { setAgreementsState(data.agreements); storage.setAgreements(data.agreements); }
        if (data.shoppingLists) { setShoppingListsState(data.shoppingLists); storage.setShoppingLists(data.shoppingLists); }
        if (data.shoppingItems) { setShoppingItemsState(data.shoppingItems); storage.setShoppingItems(data.shoppingItems); }
        if (data.planningSettings) {
          const ps = storage.getPlanningSettings();
          const merged = {
            tax: { ...ps.tax, ...(data.planningSettings.tax || {}) },
            ira: { ...ps.ira, ...(data.planningSettings.ira || {}) },
            pto: { ...ps.pto, ...(data.planningSettings.pto || {}) },
          };
          setPlanningSettingsState(merged); storage.setPlanningSettings(merged);
        }
        if (data.recurringTemplates) { setRecurringTemplatesState(data.recurringTemplates); storage.setRecurringTemplates(data.recurringTemplates); }
        if (data.paycheckActuals) { setPaycheckActualsState(data.paycheckActuals); storage.setPaycheckActuals(data.paycheckActuals); }
        if (data.notifPrefs) { setNotifPrefsState({ ...storage.getNotifPrefs(), ...data.notifPrefs, bills: { ...storage.getNotifPrefs().bills, ...(data.notifPrefs.bills || {}) }, commitments: { ...storage.getNotifPrefs().commitments, ...(data.notifPrefs.commitments || {}) }, todos: { ...storage.getNotifPrefs().todos, ...(data.notifPrefs.todos || {}) }, shifts: { ...storage.getNotifPrefs().shifts, ...(data.notifPrefs.shifts || {}) }, email: { ...storage.getNotifPrefs().email, ...(data.notifPrefs.email || {}) } }); storage.setNotifPrefs(data.notifPrefs); }
        if (data.fcmToken && !fcmToken) { setFcmToken(data.fcmToken); localStorage.setItem('bt_fcm_token', data.fcmToken); }
        if (data.projects) { setProjectsState(data.projects); storage.setProjects(data.projects); }
        if (data.vaultDocuments) { setVaultDocumentsState(data.vaultDocuments); storage.setVaultDocuments(data.vaultDocuments); }
        if (data.billStickyNotes) { setBillStickyNotesState(data.billStickyNotes); storage.setBillStickyNotes(data.billStickyNotes); }
      } else {
        // First login — upload existing localStorage data to Firestore
        saveUserData(uid, stateRef.current);
      }
      setCloudLoaded(true);
    });
  }, [uid]);

  // Save snapshot to Firestore (debounced)
  const syncToCloud = useCallback((patch) => {
    if (!uid) return;
    saveUserData(uid, patch);
  }, [uid]);

  const debouncedSync = useDebounce(syncToCloud);

  // Persist helpers: update state, localStorage, and queue Firestore sync
  // In Test Mode, only React state is updated — nothing persists to storage or cloud
  const persistBills = useCallback((next) => {
    setBillsState(next);
    if (!testModeRef.current) { storage.setBills(next); debouncedSync({ bills: next }); }
  }, [debouncedSync]);

  const persistIncome = useCallback((next) => {
    setIncomeState(next);
    if (!testModeRef.current) { storage.setIncome(next); debouncedSync({ income: next }); }
  }, [debouncedSync]);

  const persistBudget = useCallback((next) => {
    setBudgetState(next);
    if (!testModeRef.current) { storage.setBudget(next); debouncedSync({ budget: next }); }
  }, [debouncedSync]);

  const persistSettings = useCallback((next) => {
    setSettingsState(next);
    if (!testModeRef.current) { storage.setSettings(next); debouncedSync({ settings: next }); }
  }, [debouncedSync]);

  const persistDebts = useCallback((next) => {
    setDebtsState(next);
    if (!testModeRef.current) { storage.setDebts(next); debouncedSync({ debts: next }); }
  }, [debouncedSync]);

  const persistSavings = useCallback((next) => {
    setSavingsState(next);
    if (!testModeRef.current) { storage.setSavings(next); debouncedSync({ savings: next }); }
  }, [debouncedSync]);

  const persistCommitments = useCallback((next) => {
    setCommitmentsState(next);
    if (!testModeRef.current) { storage.setCommitments(next); debouncedSync({ commitments: next }); }
  }, [debouncedSync]);

  const persistPurchases = useCallback((next) => {
    setPurchasesState(next);
    if (!testModeRef.current) { storage.setPurchases(next); debouncedSync({ purchases: next }); }
  }, [debouncedSync]);

  const persistPlannedExpenses = useCallback((next) => {
    setPlannedExpensesState(next);
    if (!testModeRef.current) { storage.setPlannedExpenses(next); debouncedSync({ plannedExpenses: next }); }
  }, [debouncedSync]);

  const persistNotes = useCallback((next) => {
    setNotesState(next);
    if (!testModeRef.current) { storage.setNotes(next); debouncedSync({ notes: next }); }
  }, [debouncedSync]);

  const persistJobs = useCallback((next) => {
    setJobsState(next);
    if (!testModeRef.current) { storage.setJobs(next); debouncedSync({ jobs: next }); }
  }, [debouncedSync]);

  const persistShifts = useCallback((next) => {
    setShiftsState(next);
    if (!testModeRef.current) { storage.setShifts(next); debouncedSync({ shifts: next }); }
  }, [debouncedSync]);

  const persistBudgetCategories = useCallback((next) => {
    setBudgetCategoriesState(next);
    if (!testModeRef.current) { storage.setBudgetCategories(next); debouncedSync({ budgetCategories: next }); }
  }, [debouncedSync]);

  const persistBudgetSpends = useCallback((next) => {
    setBudgetSpendsState(next);
    if (!testModeRef.current) { storage.setBudgetSpends(next); debouncedSync({ budgetSpends: next }); }
  }, [debouncedSync]);

  const persistAgreements = useCallback((next) => {
    setAgreementsState(next);
    if (!testModeRef.current) { storage.setAgreements(next); debouncedSync({ agreements: next }); }
  }, [debouncedSync]);

  const persistNotifPrefs = useCallback((next) => {
    setNotifPrefsState(next);
    if (!testModeRef.current) { storage.setNotifPrefs(next); debouncedSync({ notifPrefs: next }); }
  }, [debouncedSync]);

  const persistProjects = useCallback((next) => {
    setProjectsState(next);
    if (!testModeRef.current) { storage.setProjects(next); debouncedSync({ projects: next }); }
  }, [debouncedSync]);

  const persistVaultDocuments = useCallback((next) => {
    setVaultDocumentsState(next);
    if (!testModeRef.current) { storage.setVaultDocuments(next); debouncedSync({ vaultDocuments: next }); }
  }, [debouncedSync]);

  const persistBillStickyNotes = useCallback((next) => {
    setBillStickyNotesState(next);
    if (!testModeRef.current) { storage.setBillStickyNotes(next); debouncedSync({ billStickyNotes: next }); }
  }, [debouncedSync]);

  const enterTestMode = useCallback(() => {
    testModeSnapshot.current = { ...stateRef.current };
    testModeRef.current = true;
    setTestMode(true);
  }, []);

  const exitTestMode = useCallback(() => {
    if (testModeSnapshot.current) {
      const snap = testModeSnapshot.current;
      setBillsState(snap.bills); storage.setBills(snap.bills);
      setIncomeState(snap.income); storage.setIncome(snap.income);
      setBudgetState(snap.budget); storage.setBudget(snap.budget);
      setSettingsState(snap.settings); storage.setSettings(snap.settings);
      setNotesState(snap.notes); storage.setNotes(snap.notes);
      setDebtsState(snap.debts); storage.setDebts(snap.debts);
      setSavingsState(snap.savings); storage.setSavings(snap.savings);
      setCommitmentsState(snap.commitments); storage.setCommitments(snap.commitments);
      setPurchasesState(snap.purchases); storage.setPurchases(snap.purchases);
      setPlannedExpensesState(snap.plannedExpenses); storage.setPlannedExpenses(snap.plannedExpenses);
      setJobsState(snap.jobs); storage.setJobs(snap.jobs);
      setShiftsState(snap.shifts); storage.setShifts(snap.shifts);
      setBudgetCategoriesState(snap.budgetCategories); storage.setBudgetCategories(snap.budgetCategories);
      setBudgetSpendsState(snap.budgetSpends); storage.setBudgetSpends(snap.budgetSpends);
      setAgreementsState(snap.agreements); storage.setAgreements(snap.agreements);
      setShoppingListsState(snap.shoppingLists); storage.setShoppingLists(snap.shoppingLists);
      setShoppingItemsState(snap.shoppingItems); storage.setShoppingItems(snap.shoppingItems);
      setPlanningSettingsState(snap.planningSettings); storage.setPlanningSettings(snap.planningSettings);
      setRecurringTemplatesState(snap.recurringTemplates); storage.setRecurringTemplates(snap.recurringTemplates);
      setPaycheckActualsState(snap.paycheckActuals); storage.setPaycheckActuals(snap.paycheckActuals);
      setNotifPrefsState(snap.notifPrefs); storage.setNotifPrefs(snap.notifPrefs);
      setProjectsState(snap.projects); storage.setProjects(snap.projects);
      if (snap.vaultDocuments) { setVaultDocumentsState(snap.vaultDocuments); storage.setVaultDocuments(snap.vaultDocuments); }
      if (snap.billStickyNotes) { setBillStickyNotesState(snap.billStickyNotes); storage.setBillStickyNotes(snap.billStickyNotes); }
      testModeSnapshot.current = null;
    }
    testModeRef.current = false;
    setTestMode(false);
  }, []);

  const enablePushNotifications = useCallback(async () => {
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') return { ok: false, reason: perm };
    const token = await registerFCMToken();
    if (token) {
      setFcmToken(token);
      localStorage.setItem('bt_fcm_token', token);
      if (uid) saveUserData(uid, { fcmToken: token });
    }
    return { ok: true, hasPush: !!token };
  }, [uid]);

  // When this device last wrote items locally. A guest's edit arriving inside
  // that window waits rather than overwriting a change still in flight.
  const lastListWriteRef = useRef(0);

  const persistShoppingLists = useCallback((next) => {
    setShoppingListsState(next);
    if (!testModeRef.current) { storage.setShoppingLists(next); debouncedSync({ shoppingLists: next }); }
  }, [debouncedSync]);

  const persistShoppingItems = useCallback((next) => {
    setShoppingItemsState(next);
    lastListWriteRef.current = Date.now();
    if (!testModeRef.current) { storage.setShoppingItems(next); debouncedSync({ shoppingItems: next }); }
  }, [debouncedSync]);

  const persistPlanningSettings = useCallback((next) => {
    setPlanningSettingsState(next);
    if (!testModeRef.current) { storage.setPlanningSettings(next); debouncedSync({ planningSettings: next }); }
  }, [debouncedSync]);

  const persistRecurringTemplates = useCallback((next) => {
    setRecurringTemplatesState(next);
    if (!testModeRef.current) { storage.setRecurringTemplates(next); debouncedSync({ recurringTemplates: next }); }
  }, [debouncedSync]);

  const persistPaycheckActuals = useCallback((next) => {
    setPaycheckActualsState(next);
    if (!testModeRef.current) { storage.setPaycheckActuals(next); debouncedSync({ paycheckActuals: next }); }
  }, [debouncedSync]);

  // ── Bills ──
  const addBill = useCallback((bill) => persistBills([...bills, { ...bill, id: generateId() }]), [bills, persistBills]);
  const updateBill = useCallback((id, u) => persistBills(bills.map((b) => b.id === id ? { ...b, ...u } : b)), [bills, persistBills]);
  const deleteBill = useCallback((id) => persistBills(bills.filter((b) => b.id !== id)), [bills, persistBills]);

  const toggleBillPaid = useCallback((id, month) => {
    const mk = month || currentMonthKey();
    persistBills(bills.map((b) => {
      if (b.id !== id) return b;
      const next = nextBillStatus(getBillStatus(b, mk));
      return { ...b, statusMonths: { ...(b.statusMonths || {}), [mk]: next } };
    }));
  }, [bills, persistBills]);

  const setBillStatusDirect = useCallback((id, mk, status) => {
    persistBills(bills.map((b) => b.id === id ? { ...b, statusMonths: { ...(b.statusMonths || {}), [mk]: status } } : b));
  }, [bills, persistBills]);

  // ── Income ──
  const addIncome = useCallback((item) => persistIncome([...income, { ...item, id: generateId() }]), [income, persistIncome]);
  const updateIncome = useCallback((id, u) => persistIncome(income.map((i) => i.id === id ? { ...i, ...u } : i)), [income, persistIncome]);
  const deleteIncome = useCallback((id) => persistIncome(income.filter((i) => i.id !== id)), [income, persistIncome]);

  // ── Budget ──
  const setBudgetForMonth = useCallback((mk, amount) => persistBudget({ ...budget, [mk]: amount }), [budget, persistBudget]);

  // ── Debts ──
  const addDebt = useCallback((debt) => persistDebts([...debts, { ...debt, id: generateId() }]), [debts, persistDebts]);
  const updateDebt = useCallback((id, u) => persistDebts(debts.map((d) => d.id === id ? { ...d, ...u } : d)), [debts, persistDebts]);
  const deleteDebt = useCallback((id) => persistDebts(debts.filter((d) => d.id !== id)), [debts, persistDebts]);

  const toggleDebtPaid = useCallback((id, month) => {
    persistDebts(debts.map((d) => {
      if (d.id !== id) return d;
      const mk = month || currentMonthKey();
      return { ...d, paidMonths: { ...(d.paidMonths || {}), [mk]: !(d.paidMonths || {})[mk] } };
    }));
  }, [debts, persistDebts]);

  // ── Savings ──
  const addSaving = useCallback((s) => persistSavings([...savings, { ...s, id: generateId() }]), [savings, persistSavings]);
  const updateSaving = useCallback((id, u) => persistSavings(savings.map((s) => s.id === id ? { ...s, ...u } : s)), [savings, persistSavings]);
  const deleteSaving = useCallback((id) => persistSavings(savings.filter((s) => s.id !== id)), [savings, persistSavings]);

  // ── Commitments ──
  const addCommitment = useCallback((c) => persistCommitments([...commitments, { ...c, id: generateId(), completed: false, createdAt: new Date().toISOString() }]), [commitments, persistCommitments]);
  const updateCommitment = useCallback((id, u) => persistCommitments(commitments.map((c) => c.id === id ? { ...c, ...u } : c)), [commitments, persistCommitments]);
  const deleteCommitment = useCallback((id) => persistCommitments(commitments.filter((c) => c.id !== id)), [commitments, persistCommitments]);
  const toggleCommitment = useCallback((id) => persistCommitments(commitments.map((c) => c.id === id ? { ...c, completed: !c.completed } : c)), [commitments, persistCommitments]);

  // ── Notes ──
  const addNote = useCallback((note) => {
    const now = new Date().toISOString();
    persistNotes([{ ...note, id: generateId(), createdAt: now, updatedAt: now }, ...notes]);
  }, [notes, persistNotes]);
  const updateNote = useCallback((id, u) => persistNotes(notes.map((n) => n.id === id ? { ...n, ...u, updatedAt: new Date().toISOString() } : n)), [notes, persistNotes]);
  const deleteNote = useCallback((id) => persistNotes(notes.filter((n) => n.id !== id)), [notes, persistNotes]);
  const toggleNotePin = useCallback((id) => persistNotes(notes.map((n) => n.id === id ? { ...n, pinned: !n.pinned } : n)), [notes, persistNotes]);
  const toggleNoteDashboardPin = useCallback((id) => persistNotes(notes.map((n) => n.id === id ? { ...n, pinnedToDashboard: !n.pinnedToDashboard } : n)), [notes, persistNotes]);

  // ── Purchases ──
  const addPurchase = useCallback((p) => persistPurchases([{ ...p, id: p.id || generateId(), createdAt: new Date().toISOString() }, ...purchases]), [purchases, persistPurchases]);
  const bulkAddPurchases = useCallback((items) => {
    const now = new Date().toISOString();
    const newItems = items.map((p) => ({ ...p, id: p.id || generateId(), createdAt: now }));
    persistPurchases([...newItems, ...purchases]);
  }, [purchases, persistPurchases]);
  const updatePurchase = useCallback((id, u) => persistPurchases(purchases.map((p) => p.id === id ? { ...p, ...u } : p)), [purchases, persistPurchases]);
  const deletePurchase = useCallback((id) => persistPurchases(purchases.filter((p) => p.id !== id)), [purchases, persistPurchases]);

  // ── Jobs ──
  const addJob = useCallback((job) => persistJobs([...jobs, { ...job, id: generateId(), createdAt: new Date().toISOString() }]), [jobs, persistJobs]);
  const updateJob = useCallback((id, u) => persistJobs(jobs.map((j) => j.id === id ? { ...j, ...u } : j)), [jobs, persistJobs]);
  const deleteJob = useCallback((id) => persistJobs(jobs.filter((j) => j.id !== id)), [jobs, persistJobs]);

  // ── Shifts ──
  const addShift = useCallback((sh) => {
    const newShift = { ...sh, id: generateId(), createdAt: new Date().toISOString() };
    const next = [newShift, ...shifts];
    persistShifts(next);
    if (newShift.notificationEnabled) {
      const job = jobs.find((j) => j.id === newShift.jobId);
      scheduleShiftNotification(newShift, job);
    }
  }, [shifts, jobs, persistShifts]);
  const updateShift = useCallback((id, u) => {
    const updated = { ...shifts.find((s) => s.id === id), ...u };
    persistShifts(shifts.map((s) => s.id === id ? updated : s));
    cancelShiftNotification(id);
    if (updated.notificationEnabled) {
      const job = jobs.find((j) => j.id === updated.jobId);
      scheduleShiftNotification(updated, job);
    }
  }, [shifts, jobs, persistShifts]);
  const deleteShift = useCallback((id) => {
    cancelShiftNotification(id);
    persistShifts(shifts.filter((s) => s.id !== id));
  }, [shifts, persistShifts]);
  const bulkSaveShifts = useCallback((entries) => {
    let updated = [...shifts];
    const touched = [];
    for (const { existingId, ...data } of entries) {
      if (existingId) {
        const merged = { ...updated.find((s) => s.id === existingId), ...data };
        updated = updated.map((s) => s.id === existingId ? merged : s);
        touched.push(merged);
      } else {
        const created = { ...data, id: generateId(), createdAt: new Date().toISOString() };
        updated = [created, ...updated];
        touched.push(created);
      }
    }
    persistShifts(updated);
    // Copied shifts can carry a reminder, so they need scheduling the same way
    // a singly-added one does.
    for (const sh of touched) {
      cancelShiftNotification(sh.id);
      if (sh.notificationEnabled) {
        scheduleShiftNotification(sh, jobs.find((j) => j.id === sh.jobId));
      }
    }
  }, [shifts, jobs, persistShifts]);

  // ── Planned Expenses ──
  const addPlannedExpense = useCallback((pe) => persistPlannedExpenses([...plannedExpenses, { ...pe, id: generateId(), status: 'planned', createdAt: new Date().toISOString() }]), [plannedExpenses, persistPlannedExpenses]);
  const updatePlannedExpense = useCallback((id, u) => persistPlannedExpenses(plannedExpenses.map((pe) => pe.id === id ? { ...pe, ...u } : pe)), [plannedExpenses, persistPlannedExpenses]);
  const deletePlannedExpense = useCallback((id) => persistPlannedExpenses(plannedExpenses.filter((pe) => pe.id !== id)), [plannedExpenses, persistPlannedExpenses]);

  // ── Budget Categories (envelopes) ──
  const addBudgetCategory = useCallback((cat) => persistBudgetCategories([...budgetCategories, { ...cat, id: generateId(), createdAt: new Date().toISOString() }]), [budgetCategories, persistBudgetCategories]);
  const updateBudgetCategory = useCallback((id, u) => persistBudgetCategories(budgetCategories.map((c) => c.id === id ? { ...c, ...u } : c)), [budgetCategories, persistBudgetCategories]);
  const deleteBudgetCategory = useCallback((id) => persistBudgetCategories(budgetCategories.filter((c) => c.id !== id)), [budgetCategories, persistBudgetCategories]);

  // ── Budget Spends ──
  const addBudgetSpend = useCallback((spend) => persistBudgetSpends([{ ...spend, id: generateId(), createdAt: new Date().toISOString() }, ...budgetSpends]), [budgetSpends, persistBudgetSpends]);
  const updateBudgetSpend = useCallback((id, u) => persistBudgetSpends(budgetSpends.map((s) => s.id === id ? { ...s, ...u } : s)), [budgetSpends, persistBudgetSpends]);
  const deleteBudgetSpend = useCallback((id) => persistBudgetSpends(budgetSpends.filter((s) => s.id !== id)), [budgetSpends, persistBudgetSpends]);

  // ── Agreements ──
  const addAgreement = useCallback((ag) => persistAgreements([{ ...ag, id: generateId(), status: 'active', createdAt: new Date().toISOString() }, ...agreements]), [agreements, persistAgreements]);
  const updateAgreement = useCallback((id, u) => persistAgreements(agreements.map((a) => a.id === id ? { ...a, ...u } : a)), [agreements, persistAgreements]);
  const deleteAgreement = useCallback((id) => persistAgreements(agreements.filter((a) => a.id !== id)), [agreements, persistAgreements]);

  // ── Shopping Lists ──
  // Lists carry the same due/reminder shape as items, so a reminder can be set
  // on the list as a whole. `dueAt` is stamped here for the same reason it is on
  // items: the Cloud Function reads an absolute instant rather than re-deriving
  // one from a wall-clock time in an unknown zone.
  const addShoppingList = useCallback((list) => persistShoppingLists([
    ...shoppingLists,
    {
      ...list,
      id: generateId(),
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dueAt: list.dueAt ?? computeDueAt(list.dueDate, list.dueTime),
    },
  ]), [shoppingLists, persistShoppingLists]);

  const updateShoppingList = useCallback((id, u) => persistShoppingLists(
    shoppingLists.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...u, updatedAt: new Date().toISOString() };
      if ('dueDate' in u || 'dueTime' in u) next.dueAt = computeDueAt(next.dueDate, next.dueTime);
      return next;
    })
  ), [shoppingLists, persistShoppingLists]);

  const deleteShoppingList = useCallback((id) => {
    const newLists = shoppingLists.filter((l) => l.id !== id);
    const newItems = shoppingItems.filter((i) => i.listId !== id);
    setShoppingListsState(newLists);
    setShoppingItemsState(newItems);
    if (!testModeRef.current) {
      storage.setShoppingLists(newLists);
      storage.setShoppingItems(newItems);
      debouncedSync({ shoppingLists: newLists, shoppingItems: newItems });
    }
  }, [shoppingLists, shoppingItems, debouncedSync]);

  // ── Shopping Items ──
  // The caller may bring its own id: the full add-task form needs one before
  // the item exists, so photos can upload to their final storage path while
  // it's still being filled in.
  const addShoppingItem = useCallback((item) => persistShoppingItems([
    ...shoppingItems,
    {
      ...item,
      id: item.id ?? generateId(),
      createdAt: new Date().toISOString(),
      dueAt: item.dueAt ?? computeDueAt(item.dueDate, item.dueTime),
    },
  ]), [shoppingItems, persistShoppingItems]);

  // Adding several items has to be one write, not a loop over addShoppingItem:
  // each of those calls closes over the same `shoppingItems`, so N calls in a
  // row would all append to the same starting array and only the last would
  // survive.
  //
  // `keepIds` is for generated rows — the weekly planner's day headings carry
  // ids derived from their date, which is what stops a second run from
  // building a duplicate Monday.
  const addShoppingItems = useCallback((items, { keepIds = false } = {}) => {
    if (!items || items.length === 0) return;
    const now = new Date().toISOString();
    persistShoppingItems([
      ...shoppingItems,
      ...items.map((item) => ({
        ...item,
        id: (keepIds && item.id) ? item.id : generateId(),
        createdAt: now,
        dueAt: item.dueAt ?? computeDueAt(item.dueDate, item.dueTime),
      })),
    ]);
  }, [shoppingItems, persistShoppingItems]);

  const updateShoppingItem = useCallback((id, u) => persistShoppingItems(
    shoppingItems.map((i) => {
      if (i.id !== id) return i;
      const next = { ...i, ...u };
      // Keep the due instant in sync whenever the date or time changes, so the
      // Cloud Function can schedule the push without guessing a time zone.
      if ('dueDate' in u || 'dueTime' in u) next.dueAt = computeDueAt(next.dueDate, next.dueTime);
      return next;
    })
  ), [shoppingItems, persistShoppingItems]);

  /**
   * Patch several items with the same change in one write. Completing a parent
   * task closes its subtasks too, and doing that as N calls to
   * `updateShoppingItem` would lose all but the last — each closes over the
   * same `shoppingItems`.
   */
  const updateShoppingItems = useCallback((ids, u) => {
    const target = new Set(ids);
    if (target.size === 0) return;
    persistShoppingItems(shoppingItems.map((i) => {
      if (!target.has(i.id)) return i;
      const next = { ...i, ...u };
      if ('dueDate' in u || 'dueTime' in u) next.dueAt = computeDueAt(next.dueDate, next.dueTime);
      return next;
    }));
  }, [shoppingItems, persistShoppingItems]);

  /**
   * Patch one item and append another in a single write — completing a
   * repeating task marks it done *and* creates its next occurrence.
   *
   * This can't be updateShoppingItem followed by addShoppingItem: both close
   * over the same `shoppingItems` array, so the second call would be built
   * from a list that never had the first change in it, and one of the two
   * would be lost.
   *
   * `alsoIds` take the same patch — a repeating parent closes its subtasks on
   * the way out, which has to happen in this write for the same reason.
   *
   * `newItems` is an array because a repeating parent brings copies of its
   * subtasks with it, so one completion can create several tasks.
   */
  const completeAndRepeatShoppingItem = useCallback((id, patch, newItems, alsoIds = []) => {
    const now = new Date().toISOString();
    const alsoPatched = new Set([id, ...alsoIds]);
    const patched = shoppingItems.map((i) => {
      if (!alsoPatched.has(i.id)) return i;
      // Only the completed task itself spawns the follow-up; its subtasks are
      // just being closed, so the marker doesn't belong on them.
      const own = i.id === id ? patch : { ...patch, spawnedNextId: i.spawnedNextId ?? null };
      const next = { ...i, ...own };
      if ('dueDate' in own || 'dueTime' in own) next.dueAt = computeDueAt(next.dueDate, next.dueTime);
      return next;
    });
    persistShoppingItems([
      ...patched,
      ...(Array.isArray(newItems) ? newItems : [newItems]).map((item) => ({
        ...item,
        id: item.id ?? generateId(),
        createdAt: now,
        dueAt: item.dueAt ?? computeDueAt(item.dueDate, item.dueTime),
      })),
    ]);
  }, [shoppingItems, persistShoppingItems]);

  const deleteShoppingItem = useCallback((id) => persistShoppingItems(
    shoppingItems.filter((i) => i.id !== id)
  ), [shoppingItems, persistShoppingItems]);

  /** Remove several items in one write — a parent and the subtasks under it. */
  const deleteShoppingItems = useCallback((ids) => {
    const doomed = new Set(ids);
    if (doomed.size === 0) return;
    persistShoppingItems(shoppingItems.filter((i) => !doomed.has(i.id)));
  }, [shoppingItems, persistShoppingItems]);

  const toggleShoppingItem = useCallback((id) => persistShoppingItems(
    shoppingItems.map((i) => i.id === id ? { ...i, checked: !i.checked } : i)
  ), [shoppingItems, persistShoppingItems]);

  // Creates a list + all its items in one atomic write (used by paste-import)
  const importList = useCallback((listData, itemNames) => {
    const listId = generateId();
    const now = new Date().toISOString();
    const newList = {
      ...listData, id: listId, archived: false, createdAt: now, updatedAt: now,
      dueAt: computeDueAt(listData.dueDate, listData.dueTime),
    };
    const newItems = itemNames.map((name) => ({
      id: generateId(), listId, name: name.trim(), createdAt: now,
      qty: null, price: null, checked: false,
      status: 'pending', notes: null,
      dueDate: listData.dueDate || null, dueTime: null, notifyEnabled: false,
      dueAt: computeDueAt(listData.dueDate, null), remindOffsetMinutes: 0,
    }));
    const nextLists = [...shoppingLists, newList];
    const nextItems = [...shoppingItems, ...newItems];
    setShoppingListsState(nextLists);
    setShoppingItemsState(nextItems);
    if (!testModeRef.current) {
      storage.setShoppingLists(nextLists);
      storage.setShoppingItems(nextItems);
      debouncedSync({ shoppingLists: nextLists, shoppingItems: nextItems });
    }
  }, [shoppingLists, shoppingItems, debouncedSync]);

  // ── Planning Settings ──
  const updatePlanningSettings = useCallback((patch) => {
    const next = { ...planningSettings, ...patch };
    persistPlanningSettings(next);
  }, [planningSettings, persistPlanningSettings]);

  // ── Recurring Templates ──
  const addRecurringTemplate = useCallback((t) => persistRecurringTemplates([
    ...recurringTemplates,
    { ...t, id: generateId(), active: true, createdAt: new Date().toISOString() },
  ]), [recurringTemplates, persistRecurringTemplates]);

  const updateRecurringTemplate = useCallback((id, u) => persistRecurringTemplates(
    recurringTemplates.map((t) => t.id === id ? { ...t, ...u } : t)
  ), [recurringTemplates, persistRecurringTemplates]);

  const deleteRecurringTemplate = useCallback((id) => persistRecurringTemplates(
    recurringTemplates.filter((t) => t.id !== id)
  ), [recurringTemplates, persistRecurringTemplates]);

  // Auto-log recurring purchases on load (after cloud data is ready)
  useEffect(() => {
    if (!cloudLoaded || !recurringTemplates.length) return;
    const today = new Date();
    const todayDay = today.getDate();
    const currentMk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const toLog = recurringTemplates.filter((t) => {
      if (!t.active) return false;
      if (t.lastLoggedMonth === currentMk) return false;
      if (t.dayOfMonth && t.dayOfMonth > todayDay) return false;
      return true;
    });

    if (!toLog.length) return;

    const newPurchases = toLog.map((t) => {
      const day = t.dayOfMonth ? String(Math.min(t.dayOfMonth, todayDay)).padStart(2, '0') : String(todayDay).padStart(2, '0');
      return {
        id: generateId(),
        merchant: t.merchant,
        amount: t.amount,
        category: t.category || 'Subscriptions',
        person: t.person || 'me',
        date: `${currentMk}-${day}`,
        notes: 'Auto-logged recurring',
        recurringTemplateId: t.id,
        createdAt: new Date().toISOString(),
      };
    });

    const updatedTemplates = recurringTemplates.map((t) =>
      toLog.find((tl) => tl.id === t.id) ? { ...t, lastLoggedMonth: currentMk } : t
    );

    // Use state refs to avoid stale closures
    const freshPurchases = stateRef.current.purchases;
    setRecurringTemplatesState(updatedTemplates); storage.setRecurringTemplates(updatedTemplates);
    const nextPurchases = [...newPurchases, ...freshPurchases];
    setPurchasesState(nextPurchases); storage.setPurchases(nextPurchases);
    debouncedSync({ purchases: nextPurchases, recurringTemplates: updatedTemplates });
  }, [cloudLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed permanent budget categories after cloud data is ready
  useEffect(() => {
    if (!cloudLoaded) return;
    const current = stateRef.current.budgetCategories;
    const next = [...current];
    let changed = false;
    PERMANENT_BUDGET_CATEGORIES.forEach((p) => {
      const idx = next.findIndex((c) => c.name.toLowerCase() === p.name.toLowerCase());
      if (idx === -1) {
        next.push({ ...p, id: generateId(), isPermanent: true, createdAt: new Date().toISOString() });
        changed = true;
      } else if (!next[idx].isPermanent) {
        next[idx] = { ...next[idx], isPermanent: true };
        changed = true;
      }
    });
    if (changed) persistBudgetCategories(next);
  }, [cloudLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vault Documents ──
  const addVaultDocument = useCallback((doc) => {
    const now = new Date().toISOString();
    persistVaultDocuments([{ ...doc, id: generateId(), createdAt: now, updatedAt: now }, ...vaultDocuments]);
  }, [vaultDocuments, persistVaultDocuments]);
  const updateVaultDocument = useCallback((id, u) => persistVaultDocuments(
    vaultDocuments.map((d) => d.id === id ? { ...d, ...u, updatedAt: new Date().toISOString() } : d)
  ), [vaultDocuments, persistVaultDocuments]);
  const deleteVaultDocument = useCallback((id) => persistVaultDocuments(
    vaultDocuments.filter((d) => d.id !== id)
  ), [vaultDocuments, persistVaultDocuments]);

  // ── Bill Sticky Notes (per month) ──
  const setBillStickyNote = useCallback((mk, patch) => {
    persistBillStickyNotes({
      ...billStickyNotes,
      [mk]: { ...billStickyNotes[mk], ...patch, updatedAt: new Date().toISOString() },
    });
  }, [billStickyNotes, persistBillStickyNotes]);

  // ── Projects ──
  const addProject = useCallback((p) => persistProjects([
    { ...p, id: generateId(), completed: false, createdAt: new Date().toISOString() },
    ...projects,
  ]), [projects, persistProjects]);

  const updateProject = useCallback((id, u) => persistProjects(
    projects.map((p) => p.id === id ? { ...p, ...u } : p)
  ), [projects, persistProjects]);

  const deleteProject = useCallback((id) => persistProjects(
    projects.filter((p) => p.id !== id)
  ), [projects, persistProjects]);

  // ── Paycheck Actuals ──
  const addPaycheckActual = useCallback((a) => persistPaycheckActuals([
    ...paycheckActuals,
    { ...a, id: generateId(), createdAt: new Date().toISOString() },
  ]), [paycheckActuals, persistPaycheckActuals]);

  const updatePaycheckActual = useCallback((id, u) => persistPaycheckActuals(
    paycheckActuals.map((a) => a.id === id ? { ...a, ...u } : a)
  ), [paycheckActuals, persistPaycheckActuals]);

  const deletePaycheckActual = useCallback((id) => persistPaycheckActuals(
    paycheckActuals.filter((a) => a.id !== id)
  ), [paycheckActuals, persistPaycheckActuals]);

  // ── Share Link ──
  const buildSnapshot = useCallback(() => {
    const today = new Date();
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const oldestMk = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
    return {
      settings: { myName: settings.myName, spouseName: settings.spouseName, spouseEnabled: settings.spouseEnabled },
      sharePin: settings.sharePin || '3419',
      bills,
      income,
      purchases: purchases.filter((p) => p.date && p.date >= oldestMk),
      debts,
      savings,
      commitments: commitments.filter((c) => !c.completed),
      shoppingLists,
      shoppingItems,
    };
  }, [bills, income, purchases, debts, savings, commitments, settings, shoppingLists, shoppingItems]);

  const generateShareLink = useCallback(async () => {
    const token = generateId() + generateId();
    try {
      await saveSharedView(token, buildSnapshot());
    } catch (err) {
      return { ok: false, error: err.message || 'Firestore write failed' };
    }
    persistSettings({ ...settings, shareToken: token });
    return { ok: true, token };
  }, [buildSnapshot, settings, persistSettings]);

  const revokeShareLink = useCallback(() => {
    persistSettings({ ...settings, shareToken: null });
  }, [settings, persistSettings]);

  const refreshShareLink = useCallback(async () => {
    const token = settings.shareToken;
    if (!token) return { ok: false, error: 'No active share token' };
    try {
      await saveSharedView(token, buildSnapshot());
    } catch (err) {
      return { ok: false, error: err.message || 'Firestore write failed' };
    }
    return { ok: true };
  }, [buildSnapshot, settings]);

  // ── Filing dated tasks into the week they belong to ───────────────────────
  // Give a task a date months out and its week and day are built around it.
  // `planWeeks` only keeps the standing weeks up; without this, a task dated in
  // December had nowhere to go — there was no December — so it sat in whichever
  // column happened to be open.
  //
  // Done as an effect rather than inside each mutator because a date can be set
  // from four places (quick-add, the row's date panel, the full editor, a
  // paste) and a fifth that isn't even on this device: a guest editing a shared
  // list. One rule at the end covers all of them, and it also files tasks that
  // were dated before the planner existed.
  //
  // `refileByDate` returns null when there's nothing to do, which is the answer
  // almost every time this runs.
  const itemFilingSignature = shoppingItems
    .map((i) => `${i.id}:${i.dueDate || ''}:${i.sectionId || ''}:${i.parentId || ''}:${i.status}`)
    .join('|');

  useEffect(() => {
    if (uid && !cloudLoaded) return;

    const lists = stateRef.current.shoppingLists || [];
    const items = stateRef.current.shoppingItems || [];
    const plans = lists
      .filter((l) => !l.archived && l.weekly?.enabled)
      .map((list) => [list, refileByDate(list, items)])
      .filter(([, plan]) => plan);
    if (plans.length === 0) return;

    const now = new Date().toISOString();
    const listPatch = new Map();
    const newItems = [];
    const patchById = new Map();

    for (const [list, plan] of plans) {
      if (plan.sections.length > 0) {
        listPatch.set(list.id, {
          sections: [...(list.sections || []), ...plan.sections],
          updatedAt: now,
        });
      }
      newItems.push(...plan.items.map((item) => ({
        ...item,
        createdAt: now,
        dueAt: computeDueAt(item.dueDate, item.dueTime),
      })));
      for (const patch of plan.patches) patchById.set(patch.id, patch);
    }

    // One write: a task pointing at a section that landed in a later write
    // would render as unfiled in between.
    const nextLists = lists.map((l) => (listPatch.has(l.id) ? { ...l, ...listPatch.get(l.id) } : l));
    const nextItems = [
      ...items.map((i) => (patchById.has(i.id) ? { ...i, ...patchById.get(i.id) } : i)),
      ...newItems,
    ];

    setShoppingListsState(nextLists);
    setShoppingItemsState(nextItems);
    if (!testModeRef.current) {
      storage.setShoppingLists(nextLists);
      storage.setShoppingItems(nextItems);
      debouncedSync({ shoppingLists: nextLists, shoppingItems: nextItems });
    }
  }, [cloudLoaded, uid, debouncedSync, itemFilingSignature, weeklySignature]);

  // ── How full the Firestore document is ────────────────────────────────────
  // Everything this app stores lives in one document, `users/{uid}/data/app`,
  // and Firestore hard-caps a document at 1 MiB. Past that, writes fail — and
  // the first thing anyone would notice is changes silently not saving.
  //
  // So it's measured and surfaced (Settings → Data) rather than left to be
  // discovered. Measuring is a full serialise, which is not free, so it runs
  // on a long timer and after the cloud load rather than on every keystroke.
  const [docSize, setDocSize] = useState(null);

  useEffect(() => {
    if (uid && !cloudLoaded) return;
    const measure = () => {
      try {
        setDocSize(new TextEncoder().encode(JSON.stringify(stateRef.current)).length);
      } catch {
        // A circular or unserialisable value would throw here — but it would
        // also break the sync, which reports its own errors. Not this job.
        setDocSize(null);
      }
    };
    measure();
    const id = setInterval(measure, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [cloudLoaded, uid]);

  // ── Shared lists ──────────────────────────────────────────────────────────
  // A list can be handed to someone else by link. The list itself stays here,
  // in this user's document; `listShares/{token}` holds a *mirror* of it that
  // the other person reads, and their edits arrive as ops that a Cloud
  // Function applies back to this document. Keeping the blob authoritative is
  // what lets the reminder functions, the offline cache and every sync path in
  // this file carry on unchanged.

  /** Start sharing a list, or hand back the link if it already has one. */
  const shareList = useCallback(async (listId) => {
    const list = stateRef.current.shoppingLists.find((l) => l.id === listId);
    if (!list) return { ok: false, error: 'List not found' };
    if (!uid) return { ok: false, error: 'Sign in to share a list' };

    const token = list.share?.token || (generateId() + generateId());
    try {
      await saveListShare(token, {
        ownerUid: uid,
        list,
        items: stateRef.current.shoppingItems.filter((i) => i.listId === listId),
      });
      await setListShareRevoked(token, false);
    } catch (err) {
      return { ok: false, error: err.message || 'Could not create the share' };
    }

    updateShoppingList(listId, {
      share: { token, createdAt: list.share?.createdAt || new Date().toISOString(), revoked: false },
    });
    return { ok: true, token };
  }, [uid, updateShoppingList]);

  /**
   * Turn a link off. The share document stays, so the activity feed survives
   * and the same link works again if it's resumed — a revoke is a stop, not a
   * delete.
   */
  const revokeListShare = useCallback(async (listId, revoked = true) => {
    const list = stateRef.current.shoppingLists.find((l) => l.id === listId);
    const token = list?.share?.token;
    if (!token) return { ok: false, error: 'That list is not shared' };
    try {
      await setListShareRevoked(token, revoked);
    } catch (err) {
      return { ok: false, error: err.message || 'Could not change the share' };
    }
    updateShoppingList(listId, { share: { ...list.share, revoked } });
    return { ok: true };
  }, [updateShoppingList]);

  /** Stop sharing for good: the link dies and the mirror goes with it. */
  const deleteListShareLink = useCallback(async (listId) => {
    const list = stateRef.current.shoppingLists.find((l) => l.id === listId);
    const token = list?.share?.token;
    if (!token) return { ok: true };
    try {
      await deleteListShare(token);
    } catch (err) {
      return { ok: false, error: err.message || 'Could not delete the share' };
    }
    updateShoppingList(listId, { share: null });
    return { ok: true };
  }, [updateShoppingList]);

  // Push the mirror whenever a shared list changes. Debounced on its own timer
  // rather than sharing `debouncedSync`'s: that one carries patches to this
  // user's document, and a mirror is a different destination with a different
  // shape.
  //
  // The signature is what stops this from writing on every render — a list is
  // only mirrored when something a guest would see has actually changed.
  const mirrorTimerRef = useRef(null);
  const mirrorSentRef = useRef(new Map()); // token → last signature written

  const sharedListSignature = shoppingLists
    .filter((l) => l.share?.token && !l.share.revoked)
    .map((l) => {
      const items = shoppingItems.filter((i) => i.listId === l.id);
      return `${l.share.token}:${l.name}:${(l.sections || []).length}:${items.length}:${
        items.map((i) => `${i.id}${i.status}${i.name}${i.dueDate || ''}${i.dueTime || ''}`).join(',')
      }`;
    })
    .join('|');

  useEffect(() => {
    if (!uid || testModeRef.current) return;
    clearTimeout(mirrorTimerRef.current);
    mirrorTimerRef.current = setTimeout(() => {
      for (const list of stateRef.current.shoppingLists) {
        const token = list.share?.token;
        if (!token || list.share.revoked) continue;
        const items = stateRef.current.shoppingItems.filter((i) => i.listId === list.id);
        const signature = `${list.name}:${JSON.stringify(list.sections || [])}:${JSON.stringify(items)}`;
        if (mirrorSentRef.current.get(token) === signature) continue;
        mirrorSentRef.current.set(token, signature);
        saveListShare(token, { ownerUid: uid, list, items }).catch((err) => {
          // A failed mirror push is recoverable — the next change retries — so
          // it must not take the app down with it.
          mirrorSentRef.current.delete(token);
          console.error('Could not update the shared copy of', list.name, err.message);
        });
      }
    }, 1500);
    return () => clearTimeout(mirrorTimerRef.current);
  }, [uid, sharedListSignature]);

  // Pick up a guest's edits. The Cloud Function has already applied them to
  // this user's document and stamped `appliedAt` on the mirror, so adopting
  // the mirror's items for that list is catching up to a change already
  // committed here — not a merge of two competing versions.
  //
  // Only snapshots carrying a *newer* `appliedAt` are adopted, which is what
  // distinguishes the function's write from an echo of our own mirror push.
  // A local edit inside the last few seconds defers the adoption rather than
  // being overwritten by it.
  const adoptedRef = useRef(new Map()); // token → last appliedAt adopted
  const shareTokens = shoppingLists
    .filter((l) => l.share?.token && !l.share.revoked)
    .map((l) => `${l.id}:${l.share.token}`)
    .join('|');

  useEffect(() => {
    if (!uid || testModeRef.current || !shareTokens) return;

    const retries = [];

    const adopt = (listId, token, mirror) => {
      const appliedAt = Number(mirror?.appliedAt) || 0;
      if (!appliedAt || appliedAt <= (adoptedRef.current.get(token) || 0)) return;

      // Our own write is still settling — come back to this rather than
      // dropping it, since no further snapshot is coming to prompt a retry.
      const sinceLocal = Date.now() - lastListWriteRef.current;
      if (sinceLocal < LOCAL_WRITE_SETTLE_MS) {
        retries.push(setTimeout(() => adopt(listId, token, mirror), LOCAL_WRITE_SETTLE_MS - sinceLocal + 100));
        return;
      }
      adoptedRef.current.set(token, appliedAt);

      const incoming = (mirror.items || []).map(({ hasPhotos, ...rest }) => rest);
      const byId = new Map(incoming.map((i) => [i.id, i]));
      const next = [
        // Photos live only in this document, so they're taken from the local
        // copy rather than the mirror, which never carries them.
        ...stateRef.current.shoppingItems
          .filter((i) => i.listId !== listId || byId.has(i.id))
          .map((i) => (i.listId === listId && byId.has(i.id)
            ? { ...byId.get(i.id), attachments: i.attachments || [] }
            : i)),
        ...incoming.filter((i) => !stateRef.current.shoppingItems.some((local) => local.id === i.id))
          .map((i) => ({ ...i, attachments: [] })),
      ];

      setShoppingItemsState(next);
      storage.setShoppingItems(next);
      // Deliberately no cloud write: the function already wrote this to the
      // document. Syncing it back would be a pointless round trip.
    };

    const unsubs = shareTokens.split('|').map((pair) => {
      const [listId, token] = pair.split(':');
      return subscribeListShare(
        token,
        (mirror) => adopt(listId, token, mirror),
        (err) => console.error('Shared list subscription failed:', err.message),
      );
    });
    return () => {
      unsubs.forEach((fn) => fn?.());
      retries.forEach(clearTimeout);
    };
  }, [uid, shareTokens]);

  // ── Firebase Cloud Messaging: register token + handle foreground messages ──
  useEffect(() => {
    if (notificationPermission() !== 'granted') return;
    let unsub = () => {};
    registerFCMToken().then((token) => { if (token && uid) saveFCMToken(uid, token); });
    onForegroundMessage().then((fn) => { unsub = fn; });
    return () => unsub();
  }, [uid]);

  // ── One-time migration: hide moved Dashboard sections after Spending tabs added ──
  useEffect(() => {
    if (!cloudLoaded && uid) return;
    const current = stateRef.current.settings;
    if (!current._planningTabsMigrated) {
      const next = {
        ...current,
        dashboardSections: {
          ...current.dashboardSections,
          commitments: false,
          agreements: false,
          plannedExpenses: false,
        },
        _planningTabsMigrated: true,
      };
      setSettingsState(next); storage.setSettings(next);
      debouncedSync({ settings: next });
    }
  }, [cloudLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Weekly planner: keep the standing weeks built ──
  // A list with `weekly.enabled` always has the current week and the next one
  // laid out, one section per week and one day heading per day. Building that
  // by hand every Sunday is the chore the setting exists to remove.
  //
  // It runs on load and again whenever the app comes back to the foreground on
  // a *different local date* — a phone left open across midnight is the normal
  // case, not the exception, and the week has to be there when it's opened in
  // the morning. `planWeeks` returns null when nothing is owed, so the common
  // path costs one comparison per weekly list and no write at all.
  const plannedRef = useRef(new Map()); // listId → the local date it was last planned

  // Re-runs when a weekly list is created or its generated-through mark moves.
  // Without this a list switched to weekly wouldn't lay itself out until the
  // next foreground, which reads as the setting not working.
  const weeklySignature = shoppingLists
    .filter((l) => !l.archived && l.weekly?.enabled)
    .map((l) => `${l.id}:${l.weekly.generatedThrough || ''}`)
    .join('|');

  useEffect(() => {
    if (uid && !cloudLoaded) return;

    const runPlanner = () => {
      const today = localTodayISO();
      const lists = stateRef.current.shoppingLists || [];
      const items = stateRef.current.shoppingItems || [];

      const due = lists.filter((l) => (
        !l.archived && l.weekly?.enabled && plannedRef.current.get(l.id) !== today
      ));
      if (due.length === 0) return;

      const plans = due
        .map((list) => [list, planWeeks(list, items, new Date())])
        .filter(([, plan]) => plan);

      // Marked even when there was nothing to build, so a list that's already
      // up to date isn't re-checked on every foreground of the day.
      for (const list of due) plannedRef.current.set(list.id, today);
      if (plans.length === 0) return;

      const now = new Date().toISOString();
      const listPatch = new Map();
      const newItems = [];
      for (const [list, plan] of plans) {
        listPatch.set(list.id, {
          sections: [...(list.sections || []), ...plan.sections],
          weekly: { ...weeklyConfig(list), generatedThrough: plan.generatedThrough },
          updatedAt: now,
        });
        newItems.push(...plan.items.map((item) => ({
          ...item,
          createdAt: now,
          dueAt: computeDueAt(item.dueDate, item.dueTime),
        })));
      }

      // One write for both halves: sections and the day headings that point at
      // them must never be able to land separately.
      const nextLists = (stateRef.current.shoppingLists || []).map((l) => (
        listPatch.has(l.id) ? { ...l, ...listPatch.get(l.id) } : l
      ));
      const nextItems = [...(stateRef.current.shoppingItems || []), ...newItems];
      setShoppingListsState(nextLists);
      setShoppingItemsState(nextItems);
      if (!testModeRef.current) {
        storage.setShoppingLists(nextLists);
        storage.setShoppingItems(nextItems);
        debouncedSync({ shoppingLists: nextLists, shoppingItems: nextItems });
      }
    };

    runPlanner();
    const onVisible = () => { if (document.visibilityState === 'visible') runPlanner(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [cloudLoaded, uid, debouncedSync, weeklySignature]);

  // ── Back-fill dueAt on to-do items saved before absolute due instants ──
  // The Cloud Function schedules pushes off `dueAt`; without it, it has to fall
  // back to assuming a time zone. Stamp it once from the device's own clock.
  useEffect(() => {
    if (uid && !cloudLoaded) return;
    const items = stateRef.current.shoppingItems || [];
    const needsStamp = items.some((i) => i.dueDate && i.dueAt == null);
    if (!needsStamp) return;
    persistShoppingItems(items.map((i) => (
      i.dueDate && i.dueAt == null ? { ...i, dueAt: computeDueAt(i.dueDate, i.dueTime) } : i
    )));
  }, [cloudLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global To-Do notification scheduling ──
  // These are in-app timers — they only fire while the app is open. The same
  // reminders are delivered by the `todoReminders` Cloud Function when the app
  // is closed; both use the same notification tag so the phone shows only one.
  const todoNotifiedRef = useRef(new Set());
  useEffect(() => {
    if (notificationPermission() !== 'granted') return;
    const prefs = notifPrefs.todos || {};
    const timers = {};
    const now = Date.now();
    const todoListIds = new Set(shoppingLists.filter((l) => isTaskList(l.type) && !l.archived).map((l) => l.id));
    const todoItems = shoppingItems.filter((i) =>
      todoListIds.has(i.listId) && (i.status === 'pending' || !i.status)
    );

    // Fires now, or on a timer if it's close enough to keep in memory.
    const at = (fireAt, key, notify) => {
      if (todoNotifiedRef.current.has(key)) return;
      const delay = fireAt - now;
      if (delay <= 0) {
        todoNotifiedRef.current.add(key);
        notify();
      } else if (delay < 7 * 24 * 60 * 60 * 1000) {
        timers[key] = setTimeout(() => {
          todoNotifiedRef.current.add(key);
          notify();
        }, Math.min(delay, 2147483647));
      }
    };

    todoItems.forEach((item) => {
      const list = shoppingLists.find((l) => l.id === item.listId);
      const listLabel = list ? `List: ${list.name}` : 'To-do list';

      if (prefs.enabled !== false && item.notifyEnabled) {
        const fireAt = todoReminderAt(item);
        if (!fireAt) return;
        const lead = Number(item.remindOffsetMinutes) || 0;
        const overdue = fireAt <= now;
        at(fireAt, `todo-due-${item.id}-${fireAt}`, () => {
          const title = overdue ? `Overdue: ${item.name}`
            : lead > 0 ? `Due soon: ${item.name}`
            : `Due now: ${item.name}`;
          sendNotification(title, { body: listLabel, tag: `todo-due-${item.id}-${fireAt}` });
        });
      }
    });

    return () => Object.values(timers).forEach(clearTimeout);
  }, [shoppingItems, shoppingLists, notifPrefs.todos]);

  // ── To-Do daily list reminders (morning + afternoon) ──
  const todoListTimersRef = useRef({ morning: null, afternoon: null });
  useEffect(() => {
    if (notificationPermission() !== 'granted') return;
    const prefs = notifPrefs.todos || {};
    const todoListIds = new Set(shoppingLists.filter((l) => isTaskList(l.type)).map((l) => l.id));
    const incompleteCount = shoppingItems.filter((i) =>
      todoListIds.has(i.listId) && (i.status === 'pending' || !i.status)
    ).length;
    const listCount = [...todoListIds].filter((lid) =>
      shoppingItems.some((i) => i.listId === lid && (i.status === 'pending' || !i.status))
    ).length;
    if (incompleteCount === 0) return;
    const schedule = (timeStr, key) => {
      const now = new Date();
      const [h, m] = (timeStr || (key === 'morning' ? '08:00' : '16:00')).split(':').map(Number);
      const fireAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      const delay = fireAt.getTime() - now.getTime();
      if (delay <= 0) return null;
      return setTimeout(() => {
        sendNotification('To-Do Reminder', {
          body: `${incompleteCount} incomplete item${incompleteCount !== 1 ? 's' : ''} across ${listCount} list${listCount !== 1 ? 's' : ''}`,
          tag: `todo-daily-${key}`,
        });
      }, delay);
    };
    clearTimeout(todoListTimersRef.current.morning);
    clearTimeout(todoListTimersRef.current.afternoon);
    todoListTimersRef.current.morning = prefs.morningEnabled !== false ? schedule(prefs.morningTime, 'morning') : null;
    todoListTimersRef.current.afternoon = prefs.afternoonEnabled !== false ? schedule(prefs.afternoonTime, 'afternoon') : null;
    return () => {
      clearTimeout(todoListTimersRef.current.morning);
      clearTimeout(todoListTimersRef.current.afternoon);
    };
  }, [shoppingItems, shoppingLists, notifPrefs.todos]);

  // ── Bill notifications ──
  const billNotifiedRef = useRef(new Set());
  const billTimersRef = useRef({});
  useEffect(() => {
    if (notificationPermission() !== 'granted') return;
    const { overdue, dayBefore, sameDay } = notifPrefs.bills || {};
    if (!overdue && !dayBefore && !sameDay) return;
    const now = new Date();
    const todayDay = now.getDate();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    bills.forEach((bill) => {
      if (!bill.dueDay || bill.isPermanent) return;
      const status = getBillStatus(bill, mk);
      if (status === 'paid') return;
      if (overdue && bill.dueDay < todayDay) {
        const key = `bill-overdue-${bill.id}`;
        if (!billNotifiedRef.current.has(key)) {
          billNotifiedRef.current.add(key);
          sendNotification(`Bill Overdue: ${bill.name}`, { body: `$${bill.amount} — due on the ${bill.dueDay}th`, tag: key });
        }
      }
      if (dayBefore && bill.dueDay === todayDay + 1) {
        const key = `bill-tomorrow-${bill.id}`;
        if (!billNotifiedRef.current.has(key)) {
          billNotifiedRef.current.add(key);
          sendNotification(`Bill Due Tomorrow: ${bill.name}`, { body: `$${bill.amount} due tomorrow`, tag: key });
        }
      }
      if (sameDay && bill.dueDay === todayDay) {
        const key = `bill-today-${bill.id}`;
        if (!billNotifiedRef.current.has(key) && !billTimersRef.current[key]) {
          const eightAM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
          const delay = eightAM.getTime() - now.getTime();
          if (delay <= 0) {
            billNotifiedRef.current.add(key);
            sendNotification(`Bill Due Today: ${bill.name}`, { body: `$${bill.amount} due today`, tag: key });
          } else {
            billTimersRef.current[key] = setTimeout(() => {
              billNotifiedRef.current.add(key);
              delete billTimersRef.current[key];
              sendNotification(`Bill Due Today: ${bill.name}`, { body: `$${bill.amount} due today`, tag: key });
            }, delay);
          }
        }
      }
    });
    return () => {
      Object.values(billTimersRef.current).forEach(clearTimeout);
      billTimersRef.current = {};
    };
  }, [bills, notifPrefs.bills]);

  // ── Commitment expiry notifications ──
  const commitNotifiedRef = useRef(new Set());
  useEffect(() => {
    if (notificationPermission() !== 'granted') return;
    if (!notifPrefs.commitments?.expiring) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysBefore = notifPrefs.commitments.daysBefore ?? 3;
    commitments.forEach((c) => {
      if (c.completed || !c.endDate) return;
      const end = new Date(c.endDate + 'T12:00:00');
      const diffDays = Math.round((end.getTime() - today.getTime()) / 86400000);
      if (diffDays < 0 || diffDays > daysBefore) return;
      const key = `commit-exp-${c.id}`;
      if (commitNotifiedRef.current.has(key)) return;
      commitNotifiedRef.current.add(key);
      const body = diffDays === 0 ? 'Expires today' : diffDays === 1 ? 'Expires tomorrow' : `Expires in ${diffDays} days`;
      sendNotification(`Commitment: ${c.description || 'Commitment'}`, { body, tag: key });
    });
  }, [commitments, notifPrefs.commitments]);

  // ── Goal (planned expense) target date notifications ──
  const goalNotifiedRef = useRef(new Set());
  useEffect(() => {
    if (notificationPermission() !== 'granted') return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    plannedExpenses.forEach((pe) => {
      if (pe.status === 'completed' || !pe.targetDate) return;
      const target = new Date(pe.targetDate + 'T12:00:00');
      const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
      if (diffDays < 0 || diffDays > 7) return;
      const key = `goal-due-${pe.id}`;
      if (goalNotifiedRef.current.has(key)) return;
      goalNotifiedRef.current.add(key);
      const body = diffDays === 0 ? 'Target date is today' : diffDays === 1 ? 'Target date is tomorrow' : `Target date in ${diffDays} days`;
      sendNotification(`Goal: ${pe.name}`, { body, tag: key });
    });
  }, [plannedExpenses]);

  // ── Project date notifications ──
  const projectNotifiedRef = useRef(new Set());
  useEffect(() => {
    if (notificationPermission() !== 'granted') return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    projects.forEach((p) => {
      if (p.completed) return;
      for (const [field, label] of [['reviewDate', 'Review'], ['dueDate', 'Due']]) {
        if (!p[field]) continue;
        const date = new Date(p[field] + 'T12:00:00');
        const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
        if (diffDays < 0 || diffDays > 3) continue;
        const key = `project-${field}-${p.id}`;
        if (projectNotifiedRef.current.has(key)) return;
        projectNotifiedRef.current.add(key);
        const body = diffDays === 0 ? `${label} date is today` : diffDays === 1 ? `${label} date is tomorrow` : `${label} date in ${diffDays} days`;
        sendNotification(`Project: ${p.name}`, { body, tag: key });
      }
    });
  }, [projects]);

  // ── Shift log reminder ──
  const shiftReminderRef = useRef({ lastDate: null, timer: null });
  useEffect(() => {
    if (notificationPermission() !== 'granted') return;
    if (!notifPrefs.shifts?.reminder) return;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const [h, m] = (notifPrefs.shifts.reminderTime || '18:00').split(':').map(Number);
    const reminderMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
    const fire = () => {
      if (shiftReminderRef.current.lastDate !== todayStr) {
        shiftReminderRef.current.lastDate = todayStr;
        sendNotification('Work Log Reminder', { body: "Don't forget to log your hours for today!", tag: 'shift-reminder' });
      }
    };
    const delay = reminderMs - now.getTime();
    if (delay <= 0) { fire(); return; }
    const t = setTimeout(fire, delay);
    shiftReminderRef.current.timer = t;
    return () => clearTimeout(t);
  }, [notifPrefs.shifts]);

  // ── Schedule future shift notifications on mount / when shifts change ──
  const shiftNotifsScheduledRef = useRef(false);
  useEffect(() => {
    if (notificationPermission() !== 'granted') return;
    shiftNotifsScheduledRef.current = true;
    // Reschedule all upcoming shifts that have notifications enabled
    shifts.forEach((sh) => {
      if (sh.notificationEnabled) {
        const job = jobs.find((j) => j.id === sh.jobId);
        scheduleShiftNotification(sh, job);
      }
    });
    return () => {
      // Cleanup timers when component unmounts - optional, keeps them in module scope
    };
  }, [shifts, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppContext.Provider value={{
      cloudLoaded,
      selectedMonth, setSelectedMonth,
      bills, addBill, updateBill, deleteBill, toggleBillPaid, setBillStatusDirect,
      income, addIncome, updateIncome, deleteIncome,
      budget, setBudgetForMonth,
      notes, addNote, updateNote, deleteNote, toggleNotePin, toggleNoteDashboardPin,
      debts, addDebt, updateDebt, deleteDebt, toggleDebtPaid,
      savings, addSaving, updateSaving, deleteSaving,
      commitments, addCommitment, updateCommitment, deleteCommitment, toggleCommitment,
      purchases, addPurchase, bulkAddPurchases, updatePurchase, deletePurchase,
      plannedExpenses, addPlannedExpense, updatePlannedExpense, deletePlannedExpense,
      jobs, addJob, updateJob, deleteJob,
      shifts, addShift, updateShift, deleteShift, bulkSaveShifts,
      budgetCategories, addBudgetCategory, updateBudgetCategory, deleteBudgetCategory, persistBudgetCategories,
      budgetSpends, addBudgetSpend, updateBudgetSpend, deleteBudgetSpend,
      agreements, addAgreement, updateAgreement, deleteAgreement,
      shoppingLists, addShoppingList, updateShoppingList, deleteShoppingList,
      shoppingItems, addShoppingItem, addShoppingItems, updateShoppingItem, updateShoppingItems,
      deleteShoppingItem, deleteShoppingItems, toggleShoppingItem, importList,
      completeAndRepeatShoppingItem,
      shareList, revokeListShare, deleteListShareLink,
      planningSettings, updatePlanningSettings,
      recurringTemplates, addRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate,
      paycheckActuals, addPaycheckActual, updatePaycheckActual, deletePaycheckActual,
      settings, setSettings: persistSettings,
      generateShareLink, revokeShareLink, refreshShareLink,
      notifPrefs, persistNotifPrefs, fcmToken, enablePushNotifications,
      projects, addProject, updateProject, deleteProject,
      vaultDocuments, addVaultDocument, updateVaultDocument, deleteVaultDocument,
      billStickyNotes, setBillStickyNote,
      testMode, enterTestMode, exitTestMode,
      docSize, DOC_SIZE_LIMIT,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
