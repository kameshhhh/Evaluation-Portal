const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const http = require("http");

const pool = new Pool({
  connectionString:
    "postgresql://postgres:kamesh123@localhost:5432/bitsathy_auth",
});

// Load config
require("dotenv").config();
const JWT_SECRET = process.env.JWT_SECRET;

function httpGet(path, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "localhost",
      port: 5000,
      path,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "TestAgent/1.0",
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
    req.end();
  });
}

(async () => {
  try {
    // ── 1. Get KAVIN's active token ──
    const sessRes = await pool.query(`
      SELECT us.jwt_token_id as token_id, us.internal_user_id as user_id, u.normalized_email, u.user_role, us.user_agent, us.ip_address
      FROM user_sessions us
      JOIN users u ON u.internal_user_id = us.internal_user_id
      WHERE u.normalized_email LIKE '%kavin%' AND us.revoked = false
      ORDER BY us.issued_at DESC LIMIT 1
    `);

    if (!sessRes.rows.length) {
      console.log("❌ No active session for KAVIN. He needs to login first.");
      await pool.end();
      return;
    }

    const sess = sessRes.rows[0];
    console.log(`\n✅ Found session for: ${sess.normalized_email} (role: ${sess.user_role})`);

    // ── 2. Generate a fresh JWT for testing ──
    // The server fingerprint check: sha256("User-Agent|req.ip")
    // When making local HTTP, req.ip will be "::1" or "127.0.0.1"  
    // We control User-Agent in our request, so match both sides
    const crypto = require("crypto");
    const testUA = "TestAgent/1.0";
    const testIP = "::1";  // Node http to localhost uses IPv6 loopback
    const fgp = crypto
      .createHash("sha256")
      .update(`${testUA}|${testIP}`)
      .digest("hex");

    const token = jwt.sign(
      {
        userId: sess.user_id,
        email: sess.normalized_email,
        role: sess.user_role,
        fgp,
      },
      JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "1h",
        issuer: "bitsathy-auth-server",
        audience: "bitsathy-auth-client",
        jwtid: sess.token_id,
      },
    );

    console.log("✅ JWT generated for testing\n");

    // ── 3. Test APIs ──
    const tests = [
      { name: "Health Check", path: "/api/health" },
      {
        name: "My Sessions (Session Planner)",
        path: "/api/session-planner/my-sessions",
      },
      {
        name: "Session History",
        path: "/api/session-planner/session-history",
      },
    ];

    let pass = 0;
    let fail = 0;

    for (const t of tests) {
      const r = await httpGet(t.path, token);
      const ok = r.status === 200 && r.body.success;
      if (ok) {
        pass++;
        console.log(`  ✅ ${t.name} — ${r.status}`);
        if (t.name === "My Sessions (Session Planner)" && r.body.data) {
          console.log(`     → ${r.body.data.length} sessions returned`);
          for (const s of r.body.data) {
            console.log(
              `     → Session "${s.title}" | ${s.studentCount} students | venue: ${s.venue || "n/a"} | date: ${s.session_date || "n/a"} | time: ${s.session_time || "n/a"}`,
            );
            if (s.students && s.students.length > 0) {
              for (const st of s.students) {
                console.log(
                  `       - ${st.display_name} | ${st.email || "no email"} | track: ${st.track || "n/a"} | dept: ${st.department_code}`,
                );
              }
            }
          }
        }
        if (t.name === "Session History" && r.body.data) {
          console.log(`     → ${r.body.data.length} history records`);
        }
      } else {
        fail++;
        console.log(`  ❌ ${t.name} — ${r.status}`);
        console.log(`     Error: ${JSON.stringify(r.body).substring(0, 200)}`);
      }
    }

    console.log(`\n═══ Results: ${pass} passed, ${fail} failed ═══\n`);

    // ── 4. Test student endpoint (getMyEvaluator) ──
    console.log("── Testing Student Endpoint (getMyEvaluator) ──");
    const kameshRes = await pool.query(`
      SELECT us.jwt_token_id as token_id, us.internal_user_id as user_id, u.normalized_email, u.user_role, us.user_agent, us.ip_address
      FROM user_sessions us
      JOIN users u ON u.internal_user_id = us.internal_user_id
      WHERE u.normalized_email LIKE '%kamesh.mz%' AND us.revoked = false
      ORDER BY us.issued_at DESC LIMIT 1
    `);
    if (kameshRes.rows.length > 0) {
      const ks = kameshRes.rows[0];
      console.log(`  Found session for student: ${ks.normalized_email}`);
      const studentFgp = crypto.createHash("sha256").update(`${testUA}|${testIP}`).digest("hex");
      const studentToken = jwt.sign(
        { userId: ks.user_id, email: ks.normalized_email, role: ks.user_role, fgp: studentFgp },
        JWT_SECRET,
        { algorithm: "HS256", expiresIn: "1h", issuer: "bitsathy-auth-server", audience: "bitsathy-auth-client", jwtid: ks.token_id }
      );
      const evalR = await httpGet("/api/session-planner/planner/my-evaluator", studentToken);
      if (evalR.status === 200 && evalR.body.success) {
        pass++;
        console.log(`  ✅ getMyEvaluator — ${evalR.status}`);
        const d = evalR.body.data;
        if (d) {
          console.log(`     → Full response keys: ${Object.keys(d).join(", ")}`);
          console.log(`     → Faculty: ${d.evaluator_name || d.faculty_name || d.display_name} | Session: ${d.session_title || d.title}`);
          console.log(`     → Venue: ${d.session_venue || d.venue || "n/a"} | Date: ${d.session_date || "n/a"} | Time: ${d.session_time || "n/a"}`);
        } else {
          console.log(`     → No evaluator assigned`);
        }
      } else {
        fail++;
        console.log(`  ❌ getMyEvaluator — ${evalR.status}`);
        console.log(`     Error: ${JSON.stringify(evalR.body).substring(0, 200)}`);
      }
    } else {
      console.log("  ⚠️  No active session for KAMESH D — skipping student test");
    }

    console.log(`\n═══ FINAL: ${pass} passed, ${fail} failed ═══\n`);
    await pool.end();
  } catch (err) {
    console.error("Test error:", err.message);
    await pool.end();
    process.exit(1);
  }
})();
