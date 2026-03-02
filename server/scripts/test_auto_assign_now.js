require('dotenv').config();
const { pool } = require('../src/config/database');
const AutoAssignmentService = require('../src/services/autoAssignmentService');

(async () => {
  try {
    const sessionId = '8539ed91-c567-4070-861c-e1fa4707b12b'; // Feb S1 - semester 1
    const actorId = '977c5000-c340-43d1-ba11-480a9b6dc16f'; // Kamesh admin person_id
    
    console.log('=== Testing getSuggestions for one student ===');
    const kavinId = '7bb581ee-6f0d-4f5a-9e25-1500fa04df07'; // KAVIN
    const suggestions = await AutoAssignmentService.getSuggestions(sessionId, kavinId);
    console.log('Suggestions for KAVIN:', JSON.stringify(suggestions, null, 2));
    
    console.log('\n=== Testing assignBatch ===');
    const result = await AutoAssignmentService.assignBatch(sessionId, actorId, 'test_auto', 2);
    console.log('Batch result:', JSON.stringify(result, null, 2));
    
    // Check what was created
    const assignments = await pool.query('SELECT spa.*, p.display_name as student_name, f.display_name as faculty_name FROM session_planner_assignments spa JOIN persons p ON p.person_id=spa.student_id JOIN persons f ON f.person_id=spa.faculty_id WHERE spa.session_id=$1', [sessionId]);
    console.log('\nAssignments created:');
    assignments.rows.forEach(a => console.log(`  ${a.faculty_name} → ${a.student_name} (${a.status})`));
    
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
  } finally {
    pool.end();
  }
})();
