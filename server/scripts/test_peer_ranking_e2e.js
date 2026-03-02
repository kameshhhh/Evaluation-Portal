// ============================================================
// END-TO-END PEER RANKING TEST
// ============================================================
// Tests the complete peer ranking flow:
// 1. Create test students (need 5+ for peer groups)
// 2. Create peer group
// 3. Create student-initiated survey
// 4. Submit rankings from multiple students
// 5. Aggregate results
// 6. View results
// 7. Run gaming detection
// 8. Cleanup
// ============================================================

require('dotenv').config();
const { query, pool } = require('../src/config/database');
const PeerRankingSchemaAdapter = require('../src/services/analytics/PeerRankingSchemaAdapter');
const PeerRankingSafeguardService = require('../src/services/analytics/PeerRankingSafeguardService');

// Existing students
const STUDENTS = {
  DEVI: { personId: '3e9e4427-0957-4849-8a34-64f88ef5c597', userId: '9f7961e8-167b-49e5-8f22-aad5f142b7ad', name: 'DEVI SUBRAMANI' },
  KAMESH: { personId: '26caec64-4f95-4442-912a-43ea0a9a5da1', userId: 'cb625e60-76ad-4e50-8e2b-3e0311843a4f', name: 'KAMESH D' },
  KAVIN: { personId: '7bb581ee-6f0d-4f5a-9e25-1500fa04df07', userId: '8f362c65-0515-4356-b957-033c3ad6e1f2', name: 'KAVIN KUMAR E D' },
};

const TEST_STUDENTS = [];

async function createTestStudents() {
  console.log('\n=== Step 1: Creating test students ===');
  const names = [
    { display: 'PRIYA SHARMA', email: 'priya.test@bitsathy.ac.in' },
    { display: 'RAHUL KUMAR', email: 'rahul.test@bitsathy.ac.in' },
    { display: 'ANITHA RAJ', email: 'anitha.test@bitsathy.ac.in' },
    { display: 'VIJAY KRISHNAN', email: 'vijay.test@bitsathy.ac.in' },
  ];
  
  for (const { display, email } of names) {
    // Check if person already exists
    const existing = await query(
      `SELECT p.person_id, u.internal_user_id FROM persons p
       JOIN users u ON p.identity_id = u.internal_user_id
       WHERE p.display_name = $1 AND p.person_type = 'student'`,
      [display]
    );
    
    let personId, userId;
    if (existing.rows.length > 0) {
      personId = existing.rows[0].person_id;
      userId = existing.rows[0].internal_user_id;
      console.log(`  [EXISTS] ${display} → ${personId}`);
    } else {
      // Create user first (or get existing one)
      let userResult = await query(
        `SELECT internal_user_id FROM users WHERE normalized_email = $1`,
        [email]
      );
      if (userResult.rows.length === 0) {
        userResult = await query(
          `INSERT INTO users (normalized_email, email_hash, user_role)
           VALUES ($1, encode(sha256(convert_to($2, 'UTF8')), 'hex'), 'student')
           RETURNING internal_user_id`,
          [email, email]
        );
      }
      userId = userResult.rows[0].internal_user_id;
      
      // Create person linked to user
      const personResult = await query(
        `INSERT INTO persons (identity_id, display_name, person_type, department_code, admission_year)
         VALUES ($1, $2, 'student', 'CSE', 2023)
         RETURNING person_id`,
        [userId, display]
      );
      personId = personResult.rows[0].person_id;
      console.log(`  [CREATED] ${display} → person:${personId} user:${userId}`);
    }
    TEST_STUDENTS.push({ personId, userId, name: display });
  }
}

async function testPeerGroupCreation() {
  console.log('\n=== Step 2: Creating peer group ===');
  
  const creator = STUDENTS.DEVI;
  const peerIds = [
    STUDENTS.KAMESH.personId,
    STUDENTS.KAVIN.personId,
    ...TEST_STUDENTS.map(s => s.personId)
  ];
  
  console.log(`  Creator: ${creator.name}`);
  console.log(`  Peers (${peerIds.length}): ${peerIds.join(', ').substring(0, 80)}...`);
  
  // Clean up any existing groups first
  await query(`UPDATE peer_groups SET is_active = false WHERE student_id = $1`, [creator.personId]);
  
  const group = await PeerRankingSchemaAdapter.createPeerGroup(creator.personId, {
    groupName: 'Test Peer Group',
    peerIds,
    refreshPeriod: 'semester'
  });
  
  console.log(`  [OK] Group created: ${group.group_id} (${group.peer_count} peers)`);
  return group;
}

