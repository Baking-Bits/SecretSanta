require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
app.use(bodyParser.json());

// Use the standard `cors` middleware for predictable behavior in dev and production.
app.use(cors({
  origin: [ 'http://localhost:5173', 'http://127.0.0.1:5173' ],
  methods: [ 'GET', 'POST', 'PUT', 'DELETE', 'OPTIONS' ],
  allowedHeaders: [ 'Content-Type', 'Authorization' ],
  credentials: true
}));

// Prefer the PORT from environment; default to 3078 for this workspace to avoid conflicts
const PORT = process.env.PORT || 3078;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

let pool;
function parseDatabaseUrl(urlString) {
  try {
    const u = new URL(urlString);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname ? u.pathname.replace(/^\//, '') : undefined
    };
  } catch (e) {
    return null;
  }
}

if (process.env.DATABASE_URL) {
  const cfg = parseDatabaseUrl(process.env.DATABASE_URL);
  pool = mysql.createPool(Object.assign({ waitForConnections: true, connectionLimit: 10 }, cfg));
} else {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'pass',
    database: process.env.DB_NAME || 'secret_santa_db',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    waitForConnections: true,
    connectionLimit: 10
  });
}

async function query(sql, params) {
  const [rows] = await pool.execute(sql, params || []);
  return rows;
}

// Global error handlers to surface issues during startup/runtime
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

console.log('DB pool configured (will attempt connections on demand)');
console.log('Startup info:', { PORT: PORT, DB_HOST: process.env.DB_HOST || process.env.DATABASE_URL || 'not-set' });

// simple file logger for sensitive flows (draw, auth diagnostics)
const LOG_DIR = path.join(__dirname, 'logs');
function logEvent(event, payload) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const line = JSON.stringify(Object.assign({ timestamp: new Date().toISOString(), event }, payload || {}));
    fs.appendFileSync(path.join(LOG_DIR, 'activity.log'), line + os.EOL);
  } catch (err) {
    console.error('Log write failed', err);
  }
}

// Serve static frontend: prefer built React client in /client/dist, fallback to /public
const clientDist = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
} else {
  app.use(express.static(path.join(__dirname, 'public')));
}

// Auth helpers
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

