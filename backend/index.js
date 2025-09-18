require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt'); // fallback to bcryptjs if build fails

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';



// DB envs
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'your_db';


// Debug route - place before 404/static handlers
app.get('/__debug__/attendance_headers', (req, res) => {
  console.log('DEBUG_HEADERS:', {
    originalUrl: req.originalUrl,
    authorization_present: !!req.headers.authorization,
    authorization_value: req.headers.authorization,
    x_student_id: req.headers['x-student-id'],
    query: req.query
  });
  res.json({
    ok: true,
    sawAuthorization: !!req.headers.authorization,
    authorizationSnippet: req.headers.authorization
      ? req.headers.authorization.slice(0, 50) + '...'
      : null,
    xStudent: req.headers['x-student-id'],
    query: req.query
  });
});



// put this at the very top of your server file (before other middleware/routes)
app.get('/__ping__', (req, res) => {
  console.log('PING /__ping__ from', req.ip);
  res.send('pong');
});

// immediate POST sanity-check
app.post('/__debug_post__', (req, res) => {
  console.log('__debug_post__ hit - headers:', req.headers);
  res.json({ ok: true, note: '__debug_post__' });
});



app.use((req, res, next) => {
  console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.originalUrl} from ${req.ip}`);
  // make hanging requests obvious in logs
  res.setTimeout(30000, () => console.warn('response timeout for', req.originalUrl));
  next();
});


// ---------- Middlewares (order matters) ----------
app.use(express.json());
app.use(cors({
  origin: FRONTEND_ORIGIN,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-student-id'],
  credentials: true
}));
app.use(morgan('dev'));




// create a MySQL pool and attach to app.locals
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'Ganapathi@20',
  database: process.env.DB_NAME || 'university', 
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
app.locals.db = pool;

const io = typeof global.io !== 'undefined' ? global.io : null; // if using socket.io, supply it

const profAssignments = require('./routes/assignment_professor')(pool, io);
app.use('/api/professors/assignments', profAssignments);

const studentAssignments = require('./routes/assignment_student')(pool, io);
app.use('/api/student/assignments', studentAssignments);




app.get('/api/student/attendance_summary', async (req, res) => {
  try {
    const studentId =
      req.user?.id || req.query.student_id || req.headers['x-student-id'];

    if (!studentId) {
      return res.status(400).json({ error: 'student_id required' });
    }

    const [rows] = await pool.query(
      `
SELECT   c.course_id,    
c.code AS course_code,    
c.title AS course_title,    
COUNT(*) AS total_sessions,    
SUM(CASE WHEN (a.status = 'present') THEN 1 ELSE 0 END) AS present,
        ROUND(
          SUM(CASE WHEN (a.status='present') THEN 1 ELSE 0 END)
          / COUNT(*) * 100, 2
        ) AS percent,
 ROUND(100.0 * SUM(status = 'present') / COUNT(*), 2) AS pct_present 
 FROM attendance a  
 JOIN courses c  ON a.course_id = c.course_id 
 where a.student_id= ?
 GROUP BY a.course_id,a.student_id	
      `,
      [studentId]
    );

    res.json({ ok: true, attendance: rows });
  } catch (err) {
    console.error('GET /api/student/attendance_summary db error', err);
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});


const studentDashboardRouter = require('./routes/students');
app.use('/api/student', studentDashboardRouter);

const autoConfirmRouter = require("./routes/autoConfirm");
app.use("/autoConfirm", autoConfirmRouter);

// Attendance summary endpoint (directly in index.js)




// ---------------- DB helpers ----------------
async function waitForDb(maxRetries = 12, delayMs = 2000) {
  for (let i = 0; i < maxRetries; ++i) {
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      console.log('DB reachable');
      return;
    } catch (err) {
      console.log(`DB not ready (attempt ${i+1}/${maxRetries}): ${err.code || err.message}`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('DB did not become ready in time');
}

async function applySchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.warn('schema.sql not found at', schemaPath, '— skipping schema apply.');
    return;
  }
  let schema = fs.readFileSync(schemaPath, 'utf8');
  schema = schema.replace(/\r\n/g, '\n');

  await waitForDb();

  const conn = await pool.getConnection();
  try {
    if (process.env.DB_NAME) {
      const dbName = process.env.DB_NAME;
      try {
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);
      } catch (e) {
        console.log('Notice: CREATE DATABASE may have been skipped:', e.code || e.message);
      }
      await conn.query(`USE \`${dbName}\``);
      console.log('Using database:', dbName);
    }

    // Try one-shot apply
    try {
      console.log('Attempting one-shot schema apply...');
      await conn.query(schema); // multipleStatements: true required
      console.log('Schema applied (one-shot).');
      return;
    } catch (oneShotErr) {
      console.warn('One-shot schema apply failed — falling back to statement-by-statement. Err:', oneShotErr.code || oneShotErr.message);
    }

    app.get('/api/student/attendance_summary', (req, res) => {
  console.log('attendance_summary HIT', { headers: req.headers, query: req.query });
  res.json({ ok: true, attendance: [] });
});


