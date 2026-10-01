import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initialUsers, initialTimesheets } from './src/data/mockData';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Database file path on container filesystem
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface AppDatabase {
  users: any[];
  timesheets: any[];
  activeUserId: string | null;
  selectedPeriod?: string;
  lastUpdated: string;
}

function loadDb(): AppDatabase {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading db.json, falling back to defaults:', err);
  }

  const initialDb: AppDatabase = {
    users: initialUsers,
    timesheets: initialTimesheets,
    activeUserId: 'usr_lucas',
    selectedPeriod: undefined,
    lastUpdated: new Date().toISOString(),
  };
  saveDb(initialDb);
  return initialDb;
}

function saveDb(data: AppDatabase): void {
  const tempFile = `${DB_FILE}.${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Error writing to db.json:', err);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {
      // ignore
    }
  }
}

// ==========================================
// REST API Routes (Before Vite middleware)
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Full state retrieval
app.get('/api/data', (req, res) => {
  const db = loadDb();
  res.json(db);
});

// Timesheets list retrieval
app.get('/api/timesheets', (req, res) => {
  const db = loadDb();
  res.json({
    timesheets: db.timesheets || [],
    count: (db.timesheets || []).length,
    lastUpdated: db.lastUpdated,
  });
});

// Update users list (contracts, default schedules, credentials)
app.post('/api/users', (req, res) => {
  const { users } = req.body;
  if (!Array.isArray(users)) {
    return res.status(400).json({ error: 'users array is required' });
  }
  const db = loadDb();
  db.users = users;
  db.lastUpdated = new Date().toISOString();
  saveDb(db);
  res.json({ success: true, count: users.length });
});

// Update or insert a single timesheet
app.post('/api/timesheets', (req, res) => {
  const { timesheet } = req.body;
  if (!timesheet || !timesheet.id) {
    return res.status(400).json({ error: 'timesheet object with id is required' });
  }
  const db = loadDb();
  if (!Array.isArray(db.timesheets)) {
    db.timesheets = [];
  }
  const index = db.timesheets.findIndex((ts: any) => ts.id === timesheet.id);
  const stamped = {
    ...timesheet,
    updatedAt: timesheet.updatedAt || new Date().toISOString(),
  };

  if (index !== -1) {
    db.timesheets[index] = stamped;
  } else {
    db.timesheets.push(stamped);
  }
  db.lastUpdated = new Date().toISOString();
  saveDb(db);
  console.log(`[Storage] Saved timesheet ${timesheet.id} (${timesheet.isSupplement ? 'COMPLEMENT #' + timesheet.supplementNumber : 'BASE'}). Total in DB: ${db.timesheets.length}`);
  res.json({ success: true, timesheet: stamped, totalCount: db.timesheets.length });
});

// Bulk update timesheets (MERGES incoming timesheets by default, preserving all existing documents)
app.post('/api/timesheets/bulk', (req, res) => {
  const { timesheets, replace } = req.body;
  if (!Array.isArray(timesheets)) {
    return res.status(400).json({ error: 'timesheets array is required' });
  }
  const db = loadDb();
  if (!Array.isArray(db.timesheets)) {
    db.timesheets = [];
  }

  if (replace === true) {
    // Explicit replacement (used only during administrative full database resets)
    db.timesheets = timesheets;
  } else {
    // Safe UPSERT MERGE: update matching IDs, insert new ones, NEVER delete existing sheets
    const map = new Map<string, any>();
    for (const existing of db.timesheets) {
      if (existing && existing.id) {
        map.set(existing.id, existing);
      }
    }
    for (const incoming of timesheets) {
      if (incoming && incoming.id) {
        const existing = map.get(incoming.id);
        const incomingTime = new Date(incoming.updatedAt || 0).getTime();
        const existingTime = existing ? new Date(existing.updatedAt || 0).getTime() : 0;
        // Keep the newer version or update with incoming
        if (!existing || incomingTime >= existingTime) {
          map.set(incoming.id, {
            ...existing,
            ...incoming,
            updatedAt: incoming.updatedAt || new Date().toISOString(),
          });
        }
      }
    }
    db.timesheets = Array.from(map.values());
  }

  db.lastUpdated = new Date().toISOString();
  saveDb(db);
  console.log(`[Storage] Bulk merged ${timesheets.length} sheets. Total in DB: ${db.timesheets.length}`);
  res.json({ success: true, count: db.timesheets.length });
});

// Delete timesheet by id (e.g. discard draft supplement)
app.delete('/api/timesheets/:id', (req, res) => {
  const { id } = req.params;
  const db = loadDb();
  db.timesheets = db.timesheets.filter((ts: any) => ts.id !== id);
  db.lastUpdated = new Date().toISOString();
  saveDb(db);
  res.json({ success: true, id });
});

// Update active user and selected period
app.post('/api/session', (req, res) => {
  const { activeUserId, selectedPeriod } = req.body;
  const db = loadDb();
  if (activeUserId !== undefined) db.activeUserId = activeUserId;
  if (selectedPeriod !== undefined) db.selectedPeriod = selectedPeriod;
  db.lastUpdated = new Date().toISOString();
  saveDb(db);
  res.json({ success: true });
});

// Reset to initial demo data
app.post('/api/reset', (req, res) => {
  const initialDb: AppDatabase = {
    users: initialUsers,
    timesheets: initialTimesheets,
    activeUserId: 'usr_lucas',
    selectedPeriod: undefined,
    lastUpdated: new Date().toISOString(),
  };
  saveDb(initialDb);
  res.json({ success: true, db: initialDb });
});

// ==========================================
// Vite Middleware / Static Asset Serving
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur démarré avec persistance permanente sur http://0.0.0.0:${PORT}`);
  });
}

startServer();
