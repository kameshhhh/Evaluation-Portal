/**
 * Session Planner API Integration Test
 * Tests all endpoints: track-config, admin teams, planner, all-students
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const http = require("http");

const SECRET = process.env.JWT_SECRET;
const BASE = "http://localhost:5000";

// Generate valid tokens for different roles
function makeToken(role, email) {
  return jwt.sign(
    { userId: `test-${role}`, email, role, jti: `test-jti-${role}` },
    SECRET,
    {
      expiresIn: "1h",
      algorithm: "HS256",
      issuer: "bitsathy-auth-server",
      audience: "bitsathy-auth-client",
    }
  );
}

const adminToken = makeToken("admin", "admin@bitsathy.ac.in");
const facultyToken = makeToken("faculty", "faculty@bitsathy.ac.in");
const studentToken = makeToken("student", "student@bitsathy.ac.in");

function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(label, method, path, token, body, expectSuccess) {
  try {
    const r = await request(method, path, token, body);
    const ok = expectSuccess
      ? r.body.success === true
      : r.status < 500;
    const icon = ok ? "✅" : "❌";
    console.log(`${icon} ${label} -> ${r.status} success=${r.body.success}`);
    if (!ok || r.status >= 400) {
      console.log(`   Response: ${JSON.stringify(r.body).slice(0, 200)}`);
    }
    if (r.body.data && typeof r.body.data === "object" && !Array.isArray(r.body.data)) {
      const keys = Object.keys(r.body.data);
      console.log(`   Data keys: [${keys.join(", ")}]`);
    }
    if (Array.isArray(r.body.data)) {
      console.log(`   Data: array of ${r.body.data.length} items`);
    }
    return r;
  } catch (err) {
    console.log(`ERROR ${label} -> ${err.message}`);
    return null;
  }
}

(async () => {
  console.log("\n========== SESSION PLANNER API TESTS ==========\n");

  // 1. Track config (any authenticated user)
  await test("GET /track-config (admin)", "GET", "/api/session-planner/track-config", adminToken, null, true);

  // 2. All students (admin/faculty)
  const allStudents = await test("GET /all-students (admin)", "GET", "/api/session-planner/all-students", adminToken, null, true);

  // 3. Admin team list
  await test("GET /admin/teams (admin)", "GET", "/api/session-planner/admin/teams", adminToken, null, true);
  await test("GET /admin/teams?status=pending", "GET", "/api/session-planner/admin/teams?status=pending", adminToken, null, true);

  // 4. Planner password verify
  await test("POST /planner/verify-password (correct)", "POST", "/api/session-planner/planner/verify-password", adminToken, { password: "bit!123" }, true);
  await test("POST /planner/verify-password (wrong)", "POST", "/api/session-planner/planner/verify-password", adminToken, { password: "wrong" }, false);

  // 5. Student-specific endpoints
  await test("GET /my-track (student)", "GET", "/api/session-planner/my-track", studentToken, null, false);
  await test("GET /my-team (student)", "GET", "/api/session-planner/my-team", studentToken, null, false);
  await test("GET /pending-invitations (student)", "GET", "/api/session-planner/pending-invitations", studentToken, null, false);
  await test("GET /available-students (student)", "GET", "/api/session-planner/available-students", studentToken, null, false);
  await test("GET /my-evaluator (student)", "GET", "/api/session-planner/my-evaluator", studentToken, null, false);

  // 6. Faculty endpoints
  await test("GET /my-assignments (faculty)", "GET", "/api/session-planner/planner/my-assignments", facultyToken, null, false);

  // 7. Authorization checks (should 403)
  await test("GET /my-track (admin->403)", "GET", "/api/session-planner/my-track", adminToken, null, false);
  await test("GET /admin/teams (student->403)", "GET", "/api/session-planner/admin/teams", studentToken, null, false);

  console.log("\n========== DONE ==========\n");
})();
