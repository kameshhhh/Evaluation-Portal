// Fix peer_safeguard_flags table to work with survey-based gaming detection
// Issues:
// 1. Table has session_id (NOT NULL) but detectGaming writes survey_id
// 2. flag_type CHECK doesn't include 'collusion', 'reciprocity', 'outlier_inflation'
// 3. evaluator_id is NOT NULL but pair-based flags don't have a single evaluator
// 4. UNIQUE(session_id, evaluator_id, flag_type) blocks survey-based inserts

const { query } = require('../src/config/database');

(async () => {
  try {
    console.log('=== Fixing peer_safeguard_flags table ===\n');

    // 1. Add survey_id column (nullable FK to peer_ranking_surveys)
    await query(`
      ALTER TABLE peer_safeguard_flags
        ADD COLUMN IF NOT EXISTS survey_id UUID REFERENCES peer_ranking_surveys(survey_id) ON DELETE CASCADE
    `);
    console.log('[OK] Added survey_id column');

    // 2. Make session_id nullable (peer ranking flags don't always have a session)
    await query(`ALTER TABLE peer_safeguard_flags ALTER COLUMN session_id DROP NOT NULL`);
    console.log('[OK] Made session_id nullable');

    // 3. Make evaluator_id nullable (pair-based flags like collusion don't have a single evaluator)
    await query(`ALTER TABLE peer_safeguard_flags ALTER COLUMN evaluator_id DROP NOT NULL`);
    console.log('[OK] Made evaluator_id nullable');

    // 4. Drop old flag_type CHECK and add expanded one
    await query(`ALTER TABLE peer_safeguard_flags DROP CONSTRAINT IF EXISTS peer_safeguard_flags_flag_type_check`);
    await query(`
      ALTER TABLE peer_safeguard_flags
        ADD CONSTRAINT peer_safeguard_flags_flag_type_check
        CHECK (flag_type IN (
          'reciprocal_bias', 'retaliatory_scoring', 'uniform_distribution',
          'extreme_outlier', 'collusion_cluster',
          'collusion', 'reciprocity', 'outlier_inflation'
        ))
    `);
    console.log('[OK] Updated flag_type CHECK constraint');

    // 5. Drop old UNIQUE constraint that requires session_id + evaluator_id
    await query(`ALTER TABLE peer_safeguard_flags DROP CONSTRAINT IF EXISTS peer_safeguard_flags_session_id_evaluator_id_flag_type_key`);
    console.log('[OK] Dropped old UNIQUE constraint');

    // 6. Add index on survey_id for fast lookups
    await query(`CREATE INDEX IF NOT EXISTS idx_psf_survey ON peer_safeguard_flags(survey_id)`);
    console.log('[OK] Added survey_id index');

    // Verify
    const cols = await query(`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='peer_safeguard_flags' ORDER BY ordinal_position`);
    console.log('\n=== Updated columns ===');
    cols.rows.forEach(r => console.log(`  ${r.column_name} (nullable: ${r.is_nullable})`));

    const constraints = await query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'peer_safeguard_flags'
    `);
    console.log('\n=== Constraints ===');
    constraints.rows.forEach(r => console.log(`  ${r.conname}: ${r.def}`));

    console.log('\n[DONE] peer_safeguard_flags table fixed');
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