async function getUserByEmail(email) {
  const rows = await query('SELECT id, email, password_hash FROM users WHERE email = ?', [email]);
  return rows[0];
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Routes
async function registerHandler(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
  try {
    const existing = await getUserByEmail(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const result = await query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hash]);
    const insertId = result.insertId;
    const [userRows] = await pool.execute('SELECT id, email FROM users WHERE id = ?', [insertId]);
    const user = userRows[0];
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

app.post('/register', registerHandler);
app.post('/api/register', registerHandler);

async function loginHandler(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
  try {
    const user = await getUserByEmail(email);
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    if (!user.password_hash) {
      console.warn('User exists but no password_hash set for', email);
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    let ok = false;
    try {
      ok = await bcrypt.compare(password, user.password_hash);
    } catch (bcryptErr) {
      console.error('Error comparing password for', email, bcryptErr);
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    // Surface a friendly message but log details server-side
    res.status(500).json({ error: 'Server error during login' });
  }
}

app.post('/login', loginHandler);
app.post('/api/login', loginHandler);

// Wishlist endpoints
app.get('/api/wishlist', authMiddleware, async (req, res) => {
  try {
    // allow viewing another profile's wishlist by passing ?profileId=NN
    let targetUserId = req.user.id;
    if (req.query && req.query.profileId) {
      const pid = parseInt(req.query.profileId, 10);
      if (!isNaN(pid)) {
        const rows = await query('SELECT c.user_id FROM profiles JOIN claims c ON profiles.id = c.profile_id WHERE profiles.id = ?', [pid]);
        if (rows && rows[0] && rows[0].user_id) {
          targetUserId = rows[0].user_id;
        } else {
          // profile not claimed => empty list
          return res.json({ items: [] });
        }
      }
    }

    // return items for targetUserId with favorites_count and whether the owner favorited each
    const items = await query(`
      SELECT i.id, i.user_id, i.title, i.link, i.created_at,
        IFNULL(f.cnt,0) AS favorites_count,
        IF(EXISTS(SELECT 1 FROM favorites fx WHERE fx.item_id = i.id AND fx.user_id = ?), 1, 0) AS favorited_by_owner
      FROM items i
      LEFT JOIN (SELECT item_id, COUNT(*) AS cnt FROM favorites GROUP BY item_id) f ON f.item_id = i.id
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC
    `, [targetUserId, targetUserId]);

    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Favorite an item
app.post('/api/wishlist/:id/favorite', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid item id' });
  try {
    // Only allow the owner of the item to favorite items on their own list
    const ownerRows = await query('SELECT user_id FROM items WHERE id = ?', [id]);
    if (!ownerRows || ownerRows.length === 0) return res.status(404).json({ error: 'Item not found' });
    const ownerId = ownerRows[0].user_id;
    if (ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can favorite items on their list' });

    await query('INSERT INTO favorites (item_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)', [id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error favoriting item:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unfavorite an item
app.delete('/api/wishlist/:id/favorite', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid item id' });
  try {
    // Only allow the owner of the item to remove favorites on their own list
    const ownerRows = await query('SELECT user_id FROM items WHERE id = ?', [id]);
    if (!ownerRows || ownerRows.length === 0) return res.status(404).json({ error: 'Item not found' });
    const ownerId = ownerRows[0].user_id;
    if (ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can unfavorite items on their list' });

    await query('DELETE FROM favorites WHERE item_id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error unfavoriting item:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/wishlist', authMiddleware, async (req, res) => {
  const { title, link } = req.body;
  if (!title) return res.status(400).json({ error: 'Missing title' });
  try {
    const result = await query('INSERT INTO items (user_id, title, link) VALUES (?, ?, ?)', [req.user.id, title, link || null]);
    const insertId = result.insertId;
    const [rows] = await pool.execute('SELECT id, title, link, created_at FROM items WHERE id = ?', [insertId]);
    res.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/wishlist/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  const { title, link } = req.body;
  try {
    const result = await query('UPDATE items SET title = ?, link = ? WHERE id = ? AND user_id = ?', [title, link || null, id, req.user.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    const [rows] = await pool.execute('SELECT id, title, link, created_at FROM items WHERE id = ?', [id]);
    res.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/wishlist/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await query('DELETE FROM items WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Simple recommendations: return up to `count` items (default 5). If user has items with is_recommended, prefer them.
app.get('/api/recommendations', authMiddleware, async (req, res) => {
  const count = Math.max(1, Math.min(100, parseInt(req.query.count || '5', 10)));
  try {
    const preferredRows = await query('SELECT id, title, link FROM items WHERE user_id = ? AND is_recommended = 1 ORDER BY created_at DESC LIMIT ?', [req.user.id, count]);
    const results = Array.isArray(preferredRows) ? preferredRows.slice() : [];
    if (results.length < count) {
      const need = count - results.length;
      const othersRows = await query('SELECT id, title, link FROM items WHERE user_id = ? AND is_recommended = 0 ORDER BY created_at DESC LIMIT ?', [req.user.id, need]);
      results.push(...(Array.isArray(othersRows) ? othersRows : []));
    }
    res.json({ items: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Profiles & claims endpoints
app.get('/api/profiles', async (req, res) => {
  try {
    const rows = await query(`SELECT p.id, p.name, p.partner_profile_id, c.user_id AS claimed_by, u.email AS claimed_by_email
            FROM profiles p
            LEFT JOIN claims c ON p.id = c.profile_id
            LEFT JOIN users u ON c.user_id = u.id
            ORDER BY p.id`);
    res.json({ profiles: rows });
  } catch (err) {
    console.error('Error fetching profiles:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Run Secret Santa draw for all claimed profiles (assign a recipient profile to each giver user)
// Accessible to any authenticated user. If assignments exist, returns existing unless ?force=true
// Production draw route (uses DB) — but if DEV_NO_DB is enabled we provide a lightweight in-memory draw.
app.post('/api/draw', authMiddleware, async (req, res) => {
  // Persist a real draw (admin action). Assign across all profiles (claimed or not).
  try {
    // Log incoming request meta to help diagnose cases where browser receives HTML instead of JSON
    try {
      const hdrs = Object.assign({}, req.headers);
      // remove potentially large/secret headers
      if (hdrs.authorization) hdrs.authorization = '[REDACTED]';
      logEvent('draw_request_received', { method: req.method, path: req.path, headers: { origin: hdrs.origin, accept: hdrs.accept, 'content-type': hdrs['content-type'] } });
    } catch (le) {
      // ignore logging errors
    }
    logEvent('draw_attempt', { userId: req.user && req.user.id });
    // Fetch all profiles and left-join claims so we know which profiles are claimed
    const rows = await query('SELECT p.id AS profile_id, p.partner_profile_id, c.user_id AS claimed_user_id FROM profiles p LEFT JOIN claims c ON p.id = c.profile_id');
    if (!rows || rows.length === 0) return res.status(400).json({ error: 'No profiles available to run draw' });

    logEvent('draw_loaded_participants', { count: rows.length, claimed: rows.filter(r => !!r.claimed_user_id).length });

    // Build givers as profiles; they may have a claimed_user_id (nullable)
    const givers = rows.map(r => ({ profile_id: r.profile_id, partner_profile_id: r.partner_profile_id, claimed_user_id: r.claimed_user_id }));
    const recipientProfiles = rows.map(r => r.profile_id);

    // Build bipartite graph between givers (left) and recipientProfiles (right)
    const ids = recipientProfiles.slice();
    const idToIndex = {};
    ids.forEach((id, idx) => { idToIndex[id] = idx; });
    const n = ids.length;
    const adj = Array.from({ length: n }, () => []);
    // Map giver profile ids to left indices in same order as ids
    const giverIds = givers.map(g => g.profile_id);
    const giverIndex = {};
    giverIds.forEach((id, i) => { giverIndex[id] = i; });

    for (let i = 0; i < givers.length; i++) {
      const g = givers[i];
      for (const cand of recipientProfiles) {
        if (cand === g.profile_id) continue;
        if (g.partner_profile_id && cand === g.partner_profile_id) continue;
        const v = idToIndex[cand];
        if (typeof v !== 'undefined') adj[i].push(v);
      }
    }

    // Hopcroft-Karp implementation
    function hopcroftKarp() {
      const INF = 1e9;
      const pairU = Array(n).fill(-1);
      const pairV = Array(n).fill(-1);
      const dist = Array(n).fill(0);

      function bfs() {
        const queue = [];
        for (let u = 0; u < n; u++) {
          if (pairU[u] === -1) { dist[u] = 0; queue.push(u); }
          else dist[u] = INF;
        }
        let found = false;
        while (queue.length) {
          const u = queue.shift();
          for (const v of adj[u]) {
            const pu = pairV[v];
            if (pu !== -1 && dist[pu] === INF) {
              dist[pu] = dist[u] + 1;
              queue.push(pu);
            }
            if (pu === -1) found = true;
          }
        }
        return found;
      }

      function dfs(u) {
        for (const v of adj[u]) {
          const pu = pairV[v];
          if (pu === -1 || (dist[pu] === dist[u] + 1 && dfs(pu))) {
            pairU[u] = v; pairV[v] = u; return true;
          }
        }
        dist[u] = INF; return false;
      }

      let result = 0;
      while (bfs()) {
        for (let u = 0; u < n; u++) if (pairU[u] === -1) if (dfs(u)) result++;
      }
      return { pairU, pairV, result };
    }

    const { pairU, result: matchSize } = hopcroftKarp();

    if (matchSize < givers.length) {
      // diagnostics
      try {
        const participantCount = givers.length;
        const claimedCount = rows.filter(r => !!r.claimed_user_id).length;
        const partnerMap = {};
        for (const r of rows) partnerMap[r.profile_id] = r.partner_profile_id || null;

        // compute per-giver options
        const perGiverOptions = {};
        for (let i = 0; i < givers.length; i++) {
          perGiverOptions[givers[i].profile_id] = adj[i].map(v => ids[v]);
        }

        // find givers with zero options
        const impossibleGivers = Object.keys(perGiverOptions).filter(k => perGiverOptions[k].length === 0);

        // find alternating-reachable sets for Hall witness
        const visitedU = Array(n).fill(false);
        const visitedV = Array(n).fill(false);
        const queue = [];
        for (let u = 0; u < n; u++) if (pairU[u] === -1) { visitedU[u] = true; queue.push(u); }
        while (queue.length) {
          const u = queue.shift();
          for (const v of adj[u]) {
            if (!visitedV[v]) {
              visitedV[v] = true;
              const pu = pairV[v];
              if (pu !== -1 && !visitedU[pu]) { visitedU[pu] = true; queue.push(pu); }
            }
          }
        }
        const reachableLeft = new Set();
        for (let u = 0; u < n; u++) if (visitedU[u]) reachableLeft.add(givers[u].profile_id);
        const S = givers.map(g => g.profile_id).filter(id => !reachableLeft.has(id));
        const NofS = new Set();
        for (const sid of S) {
          const u = giverIndex[sid];
          for (const v of adj[u]) NofS.add(ids[v]);
        }

        const diag = {
          timestamp: new Date().toISOString(),
          participantCount,
          claimedCount,
          partnerMap,
          impossibleGivers,
          hall_witness_S: S,
          hall_witness_N_of_S: Array.from(NofS),
          perGiverOptions: Object.fromEntries(Object.entries(perGiverOptions).slice(0, 50))
        };
        console.error('Draw failed to produce assignments (max matching < participants)', diag);
        logEvent('draw_match_failure', { diag });

        // include wishlist item counts per profile to help debug (how many items each recipient has)
        try {
          const itemCountsRows = await query('SELECT p.id AS profile_id, COUNT(i.id) AS item_count FROM profiles p LEFT JOIN claims c ON p.id = c.profile_id LEFT JOIN items i ON i.user_id = c.user_id GROUP BY p.id');
          const itemCounts = {};
          for (const r of itemCountsRows) itemCounts[r.profile_id] = r.item_count || 0;
          diag.itemCounts = itemCounts;
        } catch (qi) {
          diag.itemCountsError = String(qi && qi.message ? qi.message : qi);
        }

        // persist diagnostic to logs/draw_failures.log for later inspection
        try {
          const logDir = path.join(__dirname, 'logs');
          if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
          const logPath = path.join(logDir, 'draw_failures.log');
          fs.appendFileSync(logPath, JSON.stringify(diag) + '\n');
        } catch (writeErr) {
          console.error('Failed to write draw diagnostic log:', writeErr);
        }
      } catch (diagErr) {
        console.error('Error logging draw diagnostics:', diagErr);
      }
      return res.status(500).json({ error: 'Could not produce valid assignments (no perfect matching)' });
    }

    // Persist assignments from pairU mapping
    await query('DELETE FROM assignments');
    for (let u = 0; u < givers.length; u++) {
      const v = pairU[u];
      const giverProfileId = givers[u].profile_id;
      const recipientProfileId = ids[v];
      const found = rows.find(r => r.profile_id === giverProfileId);
      if (found && found.claimed_user_id) {
        await query('INSERT INTO assignments (giver_user_id, giver_profile_id, recipient_profile_id) VALUES (?, NULL, ?)', [found.claimed_user_id, recipientProfileId]);
      } else {
        await query('INSERT INTO assignments (giver_user_id, giver_profile_id, recipient_profile_id) VALUES (NULL, ?, ?)', [giverProfileId, recipientProfileId]);
      }
    }

    const out = await query('SELECT id, giver_user_id, giver_profile_id, recipient_profile_id FROM assignments');
    logEvent('draw_success', { userId: req.user && req.user.id, assignmentCount: out.length });
    res.json({ assignments: out });
  } catch (err) {
    console.error('Error running draw:', err);
    logEvent('draw_error', { userId: req.user && req.user.id, message: err && err.message, code: err && err.code });
    res.status(500).json({ error: 'Server error: ' + (err && err.message ? err.message : 'unknown error') });
  }
});

// Get my assignment (for current authenticated user)
app.get('/api/my-assignment', authMiddleware, async (req, res) => {
  try {
    const rows = await query(`SELECT a.recipient_profile_id, p.name as recipient_name, p.partner_profile_id
                              FROM assignments a JOIN profiles p ON a.recipient_profile_id = p.id
                              WHERE a.giver_user_id = ?`, [req.user.id]);
    if (!rows || rows.length === 0) return res.json({ assignment: null });
    const r = rows[0];
    // fetch recipient's wishlist items
    const items = await query('SELECT i.id, i.title, i.link FROM items i WHERE i.user_id = (SELECT user_id FROM claims WHERE profile_id = ?) ORDER BY i.created_at DESC', [r.recipient_profile_id]);
    res.json({ assignment: { recipient_profile_id: r.recipient_profile_id, recipient_name: r.recipient_name, items } });
  } catch (err) {
    console.error('Error fetching my-assignment:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Return whether assignments exist (draw has been run)
app.get('/api/draw-status', authMiddleware, async (req, res) => {
  try {
    const rows = await query('SELECT COUNT(*) as cnt FROM assignments');
    const cnt = rows && rows[0] && rows[0].cnt ? rows[0].cnt : 0;
    res.json({ hasAssignments: cnt > 0 });
  } catch (err) {
    console.error('Error checking draw status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset the Secret Santa draw: remove all assignments and mark draw as off.
// Accessible to any authenticated user (treat as admin action in this small app).
app.post('/api/draw-reset', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM assignments');
    logEvent('draw_reset', { userId: req.user && req.user.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error resetting draw:', err);
    res.status(500).json({ error: 'Server error resetting draw' });
  }
});


// Preview a draw without persisting results
// If query param `useProfiles=1` is provided, use all profiles (even unclaimed) as participants.
app.get('/api/draw-preview', authMiddleware, async (req, res) => {
  try {
    const useProfiles = req.query && (req.query.useProfiles === '1' || req.query.useProfiles === 'true');
    let rows;
    if (useProfiles) {
      // participants are profiles table (id, name, partner_profile_id)
      rows = await query('SELECT id AS profile_id, name, partner_profile_id FROM profiles');
      if (!rows || rows.length === 0) return res.status(400).json({ error: 'No profiles available to run draw' });
      // build givers as profiles (no giver_user_id)
      var givers = rows.map(r => ({ giver_profile_id: r.profile_id, giver_name: r.name, profile_id: r.profile_id, partner_profile_id: r.partner_profile_id }));
      var recipientProfiles = rows.map(r => r.profile_id);
    } else {
      // participants are claimed profiles (profile + giver user)
      rows = await query('SELECT p.id AS profile_id, p.partner_profile_id, c.user_id AS giver_user_id, p.name FROM profiles p JOIN claims c ON p.id = c.profile_id');
      if (!rows || rows.length === 0) return res.status(400).json({ error: 'No claimed profiles to run draw' });
      givers = rows.map(r => ({ giver_user_id: r.giver_user_id, profile_id: r.profile_id, partner_profile_id: r.partner_profile_id, giver_name: r.name }));
      recipientProfiles = rows.map(r => r.profile_id);
    }

    function tryAssign() {
      const shuffled = recipientProfiles.slice().sort(() => Math.random() - 0.5);
      const assignments = {};
      const used = new Set();
      for (const giver of givers) {
        let found = false;
        for (let i = 0; i < shuffled.length; i++) {
          const cand = shuffled[i];
          if (used.has(cand)) continue;
          if (cand === giver.profile_id) continue;
          if (giver.partner_profile_id && cand === giver.partner_profile_id) continue;
          // key by giver_profile_id (string) so output is consistent
          assignments[String(giver.profile_id)] = cand;
          used.add(cand);
          found = true;
          break;
        }
        if (!found) return null;
      }
      return assignments;
    }

    let result = null;
    const maxTries = 2000;
    for (let t = 0; t < maxTries; t++) {
      const r = tryAssign();
      if (r) { result = r; break; }
    }
    if (!result) return res.status(500).json({ error: 'Could not produce valid assignments' });

    // Build human-readable mapping: use profile names for giver and recipient
    const giverProfileIds = Object.keys(result).map(x => parseInt(x, 10));
    const recipientIds = Object.values(result);
    const profileIds = Array.from(new Set(giverProfileIds.concat(recipientIds)));
    const profRows = await query('SELECT id, name FROM profiles WHERE id IN (' + profileIds.map(()=>'?').join(',') + ')', profileIds);
    const profById = {};
    for (const r of profRows) profById[r.id] = r;

    const out = [];
    for (const giverProfileIdStr of Object.keys(result)) {
      const gpid = parseInt(giverProfileIdStr, 10);
      const rid = result[giverProfileIdStr];
      out.push({ giver_profile_id: gpid, giver_name: (profById[gpid] && profById[gpid].name) || null, recipient_profile_id: rid, recipient_name: (profById[rid] && profById[rid].name) || null });
    }

    res.json({ preview: out });
  } catch (err) {
    console.error('Error creating draw preview:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Return current authenticated user info
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    res.json({ user: { id: req.user.id, email: req.user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/my-claim', authMiddleware, async (req, res) => {
  try {
    const rows = await query('SELECT p.id, p.name, p.partner_profile_id FROM profiles p JOIN claims c ON p.id = c.profile_id WHERE c.user_id = ?', [req.user.id]);
    res.json({ claim: rows[0] || null });
  } catch (err) {
    console.error('Error fetching my claim:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/claim', authMiddleware, async (req, res) => {
  const profileId = req.body && req.body.profileId ? parseInt(req.body.profileId, 10) : null;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    // Check if profile already claimed
    const existing = await query('SELECT user_id FROM claims WHERE profile_id = ?', [profileId]);
    if (existing && existing.length > 0) return res.status(409).json({ error: 'Profile already claimed' });
    // Check if user already claimed one
    const mine = await query('SELECT profile_id FROM claims WHERE user_id = ?', [req.user.id]);
    if (mine && mine.length > 0) return res.status(400).json({ error: 'You already claimed a profile' });
    // Insert claim
    await query('INSERT INTO claims (profile_id, user_id) VALUES (?, ?)', [profileId, req.user.id]);
    // If there was an assignment previously created for this profile (giver_profile_id), transfer it to the newly claimed user
    try {
      const assignRows = await query('SELECT id FROM assignments WHERE giver_profile_id = ?', [profileId]);
      if (assignRows && assignRows.length > 0) {
        // Move the assignment to the claiming user (set giver_user_id and clear giver_profile_id)
        await query('UPDATE assignments SET giver_user_id = ?, giver_profile_id = NULL WHERE giver_profile_id = ?', [req.user.id, profileId]);
        console.log('Transferred assignment for profile', profileId, 'to user', req.user.id);
      }
    } catch (migrateErr) {
      console.error('Error migrating assignment on claim:', migrateErr);
      // continue; do not fail the claim just because migration had an issue
    }

    const [rows] = await pool.execute('SELECT p.id, p.name, p.partner_profile_id FROM profiles p JOIN claims c ON p.id = c.profile_id WHERE c.user_id = ?', [req.user.id]);
    res.json({ claim: rows[0] });
  } catch (err) {
    console.error('Error creating claim:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Fallback to index.html for client-side routing (prefer client dist)
// If any /api/* route was not matched above, return JSON 404 instead of sending index.html.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Fallback to index.html for client-side routing (prefer client dist)
app.get('*', (req, res) => {
  if (fs.existsSync(clientDist)) return res.sendFile(path.join(clientDist, 'index.html'));
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Bind address: allow override via BIND_ADDR, but default to 0.0.0.0 so container is reachable
const BIND_ADDR = process.env.BIND_ADDR || '0.0.0.0';
const server = app.listen(PORT, BIND_ADDR, () => {
  console.log(`Server listening on port ${PORT} (${BIND_ADDR})`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. If another dev server is running, stop it or set PORT=${PORT} to a free port.`);
  } else {
    console.error('Server error on listen:', err);
  }
  process.exit(1);
});
