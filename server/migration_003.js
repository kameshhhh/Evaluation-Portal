// ============================================================
// MIGRATION 003: Session Groups + Track Support + Appeals + Alerts
// ============================================================
// Run: node server/migration_003.js
// 
// Changes:
//   1. CREATE TABLE session_groups (parent session concept)
//   2. ALTER faculty_evaluation_sessions: add group_id, track columns
//   3. ALTER persons: add track_scope column for faculty
//   4. CREATE TABLE score_appeals (student appeal workflow)
//   5. CREATE TABLE faculty_alerts (anomaly detection)
//   6. Add indexes for new columns
// ============================================================

const { query, pool } = require('./src/config/database');

const MIGRATION_SQL = [
  // ─── 1. SESSION GROUPS TABLE ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS session_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      session_date DATE,
      target_year VARCHAR(50),
      academic_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
      semester INTEGER NOT NULL DEFAULT 1,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ─── 2. ADD group_id AND track TO faculty_evaluation_sessions ──
  `DO $$ BEGIN
      IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'faculty_evaluation_sessions' AND column_name = 'group_id'
      ) THEN
          ALTER TABLE faculty_evaluation_sessions 
              ADD COLUMN group_id UUID REFERENCES session_groups(id) ON DELETE SET NULL;
      END IF;
  END $$`,

  `DO $$ BEGIN
      IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'faculty_evaluation_sessions' AND column_name = 'track'
      ) THEN
          ALTER TABLE faculty_evaluation_sessions 
              ADD COLUMN track VARCHAR(30);
      END IF;
  END $$`,

  // ─── 3. ADD track_scope TO persons (for faculty) ──────────
  `DO $$ BEGIN
      IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'persons' AND column_name = 'track_scope'
      ) THEN
          ALTER TABLE persons 
              ADD COLUMN track_scope TEXT[] DEFAULT '{}';
      END IF;
  END $$`,

  // ─── 4. SCORE APPEALS TABLE ───────────────────────────────
  `CREATE TABLE IF NOT EXISTS score_appeals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL,
      session_id UUID NOT NULL,
      disputed_faculty_id UUID,
      reason TEXT NOT NULL,
      evidence_url TEXT,
      score_at_appeal DECIMAL(5,2),
      faculty_gap DECIMAL(5,2),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'under_review', 'accepted', 'rejected')),
      resolved_by UUID,
      resolution_notes TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_one_appeal_per_session UNIQUE (student_id, session_id)
  )`,

  // ─── 5. FACULTY ALERTS TABLE ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS faculty_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      faculty_id UUID NOT NULL,
      session_id UUID,
      alert_type VARCHAR(30) NOT NULL
          CHECK (alert_type IN ('identical_marks', 'low_credibility', 'incomplete_evaluation')),
      severity VARCHAR(10) NOT NULL DEFAULT 'warning'
          CHECK (severity IN ('warning', 'critical')),
      title VARCHAR(500) NOT NULL,
      details JSONB DEFAULT '{}',
      is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
      acknowledged_by UUID,
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_faculty_alert_dedup UNIQUE (faculty_id, session_id, alert_type)
  )`,

  // ─── 6. INDEXES ───────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_fes_group_id ON faculty_evaluation_sessions(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fes_track ON faculty_evaluation_sessions(track)`,
  `CREATE INDEX IF NOT EXISTS idx_sg_date ON session_groups(session_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_appeals_student ON score_appeals(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_appeals_session ON score_appeals(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_appeals_status ON score_appeals(status) WHERE status = 'pending'`,
  `CREATE INDEX IF NOT EXISTS idx_fa_faculty ON faculty_alerts(faculty_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fa_session ON faculty_alerts(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fa_unacked ON faculty_alerts(is_acknowledged) WHERE is_acknowledged = FALSE`,
];

// ============================================================
// RUN MIGRATION
// ============================================================
(async () => {
  const client = await pool.connect();
  try {
    console.log('Starting migration 003: Session Groups + Track + Appeals + Alerts\n');
    await client.query('BEGIN');

    for (let i = 0; i < MIGRATION_SQL.length; i++) {
      const sql = MIGRATION_SQL[i];
      const preview = sql.replace(/\s+/g, ' ').trim().slice(0, 80);
      process.stdout.write(`  [${i + 1}/${MIGRATION_SQL.length}] ${preview}...`);
      try {
        await client.query(sql);
        console.log(' ✓');
      } catch (err) {
        console.log(` ✗ ${err.message}`);
        throw err;
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ Migration 003 completed successfully.');

    // Verify
    console.log('\n--- Verification ---');
    const tables = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename IN ('session_groups','score_appeals','faculty_alerts')
      ORDER BY tablename
    `);
    tables.rows.forEach(r => console.log(`  ✓ Table: ${r.tablename}`));

    const cols = await client.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name = 'faculty_evaluation_sessions' AND column_name IN ('group_id','track'))
         OR (table_name = 'persons' AND column_name = 'track_scope')
      ORDER BY table_name, column_name
    `);
    cols.rows.forEach(r => console.log(`  ✓ Column: ${r.table_name}.${r.column_name}`));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
})();