try {
  const profAuthFactory = require('./routes/prof_auth'); // adjust path if needed
  const profAuthRouter = typeof profAuthFactory === 'function' ? profAuthFactory(pool) : profAuthFactory;
  app.use('/auth', profAuthRouter); // Mounts /auth/professor/login
  console.log('Mounted prof_auth at /auth');
} catch (err) {
  console.warn('Could not mount prof_auth:', err && err.message ? err.message : err);
}


    // Fallback: run statements individually
    const noComments = schema.split('\n').map(line => line.replace(/^\s*--.*$/, '')).join('\n');
    const statements = noComments
      .split(/;\s*(?:\n|$)/)
      .map(s => s && s.trim())
      .filter(Boolean);

    console.log(`Applying ${statements.length} statements individually...`);
    for (const stmt of statements) {
      if (!stmt || /^\s*(--|\/\*)/.test(stmt)) continue;
      try {
        await conn.query(stmt);
      } catch (err) {
        const benign = ['ER_TABLE_EXISTS_ERROR','ER_DB_CREATE_EXISTS','ER_DUP_ENTRY','ER_DUP_KEYNAME'];
        if (err && benign.includes(err.code)) {
          console.log('Notice (schema):', err.sqlMessage || err.message);
          continue;
        }
        console.error('Error while applying statement:\n', stmt, '\n->', err);
        throw err;
      }
    }
    console.log('Schema applied (statement-by-statement).');
  } finally {
    conn.release();
  }
}

// Helper: resolve either a router object or call a factory to obtain one.
// Express Router objects have a `.stack` array (and are functions too), so
// don't call them. Only call as factory if it doesn't look like a router.
function resolveRouter(maybeFactoryOrRouter, pool) {
  if (!maybeFactoryOrRouter) return null;

  // If it's already an Express Router (has a stack array), return it.
  if (maybeFactoryOrRouter.stack && Array.isArray(maybeFactoryOrRouter.stack)) {
    return maybeFactoryOrRouter;
  }

  // Some router shapes might expose handle.stack
  if (maybeFactoryOrRouter.handle && maybeFactoryOrRouter.handle.stack) {
    return maybeFactoryOrRouter;
  }

  // If it's a function *and not* an Express Router, assume it's a factory and call it.
  if (typeof maybeFactoryOrRouter === 'function') {
    try {
      const r = maybeFactoryOrRouter(pool);
      // if factory returned a router, return it; otherwise return what it returned (may be null)
      return r;
    } catch (e) {
      // rethrow so surrounding try/catch logs the error
      throw e;
    }
  }

  // Unknown shape
  return null;
}

// Simple explicit mount for attendance router
const attendanceRouter = require('./routes/attendance');
app.use('/api/professors', attendanceRouter);
console.log('Mounted attendance router at /api/professors');


// ---------------- Idempotent runtime fixes ----------------
async function columnExists(conn, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [DB_NAME, tableName, columnName]
  );
  return rows && rows[0] && rows[0].cnt > 0;
}

