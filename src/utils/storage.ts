import { initialTimesheets, initialUsers } from '../data/mockData';
import { Timesheet, UserProfile } from '../types';
import {
  calculateScheduleStandardHours,
  generateMonthDays,
  getPreviousPeriod,
  recalculateDayEntry,
} from './timeCalculations';

const USERS_STORAGE_KEY = 'svh_v3_permanent_users';
const TIMESHEETS_STORAGE_KEY = 'svh_v3_permanent_timesheets';
const ACTIVE_USER_KEY = 'svh_v3_active_user_id';
const LOGIN_ATTEMPTS_KEY = 'svh_v3_login_attempts';

// Helper to normalize user schedule hours
function normalizeUserSchedules(users: UserProfile[]): UserProfile[] {
  return users.map((user) => ({
    ...user,
    contract: {
      ...user.contract,
      defaultSchedule: (user.contract?.defaultSchedule || []).map((s) => ({
        ...s,
        standardHours: calculateScheduleStandardHours(
          s.isWorked,
          s.morningStart,
          s.morningEnd,
          s.afternoonStart,
          s.afternoonEnd
        ),
      })),
    },
  }));
}

/**
 * Reads users synchronously from localStorage (instant rendering cache)
 */
export function getStoredUsers(): UserProfile[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const users: UserProfile[] = JSON.parse(raw);
      if (Array.isArray(users) && users.length > 0) {
        return normalizeUserSchedules(users);
      }
    }
    // Backward compatibility with previous keys
    const fallbackRaw = localStorage.getItem('svh_v2_users');
    if (fallbackRaw) {
      const fallbackUsers: UserProfile[] = JSON.parse(fallbackRaw);
      if (Array.isArray(fallbackUsers) && fallbackUsers.length > 0) {
        return normalizeUserSchedules(fallbackUsers);
      }
    }
    return normalizeUserSchedules(initialUsers);
  } catch {
    return normalizeUserSchedules(initialUsers);
  }
}

/**
 * Saves users to localStorage and syncs permanently to server
 */
export function saveUsers(users: UserProfile[]): void {
  const normalized = normalizeUserSchedules(users);
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.error('Failed to save users to localStorage', err);
  }

  // Asynchronously persist to server
  fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: normalized }),
  }).catch((err) => {
    console.warn('Server sync warning (users):', err);
  });
}

/**
 * Reads timesheets synchronously from localStorage
 */
export function getStoredTimesheets(): Timesheet[] {
  try {
    const raw = localStorage.getItem(TIMESHEETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    // Backward compatibility
    const fallbackRaw = localStorage.getItem('svh_v3_clean_timesheets');
    if (fallbackRaw) {
      const parsed = JSON.parse(fallbackRaw);
      if (Array.isArray(parsed)) return parsed;
    }
    return initialTimesheets;
  } catch {
    return initialTimesheets;
  }
}

/**
 * Saves timesheets to localStorage and syncs permanently to server
 */
export function saveTimesheets(timesheets: Timesheet[]): void {
  try {
    localStorage.setItem(TIMESHEETS_STORAGE_KEY, JSON.stringify(timesheets));
  } catch (err) {
    console.error('Failed to save timesheets to localStorage', err);
  }

  // Asynchronously persist to server
  fetch('/api/timesheets/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timesheets }),
  }).catch((err) => {
    console.warn('Server sync warning (timesheets bulk):', err);
  });
}

/**
 * Updates a single timesheet (both locally and on the server)
 */
export function updateTimesheet(updated: Timesheet): void {
  const allSheets = getStoredTimesheets();
  const index = allSheets.findIndex((ts) => ts.id === updated.id);
  const stamped: Timesheet = {
    ...updated,
    updatedAt: new Date().toISOString(),
  };

  if (index !== -1) {
    allSheets[index] = stamped;
  } else {
    allSheets.push(stamped);
  }

  try {
    localStorage.setItem(TIMESHEETS_STORAGE_KEY, JSON.stringify(allSheets));
  } catch (err) {
    console.error('Failed to save updated timesheet locally', err);
  }

  // Asynchronously persist single timesheet to server
  fetch('/api/timesheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timesheet: stamped }),
  }).catch((err) => {
    console.warn('Server sync warning (single timesheet):', err);
  });
}

