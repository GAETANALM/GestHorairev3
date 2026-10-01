import { UserContract, UserProfile, Timesheet } from '../types';

// Standard 35h Contract (7h/day Mon-Fri)
export const contract35h: UserContract = {
  weeklyHours: 35,
  title: 'Contrat Cadre / Employé 35h',
  department: 'Ressources Humaines & Administration',
  defaultSchedule: [
    { dayOfWeek: 1, isWorked: true, morningStart: '09:00', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:00', standardHours: 7.0 },
    { dayOfWeek: 2, isWorked: true, morningStart: '09:00', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:00', standardHours: 7.0 },
    { dayOfWeek: 3, isWorked: true, morningStart: '09:00', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:00', standardHours: 7.0 },
    { dayOfWeek: 4, isWorked: true, morningStart: '09:00', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:00', standardHours: 7.0 },
    { dayOfWeek: 5, isWorked: true, morningStart: '09:00', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:00', standardHours: 7.0 },
    { dayOfWeek: 6, isWorked: false, morningStart: '', morningEnd: '', afternoonStart: '', afternoonEnd: '', standardHours: 0 },
    { dayOfWeek: 7, isWorked: false, morningStart: '', morningEnd: '', afternoonStart: '', afternoonEnd: '', standardHours: 0 },
  ],
};

// Standard 39h Contract (8h Mon-Thu, 7h Fri)
export const contract39h: UserContract = {
  weeklyHours: 39,
  title: 'Contrat Technique / Opérations 39h',
  department: 'Opérations & Logistique',
  defaultSchedule: [
    { dayOfWeek: 1, isWorked: true, morningStart: '08:30', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:30', standardHours: 8.0 },
    { dayOfWeek: 2, isWorked: true, morningStart: '08:30', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:30', standardHours: 8.0 },
    { dayOfWeek: 3, isWorked: true, morningStart: '08:30', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:30', standardHours: 8.0 },
    { dayOfWeek: 4, isWorked: true, morningStart: '08:30', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:30', standardHours: 8.0 },
    { dayOfWeek: 5, isWorked: true, morningStart: '08:30', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '16:30', standardHours: 7.0 },
    { dayOfWeek: 6, isWorked: false, morningStart: '', morningEnd: '', afternoonStart: '', afternoonEnd: '', standardHours: 0 },
    { dayOfWeek: 7, isWorked: false, morningStart: '', morningEnd: '', afternoonStart: '', afternoonEnd: '', standardHours: 0 },
  ],
};

// Part-time 28h Contract (7h Mon, Tue, Thu, Fri; Wed off)
export const contract28h: UserContract = {
  weeklyHours: 28,
  title: 'Contrat Temps Partiel 28h (80%)',
  department: 'Marketing & Communication',
  defaultSchedule: [
    { dayOfWeek: 1, isWorked: true, morningStart: '09:00', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:00', standardHours: 7.0 },
    { dayOfWeek: 2, isWorked: true, morningStart: '09:00', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:00', standardHours: 7.0 },
    { dayOfWeek: 3, isWorked: false, morningStart: '', morningEnd: '', afternoonStart: '', afternoonEnd: '', standardHours: 0 },
    { dayOfWeek: 4, isWorked: true, morningStart: '09:00', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:00', standardHours: 7.0 },
    { dayOfWeek: 5, isWorked: true, morningStart: '09:00', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '17:00', standardHours: 7.0 },
    { dayOfWeek: 6, isWorked: false, morningStart: '', morningEnd: '', afternoonStart: '', afternoonEnd: '', standardHours: 0 },
    { dayOfWeek: 7, isWorked: false, morningStart: '', morningEnd: '', afternoonStart: '', afternoonEnd: '', standardHours: 0 },
  ],
};

export const initialUsers: UserProfile[] = [
  {
    id: 'usr_sophie',
    firstName: 'Sophie',
    lastName: 'Dubois',
    email: 'sophie.dubois@entreprise.fr',
    pin: '123456',
    roles: ['employee', 'validator', 'admin'],
    contract: contract35h,
    isActive: true,
    hireDate: '2021-03-15',
  },
  {
    id: 'usr_lucas',
    firstName: 'Lucas',
    lastName: 'Martin',
    email: 'lucas.martin@entreprise.fr',
    pin: '111111',
    roles: ['employee'],
    contract: contract39h,
    isActive: true,
    hireDate: '2022-09-01',
  },
  {
    id: 'usr_emma',
    firstName: 'Emma',
    lastName: 'Petit',
    email: 'emma.petit@entreprise.fr',
    pin: '222222',
    roles: ['employee'],
    contract: contract28h,
    isActive: true,
    hireDate: '2023-01-10',
  },
  {
    id: 'usr_thomas',
    firstName: 'Thomas',
    lastName: 'Bernard',
    email: 'thomas.bernard@entreprise.fr',
    pin: '333333',
    roles: ['employee'],
    contract: contract35h,
    isActive: true,
    hireDate: '2024-04-02',
  },
];

// Initial timesheets empty so users can test from scratch (0 fiches)
export const initialTimesheets: Timesheet[] = [];

