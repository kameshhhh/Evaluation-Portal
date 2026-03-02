// ============================================================
// ACADEMIC IDENTITY INFRASTRUCTURE — COMPREHENSIVE TEST SUITE
// ============================================================
// Tests for all academic modules:
//   1. DepartmentRegistry (pure lookup functions)
//   2. AcademicIdentityParser (email → academic profile)
//   3. AcademicProfileBuilder (enrichment with academic context)
//   4. AcademicIntegrityGuard (academic invariant validation)
//   5. academicProfileMiddleware (Express middleware)
//
// All modules under test are PURE FUNCTIONS (no mocks required)
// except the middleware which uses req/res/next Express patterns.
//
// ZERO DATABASE DEPENDENCIES — every test runs in isolation.
// ============================================================

// ============================================================
// IMPORTS — All academic modules under test
// ============================================================

// Department registry — pure lookup functions
const {
  isValidDepartmentCode, // Validate a 2-letter email code
  getCanonicalDepartment, // Look up full dept info by email code
  getAllDepartmentCodes, // List all official codes
  getAllDepartments, // List all departments with metadata
  getDepartmentsByCategory, // Filter departments by category
  getEmailCodeFromOfficial, // Reverse lookup: CS → cs
} = require("../DepartmentRegistry");

// Academic identity parser — email → academic profile
const {
  parseStudentAcademicInfo, // Main parser: email → academic profile
  isAcademicProfileComplete, // Completeness validator
  extractDisplayNameFromEmail, // Name extractor: email → readable name
  _extractAcademicToken, // Internal: extract token from email
  _parseAcademicToken, // Internal: parse token into data
} = require("../AcademicIdentityParser");

// Academic profile builder — enrichment with academic context
const {
  buildAcademicProfile, // Main builder: person + email → profile
  validateAcademicProfileForStorage, // Pre-storage validation
  AcademicProfileValidationError, // Custom error class
  _calculateAcademicContext, // Internal: academic year/semester calc
} = require("../AcademicProfileBuilder");

// Academic integrity guard — invariant validation
const {
  validateDepartmentIntegrity, // Check department code validity
  validateAdmissionYearIntegrity, // Check admission year validity
  crossValidateEmailVsStored, // Compare email inference vs DB data
  runFullIntegrityCheck, // Run all checks at once
} = require("../AcademicIntegrityGuard");

// Canonical department data (for verifying test expectations)
const { DEPARTMENT_REGISTRY } = require("../../../../config/departments");

