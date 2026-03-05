const{query}=require('./src/config/database');
(async()=>{
  // 1. faculty_evaluation_sessions columns
  console.log('=== faculty_evaluation_sessions ===');
  const r1=await query(`SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_name='faculty_evaluation_sessions' ORDER BY ordinal_position`);
  r1.rows.forEach(x=>console.log('  '+x.column_name+' | '+x.data_type+' | null='+x.is_nullable));

  // 2. persons columns (check for project_track, track_scope)
  console.log('\n=== persons (track-related) ===');
  const r2=await query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='persons' AND column_name IN ('project_track','track_scope','scope','department_code','current_year') ORDER BY ordinal_position`);
  r2.rows.forEach(x=>console.log('  '+x.column_name+' | '+x.data_type));

  // 3. Check project_track values
  console.log('\n=== project_track values in DB ===');
  const r3=await query(`SELECT project_track, COUNT(*) as cnt FROM persons WHERE project_track IS NOT NULL GROUP BY project_track`);
  r3.rows.forEach(x=>console.log('  '+x.project_track+' : '+x.cnt));

  // 4. Check if session_groups table already exists
  console.log('\n=== session_groups table exists? ===');
  const r4=await query(`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='session_groups') as exists`);
  console.log('  '+r4.rows[0].exists);

  // 5. Check if score_appeals table already exists
  const r5=await query(`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='score_appeals') as exists`);
  console.log('  score_appeals exists: '+r5.rows[0].exists);

  // 6. Check if faculty_alerts table already exists
  const r6=await query(`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='faculty_alerts') as exists`);
  console.log('  faculty_alerts exists: '+r6.rows[0].exists);

  // 7. Check existing constraints on faculty_evaluation_sessions.status
  console.log('\n=== fes constraints ===');
  const r7=await query(`SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid='faculty_evaluation_sessions'::regclass AND contype='c'`);
  r7.rows.forEach(x=>console.log('  '+x.conname+' : '+x.def));

  // 8. team_formations columns
  console.log('\n=== team_formations ===');
  const r8=await query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='team_formation_requests' ORDER BY ordinal_position`);
  r8.rows.forEach(x=>console.log('  '+x.column_name+' | '+x.data_type));

  // 9. Check if team_formation_requests has track
  console.log('\n=== team_formation_requests sample ===');
  const r9=await query(`SELECT id,leader_id,status,track FROM team_formation_requests LIMIT 3`);
  r9.rows.forEach(x=>console.log('  '+JSON.stringify(x)));

  // 10. student_track_selections
  console.log('\n=== student_track_selections ===');
  const r10=await query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='student_track_selections' ORDER BY ordinal_position`);
  r10.rows.forEach(x=>console.log('  '+x.column_name+' | '+x.data_type));

  // 11. sample student_track_selections
  console.log('\n=== sts sample ===');
  const r11=await query(`SELECT track,COUNT(*) as cnt FROM student_track_selections GROUP BY track`);
  r11.rows.forEach(x=>console.log('  '+x.track+' : '+x.cnt));

  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});