async function ensureColumn(conn, tableName, columnName, columnDefinition) {
  if (await columnExists(conn, tableName, columnName)) return false;
  const sql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition}`;
  console.log('Applying schema fix:', sql);
  await conn.query(sql);
  return true;
}

async function renameColumnIfExists(conn, tableName, oldName, newName, newDefinition = null) {
  const hasOld = await columnExists(conn, tableName, oldName);
  const hasNew = await columnExists(conn, tableName, newName);
  if (!hasOld || hasNew) return false;
  try {
    const sql = `ALTER TABLE \`${tableName}\` RENAME COLUMN \`${oldName}\` TO \`${newName}\``;
    console.log('Trying rename:', sql);
    await conn.query(sql);
    return true;
  } catch (e) {
    console.log('RENAME COLUMN failed (falling back to CHANGE):', e.code || e.message);
    if (!newDefinition) throw e;
    const sql = `ALTER TABLE \`${tableName}\` CHANGE \`${oldName}\` \`${newName}\` ${newDefinition}`;
    console.log('Trying change:', sql);
    await conn.query(sql);
    return true;
  }
}

// ---------------- Seed admin ----------------
async function seedDefaultAdmin() {
  const conn = await pool.getConnection();
  try {
    // Debug: which DB we are connected to
    try {
      const [d] = await conn.query('SELECT DATABASE() AS db');
      console.log('Connected DB when seeding:', d && d[0] && d[0].db);
    } catch (e) {
      // ignore
    }

    // Ensure admins table exists
    const [tbl] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`,
      [DB_NAME, 'admins']
    );
    if (!tbl || tbl[0].cnt === 0) {
      console.warn("No 'admins' table found; skipping default admin creation. Create table `admins` first.");
      return;
    }

    // Read columns on admins table
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?`,
      [DB_NAME, 'admins']
    );
    const columnNames = (cols || []).map(r => String(r.COLUMN_NAME));

    // Default values (can be overridden with env vars)
    const defaultAdminId = Number(process.env.DEFAULT_ADMIN_ID || 1);
    const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || '1';
    const defaultFullName = process.env.DEFAULT_ADMIN_FULLNAME || 'Administrator';
    const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';

    // If username column exists and username already present — skip
    if (columnNames.includes('username')) {
      const [existing] = await conn.query('SELECT username FROM admins WHERE username = ? LIMIT 1', [defaultUsername]);
      if (existing && existing.length > 0) {
        console.log('Default admin already exists. Skipping seed.');
        return;
      }
    } else {
      // if any admin row exists, skip to avoid creating duplicates
      const [anyAdmin] = await conn.query('SELECT 1 FROM admins LIMIT 1');
      if (anyAdmin && anyAdmin.length > 0) {
        console.log('Admins table already has at least one row. Skipping default admin seed.');
        return;
      }
    }

    // Hash password
    const hash = await bcrypt.hash(defaultPassword, 10);

    // Build insert columns & values according to table schema
    const insertCols = [];
    const placeholders = [];
    const values = [];

    if (columnNames.includes('admin_id')) {
      insertCols.push('admin_id'); placeholders.push('?'); values.push(defaultAdminId);
    }
    if (columnNames.includes('username')) {
      insertCols.push('username'); placeholders.push('?'); values.push(defaultUsername);
    }
    if (columnNames.includes('password_hash')) {
      insertCols.push('password_hash'); placeholders.push('?'); values.push(hash);
    } else if (columnNames.includes('password')) {
      insertCols.push('password'); placeholders.push('?'); values.push(hash);
    }
    if (columnNames.includes('full_name')) {
      insertCols.push('full_name'); placeholders.push('?'); values.push(defaultFullName);
    }
    if (columnNames.includes('email')) {
      insertCols.push('email'); placeholders.push('?'); values.push(defaultEmail);
    }

    if (insertCols.length === 0) {
      console.warn('admins table columns did not match expected names. Skipping admin seed.');
      return;
    }

    let sql = `INSERT INTO admins (${insertCols.join(',')}) VALUES (${placeholders.join(',')})`;
    if (columnNames.includes('username')) {
      const upd = insertCols.filter(c => c !== 'username');
      if (upd.length) sql += ' ON DUPLICATE KEY UPDATE ' + upd.map(c => `${c}=VALUES(${c})`).join(', ');
    } else if (columnNames.includes('admin_id')) {
      // if admin_id is primary key, ensure idempotency
      const upd = insertCols.filter(c => c !== 'admin_id');
      if (upd.length) sql += ' ON DUPLICATE KEY UPDATE ' + upd.map(c => `${c}=VALUES(${c})`).join(', ');
    }

    await conn.query(sql, values);
    console.log(`Created default admin account (password='${defaultPassword}').`);
    console.log('*** Change this password immediately in production or set DEFAULT_ADMIN_PASSWORD in .env ***');

  } catch (err) {
    console.error('Failed to seed admin:', err);
    throw err;
  } finally {
    conn.release();
  }
}