/**
 * Deletes a timesheet by id (e.g. discard draft supplement)
 */
export function deleteTimesheet(id: string): void {
  const allSheets = getStoredTimesheets();
  const filtered = allSheets.filter((ts) => ts.id !== id);
  try {
    localStorage.setItem(TIMESHEETS_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to delete timesheet locally', err);
  }

  fetch(`/api/timesheets/${id}`, {
    method: 'DELETE',
  }).catch((err) => {
    console.warn('Server sync warning (delete timesheet):', err);
  });
}

export function getActiveUserId(): string | null {
  return localStorage.getItem(ACTIVE_USER_KEY);
}

export function setActiveUserId(id: string | null): void {
  if (id) {
    localStorage.setItem(ACTIVE_USER_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_USER_KEY);
  }

  fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeUserId: id }),
  }).catch(() => {});
}

export function saveSessionState(activeUserId: string | null, selectedPeriod?: string): void {
  if (activeUserId) localStorage.setItem(ACTIVE_USER_KEY, activeUserId);
  if (selectedPeriod) localStorage.setItem('svh_selected_period', selectedPeriod);

  fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeUserId, selectedPeriod }),
  }).catch(() => {});
}

/**
 * Fetches permanent data from the server backend with bidirectional merge protection
 */
export async function fetchServerData(): Promise<{
  users: UserProfile[];
  timesheets: Timesheet[];
  activeUserId: string | null;
  selectedPeriod?: string;
} | null> {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.users)) {
      const normalizedUsers = normalizeUserSchedules(data.users);
      const serverSheets: Timesheet[] = Array.isArray(data.timesheets) ? data.timesheets : [];
      
      // Bidirectional merge: combine server sheets and any existing local sheets
      // so neither local edits nor server-persisted sheets (like supplements) are lost
      const localSheets = getStoredTimesheets();
      const sheetMap = new Map<string, Timesheet>();

      // 1. Put all server sheets in map
      for (const s of serverSheets) {
        if (s && s.id) {
          sheetMap.set(s.id, s);
        }
      }

      // 2. Check local sheets: keep any missing ones or ones with newer updatedAt
      let missingOnServerCount = 0;
      for (const l of localSheets) {
        if (!l || !l.id) continue;
        const s = sheetMap.get(l.id);
        if (!s) {
          sheetMap.set(l.id, l);
          missingOnServerCount++;
        } else {
          const localTime = new Date(l.updatedAt || 0).getTime();
          const serverTime = new Date(s.updatedAt || 0).getTime();
          if (localTime > serverTime) {
            sheetMap.set(l.id, l);
            missingOnServerCount++;
          }
        }
      }

      const mergedTimesheets = Array.from(sheetMap.values());

      // Update local storage cache with safe merged state
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(normalizedUsers));
      localStorage.setItem(TIMESHEETS_STORAGE_KEY, JSON.stringify(mergedTimesheets));
      if (data.activeUserId) {
        localStorage.setItem(ACTIVE_USER_KEY, data.activeUserId);
      }

      // If there were local sheets that hadn't reached the server, sync them now
      if (missingOnServerCount > 0) {
        console.log(`[Storage] Pushing ${missingOnServerCount} local sheets to server during sync`);
        fetch('/api/timesheets/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timesheets: mergedTimesheets }),
        }).catch((err) => console.warn('Sync push warning:', err));
      }

      return {
        users: normalizedUsers,
        timesheets: mergedTimesheets,
        activeUserId: data.activeUserId || null,
        selectedPeriod: data.selectedPeriod,
      };
    }
    return null;
  } catch (err) {
    console.warn('Server fetch warning (offline or initializing):', err);
    return null;
  }
}

