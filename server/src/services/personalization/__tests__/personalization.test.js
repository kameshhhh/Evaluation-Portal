// ============================================================
// PERSONALIZATION UNIT TESTS
// ============================================================
// Tests for PersonProfileLinker, PersonalizationCache,
// DashboardBuilder, and PersonalizationService.
//
// All database dependencies are mocked.
// Tests verify the data transformation logic, not DB queries.
// ============================================================

// ============================================================
// MOCK SETUP — Must be before imports
// ============================================================

// Mock the database module
jest.mock("../../../config/database", () => ({
  query: jest.fn(), // Mock query function
  getClient: jest.fn(), // Mock client function
  pool: {}, // Empty pool object
}));

// Mock the PersonRepository
jest.mock("../../../repositories/PersonRepository", () => ({
  findByIdentityId: jest.fn(), // Mock identity lookup
  findById: jest.fn(), // Mock ID lookup
  create: jest.fn(), // Mock person creation (for auto-create)
}));

// Mock the logger to suppress output during tests
jest.mock("../../../utils/logger", () => ({
  debug: jest.fn(), // Suppress debug logs
  info: jest.fn(), // Suppress info logs
  warn: jest.fn(), // Suppress warn logs
  error: jest.fn(), // Suppress error logs
}));

// ============================================================
// IMPORTS — After mocks are set up
// ============================================================

const PersonProfileLinker = require("../PersonProfileLinker");
const { PersonalizationCacheClass } = require("../PersonalizationCache");
const DashboardBuilder = require("../DashboardBuilder");
const { query } = require("../../../config/database");
const PersonRepository = require("../../../repositories/PersonRepository");

// ============================================================
// TEST DATA FIXTURES
// ============================================================

// Sample auth user (from req.user set by auth middleware)
const mockAuthUser = {
  id: "6f51981c-aaaa-bbbb-cccc-dddddddddddd",
  email: "kamesh@bitsathy.ac.in",
  role: "student",
  name: "Kamesh Kumar",
};

// Sample PEMM person (from PersonRepository)
const mockPerson = {
  personId: "8037a704-9022-49be-8c2b-89cf11c32d6b",
  identityId: "6f51981c-aaaa-bbbb-cccc-dddddddddddd",
  displayName: "Kamesh Kumar",
  personType: "student",
  departmentCode: "CSE",
  admissionYear: 2023,
  graduationYear: 2027,
  status: "active",
  version: 1,
};

// Sample project membership (from getPersonProjects query)
const mockProjects = [
  {
    project_id: "40218f88-e808-4b14-801f-baf5af41b9e7",
    role_in_project: "leader",
    declared_share_percentage: 50,
    joined_at: "2025-07-01",
    is_active: true,
    project_title: "AI-Powered Attendance System",
    project_description: "Automated attendance using face recognition",
    project_status: "under_review",
    academic_year: 2025,
    semester: 1,
    start_date: "2025-07-01",
    expected_end_date: "2025-12-31",
    frozen_at: "2025-07-01T10:00:00.000Z",
  },
];

// Sample team counts
const mockTeamCounts = { "40218f88-e808-4b14-801f-baf5af41b9e7": 2 };