// Small helper to robustly require a router from a few possible locations
function requireRouter(possiblePaths) {
  for (const p of possiblePaths) {
    const full = path.join(__dirname, p);
    if (fs.existsSync(full + '.js')) {
      return require(full);
    }
  }
  throw new Error(`Could not locate router. Tried: ${JSON.stringify(possiblePaths)}`);
}

// ---------- Auth middleware to populate req.user.student_id ----------
app.use((req, res, next) => {
  // 1) Prefer explicit header or body
  let studentId = req.headers['x-student-id'] || (req.body && req.body.student_id) || null;

  // 2) If Authorization: Bearer <token> present, try to verify JWT and extract student id
  const auth = req.headers.authorization;
  if (auth && typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) {
      const token = m[1];
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        // prefer claims that are common
        studentId = studentId || payload.student_id || payload.sub || payload.id || null;
      } catch (e) {
        // verification failed — attempt decode as fallback (dev only)
        try {
          const decoded = jwt.decode(token);
          if (decoded) {
            studentId = studentId || decoded.student_id || decoded.sub || decoded.id || null;
          }
        } catch (err) {
          // ignore
        }
      }
    }
  }

  if (studentId) {
    req.user = req.user || {};
    req.user.student_id = String(studentId);
  }
  next();
});

// Debug log for course_responses routes (keeps console informative)
app.use((req, res, next) => {
  if (req.path.startsWith('/course_responses')) {
    console.log('-> course_responses request:', req.method, req.path, 'student_id=', req.user && req.user.student_id);
  }
  next();
});

// ---------- Mount routers (try a few likely file locations) ----------
// ---------- Mount routers (try a few likely file locations) ----------


// ---------- Course responses router (mount at both /api/course_responses and /course_responses) ----------
try {
  const courseResponsesFactory = requireRouter([
    './routes/course_responses',
    './routes/courseResponses',
    './server/routes/course_responses',
    './server/routes/courseResponses'
  ]);

  if (!courseResponsesFactory) throw new Error('course_responses router export is undefined/null');

  // If factory (function), call with pool to get router; otherwise assume router
  const courseResponsesRouter =
    typeof courseResponsesFactory === 'function' ? courseResponsesFactory(pool) : courseResponsesFactory;

  if (!courseResponsesRouter) throw new Error('course_responses resolved to null/undefined');

  // Mount at both endpoints temporarily to remove source-of-truth mismatches while debugging
  app.use('/api/course_responses', courseResponsesRouter);
  app.use('/course_responses', courseResponsesRouter);

  console.log('Mounted course_responses router at /api/course_responses and /course_responses');
} catch (err) {
  console.warn('Warning: course_responses router not found or failed to mount. Continuing without it.');
  console.warn(err && err.message ? err.message : err);
}


try {
  const authRouterFactory = requireRouter([
    './routes/auth',
    './routes/authentication',
    './server/routes/auth',
    './server/routes/authentication',
    './routes/signup',
    './server/routes/signup'
  ]);

  if (!authRouterFactory) {
    throw new Error('auth router export is undefined/null');
  }

  // If it's a function, assume it's a factory that needs the pool
  const authRouter =
    typeof authRouterFactory === 'function'
      ? authRouterFactory(pool)
      : authRouterFactory;

  if (!authRouter) {
    throw new Error('auth router resolved to null/undefined');
  }

  app.use('/auth', authRouter);
  console.log('Mounted auth router at /auth');
} catch (err) {
  console.warn('Warning: auth router not found or failed to mount:');
  console.warn(err && err.message ? err.message : err);
}


