const{query}=require('./src/config/database');
(async()=>{
  // 1. student_track_selections full schema
  console.log('=== student_track_selections columns ===');
  const r1=await query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='student_track_selections' ORDER BY ordinal_position`);
  r1.rows.forEach(x=>console.log('  '+x.column_name+' | '+x.data_type));

  // 2. sample data
  console.log('\n=== sts sample data ===');
  const r2=await query(`SELECT * FROM student_track_selections LIMIT 5`);
  r2.rows.forEach(x=>console.log('  '+JSON.stringify(x)));

  // 3. track values
  console.log('\n=== track values ===');
  const r3=await query(`SELECT track, COUNT(*) as cnt FROM student_track_selections GROUP BY track`);
  r3.rows.forEach(x=>console.log('  '+x.track+' : '+x.cnt));

  // 4. persons table - all columns
  console.log('\n=== persons ALL columns ===');
  const r4=await query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='persons' ORDER BY ordinal_position`);
  r4.rows.forEach(x=>console.log('  '+x.column_name+' | '+x.data_type));

  // 5. team_formation_requests
  console.log('\n=== team_formation_requests columns ===');
  const r5=await query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='team_formation_requests' ORDER BY ordinal_position`);
  r5.rows.forEach(x=>console.log('  '+x.column_name+' | '+x.data_type));

  // 6. team_formation_requests sample
  console.log('\n=== tfr sample ===');
  const r6=await query(`SELECT id,leader_id,track,status FROM team_formation_requests LIMIT 3`);
  r6.rows.forEach(x=>console.log('  '+JSON.stringify(x)));

  // 7. team_invitations columns
  console.log('\n=== team_invitations columns ===');
  const r7=await query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='team_invitations' ORDER BY ordinal_position`);
  r7.rows.forEach(x=>console.log('  '+x.column_name+' | '+x.data_type));

  // 8. faculty_evaluation_scope columns
  console.log('\n=== faculty_evaluation_scope columns ===');
  const r8=await query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='faculty_evaluation_scope' ORDER BY ordinal_position`);
  r8.rows.forEach(x=>console.log('  '+x.column_name+' | '+x.data_type));

  // 9. faculty_evaluation_scope sample
  console.log('\n=== fes_scope sample ===');
  const r9=await query(`SELECT * FROM faculty_evaluation_scope LIMIT 5`);
  r9.rows.forEach(x=>console.log('  '+JSON.stringify(x)));

  // 10. tracks table
  console.log('\n=== tracks table ===');
  const r10=await query(`SELECT * FROM tracks ORDER BY name`);
  r10.rows.forEach(x=>console.log('  '+JSON.stringify(x)));

  // 11. Check all table names
  console.log('\n=== All tables ===');
  const r11=await query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
  r11.rows.forEach(x=>console.log('  '+x.tablename));

  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});
