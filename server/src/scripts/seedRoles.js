// ============================================================
// SEED ROLES SCRIPT — Initial Data Population
// ============================================================
// Seeds the database with initial allowed domains and role patterns.
// Run after initDatabase.js to populate configuration tables.
// Uses INSERT ... ON CONFLICT DO NOTHING for idempotent seeding.
//
// Usage: npm run db:seed
// ============================================================

// Load environment variables for database connection and domain config
require("dotenv").config();

// Import the database pool for executing INSERT statements
const { pool } = require("../config/database");

// ============================================================
// Seed the allowed_domains table with configured domains
// Reads from ALLOWED_DOMAINS environment variable
// ============================================================
const seedAllowedDomains = async () => {
  // Parse the comma-separated domain list from environment
  const domains = (process.env.ALLOWED_DOMAINS || "bitsathy.ac.in")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  console.log(`Seeding ${domains.length} allowed domain(s)...`);

  for (const domain of domains) {
    // INSERT with ON CONFLICT DO NOTHING makes this idempotent
    // Running the seed script multiple times won't create duplicates
    await pool.query(
      `INSERT INTO allowed_domains (domain_pattern, is_active) 
       VALUES ($1, true) 
       ON CONFLICT (domain_pattern) DO NOTHING`,
      [domain],
    );
    console.log(`  ✓ Domain: ${domain}`);
  }
};

// ============================================================
// Seed the role_patterns table with default role mappings
// These patterns automatically assign roles based on email format
// ============================================================
const seedRolePatterns = async () => {
  // Define the default role patterns for bitsathy.ac.in
  // Patterns use SQL LIKE syntax: % = any characters
  // Priority: lower number = higher precedence
  const patterns = [
    // ============================================================
    // Pattern explanation for bitsathy.ac.in email conventions:
    // Students: typically use rollnumber@bitsathy.ac.in
    // Faculty: typically use name@bitsathy.ac.in or name.dept@bitsathy.ac.in
    // Admins: manually assigned — no pattern
    // ============================================================

    {
      // Match ALL emails from bitsathy.ac.in as students by default
      // This is the lowest-priority catch-all for the domain
      // Specific patterns above this will override for faculty/admin
      pattern: "%@bitsathy.ac.in",
      role: "student",
      priority: 100, // Lowest priority — catch-all
    },
  ];

  console.log(`\nSeeding ${patterns.length} role pattern(s)...`);

  for (const { pattern, role, priority } of patterns) {
    // INSERT with ON CONFLICT — update the role and priority if the pattern exists
    // This allows re-seeding to update existing patterns
    await pool.query(
      `INSERT INTO role_patterns (email_pattern, assigned_role, priority, is_active) 
       VALUES ($1, $2, $3, true) 
       ON CONFLICT DO NOTHING`,
      [pattern, role, priority],
    );
    console.log(
      `  ✓ Pattern: ${pattern} → Role: ${role} (priority: ${priority})`,
    );
  }
};

// ============================================================
// Main seed function — orchestrates all seeding operations
// ============================================================
const seedDatabase = async () => {
  console.log("========================================");
  console.log("DATABASE SEEDING STARTING");
  console.log("========================================\n");

  try {
    // Seed allowed domains first (role patterns reference domains conceptually)
    await seedAllowedDomains();

    // Seed role patterns for automatic role assignment
    await seedRolePatterns();

    console.log("\n========================================");
    console.log("DATABASE SEEDING COMPLETE");
    console.log("========================================");
    console.log("\nThe database is ready for use.");
    console.log("Start the server with: npm run dev");
  } catch (error) {
    console.error("✗ Database seeding FAILED:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  } finally {
    // Close the pool to allow the script to exit cleanly
    await pool.end();
  }
};

// Run the seeding
seedDatabase();