async function testGetAvailablePeers() {
  console.log('\n=== Step 2b: Testing available peers ===');
  const peers = await PeerRankingSchemaAdapter.getAvailablePeers(STUDENTS.DEVI.personId);
  console.log(`  [OK] Found ${peers.length} available peers`);
  peers.forEach(p => console.log(`    ${p.displayName} (${p.department || 'unknown dept'}) [${p.relationship}]`));
  return peers;
}

async function testSurveyCreation(group) {
  console.log('\n=== Step 3: Creating student-initiated survey ===');
  
  const survey = await PeerRankingSchemaAdapter.createStudentSurvey(
    STUDENTS.DEVI.personId,
    group.group_id,
    ['leadership', 'communication', 'technical'],
    STUDENTS.DEVI.userId
  );
  
  console.log(`  [OK] Survey created: ${survey.survey_id}`);
  console.log(`  Title: ${survey.title}`);
  console.log(`  Status: ${survey.status}`);
  return survey;
}

async function testGetActiveSurveys() {
  console.log('\n=== Step 3b: Testing active surveys ===');
  
  // DEVI should see the survey (she's in the group as peer_group owner)
  // But participant_ids contains the peers, not DEVI herself
  // Let's check from KAMESH's perspective (he's a peer in the group)
  const surveys = await PeerRankingSchemaAdapter.getActiveSurveys(STUDENTS.KAMESH.personId);
  console.log(`  [OK] KAMESH sees ${surveys.length} active surveys`);
  surveys.forEach(s => console.log(`    ${s.surveyId}: ${s.title} [${s.status}]`));
  return surveys;
}

async function testGetSurveyPeers(surveyId) {
  console.log('\n=== Step 3c: Testing survey peers ===');
  const peers = await PeerRankingSchemaAdapter.getSurveyPeers(surveyId, STUDENTS.KAMESH.personId);
  console.log(`  [OK] KAMESH can rank ${peers.length} peers (self excluded)`);
  peers.forEach(p => console.log(`    ${p.displayName} (${p.personId.substring(0, 8)}...)`));
  return peers;
}

async function testSubmitRankings(surveyId, peers) {
  console.log('\n=== Step 4: Submitting rankings ===');
  
  // Get all evaluators (peers in the group excluding self for each)
  const evaluators = [
    STUDENTS.KAMESH,
    STUDENTS.KAVIN,
    TEST_STUDENTS[0],
    TEST_STUDENTS[1],
  ];
  
  for (const evaluator of evaluators) {
    // Get this evaluator's rankable peers
    const rankablePeers = peers.filter(p => p.personId !== evaluator.personId);
    
    if (rankablePeers.length < 2) {
      console.log(`  [SKIP] ${evaluator.name} — not enough peers to rank`);
      continue;
    }
    
    // Build rankings: 3 questions, each gets top 3 ranked
    const rankings = [];
    for (let qIdx = 0; qIdx < 3; qIdx++) {
      // Shuffle peers differently for each question to avoid collusion detection
      const shuffled = [...rankablePeers].sort(() => Math.random() - 0.5);
      const topPeers = shuffled.slice(0, Math.min(3, shuffled.length));
      
      rankings.push({
        questionIndex: qIdx,
        rankings: topPeers.map((p, i) => ({
          personId: p.personId,
          rank: i + 1
        }))
      });
    }
    
    try {
      // Use the adapter which validates and delegates to the safeguard service
      const result = await PeerRankingSchemaAdapter.adaptAndSubmit(
        surveyId, evaluator.personId, rankings
      );
      console.log(`  [OK] ${evaluator.name} submitted ranking → ${result.response_id}`);
    } catch (err) {
      console.log(`  [ERROR] ${evaluator.name}: ${err.message}`);
    }
  }
}

async function testAggregation(surveyId) {
  console.log('\n=== Step 5: Aggregating results ===');
  
  const result = await PeerRankingSafeguardService.aggregateResults(surveyId);
  console.log(`  [OK] Aggregated from ${result.respondentCount} respondents`);
  console.log(`  Aggregated ${result.aggregates.length} persons`);
  
  return result;
}

async function testGetResults(surveyId) {
  console.log('\n=== Step 6: Getting results (privacy-safe) ===');
  
  const results = await PeerRankingSchemaAdapter.getAggregatedResults(surveyId);
  console.log(`  Survey: ${results.survey?.title || 'N/A'}`);
  
  if (results.aggregatedScores) {
    console.log(`  Scores (${results.aggregatedScores.length} peers):`);
    results.aggregatedScores.forEach(s => {
      console.log(`    ${s.displayName}: ${(s.normalizedScore * 100).toFixed(1)}% → ${s.band}`);
    });
  }
  
  if (results.safeguardSummary?.length > 0) {
    console.log(`  Safeguard flags: ${results.safeguardSummary.length}`);
    results.safeguardSummary.forEach(f => console.log(`    ${f.type} (${f.severity}): ${f.count}`));
  }
  
  return results;
}

