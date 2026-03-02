require("dotenv").config();
const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_URL });
const sessionId = "b7381e2e-b8ba-4fb4-a89b-5eb15c5ebd11";
const facultyId = "355ce028-6e19-4fe2-8b01-32110c8ad4d9";
const students = [
  { id: "cfe3ab9c-d929-4ff1-950a-c0f42edde15c", pts: 4 },
  { id: "6e76c5eb-08ae-44d5-8eeb-0a3ec53212f0", pts: 5 },
  { id: "c2bdc535-1d40-4bfa-b5db-e4dda3d1bbb6", pts: 3 },
  { id: "c538f7d8-20c8-48fb-93c7-3918b254a242", pts: 4 },
  { id: "ae81b3f5-e527-4554-bc92-0b75ab2f8cc0", pts: 5 },
  { id: "08a9c6f3-f226-4a9f-8b41-9c10539abe95", pts: 3 },
  { id: "01e68058-7efd-4cdb-b788-51df18859b96", pts: 4 },
];
async function run() {
  for (const s of students) {
    await p.query(
      "INSERT INTO faculty_evaluation_allocations (session_id,student_person_id,faculty_person_id,tier,points,is_draft,submitted_at) VALUES ($1,$2,$3,$4,$5,false,NOW())",
      [sessionId, s.id, facultyId, "tier1", s.pts]
    );
  }
  console.log("Inserted " + students.length + " allocations");
  await p.end();
}
run().catch((e) => { console.error(e.message); p.end(); });