// ============================================================
// 1. DEPARTMENT REGISTRY TESTS
// ============================================================
describe("DepartmentRegistry", () => {
  // ----------------------------------------------------------
  // isValidDepartmentCode tests
  // ----------------------------------------------------------
  describe("isValidDepartmentCode", () => {
    // All 20 codes from the registry must be valid
    test("returns true for all 20 registered email codes", () => {
      const allCodes = [
        "mz",
        "me",
        "cs",
        "ec",
        "ee",
        "ce",
        "it",
        "ad", // engineering
        "ct",
        "tx",
        "ft",
        "fd", // technology
        "bt", // science
        "bm",
        "cb",
        "cd", // interdisciplinary
        "ag",
        "al",
        "ei",
        "se", // legacy
      ];

      // Every code in the registry must return true
      allCodes.forEach((code) => {
        expect(isValidDepartmentCode(code)).toBe(true);
      });
    });

    // Case-insensitive: uppercase should also work
    test("handles uppercase input by normalizing to lowercase", () => {
      expect(isValidDepartmentCode("MZ")).toBe(true); // Uppercase
      expect(isValidDepartmentCode("Cs")).toBe(true); // Mixed case
      expect(isValidDepartmentCode("IT")).toBe(true); // Uppercase
    });

    // Unknown codes must return false
    test("returns false for unknown department codes", () => {
      expect(isValidDepartmentCode("xx")).toBe(false); // Nonsense code
      expect(isValidDepartmentCode("ab")).toBe(false); // Not in registry
      expect(isValidDepartmentCode("zz")).toBe(false); // Not in registry
    });

    // Edge cases: null, undefined, empty, non-string
    test("returns false for null, undefined, empty, and non-string inputs", () => {
      expect(isValidDepartmentCode(null)).toBe(false); // Null
      expect(isValidDepartmentCode(undefined)).toBe(false); // Undefined
      expect(isValidDepartmentCode("")).toBe(false); // Empty string
      expect(isValidDepartmentCode(123)).toBe(false); // Number
      expect(isValidDepartmentCode(true)).toBe(false); // Boolean
    });

    // Whitespace handling
    test("handles codes with whitespace by trimming", () => {
      expect(isValidDepartmentCode(" cs ")).toBe(true); // Trimmed
      expect(isValidDepartmentCode("  mz")).toBe(true); // Leading space
    });
  });

  // ----------------------------------------------------------
  // getCanonicalDepartment tests
  // ----------------------------------------------------------
  describe("getCanonicalDepartment", () => {
    // Known code returns frozen metadata
    test("returns canonical department data for known codes", () => {
      const mz = getCanonicalDepartment("mz");
      expect(mz).toEqual({
        code: "MZ",
        name: "Mechatronics Engineering",
        category: "engineering",
      });

      const cs = getCanonicalDepartment("cs");
      expect(cs).toEqual({
        code: "CS",
        name: "Computer Science Engineering",
        category: "engineering",
      });

      const bt = getCanonicalDepartment("bt");
      expect(bt).toEqual({
        code: "BT",
        name: "Biotechnology",
        category: "science",
      });
    });

    // Returned object is frozen (immutable)
    test("returns frozen objects that cannot be mutated", () => {
      const dept = getCanonicalDepartment("cs");
      expect(Object.isFrozen(dept)).toBe(true); // Must be frozen
    });

    // Unknown code returns null
    test("returns null for unknown codes", () => {
      expect(getCanonicalDepartment("xx")).toBeNull();
      expect(getCanonicalDepartment("zz")).toBeNull();
    });

    // Invalid inputs return null
    test("returns null for null, undefined, and non-string inputs", () => {
      expect(getCanonicalDepartment(null)).toBeNull();
      expect(getCanonicalDepartment(undefined)).toBeNull();
      expect(getCanonicalDepartment(42)).toBeNull();
      expect(getCanonicalDepartment("")).toBeNull();
    });

    // Case-insensitive
    test("handles uppercase and mixed-case input", () => {
      expect(getCanonicalDepartment("MZ")).toEqual({
        code: "MZ",
        name: "Mechatronics Engineering",
        category: "engineering",
      });
    });
  });

  // ----------------------------------------------------------
  // getAllDepartmentCodes tests
  // ----------------------------------------------------------
  describe("getAllDepartmentCodes", () => {
    test("returns exactly 20 department codes", () => {
      const codes = getAllDepartmentCodes();
      expect(codes).toHaveLength(20); // 20 entries in registry
    });

    test("returns uppercase official codes sorted alphabetically", () => {
      const codes = getAllDepartmentCodes();
      // First code should be 'AD' (AI & Data Science)
      expect(codes[0]).toBe("AD");
      // Last code should be 'TX' (Textile Technology)
      expect(codes[codes.length - 1]).toBe("TX");
      // All should be uppercase
      codes.forEach((code) => {
        expect(code).toMatch(/^[A-Z]{2}$/);
      });
      // Should be sorted
      const sorted = [...codes].sort();
      expect(codes).toEqual(sorted);
    });

    test("includes all known department codes", () => {
      const codes = getAllDepartmentCodes();
      expect(codes).toContain("CS");
      expect(codes).toContain("MZ");
      expect(codes).toContain("IT");
      expect(codes).toContain("BT");
      expect(codes).toContain("AD");
    });
  });

  // ----------------------------------------------------------
  // getAllDepartments tests
  // ----------------------------------------------------------
  describe("getAllDepartments", () => {
    test("returns 20 department objects with code, name, category", () => {
      const depts = getAllDepartments();
      expect(depts).toHaveLength(20);
      depts.forEach((dept) => {
        expect(dept).toHaveProperty("code");
        expect(dept).toHaveProperty("name");
        expect(dept).toHaveProperty("category");
      });
    });

    test("returns frozen objects", () => {
      const depts = getAllDepartments();
      depts.forEach((dept) => {
        expect(Object.isFrozen(dept)).toBe(true);
      });
    });

    test("department objects are sorted by code", () => {
      const depts = getAllDepartments();
      const codes = depts.map((d) => d.code);
      const sorted = [...codes].sort();
      expect(codes).toEqual(sorted);
    });
  });

  // ----------------------------------------------------------
  // getDepartmentsByCategory tests
  // ----------------------------------------------------------
  describe("getDepartmentsByCategory", () => {
    test("returns engineering departments (count check)", () => {
      const engDepts = getDepartmentsByCategory("engineering");
      // cs, ec, ee, ce, me, mz, it, ad, ag, al, ei, se = 12
      expect(engDepts.length).toBeGreaterThanOrEqual(8);
      engDepts.forEach((dept) => {
        expect(dept.category).toBe("engineering");
      });
    });

    test("returns technology departments (4 entries)", () => {
      const techDepts = getDepartmentsByCategory("technology");
      expect(techDepts).toHaveLength(4); // ct, tx, ft, fd
      techDepts.forEach((dept) => {
        expect(dept.category).toBe("technology");
      });
    });

    test("returns science departments (1 entry)", () => {
      const sciDepts = getDepartmentsByCategory("science");
      expect(sciDepts).toHaveLength(1); // bt only
      expect(sciDepts[0].code).toBe("BT");
    });

    test("returns interdisciplinary departments (3 entries)", () => {
      const interDepts = getDepartmentsByCategory("interdisciplinary");
      expect(interDepts).toHaveLength(3); // bm, cb, cd
    });

    test("returns empty array for unknown category", () => {
      expect(getDepartmentsByCategory("unknown")).toEqual([]);
    });

    test("returns empty array for null/undefined/non-string input", () => {
      expect(getDepartmentsByCategory(null)).toEqual([]);
      expect(getDepartmentsByCategory(undefined)).toEqual([]);
      expect(getDepartmentsByCategory(123)).toEqual([]);
    });
  });

  // ----------------------------------------------------------
  // getEmailCodeFromOfficial tests
  // ----------------------------------------------------------
  describe("getEmailCodeFromOfficial", () => {
    test("returns lowercase email code for known official codes", () => {
      expect(getEmailCodeFromOfficial("CS")).toBe("cs");
      expect(getEmailCodeFromOfficial("MZ")).toBe("mz");
      expect(getEmailCodeFromOfficial("IT")).toBe("it");
      expect(getEmailCodeFromOfficial("BT")).toBe("bt");
    });

    test("returns null for unknown official codes", () => {
      expect(getEmailCodeFromOfficial("XX")).toBeNull();
      expect(getEmailCodeFromOfficial("ZZ")).toBeNull();
    });

    test("returns null for null/undefined/non-string input", () => {
      expect(getEmailCodeFromOfficial(null)).toBeNull();
      expect(getEmailCodeFromOfficial(undefined)).toBeNull();
      expect(getEmailCodeFromOfficial(42)).toBeNull();
    });

    test("handles lowercase input by normalizing to uppercase", () => {
      expect(getEmailCodeFromOfficial("cs")).toBe("cs");
      expect(getEmailCodeFromOfficial("mz")).toBe("mz");
    });
  });
});