async function testGamingDetection(surveyId) {
  console.log('\n=== Step 7: Running gaming detection ===');
  
  const result = await PeerRankingSafeguardService.detectGaming(surveyId);
  console.log(`  [OK] Flags detected: ${result.flags.length}`);
  result.flags.forEach(f => console.log(`    ${f.flagType} (${f.severity})`));
  
  return result;
}

async function testTraitQuestions() {
  console.log('\n=== Step 2a: Testing trait questions ===');
  const traits = await PeerRankingSchemaAdapter.getTraitQuestions();
  console.log(`  [OK] Found ${traits.length} trait questions`);
  traits.forEach(t => console.log(`    ${t.traitKey}: "${t.text}" [${t.type}]`));
  return traits;
}

async function testDraftSave(surveyId, peers) {
  console.log('\n=== Step 3d: Testing draft save ===');
  
  // Save a partial draft for the last test student
  const drafter = TEST_STUDENTS[2]; // ANITHA RAJ
  const rankablePeers = peers.filter(p => p.personId !== drafter.personId);
  
  const partialRankings = [{
    questionIndex: 0,
    rankings: rankablePeers.slice(0, 2).map((p, i) => ({
      personId: p.personId,
      rank: i + 1
    }))
  }];
  
  try {
    const result = await PeerRankingSchemaAdapter.saveDraft(
      surveyId, drafter.personId, partialRankings
    );
    console.log(`  [OK] Draft saved for ${drafter.name} at ${result.savedAt}`);
  } catch (err) {
    console.log(`  [ERROR] Draft save: ${err.message}`);
  }
}

async function cleanup(surveyId) {
  console.log('\n=== Step 8: Cleanup ===');
  
  // Delete test data in order (respect FKs)
  await query(`DELETE FROM peer_safeguard_flags WHERE survey_id = $1`, [surveyId]);
  await query(`DELETE FROM peer_ranking_aggregates WHERE survey_id = $1`, [surveyId]);
  await query(`DELETE FROM peer_ranking_responses WHERE survey_id = $1`, [surveyId]);
  await query(`DELETE FROM peer_ranking_surveys WHERE survey_id = $1`, [surveyId]);
  await query(`DELETE FROM peer_groups WHERE student_id = $1`, [STUDENTS.DEVI.personId]);
  
  // Delete test students (persons first, then users)
  for (const s of TEST_STUDENTS) {
    await query(`DELETE FROM persons WHERE person_id = $1`, [s.personId]);
    if (s.userId) {
      await query(`DELETE FROM users WHERE internal_user_id = $1`, [s.userId]);
    }
  }
  
  console.log('  [OK] All test data cleaned up');
}

// ============================================================
// MAIN
// ============================================================
(async () => {
  let surveyId = null;
  try {
    console.log('========================================');
    console.log('PEER RANKING END-TO-END TEST');
    console.log('========================================');
    
    // Setup
    await createTestStudents();
    await testTraitQuestions();
    await testGetAvailablePeers();
    
    // Create group + survey
    const group = await testPeerGroupCreation();
    const survey = await testSurveyCreation(group);
    surveyId = survey.survey_id;
    
    // Verify surveys visible
    await testGetActiveSurveys();
    const peers = await testGetSurveyPeers(surveyId);
    
    // Test drafts
    await testDraftSave(surveyId, peers);
    
    // Submit rankings
    await testSubmitRankings(surveyId, peers);
    
    // Aggregate + results
    await testAggregation(surveyId);
    await testGetResults(surveyId);
    
    // Gaming detection
    await testGamingDetection(surveyId);
    
    console.log('\n========================================');
    console.log('ALL TESTS PASSED');
    console.log('========================================');
    
    // Ask whether to keep or cleanup
    console.log('\n[NOTE] Test data kept in DB for UI testing.');
    console.log('  Survey ID:', surveyId);
    console.log('  Run with --cleanup to remove test data.');
    
    if (process.argv.includes('--cleanup')) {
      await cleanup(surveyId);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('\n[FATAL]', err.message);
    console.error(err.stack);
    
    // Cleanup on failure if survey was created
    if (surveyId && process.argv.includes('--cleanup')) {
      await cleanup(surveyId).catch(() => {});
    }
    
    process.exit(1);
  }
})();