try {
 const coursesRouterFactory = requireRouter([
  './routes/courses',
  './server/routes/courses',
  './routes/course_list',
  './server/routes/course_list'
]);

// coursesRouterFactory might be either a router OR a function(factory).
const coursesRouter = typeof coursesRouterFactory === 'function'
  ? coursesRouterFactory(pool)   // call factory with pool
  : coursesRouterFactory;        // already a router

app.use('/api/courses', coursesRouter);
console.log('Mounted courses router at /api/courses');

} catch (err) {
  console.warn('Warning: courses router not found. Creating /api/courses test handler.');
  app.get('/api/courses', (req, res) => res.status(200).json({ data: [] }));
}




// mount admin router (after middleware and after pool is created)
try {
  const adminRouterFactory = requireRouter([
    './routes/admin',
    './server/routes/admin',
    './routes/adminRouter',
    './server/routes/adminRouter'
  ]);
  // adminRouterFactory might be a router or a factory returning a router
  const adminRouter = typeof adminRouterFactory === 'function' ? adminRouterFactory(pool) : adminRouterFactory;
  app.use('/admin', adminRouter);
  console.log('Mounted admin router at /admin');
} catch (err) {
  console.warn('Warning: admin router not found or failed to mount:', err && err.message ? err.message : err);
}

// index.js (snippet)
try {
  const studentsRouter = require('./routes/students');
  app.use('/api/students', studentsRouter);
  console.log('Mounted students router at /api/students');
} catch (err) {
  console.error('Failed to mount students router:', err && err.stack ? err.stack : err);
}


try {
  const profRouterFactory = requireRouter([
    './routes/professors',
    './server/routes/professors',
    './routes/profRouter',
    './server/routes/profRouter'
  ]);

  console.log('DEBUG: requireRouter returned ->', typeof profRouterFactory, profRouterFactory && Object.keys(profRouterFactory));

  if (!profRouterFactory) throw new Error('Professors router export is undefined/null');

  const profRouter = typeof profRouterFactory === 'function'
    ? profRouterFactory(pool)
    : profRouterFactory;

  if (!profRouter) throw new Error('Professors router resolved to null/undefined');

  app.use('/api/professors', profRouter);
  console.log('Mounted professors router at /api/professors');
} catch (err) {
  console.warn('Warning: professors router not mounted:', err && err.message ? err.message : err);
}