// ============================================================
// 2. ACADEMIC IDENTITY PARSER TESTS
// ============================================================
describe("AcademicIdentityParser", () => {
  // ----------------------------------------------------------
  // _extractAcademicToken tests (internal function)
  // ----------------------------------------------------------
  describe("_extractAcademicToken", () => {
    test("extracts token from standard student email", () => {
      expect(_extractAcademicToken("kamesh.mz23@bitsathy.ac.in")).toBe("mz23");
      expect(_extractAcademicToken("devi.cs24@bitsathy.ac.in")).toBe("cs24");
      expect(_extractAcademicToken("ram.it25@bitsathy.ac.in")).toBe("it25");
    });

    test("extracts token from multi-dot local part (right-to-left search)", () => {
      // The last dot-segment matching pattern wins
      expect(_extractAcademicToken("raj.kumar.it25@bitsathy.ac.in")).toBe(
        "it25",
      );
      expect(_extractAcademicToken("a.b.c.mz23@bitsathy.ac.in")).toBe("mz23");
    });

    test("returns null for faculty/admin emails without academic token", () => {
      expect(_extractAcademicToken("professor@bitsathy.ac.in")).toBeNull();
      expect(_extractAcademicToken("admin@bitsathy.ac.in")).toBeNull();
      expect(_extractAcademicToken("dean.kumar@bitsathy.ac.in")).toBeNull();
    });

    test("returns null for emails with invalid segment formats", () => {
      expect(_extractAcademicToken("kamesh.abc1@bitsathy.ac.in")).toBeNull(); // 3 letters + 1 digit
      expect(_extractAcademicToken("kamesh.m23@bitsathy.ac.in")).toBeNull(); // 1 letter + 2 digits
      expect(_extractAcademicToken("kamesh.mz234@bitsathy.ac.in")).toBeNull(); // 2 letters + 3 digits
    });

    test("returns null for null, undefined, and non-string input", () => {
      expect(_extractAcademicToken(null)).toBeNull();
      expect(_extractAcademicToken(undefined)).toBeNull();
      expect(_extractAcademicToken(42)).toBeNull();
      expect(_extractAcademicToken("")).toBeNull();
    });

    test("returns null for email without @ symbol", () => {
      expect(_extractAcademicToken("not-an-email")).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // _parseAcademicToken tests (internal function)
  // ----------------------------------------------------------
  describe("_parseAcademicToken", () => {
    test("parses valid token with known department code", () => {
      const result = _parseAcademicToken("mz23");
      expect(result.departmentCode).toBe("MZ");
      expect(result.departmentName).toBe("Mechatronics Engineering");
      expect(result.departmentCategory).toBe("engineering");
      expect(result.admissionYear).toBe(2023);
      expect(result.emailDepartmentCode).toBe("mz");
      expect(result.confidence).toBe("HIGH");
      expect(result.reason).toBe("PARSED_FROM_EMAIL");
    });

    test("parses token with unknown department code → LOW confidence", () => {
      const result = _parseAcademicToken("xx23");
      expect(result.departmentCode).toBeNull();
      expect(result.departmentName).toBeNull();
      expect(result.admissionYear).toBe(2023);
      expect(result.emailDepartmentCode).toBe("xx");
      expect(result.confidence).toBe("LOW");
      expect(result.reason).toBe("UNKNOWN_DEPARTMENT_CODE");
    });

    test("handles year 00 → admission year 2000", () => {
      const result = _parseAcademicToken("cs00");
      expect(result.admissionYear).toBe(2000);
    });

    test("handles year 99 → admission year 2099", () => {
      const result = _parseAcademicToken("cs99");
      expect(result.admissionYear).toBe(2099);
    });

    test("returns INVALID_TOKEN_FORMAT for malformed tokens", () => {
      const result = _parseAcademicToken("abc");
      expect(result.departmentCode).toBeNull();
      expect(result.admissionYear).toBeNull();
      expect(result.confidence).toBe("LOW");
      expect(result.reason).toBe("INVALID_TOKEN_FORMAT");
    });

    // Test ALL 20 department codes parse correctly
    test("parses all 20 registered department codes correctly", () => {
      const allCodes = [
        "mz",
        "me",
        "cs",
        "ec",
        "ee",
        "ce",
        "it",
        "ad",
        "ct",
        "tx",
        "ft",
        "fd",
        "bt",
        "bm",
        "cb",
        "cd",
        "ag",
        "al",
        "ei",
        "se",
      ];

      allCodes.forEach((code) => {
        const token = `${code}23`; // e.g., 'mz23'
        const result = _parseAcademicToken(token);
        expect(result.confidence).toBe("HIGH");
        expect(result.departmentCode).toBe(code.toUpperCase());
        expect(result.admissionYear).toBe(2023);
        expect(result.departmentName).toBeTruthy();
        expect(result.departmentCategory).toBeTruthy();
      });
    });
  });

  // ----------------------------------------------------------
  // parseStudentAcademicInfo tests (main public API)
  // ----------------------------------------------------------
  describe("parseStudentAcademicInfo", () => {
    test("parses Kamesh's email → HIGH confidence MZ department", () => {
      const result = parseStudentAcademicInfo("kamesh.mz23@bitsathy.ac.in");
      expect(result.departmentCode).toBe("MZ");
      expect(result.departmentName).toBe("Mechatronics Engineering");
      expect(result.departmentCategory).toBe("engineering");
      expect(result.admissionYear).toBe(2023);
      expect(result.confidence).toBe("HIGH");
      expect(result.source).toBe("EMAIL_PARSER");
      expect(result.requiresManualCompletion).toBe(false);
      expect(result.originalEmail).toBe("kamesh.mz23@bitsathy.ac.in");
      expect(result.academicToken).toBe("mz23");
      expect(result.parsedAt).toBeTruthy(); // Timestamp exists
    });

    test("parses Devi's email → HIGH confidence BT department", () => {
      const result = parseStudentAcademicInfo("devi.bt23@bitsathy.ac.in");
      expect(result.departmentCode).toBe("BT");
      expect(result.departmentName).toBe("Biotechnology");
      expect(result.admissionYear).toBe(2023);
      expect(result.confidence).toBe("HIGH");
    });

    test("parses faculty email (no token) → LOW confidence", () => {
      const result = parseStudentAcademicInfo("professor@bitsathy.ac.in");
      expect(result.departmentCode).toBeNull();
      expect(result.admissionYear).toBeNull();
      expect(result.confidence).toBe("LOW");
      expect(result.source).toBe("EMAIL_PARSE_FAILED");
      expect(result.requiresManualCompletion).toBe(true);
      expect(result.reason).toBe("NO_ACADEMIC_TOKEN");
      expect(result.academicToken).toBeNull();
    });

    test("parses email with unknown dept code → LOW confidence, year still parsed", () => {
      const result = parseStudentAcademicInfo("student.xx23@bitsathy.ac.in");
      expect(result.departmentCode).toBeNull();
      expect(result.admissionYear).toBe(2023); // Year is still available
      expect(result.confidence).toBe("LOW");
      expect(result.requiresManualCompletion).toBe(true);
    });

    test("includes parsedAt timestamp in every result", () => {
      const result = parseStudentAcademicInfo("kamesh.mz23@bitsathy.ac.in");
      expect(result.parsedAt).toBeTruthy();
      // Should be a valid ISO string
      expect(new Date(result.parsedAt).toISOString()).toBe(result.parsedAt);
    });

    test("includes originalEmail in every result", () => {
      const email = "test.cs24@bitsathy.ac.in";
      const result = parseStudentAcademicInfo(email);
      expect(result.originalEmail).toBe(email);
    });
  });

  // ----------------------------------------------------------
  // isAcademicProfileComplete tests
  // ----------------------------------------------------------
  describe("isAcademicProfileComplete", () => {
    test("returns true for HIGH-confidence complete profile", () => {
      const profile = {
        departmentCode: "MZ",
        departmentName: "Mechatronics Engineering",
        admissionYear: 2023,
        confidence: "HIGH",
        source: "EMAIL_PARSER",
      };
      expect(isAcademicProfileComplete(profile)).toBe(true);
    });

    test("returns true for ADMIN_OVERRIDE source even with LOW confidence", () => {
      const profile = {
        departmentCode: "MZ",
        departmentName: "Mechatronics Engineering",
        admissionYear: 2023,
        confidence: "LOW", // LOW confidence...
        source: "ADMIN_OVERRIDE", // ...but admin verified it
      };
      expect(isAcademicProfileComplete(profile)).toBe(true);
    });

    test("returns false when departmentCode is null", () => {
      const profile = {
        departmentCode: null,
        departmentName: null,
        admissionYear: 2023,
        confidence: "LOW",
      };
      expect(isAcademicProfileComplete(profile)).toBe(false);
    });

    test("returns false when departmentName is null", () => {
      const profile = {
        departmentCode: "MZ",
        departmentName: null,
        admissionYear: 2023,
        confidence: "HIGH",
      };
      expect(isAcademicProfileComplete(profile)).toBe(false);
    });

    test("returns false when admissionYear is out of range", () => {
      expect(
        isAcademicProfileComplete({
          departmentCode: "MZ",
          departmentName: "Mechatronics Engineering",
          admissionYear: 1999, // Below 2000
          confidence: "HIGH",
        }),
      ).toBe(false);

      expect(
        isAcademicProfileComplete({
          departmentCode: "MZ",
          departmentName: "Mechatronics Engineering",
          admissionYear: 2100, // Above 2099
          confidence: "HIGH",
        }),
      ).toBe(false);
    });

    test("returns false when confidence is LOW without ADMIN_OVERRIDE", () => {
      const profile = {
        departmentCode: "MZ",
        departmentName: "Mechatronics Engineering",
        admissionYear: 2023,
        confidence: "LOW",
        source: "EMAIL_PARSER",
      };
      expect(isAcademicProfileComplete(profile)).toBe(false);
    });

    test("returns false for null/undefined profile", () => {
      expect(isAcademicProfileComplete(null)).toBe(false);
      expect(isAcademicProfileComplete(undefined)).toBe(false);
    });
  });
});

// ============================================================
// 3. ACADEMIC PROFILE BUILDER TESTS
// ============================================================
describe("AcademicProfileBuilder", () => {
  // ----------------------------------------------------------
  // _calculateAcademicContext tests (internal function)
  // ----------------------------------------------------------
  describe("_calculateAcademicContext", () => {
    test("calculates YEAR_3, EVEN semester for Feb 2026 with 2023 admission", () => {
      // Feb 2026 → academic year 2025, EVEN semester, year 3
      const refDate = new Date("2026-02-15");
      const ctx = _calculateAcademicContext(2023, refDate);
      expect(ctx.currentYear).toBe(3); // 2025 - 2023 + 1
      expect(ctx.currentSemester).toBe("EVEN"); // Feb is EVEN (Dec-May)
      expect(ctx.graduationYear).toBe(2027); // 2023 + 4
      expect(ctx.status).toBe("YEAR_3");
    });

    test("calculates YEAR_1, ODD semester for Aug 2023 with 2023 admission", () => {
      // Aug 2023 → academic year 2023, ODD semester, year 1
      const refDate = new Date("2023-08-15");
      const ctx = _calculateAcademicContext(2023, refDate);
      expect(ctx.currentYear).toBe(1); // 2023 - 2023 + 1
      expect(ctx.currentSemester).toBe("ODD"); // Aug is ODD (Jun-Nov)
      expect(ctx.status).toBe("YEAR_1");
    });

    test("calculates YEAR_4, ODD semester for Oct 2026 with 2023 admission", () => {
      // Oct 2026 → academic year 2026, ODD semester, year 4
      const refDate = new Date("2026-10-15");
      const ctx = _calculateAcademicContext(2023, refDate);
      expect(ctx.currentYear).toBe(4); // 2026 - 2023 + 1
      expect(ctx.currentSemester).toBe("ODD"); // Oct is ODD
      expect(ctx.status).toBe("YEAR_4");
    });

    test("calculates ALUMNI status for post-graduation dates", () => {
      // Aug 2028 → academic year 2028, yearOfStudy = 6 → ALUMNI
      const refDate = new Date("2028-08-15");
      const ctx = _calculateAcademicContext(2023, refDate);
      expect(ctx.currentYear).toBe(6); // 2028 - 2023 + 1 = 6
      expect(ctx.status).toBe("ALUMNI");
    });

    test("calculates NOT_STARTED for pre-admission dates", () => {
      // Jan 2023 → academic year 2022, yearOfStudy = 0 → NOT_STARTED
      const refDate = new Date("2023-01-15");
      const ctx = _calculateAcademicContext(2023, refDate);
      expect(ctx.currentYear).toBe(0); // 2022 - 2023 + 1 = 0
      expect(ctx.status).toBe("NOT_STARTED");
    });

    test("returns UNKNOWN status for null admission year", () => {
      const ctx = _calculateAcademicContext(null);
      expect(ctx.currentYear).toBeNull();
      expect(ctx.currentSemester).toBeNull();
      expect(ctx.graduationYear).toBeNull();
      expect(ctx.status).toBe("UNKNOWN");
    });

    // Semester boundary tests
    test("June is ODD semester (boundary test)", () => {
      const refDate = new Date("2025-06-01");
      const ctx = _calculateAcademicContext(2023, refDate);
      expect(ctx.currentSemester).toBe("ODD");
    });

    test("November is ODD semester (boundary test)", () => {
      const refDate = new Date("2025-11-30");
      const ctx = _calculateAcademicContext(2023, refDate);
      expect(ctx.currentSemester).toBe("ODD");
    });

    test("December is EVEN semester (boundary test)", () => {
      const refDate = new Date("2025-12-01");
      const ctx = _calculateAcademicContext(2023, refDate);
      expect(ctx.currentSemester).toBe("EVEN");
    });

    test("May is EVEN semester (boundary test)", () => {
      const refDate = new Date("2026-05-31");
      const ctx = _calculateAcademicContext(2023, refDate);
      expect(ctx.currentSemester).toBe("EVEN");
    });
  });

  // ----------------------------------------------------------
  // buildAcademicProfile tests (main public API)
  // ----------------------------------------------------------
  describe("buildAcademicProfile", () => {
    // Standard person data for tests
    const personData = {
      identity_id: "6f51981c-aaaa-bbbb-cccc-dddddddddddd",
      person_type: "student",
    };

    test("builds HIGH-confidence profile for student email", () => {
      const refDate = new Date("2026-02-15");
      const profile = buildAcademicProfile(
        personData,
        "kamesh.mz23@bitsathy.ac.in",
        refDate,
      );

      // Identity fields
      expect(profile.identityId).toBe("6f51981c-aaaa-bbbb-cccc-dddddddddddd");
      expect(profile.personType).toBe("student");

      // Parsed academic fields
      expect(profile.departmentCode).toBe("MZ");
      expect(profile.departmentName).toBe("Mechatronics Engineering");
      expect(profile.departmentCategory).toBe("engineering");
      expect(profile.admissionYear).toBe(2023);

      // Calculated context
      expect(profile.currentAcademicYear).toBe(3);
      expect(profile.currentSemester).toBe("EVEN");
      expect(profile.expectedGraduationYear).toBe(2027);
      expect(profile.academicStatus).toBe("YEAR_3");

      // Confidence and completeness
      expect(profile.academicConfidence).toBe("HIGH");
      expect(profile.academicSource).toBe("EMAIL_PARSER");
      expect(profile.requiresManualCompletion).toBe(false);
      expect(profile.isComplete).toBe(true);
    });

    test("builds LOW-confidence profile for faculty email", () => {
      const profile = buildAcademicProfile(
        { identity_id: "prof-id", person_type: "faculty" },
        "professor@bitsathy.ac.in",
      );

      // No department/year inferred
      expect(profile.departmentCode).toBeNull();
      expect(profile.admissionYear).toBeNull();
      expect(profile.academicConfidence).toBe("LOW");
      expect(profile.academicSource).toBe("EMAIL_PARSE_FAILED");
      expect(profile.requiresManualCompletion).toBe(true);
      expect(profile.isComplete).toBe(false);

      // Academic context is UNKNOWN
      expect(profile.academicStatus).toBe("UNKNOWN");
      expect(profile.currentSemester).toBeNull();
    });

    test("returned profile is frozen (immutable)", () => {
      const profile = buildAcademicProfile(
        personData,
        "kamesh.mz23@bitsathy.ac.in",
      );
      expect(Object.isFrozen(profile)).toBe(true);
    });

    test("includes profileVersion and profileBuiltAt metadata", () => {
      const profile = buildAcademicProfile(
        personData,
        "kamesh.mz23@bitsathy.ac.in",
      );
      expect(profile.profileVersion).toBe("1.0");
      expect(profile.profileBuiltAt).toBeTruthy();
    });
  });

  // ----------------------------------------------------------
  // validateAcademicProfileForStorage tests
  // ----------------------------------------------------------
  describe("validateAcademicProfileForStorage", () => {
    const validProfile = {
      identityId: "6f51981c-aaaa-bbbb-cccc-dddddddddddd",
      personType: "student",
      departmentCode: "MZ",
      departmentName: "Mechatronics Engineering",
      admissionYear: 2023,
      academicConfidence: "HIGH",
      academicSource: "EMAIL_PARSER",
    };

    test("returns true for a valid complete profile", () => {
      expect(validateAcademicProfileForStorage(validProfile)).toBe(true);
    });

    test("throws AcademicProfileValidationError for missing identityId", () => {
      const invalid = { ...validProfile, identityId: null };
      expect(() => validateAcademicProfileForStorage(invalid)).toThrow(
        AcademicProfileValidationError,
      );
    });

    test("throws for missing personType", () => {
      const invalid = { ...validProfile, personType: null };
      expect(() => validateAcademicProfileForStorage(invalid)).toThrow(
        AcademicProfileValidationError,
      );
    });

    test("throws for departmentCode without departmentName", () => {
      const invalid = { ...validProfile, departmentName: null };
      expect(() => validateAcademicProfileForStorage(invalid)).toThrow(
        AcademicProfileValidationError,
      );
      try {
        validateAcademicProfileForStorage(invalid);
      } catch (e) {
        expect(
          e.metadata.errors.some((err) => /registry bypass/i.test(err)),
        ).toBe(true);
      }
    });

    test("throws for admissionYear out of range", () => {
      const tooOld = { ...validProfile, admissionYear: 1990 };
      expect(() => validateAcademicProfileForStorage(tooOld)).toThrow(
        AcademicProfileValidationError,
      );

      const tooNew = { ...validProfile, admissionYear: 2100 };
      expect(() => validateAcademicProfileForStorage(tooNew)).toThrow(
        AcademicProfileValidationError,
      );
    });

    test("throws for invalid confidence level", () => {
      const invalid = { ...validProfile, academicConfidence: "MEDIUM" };
      expect(() => validateAcademicProfileForStorage(invalid)).toThrow(
        AcademicProfileValidationError,
      );
      try {
        validateAcademicProfileForStorage(invalid);
      } catch (e) {
        expect(e.metadata.errors.some((err) => /confidence/i.test(err))).toBe(
          true,
        );
      }
    });

    test("throws for invalid source", () => {
      const invalid = { ...validProfile, academicSource: "MAGIC" };
      expect(() => validateAcademicProfileForStorage(invalid)).toThrow(
        AcademicProfileValidationError,
      );
      try {
        validateAcademicProfileForStorage(invalid);
      } catch (e) {
        expect(e.metadata.errors.some((err) => /source/i.test(err))).toBe(true);
      }
    });

    test("error has status 422 and metadata", () => {
      try {
        validateAcademicProfileForStorage({
          ...validProfile,
          identityId: null,
        });
        fail("Should have thrown"); // Should never reach here
      } catch (error) {
        expect(error).toBeInstanceOf(AcademicProfileValidationError);
        expect(error.status).toBe(422);
        expect(error.metadata).toBeDefined();
        expect(error.metadata.errors).toBeInstanceOf(Array);
        expect(error.timestamp).toBeTruthy();
      }
    });

    test("allows profile without optional fields (admissionYear null)", () => {
      const minimal = {
        identityId: "abc-123",
        personType: "faculty",
        departmentCode: null,
        departmentName: null,
        admissionYear: null,
        academicConfidence: "LOW",
        academicSource: "EMAIL_PARSE_FAILED",
      };
      expect(validateAcademicProfileForStorage(minimal)).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AcademicProfileValidationError class tests
  // ----------------------------------------------------------
  describe("AcademicProfileValidationError", () => {
    test("is an instance of Error", () => {
      const err = new AcademicProfileValidationError("test");
      expect(err).toBeInstanceOf(Error);
    });

    test("has correct name, status, and timestamp", () => {
      const err = new AcademicProfileValidationError("test msg", {
        errors: ["e1"],
      });
      expect(err.name).toBe("AcademicProfileValidationError");
      expect(err.message).toBe("test msg");
      expect(err.status).toBe(422);
      expect(err.metadata.errors).toEqual(["e1"]);
      expect(err.timestamp).toBeTruthy();
    });
  });
});

// ============================================================
// 4. ACADEMIC INTEGRITY GUARD TESTS
// ============================================================
describe("AcademicIntegrityGuard", () => {
  // ----------------------------------------------------------
  // validateDepartmentIntegrity tests
  // ----------------------------------------------------------
  describe("validateDepartmentIntegrity", () => {
    test("passes for valid department code without name", () => {
      const result = validateDepartmentIntegrity("MZ");
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    test("passes for valid department code with matching name", () => {
      const result = validateDepartmentIntegrity(
        "MZ",
        "Mechatronics Engineering",
      );
      expect(result.passed).toBe(true);
    });

    test("fails for null department code", () => {
      const result = validateDepartmentIntegrity(null);
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    test("fails for invalid format (lowercase)", () => {
      const result = validateDepartmentIntegrity("mz");
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.stringContaining("not a valid 2-letter uppercase code"),
      );
    });

    test("fails for unknown department code", () => {
      const result = validateDepartmentIntegrity("XX");
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.stringContaining("not recognized"),
      );
    });

    test("fails for mismatched department name", () => {
      const result = validateDepartmentIntegrity("CS", "Wrong Name");
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.stringContaining("name mismatch"),
      );
    });

    test("includes checkedAt timestamp in every result", () => {
      const result = validateDepartmentIntegrity("CS");
      expect(result.checkedAt).toBeTruthy();
    });
  });

  // ----------------------------------------------------------
  // validateAdmissionYearIntegrity tests
  // ----------------------------------------------------------
  describe("validateAdmissionYearIntegrity", () => {
    test("passes for valid admission year (2023)", () => {
      const result = validateAdmissionYearIntegrity(2023);
      expect(result.passed).toBe(true);
    });

    test("passes for boundary year 2000", () => {
      const result = validateAdmissionYearIntegrity(2000);
      expect(result.passed).toBe(true);
    });

    test("fails for null admission year", () => {
      const result = validateAdmissionYearIntegrity(null);
      expect(result.passed).toBe(false);
    });

    test("fails for non-number type", () => {
      const result = validateAdmissionYearIntegrity("2023");
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.stringContaining("not a valid number"),
      );
    });

    test("fails for NaN", () => {
      const result = validateAdmissionYearIntegrity(NaN);
      expect(result.passed).toBe(false);
    });

    test("fails for decimal year", () => {
      const result = validateAdmissionYearIntegrity(2023.5);
      expect(result.passed).toBe(false);
    });

    test("fails for year below 2000", () => {
      const result = validateAdmissionYearIntegrity(1999);
      expect(result.passed).toBe(false);
    });

    test("fails for year above 2099", () => {
      const result = validateAdmissionYearIntegrity(2100);
      expect(result.passed).toBe(false);
    });

    test("fails for year more than 1 year in the future", () => {
      const refDate = new Date("2026-02-15");
      const result = validateAdmissionYearIntegrity(2028, refDate);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.stringContaining("future"),
      );
    });

    test("passes for year exactly 1 year in the future (early admission)", () => {
      const refDate = new Date("2026-02-15");
      const result = validateAdmissionYearIntegrity(2027, refDate);
      expect(result.passed).toBe(true);
    });

    test("includes checkedAt timestamp in every result", () => {
      const result = validateAdmissionYearIntegrity(2023);
      expect(result.checkedAt).toBeTruthy();
    });
  });

  // ----------------------------------------------------------
  // crossValidateEmailVsStored tests
  // ----------------------------------------------------------
  describe("crossValidateEmailVsStored", () => {
    test("passes when email and stored data match", () => {
      const result = crossValidateEmailVsStored("kamesh.mz23@bitsathy.ac.in", {
        departmentCode: "MZ",
        admissionYear: 2023,
      });
      expect(result.passed).toBe(true);
      expect(result.discrepancies).toHaveLength(0);
      expect(result.skipped).toBe(false);
    });

    test("fails when department codes mismatch", () => {
      const result = crossValidateEmailVsStored("kamesh.mz23@bitsathy.ac.in", {
        departmentCode: "CS",
        admissionYear: 2023,
      });
      expect(result.passed).toBe(false);
      expect(result.discrepancies.length).toBeGreaterThan(0);
      expect(result.discrepancies[0]).toContain("Department mismatch");
    });

    test("fails when admission years mismatch", () => {
      const result = crossValidateEmailVsStored("kamesh.mz23@bitsathy.ac.in", {
        departmentCode: "MZ",
        admissionYear: 2024,
      });
      expect(result.passed).toBe(false);
      expect(result.discrepancies[0]).toContain("year mismatch");
    });

    test("skips validation when email parsing returns LOW confidence", () => {
      // Faculty email — no academic token
      const result = crossValidateEmailVsStored("professor@bitsathy.ac.in", {
        departmentCode: "CS",
        admissionYear: 2023,
      });
      expect(result.passed).toBe(true); // Can't fail what wasn't checked
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBeTruthy();
    });

    test("includes inferredData in result", () => {
      const result = crossValidateEmailVsStored("kamesh.mz23@bitsathy.ac.in", {
        departmentCode: "MZ",
        admissionYear: 2023,
      });
      expect(result.inferredData).toBeDefined();
      expect(result.inferredData.departmentCode).toBe("MZ");
      expect(result.inferredData.admissionYear).toBe(2023);
    });

    test("includes checkedAt timestamp", () => {
      const result = crossValidateEmailVsStored("kamesh.mz23@bitsathy.ac.in", {
        departmentCode: "MZ",
        admissionYear: 2023,
      });
      expect(result.checkedAt).toBeTruthy();
    });
  });

  // ----------------------------------------------------------
  // runFullIntegrityCheck tests
  // ----------------------------------------------------------
  describe("runFullIntegrityCheck", () => {
    test("passes for fully valid profile with matching email", () => {
      const profile = {
        departmentCode: "MZ",
        departmentName: "Mechatronics Engineering",
        admissionYear: 2023,
      };
      const result = runFullIntegrityCheck(
        profile,
        "kamesh.mz23@bitsathy.ac.in",
      );
      expect(result.passed).toBe(true);
      expect(result.totalIssues).toBe(0);
      expect(result.checks.department.passed).toBe(true);
      expect(result.checks.admissionYear.passed).toBe(true);
      expect(result.checks.crossValidation.passed).toBe(true);
    });

    test("fails for invalid department code and catches all issues", () => {
      const profile = {
        departmentCode: "XX",
        departmentName: "Fake Department",
        admissionYear: 1990,
      };
      const result = runFullIntegrityCheck(profile);
      expect(result.passed).toBe(false);
      expect(result.totalIssues).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.type === "department")).toBe(true);
      expect(result.issues.some((i) => i.type === "year")).toBe(true);
    });

    test("returns null crossValidation when email is not provided", () => {
      const profile = {
        departmentCode: "MZ",
        departmentName: "Mechatronics Engineering",
        admissionYear: 2023,
      };
      const result = runFullIntegrityCheck(profile);
      expect(result.checks.crossValidation).toBeNull();
    });

    test("detects cross-validation discrepancy in full check", () => {
      const profile = {
        departmentCode: "CS",
        departmentName: "Computer Science Engineering",
        admissionYear: 2023,
      };
      // Email says MZ but profile says CS
      const result = runFullIntegrityCheck(
        profile,
        "kamesh.mz23@bitsathy.ac.in",
      );
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.type === "cross")).toBe(true);
    });

    test("includes checkedAt timestamp", () => {
      const result = runFullIntegrityCheck({
        departmentCode: "MZ",
        admissionYear: 2023,
      });
      expect(result.checkedAt).toBeTruthy();
    });
  });
});

// ============================================================
// 5. ACADEMIC PROFILE MIDDLEWARE TESTS
// ============================================================
describe("academicProfileMiddleware", () => {
  // Mock logger before importing middleware
  jest.mock("../../../../utils/logger", () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }));

  // Import middleware AFTER mocking logger
  const academicProfileMiddleware = require("../../../../middleware/academicProfileMiddleware");

  // Helper: create mock req/res/next
  const createMockReqResNext = (user = null) => {
    const req = { user: user };
    const res = {};
    const next = jest.fn();
    return { req, res, next };
  };

  test("sets req.academicProfile for authenticated student user", () => {
    const { req, res, next } = createMockReqResNext({
      userId: "6f51981c-aaaa-bbbb-cccc-dddddddddddd",
      email: "kamesh.mz23@bitsathy.ac.in",
      role: "student",
    });

    academicProfileMiddleware(req, res, next);

    expect(req.academicProfile).toBeDefined();
    expect(req.academicProfile.departmentCode).toBe("MZ");
    expect(req.academicProfile.academicConfidence).toBe("HIGH");
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("sets req.academicProfile = null when no authenticated user", () => {
    const { req, res, next } = createMockReqResNext(null);

    academicProfileMiddleware(req, res, next);

    expect(req.academicProfile).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("sets req.academicProfile = null when user has no email", () => {
    const { req, res, next } = createMockReqResNext({
      userId: "abc-123",
      email: null,
      role: "student",
    });

    academicProfileMiddleware(req, res, next);

    expect(req.academicProfile).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("sets LOW-confidence profile for faculty email", () => {
    const { req, res, next } = createMockReqResNext({
      userId: "faculty-id",
      email: "professor@bitsathy.ac.in",
      role: "faculty",
    });

    academicProfileMiddleware(req, res, next);

    expect(req.academicProfile).toBeDefined();
    expect(req.academicProfile.departmentCode).toBeNull();
    expect(req.academicProfile.academicConfidence).toBe("LOW");
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("always calls next() even if parsing fails", () => {
    // Even with a weird user object, next() must be called
    const { req, res, next } = createMockReqResNext({
      userId: "test-id",
      email: "kamesh.mz23@bitsathy.ac.in",
      role: "student",
    });

    academicProfileMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // next() should not have been called with an error
    expect(next).toHaveBeenCalledWith();
  });

  test("profile includes identity fields from req.user", () => {
    const { req, res, next } = createMockReqResNext({
      userId: "my-user-id",
      email: "kamesh.mz23@bitsathy.ac.in",
      role: "student",
    });

    academicProfileMiddleware(req, res, next);

    expect(req.academicProfile.identityId).toBe("my-user-id");
    expect(req.academicProfile.personType).toBe("student");
  });
});

// ============================================================
// 6. DEPARTMENT REGISTRY DATA INTEGRITY TESTS
// ============================================================
describe("Department Registry Data Integrity", () => {
  test("DEPARTMENT_REGISTRY is frozen (immutable)", () => {
    expect(Object.isFrozen(DEPARTMENT_REGISTRY)).toBe(true);
  });

  test("each registry entry is frozen", () => {
    for (const [emailCode, dept] of Object.entries(DEPARTMENT_REGISTRY)) {
      expect(Object.isFrozen(dept)).toBe(true);
    }
  });

  test("all email codes are 2 lowercase letters", () => {
    for (const emailCode of Object.keys(DEPARTMENT_REGISTRY)) {
      expect(emailCode).toMatch(/^[a-z]{2}$/);
    }
  });

  test("all official codes are 2 uppercase letters", () => {
    for (const dept of Object.values(DEPARTMENT_REGISTRY)) {
      expect(dept.code).toMatch(/^[A-Z]{2}$/);
    }
  });

  test("email code uppercased matches official code", () => {
    for (const [emailCode, dept] of Object.entries(DEPARTMENT_REGISTRY)) {
      expect(emailCode.toUpperCase()).toBe(dept.code);
    }
  });

  test("all departments have a non-empty name", () => {
    for (const dept of Object.values(DEPARTMENT_REGISTRY)) {
      expect(dept.name).toBeTruthy();
      expect(typeof dept.name).toBe("string");
      expect(dept.name.length).toBeGreaterThan(0);
    }
  });

  test("all departments have a valid category", () => {
    const validCategories = [
      "engineering",
      "technology",
      "science",
      "interdisciplinary",
    ];
    for (const dept of Object.values(DEPARTMENT_REGISTRY)) {
      expect(validCategories).toContain(dept.category);
    }
  });

  test("registry has exactly 20 entries", () => {
    expect(Object.keys(DEPARTMENT_REGISTRY)).toHaveLength(20);
  });
});

// ============================================================
// 7. END-TO-END PARSING PIPELINE TESTS
// ============================================================
describe("End-to-End Academic Parsing Pipeline", () => {
  // These tests verify the full pipeline from email to
  // validated academic profile, testing module integration.

  test("full pipeline: email → parse → build → validate → integrity check", () => {
    const email = "kamesh.mz23@bitsathy.ac.in";
    const refDate = new Date("2026-02-15");

    // Step 1: Parse email
    const parsed = parseStudentAcademicInfo(email);
    expect(parsed.confidence).toBe("HIGH");

    // Step 2: Build profile
    const profile = buildAcademicProfile(
      { identity_id: "test-id", person_type: "student" },
      email,
      refDate,
    );
    expect(profile.isComplete).toBe(true);

    // Step 3: Validate for storage
    expect(validateAcademicProfileForStorage(profile)).toBe(true);

    // Step 4: Integrity check
    const integrity = runFullIntegrityCheck(
      {
        departmentCode: profile.departmentCode,
        departmentName: profile.departmentName,
        admissionYear: profile.admissionYear,
      },
      email,
    );
    expect(integrity.passed).toBe(true);
  });

  test("full pipeline: faculty email → LOW confidence throughout", () => {
    const email = "professor@bitsathy.ac.in";

    // Step 1: Parse
    const parsed = parseStudentAcademicInfo(email);
    expect(parsed.confidence).toBe("LOW");

    // Step 2: Build
    const profile = buildAcademicProfile(
      { identity_id: "prof-id", person_type: "faculty" },
      email,
    );
    expect(profile.isComplete).toBe(false);
    expect(profile.requiresManualCompletion).toBe(true);
  });

  test("all 20 department emails parse through the full pipeline", () => {
    const allCodes = Object.keys(DEPARTMENT_REGISTRY);
    const refDate = new Date("2026-02-15");

    allCodes.forEach((code) => {
      const email = `student.${code}23@bitsathy.ac.in`;

      // Parse
      const parsed = parseStudentAcademicInfo(email);
      expect(parsed.confidence).toBe("HIGH");
      expect(parsed.departmentCode).toBe(code.toUpperCase());

      // Build
      const profile = buildAcademicProfile(
        { identity_id: `id-${code}`, person_type: "student" },
        email,
        refDate,
      );
      expect(profile.isComplete).toBe(true);
      expect(profile.currentAcademicYear).toBe(3); // 2025 academic year - 2023 + 1

      // Validate
      expect(validateAcademicProfileForStorage(profile)).toBe(true);
    });
  });
});

// ============================================================
// 7. DISPLAY NAME EXTRACTION FROM EMAIL TESTS
// ============================================================
describe("extractDisplayNameFromEmail", () => {
  test("extracts name from student email (single name)", () => {
    expect(extractDisplayNameFromEmail("kamesh.mz23@bitsathy.ac.in")).toBe(
      "Kamesh",
    );
  });

  test("extracts name from student email (multi-part name)", () => {
    expect(extractDisplayNameFromEmail("raj.kumar.it25@bitsathy.ac.in")).toBe(
      "Raj Kumar",
    );
  });

  test("extracts name from faculty email (no token)", () => {
    expect(extractDisplayNameFromEmail("professor@bitsathy.ac.in")).toBe(
      "Professor",
    );
  });

  test("extracts name from dotted faculty email", () => {
    expect(extractDisplayNameFromEmail("dr.priya@bitsathy.ac.in")).toBe(
      "Dr Priya",
    );
  });

  test("handles single segment with token", () => {
    // Edge case: the entire local part IS the token
    // e.g., 'mz23@bitsathy.ac.in' — all filtered → fallback
    expect(extractDisplayNameFromEmail("mz23@bitsathy.ac.in")).toBe("Mz23");
  });

  test("returns 'User' for null/undefined input", () => {
    expect(extractDisplayNameFromEmail(null)).toBe("User");
    expect(extractDisplayNameFromEmail(undefined)).toBe("User");
    expect(extractDisplayNameFromEmail("")).toBe("User");
  });

  test("handles non-standard email format", () => {
    expect(extractDisplayNameFromEmail("no-at-sign")).toBe("User");
  });

  test("capitalizes each word properly", () => {
    expect(
      extractDisplayNameFromEmail("sathikmansurb.mz23@bitsathy.ac.in"),
    ).toBe("Sathikmansurb");
  });

  test("handles email with multiple dots and token", () => {
    expect(
      extractDisplayNameFromEmail("first.middle.last.cs24@bitsathy.ac.in"),
    ).toBe("First Middle Last");
  });
});