// ============================================================
// TEST SUITE: PersonProfileLinker
// ============================================================
describe("PersonProfileLinker", () => {
  // Create a fresh instance for each test
  let linker;

  beforeEach(() => {
    // Create new linker instance
    linker = new PersonProfileLinker();
    // Clear all mock call history
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------
  // linkAuthToPerson — when PEMM person exists
  // ---------------------------------------------------------
  test("linkAuthToPerson returns enriched context when person exists", async () => {
    // Arrange: PersonRepository finds a matching person
    PersonRepository.findByIdentityId.mockResolvedValue(mockPerson);

    // Act: Link the auth user to their PEMM person
    const result = await linker.linkAuthToPerson(mockAuthUser);

    // Assert: Repository was called with the correct identity ID
    expect(PersonRepository.findByIdentityId).toHaveBeenCalledWith(
      mockAuthUser.id,
    );

    // Assert: Result contains both auth and PEMM data
    expect(result.authId).toBe(mockAuthUser.id);
    expect(result.email).toBe(mockAuthUser.email);
    expect(result.personId).toBe(mockPerson.personId);
    expect(result.personType).toBe("student");
    expect(result.departmentCode).toBe("CSE");
    expect(result.profileComplete).toBe(true);
    expect(result.profileLinked).toBe(true);
  });

  // ---------------------------------------------------------
  // linkAuthToPerson — when no PEMM person exists (bitsathy faculty email)
  // Auto-creates a faculty person for @bitsathy.ac.in emails
  // ---------------------------------------------------------
  test("linkAuthToPerson auto-creates faculty person for bitsathy email", async () => {
    // Arrange: PersonRepository finds nothing, then create returns a new person
    PersonRepository.findByIdentityId.mockResolvedValue(null);
    PersonRepository.create.mockResolvedValue({
      personId: "auto-created-id",
      identityId: mockAuthUser.id,
      displayName: "Kamesh Kumar",
      personType: "faculty",
      departmentCode: null,
      admissionYear: null,
      graduationYear: null,
      status: "active",
      version: 1,
    });

    // Act: Link the auth user (faculty email — no dept token)
    const result = await linker.linkAuthToPerson(mockAuthUser);

    // Assert: Person was auto-created
    expect(PersonRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: mockAuthUser.id,
        personType: "faculty",
        displayName: "Kamesh Kumar",
      }),
    );

    // Assert: Result is enriched (not unlinked)
    expect(result.authId).toBe(mockAuthUser.id);
    expect(result.email).toBe(mockAuthUser.email);
    expect(result.personId).toBe("auto-created-id");
    expect(result.profileComplete).toBe(true);
    expect(result.profileLinked).toBe(true);
  });

  // ---------------------------------------------------------
  // linkAuthToPerson — auto-creates student for HIGH-confidence email
  // ---------------------------------------------------------
  test("linkAuthToPerson auto-creates student for HIGH-confidence email", async () => {
    // Student auth user with academic token in email
    const studentAuthUser = {
      id: "student-uuid",
      email: "sathik.mz23@bitsathy.ac.in",
      role: "student",
      name: "SATHIK MANSUR B",
    };

    // Arrange: No existing person
    PersonRepository.findByIdentityId.mockResolvedValue(null);
    PersonRepository.create.mockResolvedValue({
      personId: "new-student-id",
      identityId: "student-uuid",
      displayName: "SATHIK MANSUR B",
      personType: "student",
      departmentCode: "MZ",
      admissionYear: 2023,
      graduationYear: 2027,
      status: "active",
      version: 1,
    });

    // Act: Link the auth user
    const result = await linker.linkAuthToPerson(studentAuthUser);

    // Assert: Person was auto-created as student
    expect(PersonRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: "student-uuid",
        personType: "student",
        departmentCode: "MZ",
        admissionYear: 2023,
        graduationYear: 2027,
        displayName: "SATHIK MANSUR B",
      }),
    );

    // Assert: Result is enriched student dashboard data
    expect(result.profileComplete).toBe(true);
    expect(result.personType).toBe("student");
    expect(result.departmentCode).toBe("MZ");
    expect(result.admissionYear).toBe(2023);
  });

  // ---------------------------------------------------------
  // linkAuthToPerson — returns unlinked for non-bitsathy email
  // ---------------------------------------------------------
  test("linkAuthToPerson returns unlinked context for non-bitsathy email", async () => {
    // Non-bitsathy email — can't auto-create
    const externalUser = {
      id: "external-uuid",
      email: "user@gmail.com",
      role: "student",
      name: "External User",
    };

    // Arrange: PersonRepository finds nothing
    PersonRepository.findByIdentityId.mockResolvedValue(null);

    // Act: Link the auth user
    const result = await linker.linkAuthToPerson(externalUser);

    // Assert: No auto-creation attempted
    expect(PersonRepository.create).not.toHaveBeenCalled();

    // Assert: Context is auth-only with profileComplete: false
    expect(result.authId).toBe("external-uuid");
    expect(result.personId).toBeNull();
    expect(result.profileComplete).toBe(false);
    expect(result.profileLinked).toBe(false);
  });

  // ---------------------------------------------------------
  // enrichAuthWithPerson — creates combined context
  // ---------------------------------------------------------
  test("enrichAuthWithPerson combines auth and person data", () => {
    // Act: Combine auth user with PEMM person
    const result = linker.enrichAuthWithPerson(mockAuthUser, mockPerson);

    // Assert: All fields are properly mapped
    expect(result.authId).toBe(mockAuthUser.id);
    expect(result.email).toBe(mockAuthUser.email);
    expect(result.authRole).toBe("student");
    expect(result.displayName).toBe("Kamesh Kumar");
    expect(result.personId).toBe(mockPerson.personId);
    expect(result.personType).toBe("student");
    expect(result.departmentCode).toBe("CSE");
    expect(result.admissionYear).toBe(2023);
    expect(result.graduationYear).toBe(2027);
    expect(result.status).toBe("active");
    expect(result.version).toBe(1);
    expect(result.profileComplete).toBe(true);
    expect(result.profileLinked).toBe(true);
  });

  // ---------------------------------------------------------
  // buildUnlinkedContext — auth-only fallback
  // ---------------------------------------------------------
  test("buildUnlinkedContext returns auth-only data with nulls", () => {
    // Act: Build unlinked context
    const result = linker.buildUnlinkedContext(mockAuthUser);

    // Assert: Auth fields are present, PEMM fields are null
    expect(result.authId).toBe(mockAuthUser.id);
    expect(result.email).toBe(mockAuthUser.email);
    expect(result.displayName).toBe("Kamesh Kumar");
    expect(result.personId).toBeNull();
    expect(result.departmentCode).toBeNull();
    expect(result.profileComplete).toBe(false);
    expect(result.profileLinked).toBe(false);
  });

  // ---------------------------------------------------------
  // getPersonProjects — fetches project memberships
  // ---------------------------------------------------------
  test("getPersonProjects queries and returns project rows", async () => {
    // Arrange: Mock the DB query result
    query.mockResolvedValue({ rows: mockProjects });

    // Act: Fetch projects for a person
    const result = await linker.getPersonProjects(mockPerson.personId);

    // Assert: Query was called with person ID
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM project_members"),
      [mockPerson.personId],
    );

    // Assert: Returns the row data
    expect(result).toHaveLength(1);
    expect(result[0].project_title).toBe("AI-Powered Attendance System");
  });

  // ---------------------------------------------------------
  // getProjectTeamCounts — counts members per project
  // ---------------------------------------------------------
  test("getProjectTeamCounts returns member count map", async () => {
    // Arrange: Mock the DB count query
    query.mockResolvedValue({
      rows: [
        {
          project_id: "40218f88-e808-4b14-801f-baf5af41b9e7",
          member_count: "2",
        },
      ],
    });

    // Act: Get team counts
    const result = await linker.getProjectTeamCounts([
      "40218f88-e808-4b14-801f-baf5af41b9e7",
    ]);

    // Assert: Returns a map of projectId → count
    expect(result["40218f88-e808-4b14-801f-baf5af41b9e7"]).toBe(2);
  });

  // ---------------------------------------------------------
  // getProjectTeamCounts — handles empty array
  // ---------------------------------------------------------
  test("getProjectTeamCounts returns empty map for no projects", async () => {
    // Act: Pass empty project IDs
    const result = await linker.getProjectTeamCounts([]);

    // Assert: Returns empty object, no DB query made
    expect(result).toEqual({});
    expect(query).not.toHaveBeenCalled();
  });
});