/**
 * Calculates validated overtime from previous month (M-1)
 */
export function getPreviousMonthCarryover(
  userId: string,
  currentPeriod: string,
  allTimesheets?: Timesheet[]
): { carryover: number; previousTimesheet?: Timesheet } {
  const timesheets = allTimesheets || getStoredTimesheets();
  const prevPeriod = getPreviousPeriod(currentPeriod);

  // If there are supplements for previous period, pick the latest validated sheet (supplement or main)
  const prevSheets = timesheets.filter((ts) => ts.userId === userId && ts.period === prevPeriod && ts.status === 'validated');
  if (prevSheets.length === 0) {
    const anyPrev = timesheets.find((ts) => ts.userId === userId && ts.period === prevPeriod && !ts.isSupplement);
    return { carryover: 0, previousTimesheet: anyPrev };
  }

  // The latest validated sheet (e.g. validated supplement #1, otherwise base sheet)
  const prevSheet = prevSheets[prevSheets.length - 1];

  // 1. If explicitly specified by validation (checkbox: defer overtime vs pay)
  if (prevSheet.carryoverToNextMonth !== undefined) {
    return {
      carryover: prevSheet.carryoverToNextMonth,
      previousTimesheet: prevSheet,
    };
  }

  // 2. If deferOvertimeToNextMonth was set
  if (prevSheet.deferOvertimeToNextMonth) {
    let overtimeTotal = (prevSheet.carryoverM1 || 0);
    for (const day of prevSheet.days) {
      overtimeTotal += day.overtimeHours || 0;
    }
    return {
      carryover: Math.round(overtimeTotal * 100) / 100,
      previousTimesheet: prevSheet,
    };
  }

  // Default: if neither is set on validated sheet, overtime was paid on payroll (0 carryover)
  return {
    carryover: 0,
    previousTimesheet: prevSheet,
  };
}

/**
 * Gets or creates timesheet for a user and period
 */
export function getOrCreateTimesheet(
  user: UserProfile,
  period: string,
  persistIfNew = true
): { timesheet: Timesheet; isNew: boolean } {
  const allSheets = getStoredTimesheets();
  const existing = allSheets.find((ts) => ts.userId === user.id && ts.period === period && !ts.isSupplement);

  if (existing) {
    if (existing.status === 'draft') {
      const refreshedDays = existing.days.map((d) => recalculateDayEntry(d, user.contract));
      return { timesheet: { ...existing, days: refreshedDays }, isNew: false };
    }
    return { timesheet: existing, isNew: false };
  }

  // Detect M-1 carryover automatically from any existing sheets
  const { carryover, previousTimesheet } = getPreviousMonthCarryover(user.id, period, allSheets);

  const days = generateMonthDays(period, user.contract, true);
  const newTimesheet: Timesheet = {
    id: `ts_${user.id}_${period}`,
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    userDepartment: user.contract.department,
    period,
    status: 'draft',
    days: days.map((d) => recalculateDayEntry(d, user.contract)),
    carryoverM1: carryover,
    previousTimesheetId: previousTimesheet?.id,
    updatedAt: new Date().toISOString(),
  };

  if (persistIfNew) {
    allSheets.push(newTimesheet);
    saveTimesheets(allSheets);
  }

  return { timesheet: newTimesheet, isNew: true };
}

/**
 * Reset all data: restores initial demo users and wipes all timesheets
 */
export function resetToDemoData(): void {
  const normalizedInitial = normalizeUserSchedules(initialUsers);
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(normalizedInitial));
  localStorage.setItem(TIMESHEETS_STORAGE_KEY, JSON.stringify([]));
  localStorage.removeItem(LOGIN_ATTEMPTS_KEY);

  fetch('/api/reset', { method: 'POST' }).catch((err) => {
    console.warn('Server reset warning:', err);
  });
}
