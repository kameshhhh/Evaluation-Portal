require('dotenv').config();
const { pool } = require('../src/config/database');

(async () => {
  try {
    const creatorId = '26caec64-4f95-4442-912a-43ea0a9a5da1';
    const r = await pool.query(
      `UPDATE peer_ranking_surveys
       SET participant_ids = participant_ids || to_jsonb($1::text)::jsonb
       WHERE NOT (participant_ids @> to_jsonb($1::text)::jsonb)
       RETURNING survey_id, title, participant_ids`,
      [creatorId]
    );
    console.log('Updated surveys:', r.rowCount);
    r.rows.forEach(x => console.log(JSON.stringify(x, null, 2)));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
})();