// ============================================================
// TEST SUITE: PersonalizationCache
// ============================================================
describe("PersonalizationCache", () => {
  // Create a fresh cache instance with short TTL for testing
  let cache;

  beforeEach(() => {
    // Create new cache with 100ms TTL for fast expiration testing
    cache = new PersonalizationCacheClass({ ttlMs: 100, maxEntries: 5 });
  });

  afterEach(() => {
    // Destroy cache to clean up timer
    cache.destroy();
  });

  // ---------------------------------------------------------
  // Basic get/set operations
  // ---------------------------------------------------------
  test("set and get returns cached data", () => {
    // Arrange: Store data in cache
    const data = { type: "student", name: "Test" };
    cache.set("test-key", data);

    // Act: Retrieve from cache
    const result = cache.get("test-key");

    // Assert: Data matches
    expect(result).toEqual(data);
  });

  // ---------------------------------------------------------
  // Cache miss on unknown key
  // ---------------------------------------------------------
  test("get returns null for unknown key", () => {
    // Act: Try to get a key that doesn't exist
    const result = cache.get("nonexistent");

    // Assert: Returns null
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------
  // TTL expiration
  // ---------------------------------------------------------
  test("get returns null after TTL expires", async () => {
    // Arrange: Store data
    cache.set("expiring-key", { data: "test" });

    // Wait for TTL to expire (100ms + buffer)
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Act: Try to get expired data
    const result = cache.get("expiring-key");

    // Assert: Returns null because entry expired
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------
  // Cache invalidation
  // ---------------------------------------------------------
  test("invalidate removes specific entry", () => {
    // Arrange: Store two entries
    cache.set("key1", { a: 1 });
    cache.set("key2", { b: 2 });

    // Act: Invalidate only key1
    cache.invalidate("key1");

    // Assert: key1 is gone, key2 remains
    expect(cache.get("key1")).toBeNull();
    expect(cache.get("key2")).toEqual({ b: 2 });
  });

  // ---------------------------------------------------------
  // Clear all entries
  // ---------------------------------------------------------
  test("invalidateAll clears everything", () => {
    // Arrange: Store multiple entries
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Act: Clear all
    cache.invalidateAll();

    // Assert: All entries are gone
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeNull();
  });

  // ---------------------------------------------------------
  // Max entries triggers cleanup
  // ---------------------------------------------------------
  test("set triggers cleanup when maxEntries exceeded", async () => {
    // Arrange: Fill cache to max (5 entries)
    for (let i = 0; i < 5; i++) {
      cache.set(`key${i}`, i);
    }

    // Wait for some entries to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Act: Add one more — should trigger cleanup
    cache.set("overflow", "data");

    // Assert: Cache didn't exceed max (expired entries cleaned up)
    expect(cache.size).toBeLessThanOrEqual(5);
  });

  // ---------------------------------------------------------
  // Size property
  // ---------------------------------------------------------
  test("size returns correct count", () => {
    // Empty cache
    expect(cache.size).toBe(0);

    // After adding entries
    cache.set("x", 1);
    cache.set("y", 2);
    expect(cache.size).toBe(2);
  });
});

// ============================================================
// TEST SUITE: DashboardBuilder
// ============================================================
describe("DashboardBuilder", () => {
  // Sample user context for testing
  const studentContext = {
    displayName: "Kamesh Kumar",
    email: "kamesh@bitsathy.ac.in",
    departmentCode: "CSE",
    admissionYear: 2023,
    graduationYear: 2027,
    personType: "student",
    personId: "8037a704-9022-49be-8c2b-89cf11c32d6b",
    status: "active",
  };

  // ---------------------------------------------------------
  // buildStudentDashboard — full structure
  // ---------------------------------------------------------
  test("buildStudentDashboard returns correct structure", () => {
    // Act: Build student dashboard
    const result = DashboardBuilder.buildStudentDashboard(
      studentContext,
      mockProjects,
      mockTeamCounts,
    );

    // Assert: Dashboard type is student
    expect(result.type).toBe("student");

    // Assert: User info is correct
    expect(result.user.name).toBe("Kamesh Kumar");
    expect(result.user.department).toBe("CSE");
    expect(result.user.personType).toBe("student");

    // Assert: Sections exist
    expect(result.sections.myProjects).toHaveLength(1);
    expect(result.sections.myProjects[0].title).toBe(
      "AI-Powered Attendance System",
    );
    expect(result.sections.myProjects[0].teamSize).toBe(2);
    expect(result.sections.myProjects[0].myRole).toBe("leader");

    // Assert: Pending work is generated for under_review project
    expect(result.sections.pendingWork.length).toBeGreaterThan(0);
    expect(result.sections.pendingWork[0].type).toBe("evaluation_prep");
    expect(result.sections.pendingWork[0].priority).toBe("high");

    // Assert: Stats are calculated
    expect(result.sections.stats.totalProjects).toBe(1);

    // Assert: Actions exist
    expect(result.actions).toBeDefined();
    expect(result.actions.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------
  // buildStudentDashboard — empty projects
  // ---------------------------------------------------------
  test("buildStudentDashboard handles no projects", () => {
    // Act: Build with empty projects
    const result = DashboardBuilder.buildStudentDashboard(
      studentContext,
      [],
      {},
    );

    // Assert: Sections are empty but valid
    expect(result.sections.myProjects).toHaveLength(0);
    expect(result.sections.pendingWork).toHaveLength(0);
    expect(result.sections.stats.totalProjects).toBe(0);

    // Assert: Create project action is available
    const createAction = result.actions.find((a) => a.id === "create-project");
    expect(createAction.available).toBe(true);
  });

  // ---------------------------------------------------------
  // buildFacultyDashboard — structure
  // ---------------------------------------------------------
  test("buildFacultyDashboard returns correct structure", () => {
    // Faculty context
    const facultyContext = {
      displayName: "Dr. Priya",
      email: "priya@bitsathy.ac.in",
      departmentCode: "CSE",
      personType: "faculty",
      status: "active",
    };

    // Department stats
    const deptStats = {
      studentCount: 50,
      activeProjectCount: 10,
      totalProjectCount: 25,
      submittedCount: 3,
    };

    // Evaluation sessions
    const evalSessions = [
      {
        session_id: "eval-1",
        session_type: "project_review",
        intent: "growth",
        status: "open",
      },
    ];

    // Act: Build faculty dashboard
    const result = DashboardBuilder.buildFacultyDashboard(
      facultyContext,
      deptStats,
      evalSessions,
    );

    // Assert: Dashboard type
    expect(result.type).toBe("faculty");

    // Assert: User info
    expect(result.user.name).toBe("Dr. Priya");
    expect(result.user.personType).toBe("faculty");

    // Assert: Department overview
    expect(result.sections.departmentOverview.totalStudents).toBe(50);
    expect(result.sections.departmentOverview.activeProjects).toBe(10);

    // Assert: Evaluation assignments
    expect(result.sections.evaluationAssignments.totalSessions).toBe(1);
    expect(result.sections.evaluationAssignments.pendingReviews).toBe(1);
  });

  // ---------------------------------------------------------
  // buildAdminDashboard — structure
  // ---------------------------------------------------------
  test("buildAdminDashboard returns correct structure", () => {
    // Admin context
    const adminContext = {
      displayName: "System Admin",
      email: "admin@bitsathy.ac.in",
      personType: "admin",
      status: "active",
    };

    // System stats
    const sysStats = {
      totalUsers: 100,
      totalPersons: 80,
      totalProjects: 30,
      activeProjects: 15,
      frozenProjects: 2,
    };

    // Department breakdown
    const deptBreakdown = [
      { department_code: "CSE", student_count: "40", project_count: "15" },
      { department_code: "ECE", student_count: "30", project_count: "10" },
    ];

    // Act: Build admin dashboard
    const result = DashboardBuilder.buildAdminDashboard(
      adminContext,
      sysStats,
      deptBreakdown,
    );

    // Assert: Dashboard type
    expect(result.type).toBe("admin");

    // Assert: System health
    expect(result.sections.systemHealth.totalUsers).toBe(100);
    expect(result.sections.systemHealth.totalProjects).toBe(30);
    expect(result.sections.systemHealth.databaseStatus).toBe("healthy");

    // Assert: Department breakdown
    expect(result.sections.departments).toHaveLength(2);
    expect(result.sections.departments[0].code).toBe("CSE");
    expect(result.sections.departments[0].studentCount).toBe(40);

    // Assert: Admin actions include integrity check
    const integrityAction = result.actions.find(
      (a) => a.id === "integrity-check",
    );
    expect(integrityAction).toBeDefined();
    expect(integrityAction.available).toBe(true);
  });

  // ---------------------------------------------------------
  // buildDefaultDashboard — profile completion
  // ---------------------------------------------------------
  test("buildDefaultDashboard returns profile completion form", () => {
    // Unlinked context
    const unlinkedContext = {
      displayName: "New User",
      email: "new@bitsathy.ac.in",
      personType: "student",
    };

    // Act: Build default dashboard
    const result = DashboardBuilder.buildDefaultDashboard(unlinkedContext);

    // Assert: Dashboard type is default
    expect(result.type).toBe("default");

    // Assert: Profile completion section exists
    expect(result.sections.profileCompletion.required).toBe(true);
    expect(result.sections.profileCompletion.fields.length).toBeGreaterThan(0);

    // Assert: Has a complete-profile action
    const completeAction = result.actions.find(
      (a) => a.id === "complete-profile",
    );
    expect(completeAction).toBeDefined();
    expect(completeAction.available).toBe(true);

    // Assert: Has info notification
    expect(result.notifications.length).toBeGreaterThan(0);
    expect(result.notifications[0].type).toBe("info");
  });
});

// ============================================================
// TEST SUITE: PersonalizationService (integration-style)
// ============================================================
describe("PersonalizationService", () => {
  // We need to require PersonalizationService after mocks are set up
  // because it integrates all other services
  let personalizationService;

  beforeEach(() => {
    // Clear module cache to get fresh instance with fresh mocks
    jest.resetModules();

    // Re-mock all dependencies
    jest.mock("../../../config/database", () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      getClient: jest.fn(),
      pool: {},
    }));

    jest.mock("../../../repositories/PersonRepository", () => ({
      findByIdentityId: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    }));

    jest.mock("../../../utils/logger", () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    // Re-require after mocks
    personalizationService = require("../PersonalizationService");
  });

  // ---------------------------------------------------------
  // getDashboardData — returns default for unlinked user (non-bitsathy)
  // ---------------------------------------------------------
  test("getDashboardData returns default dashboard for unlinked user", async () => {
    // Arrange: PersonRepository returns null (no PEMM person)
    const PersonRepo = require("../../../repositories/PersonRepository");
    PersonRepo.findByIdentityId.mockResolvedValue(null);

    // Auth user from req.user — non-bitsathy email so no auto-create
    const authUser = {
      userId: "test-id",
      email: "test@external.com",
      role: "student",
    };

    // Act: Get dashboard data
    const result = await personalizationService.getDashboardData(authUser);

    // Assert: Default dashboard returned
    expect(result.type).toBe("default");
    expect(result.meta).toBeDefined();
    expect(result.meta.generatedAt).toBeDefined();
  });

  // ---------------------------------------------------------
  // getDashboardData — returns student dashboard for linked student
  // ---------------------------------------------------------
  test("getDashboardData returns student dashboard for linked student", async () => {
    // Arrange: PersonRepository finds a student person
    const PersonRepo = require("../../../repositories/PersonRepository");
    PersonRepo.findByIdentityId.mockResolvedValue(mockPerson);

    // Mock DB queries for projects and evaluations
    const db = require("../../../config/database");
    db.query
      .mockResolvedValueOnce({ rows: mockProjects }) // getPersonProjects
      .mockResolvedValueOnce({ rows: [] }) // _getUpcomingEvaluations
      .mockResolvedValueOnce({
        // getProjectTeamCounts
        rows: [
          {
            project_id: "40218f88-e808-4b14-801f-baf5af41b9e7",
            member_count: "2",
          },
        ],
      });

    // Auth user
    const authUser = {
      userId: "6f51981c-aaaa-bbbb-cccc-dddddddddddd",
      email: "kamesh@bitsathy.ac.in",
      role: "student",
    };

    // Act: Get dashboard data
    const result = await personalizationService.getDashboardData(authUser);

    // Assert: Student dashboard returned
    expect(result.type).toBe("student");
    expect(result.user.name).toBe("Kamesh Kumar");
    expect(result.sections.myProjects).toBeDefined();
    expect(result.meta).toBeDefined();
  });

  // ---------------------------------------------------------
  // getDashboardData — caching works
  // ---------------------------------------------------------
  test("getDashboardData returns cached data on second call", async () => {
    // Arrange: PersonRepository returns null for default dashboard
    const PersonRepo = require("../../../repositories/PersonRepository");
    PersonRepo.findByIdentityId.mockResolvedValue(null);

    const authUser = {
      userId: "cache-test",
      email: "cache@test.com",
      role: "student",
    };

    // Act: First call — builds fresh
    const first = await personalizationService.getDashboardData(authUser);

    // Act: Second call — should return cached
    const second = await personalizationService.getDashboardData(authUser);

    // Assert: Both return same data
    expect(first.type).toBe(second.type);

    // Assert: PersonRepository was called only ONCE (cached on second)
    expect(PersonRepo.findByIdentityId).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------
  // invalidateUserCache — clears cache for user
  // ---------------------------------------------------------
  test("invalidateUserCache forces fresh data on next call", async () => {
    // Arrange: PersonRepository returns null
    const PersonRepo = require("../../../repositories/PersonRepository");
    PersonRepo.findByIdentityId.mockResolvedValue(null);

    const authUser = {
      userId: "invalidate-test",
      email: "inv@test.com",
      role: "student",
    };

    // First call — populates cache
    await personalizationService.getDashboardData(authUser);

    // Invalidate the cache
    personalizationService.invalidateUserCache("invalidate-test");

    // Second call — should rebuild (not from cache)
    await personalizationService.getDashboardData(authUser);

    // Assert: PersonRepository was called TWICE (once per uncached call)
    expect(PersonRepo.findByIdentityId).toHaveBeenCalledTimes(2);
  });
});
