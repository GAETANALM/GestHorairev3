import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UserProfile, Timesheet } from './types';
import {
  deleteTimesheet,
  fetchServerData,
  getActiveUserId,
  getOrCreateTimesheet,
  getStoredTimesheets,
  getStoredUsers,
  resetToDemoData,
  saveSessionState,
  saveTimesheets,
  saveUsers,
  setActiveUserId,
  updateTimesheet,
} from './utils/storage';
import {
  getAvailablePeriods,
  getCurrentPeriod,
  recalculateDayEntry,
} from './utils/timeCalculations';
import { Header, NavTab } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { TimesheetSubmission } from './components/TimesheetSubmission';
import { ValidationPanel } from './components/ValidationPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { UserManagement } from './components/UserManagement';
import { UserProfileModal } from './components/UserProfileModal';
import { GdprBanner } from './components/GdprBanner';

export default function App() {
  const [users, setUsers] = useState<UserProfile[]>(() => getStoredUsers());
  const [timesheets, setTimesheets] = useState<Timesheet[]>(() => getStoredTimesheets());
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => getActiveUserId());
  const [currentTab, setCurrentTab] = useState<NavTab>('timesheet');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    return localStorage.getItem('svh_selected_period') || getCurrentPeriod();
  });
  const [selectedTimesheetId, setSelectedTimesheetId] = useState<string | null>(() => {
    return localStorage.getItem('svh_selected_timesheet_id') || null;
  });
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  // Sync state from server on app mount to ensure permanent storage across reloads/sessions
  useEffect(() => {
    let isMounted = true;
    fetchServerData().then((serverData) => {
      if (!isMounted || !serverData) {
        setIsHydrated(true);
        return;
      }
      setUsers(serverData.users);
      setTimesheets(serverData.timesheets);
      if (serverData.activeUserId) {
        setCurrentUserId(serverData.activeUserId);
      }
      if (serverData.selectedPeriod) {
        setSelectedPeriod(serverData.selectedPeriod);
      }
      setIsHydrated(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectTimesheetId = (id: string | null) => {
    setSelectedTimesheetId(id);
    if (id) {
      localStorage.setItem('svh_selected_timesheet_id', id);
    } else {
      localStorage.removeItem('svh_selected_timesheet_id');
    }
  };

  // Available periods list (3 future months for anticipation + current month + historical periods)
  const availablePeriods = useMemo(() => {
    return getAvailablePeriods(new Date(), timesheets.map((t) => t.period));
  }, [timesheets]);

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    handleSelectTimesheetId(null);
    saveSessionState(currentUserId, period);
  };

  // Ensure selected period is always valid
  useEffect(() => {
    if (!availablePeriods.includes(selectedPeriod) && availablePeriods.length > 0) {
      setSelectedPeriod(getCurrentPeriod());
    }
  }, [availablePeriods, selectedPeriod]);

  // Sync users to storage and permanently update server
  const handleUpdateUsers = (
    newUsers: UserProfile[],
    updatedUserId?: string,
    applyScheduleToDrafts: boolean = true
  ) => {
    setUsers(newUsers);
    saveUsers(newUsers);

    // If an employee's schedule changed, update any active draft timesheet with the new hours
    if (updatedUserId && applyScheduleToDrafts) {
      const targetUser = newUsers.find((u) => u.id === updatedUserId);
      if (targetUser) {
        setTimesheets((prev) => {
          const updatedTimesheets = prev.map((ts) => {
            if (ts.userId === updatedUserId && ts.status === 'draft') {
              const updatedDays = ts.days.map((day) => {
                const sched = targetUser.contract.defaultSchedule.find(
                  (s) => s.dayOfWeek === day.dayOfWeek
                );
                if (sched && !day.isHoliday) {
                  if (day.absenceType !== 'none') {
                    return recalculateDayEntry(day, targetUser.contract);
                  }
                  return recalculateDayEntry(
                    {
                      ...day,
                      isOffDay: !sched.isWorked,
                      morningStart: sched.isWorked ? sched.morningStart : '',
                      morningEnd: sched.isWorked ? sched.morningEnd : '',
                      afternoonStart: sched.isWorked ? sched.afternoonStart : '',
                      afternoonEnd: sched.isWorked ? sched.afternoonEnd : '',
                    },
                    targetUser.contract
                  );
                }
                return day;
              });
              return {
                ...ts,
                userName: `${targetUser.firstName} ${targetUser.lastName}`,
                userDepartment: targetUser.contract.department,
                days: updatedDays,
                updatedAt: new Date().toISOString(),
              };
            }
            return ts;
          });
          saveTimesheets(updatedTimesheets);
          return updatedTimesheets;
        });
      }
    }
  };

  // Sync timesheets to storage & server
  const handleUpdateTimesheet = (updated: Timesheet) => {
    updateTimesheet(updated);
    setTimesheets((prev) => {
      const idx = prev.findIndex((t) => t.id === updated.id);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [...prev, updated];
    });
  };

  // Current logged in user object
  const currentUser = useMemo(() => {
    if (!currentUserId) return null;
    return users.find((u) => u.id === currentUserId) || null;
  }, [currentUserId, users]);

  // Delete a timesheet (e.g. discard draft supplement)
  const handleDeleteTimesheet = (id: string) => {
    deleteTimesheet(id);
    setTimesheets((prev) => prev.filter((t) => t.id !== id));
    if (selectedTimesheetId === id) {
      handleSelectTimesheetId(null);
    }
  };

  // Handle Login
  const handleLogin = (user: UserProfile) => {
    setCurrentUserId(user.id);
    setActiveUserId(user.id);
    handleSelectTimesheetId(null);
    setCurrentTab('timesheet');
  };

  // Handle Logout
  const handleLogout = useCallback(() => {
    setCurrentUserId(null);
    setActiveUserId(null);
    handleSelectTimesheetId(null);
    setCurrentTab('timesheet');
  }, []);

  // Handle Reset Demo
  const handleResetDemo = () => {
    resetToDemoData();
    const freshUsers = getStoredUsers();
    const freshSheets = getStoredTimesheets();
    setUsers(freshUsers);
    setTimesheets(freshSheets);
    const defaultUser = freshUsers.find((u) => u.id === 'usr_lucas') || freshUsers[0];
    setCurrentUserId(defaultUser.id);
    setActiveUserId(defaultUser.id);
    handleSelectTimesheetId(null);
    setSelectedPeriod(getCurrentPeriod());
    localStorage.removeItem('svh_selected_period');
    setCurrentTab('timesheet');
  };

  // All timesheets for current user and selected period
  const userPeriodTimesheets = useMemo(() => {
    if (!currentUser) return [];
    return timesheets.filter(
      (ts) => ts.userId === currentUser.id && ts.period === selectedPeriod
    );
  }, [currentUser, selectedPeriod, timesheets]);

  // Active timesheet for current user and selected period (persisted if new)
  const activeTimesheet = useMemo(() => {
    if (!currentUser) return null;

    // 1. If explicit selectedTimesheetId in current user's period
    if (selectedTimesheetId) {
      const found = userPeriodTimesheets.find((ts) => ts.id === selectedTimesheetId);
      if (found) return found;
    }

    // 2. If there are active supplements (draft or submitted), prefer the active supplement currently being edited
    const activeSupplement = userPeriodTimesheets.find(
      (ts) => ts.isSupplement && (ts.status === 'draft' || ts.status === 'submitted')
    );
    if (activeSupplement) {
      return activeSupplement;
    }

    // 3. Otherwise prefer the base timesheet
    const baseSheet = userPeriodTimesheets.find((ts) => !ts.isSupplement);
    if (baseSheet) return baseSheet;

    // 4. Any other sheet in this period (e.g. validated supplement)
    if (userPeriodTimesheets.length > 0) {
      return userPeriodTimesheets[userPeriodTimesheets.length - 1];
    }

    // 5. Only auto-create if hydrated from server to prevent premature blank overwrites
    if (!isHydrated) return null;

    const { timesheet } = getOrCreateTimesheet(currentUser, selectedPeriod, true);
    return timesheet;
  }, [currentUser, selectedPeriod, selectedTimesheetId, userPeriodTimesheets, isHydrated]);

  // Count pending sheets for validators
  const pendingCount = useMemo(() => {
    return timesheets.filter((ts) => ts.status === 'submitted').length;
  }, [timesheets]);

  // If not logged in, render the login screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900">
        <LoginScreen users={users} onLogin={handleLogin} />
        <GdprBanner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 selection:bg-indigo-600 selection:text-white">
      {/* Navigation Header */}
      <Header
        currentUser={currentUser}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onLogout={handleLogout}
        onResetDemo={handleResetDemo}
        pendingCount={pendingCount}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === 'timesheet' && activeTimesheet && (
          <TimesheetSubmission
            currentUser={currentUser}
            timesheet={activeTimesheet}
            allPeriodTimesheets={userPeriodTimesheets}
            onSelectTimesheetId={handleSelectTimesheetId}
            onDeleteTimesheet={handleDeleteTimesheet}
            onUpdateTimesheet={handleUpdateTimesheet}
            onNavigateToPeriod={handlePeriodChange}
            availablePeriods={availablePeriods}
            selectedPeriod={selectedPeriod}
          />
        )}

        {currentTab === 'validation' && (
          <ValidationPanel
            currentValidator={currentUser}
            timesheets={timesheets}
            users={users}
            onUpdateTimesheet={handleUpdateTimesheet}
            selectedPeriod={selectedPeriod}
            onPeriodChange={handlePeriodChange}
            availablePeriods={availablePeriods}
          />
        )}

        {currentTab === 'history' && (
          <HistoryPanel
            timesheets={timesheets}
            users={users}
            currentUser={currentUser}
          />
        )}

        {currentTab === 'admin' && (
          <UserManagement
            users={users}
            onUpdateUsers={handleUpdateUsers}
            currentAdmin={currentUser}
          />
        )}

        {currentTab === 'profile' && (
          <UserProfileModal
            currentUser={currentUser}
            timesheets={timesheets}
            onUpdateCurrentUser={(updated) => {
              handleUpdateUsers(
                users.map((u) => (u.id === updated.id ? updated : u)),
                updated.id,
                true
              );
            }}
          />
        )}
      </main>

      {/* GDPR Banner */}
      <GdprBanner />
    </div>
  );
}