app._router.stack.forEach((r) => {
  if (r.route && r.route.path) {
    console.log(`${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
  } else if (r.name === 'router' && r.handle.stack) {
    r.handle.stack.forEach((handler) => {
      if (handler.route) {
        const methods = Object.keys(handler.route.methods).join(',').toUpperCase();
        console.log(`MOUNTED ${methods} ${handler.route.path}`);
      }
    });
  }
});




// ---------- Health check ----------
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// ---------- Start server (with schema apply + runtime fixes + seed) ----------
async function startServer() {
  try {
    // 1) Apply schema.sql (creates DB/tables if missing)
    await applySchema();

    // 2) Ensure subsequent queries operate in the desired DB and run runtime fixes
    const conn = await pool.getConnection();
    try {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);
      await conn.query(`USE \`${DB_NAME}\``);

      // runtime small schema fixes (idempotent)
      await renameColumnIfExists(conn, 'users', 'password', 'password_hash', 'VARCHAR(255) NOT NULL');
      await renameColumnIfExists(conn, 'admins', 'password', 'password_hash', 'VARCHAR(255) NOT NULL');

      // ensure common columns exist with reasonable defaults
      await ensureColumn(conn, 'users', 'email', 'VARCHAR(255) DEFAULT NULL');
      await ensureColumn(conn, 'users', 'role', "ENUM('student','faculty','admin') NOT NULL DEFAULT 'student'");

      await ensureColumn(conn, 'admins', 'password_hash', 'VARCHAR(255) DEFAULT NULL');
      await ensureColumn(conn, 'admins', 'email', 'VARCHAR(255) DEFAULT NULL');

      // If admins table lacks full_name and it is required by your schema, add it as nullable to avoid seeding failures
      await ensureColumn(conn, 'admins', 'full_name', 'VARCHAR(255) DEFAULT NULL');

    } finally {
      conn.release();
    }

    // 3) Seed default admin (if needed)
    await seedDefaultAdmin();

    

    // 4) Start Express server
    const server = app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Kill the process using that port or set PORT env var to something else.`);
        console.error(`On Windows: netstat -ano | findstr :${PORT}  then taskkill /PID <PID> /F`);
        process.exit(1);
      } else {
        console.error('Server error', err);
        process.exit(1);
      }
    });

  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}




// debug endpoints — temporary, put this before startServer()
app.get('/ping-debug', (req, res) => {
  console.log('PING-DEBUG from', req.ip, 'headers:', req.headers);
  res.json({ ok: true, ts: Date.now() });
});

app.get('/_routes', (req, res) => {
  const routes = [];
  if (app && app._router && app._router.stack) {
    app._router.stack.forEach((layer) => {
      if (layer.route && layer.route.path) {
        routes.push({ path: layer.route.path, methods: Object.keys(layer.route.methods).join(',') });
      } else if (layer.name === 'router' && layer.regexp) {
        routes.push({ routerRegexp: String(layer.regexp) });
      }
    });
  }
  res.json(routes);
});

// --- helper middleware to authenticate token and attach professor info ---
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const token = authHeader.replace(/^Bearer\s+/i, '');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // payload should include professor id and department_id
    req.professor = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --- login route: POST /api/professors/login ---
app.post('/api/professors/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, department_id FROM professors WHERE username = ? LIMIT 1',
      [username]
    );
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const prof = rows[0];
    const matched = await bcrypt.compare(password, prof.password_hash);
    if (!matched) return res.status(401).json({ error: 'Invalid credentials' });

    // create jwt containing professor id and department
    const token = jwt.sign(
      { professor_id: prof.id, username: prof.username, department_id: prof.department_id },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, professor_id: prof.id, department_id: prof.department_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.get('/api/admin/professors', authMiddleware, async (req, res) => {
  try {
    // role check (adapt if your token uses req.user or different claim name)
    const user = req.prof || req.user || req.admin;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Forbidden - admin only' });
    }

    const db = req.app.get('db');
    if (!db) return res.status(500).json({ ok: false, error: 'DB connection not configured' });

    const sql = `SELECT professor_id, name, email, department FROM professors ORDER BY professor_id`;
    console.log('[DEBUG] admin.professors SQL ->', sql);
    const [rows] = await db.query(sql);
    return res.json({ ok: true, professors: rows });
  } catch (err) {
    console.error('[ERROR] GET /api/admin/professors ->', err);
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
});



app.get('/api/professors/enrollments', authMiddleware, async (req, res) => {
  try {
    const tokenDept = (req.professor.department || '').toString().trim();
    const courseQuery = (req.query.course || '').toString().trim().toUpperCase(); // optional override
    console.log('[DEBUG] tokenDept ->', JSON.stringify(tokenDept), 'query.course ->', courseQuery);

    const run = async (sql, params) => {
      console.log('[DEBUG] SQL ->', sql.trim().replace(/\s+/g, ' ').slice(0, 300), ' params ->', params);
      const [rows] = await pool.query(sql, params);
      return rows;
    };

    // 1) Explicit course code in query
    if (courseQuery) {
      const sqlCourse = `
        SELECT cr.selected_at,
               s.student_id AS student_id, s.name AS student_name, s.email,
               c.course_id AS course_id, c.code AS course_code, c.title AS course_title
        FROM course_responses cr
        JOIN courses c ON cr.course_id = c.course_id
        JOIN students s ON cr.student_id = s.student_id
        WHERE UPPER(c.code) = ?
        ORDER BY cr.selected_at DESC
      `;
      const rows = await run(sqlCourse, [courseQuery]);
      return res.json({ by: 'courseQuery', course: courseQuery, enrollments: rows });
    }

    // 2) If tokenDept looks like a course code
    const looksLikeCourseCode = /^[A-Z]{1,4}\d{2,4}$/i.test(tokenDept);
    if (looksLikeCourseCode) {
      const code = tokenDept.toUpperCase();
      const sqlByCode = `
        SELECT cr.selected_at,
               s.student_id AS student_id, s.name AS student_name, s.email,
               c.course_id AS course_id, c.code AS course_code, c.title AS course_title
        FROM course_responses cr
        JOIN courses c ON cr.course_id = c.course_id
        JOIN students s ON cr.student_id = s.student_id
        WHERE UPPER(c.code) = ?
        ORDER BY cr.selected_at DESC
      `;
      const rows = await run(sqlByCode, [code]);
      if (rows.length > 0) {
        return res.json({ by: 'token_as_course_code', course: code, enrollments: rows });
      }
    }

    // 3) Map department via departments table (if you really have one)
    const [drows] = await pool.query(
      'SELECT id, name FROM departments WHERE TRIM(UPPER(name)) = TRIM(UPPER(?)) LIMIT 1',
      [tokenDept]
    );
    if (drows && drows.length > 0) {
      const deptId = drows[0].id;
      const sqlByDeptId = `
        SELECT cr.selected_at,
               s.student_id AS student_id, s.name AS student_name, s.email,
               c.course_id AS course_id, c.code AS course_code, c.title AS course_title
        FROM course_responses cr
        JOIN courses c ON cr.course_id = c.course_id
        JOIN students s ON cr.student_id = s.student_id
        WHERE c.department_id = ?
        ORDER BY cr.selected_at DESC
      `;
      const rows = await run(sqlByDeptId, [deptId]);
      return res.json({ by: 'dept_id', department_id: deptId, enrollments: rows });
    }

    // 4) Fallback: filter by department string
    const sqlFallback = `
      SELECT cr.selected_at,
             s.student_id AS student_id, s.name AS student_name, s.email,
             c.course_id AS course_id, c.code AS course_code, c.title AS course_title
      FROM course_responses cr
      JOIN courses c ON cr.course_id = c.course_id
      JOIN students s ON cr.student_id = s.student_id
      WHERE c.code = ?
      ORDER BY cr.selected_at DESC
      LIMIT 2000
    `;
    const rows = await run(sqlFallback, [tokenDept]);
    return res.json({ by: 'fallback_dept_string', tokenDept, enrollments: rows });

  } catch (err) {
    console.error('[ERROR] enrollments handler ->', err);
    return res.status(500).json({ error: 'Server error' });
  }
});




// optional: a route so you can test token decode
app.get('/api/professors/me', authMiddleware, (req, res) => {
  res.json({ professor: req.professor });
});

app.get('/__debug_students_test__', (req, res) => {
  console.log('DEBUG: __debug_students_test__ hit from', req.ip);
  res.json({ ok: true, ts: Date.now() });
});

app.get('/api/professors-test', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));


app._router.stack.forEach((r) => {
  if (r.route && r.route.path) {
    console.log(r.route.path, r.route.methods);
  }
});


// === TEMP DEBUG: verbose request logger (remove after debugging) ===
app.use((req, res, next) => {
  // Print a compact but useful debug line for each request
  console.log('[VERBOSE-DBG]', new Date().toISOString(), req.method, req.originalUrl, 'from', req.ip);
  // Print auth header and x-student-id if present (safe for local debugging)
  if (req.headers && (req.headers.authorization || req.headers['x-student-id'])) {
    console.log('[VERBOSE-DBG] headers:', {
      authorization: req.headers.authorization ? '[present]' : undefined,
      'x-student-id': req.headers['x-student-id']
    });
  }
  next();
});

// === TEMP DEBUG: guaranteed test handlers ===
// These handlers bypass any router issues so you can confirm the server receives requests.
app.get('/_test_course_responses_get', (req, res) => {
  console.log('[_test_course_responses_get] hit, headers:', req.headers);
  res.json({ ok: true, path: '/_test_course_responses_get' });
});

app.post('/api/course_responses', express.json(), (req, res) => {
  console.log('[_temp api/course_responses POST] body:', req.body, 'headers:', req.headers);
  // echo back what we received
  res.status(200).json({ ok: true, received: req.body, route: '/api/course_responses' });
});

app.post('/course_responses', express.json(), (req, res) => {
  console.log('[_temp /course_responses POST] body:', req.body, 'headers:', req.headers);
  res.status(200).json({ ok: true, received: req.body, route: '/course_responses' });
});

// Put this ABOVE app.use('/auth', ...) or similar






startServer();
