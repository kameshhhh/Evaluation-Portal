// ============================================================
// SOCKET.IO SERVER — Real-Time Event Broadcasting
// ============================================================
// Provides WebSocket-based real-time communication between the
// server and all connected clients. Uses JWT authentication
// so only logged-in users receive events.
//
// Architecture:
//   - Server emits events after any DB write (create/update/delete)
//   - Clients subscribe to relevant channels based on their role
//   - Smart invalidation: events carry entity type + ID so clients
//     refetch only the affected data
//
// Rooms:
//   - "role:admin"   — admin-only broadcasts
//   - "role:faculty" — faculty-specific events
//   - "role:student" — student-specific events
//   - "user:{userId}" — private events for a specific user
//   - "session:{sessionId}" — events scoped to a specific session
// ============================================================

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const jwtConfig = require("./config/jwtConfig");
const logger = require("./utils/logger");

let io = null;

// ============================================================
// EVENT TYPES — Centralized event name constants
// ============================================================
const EVENTS = {
  // Evaluation sessions (core eval system)
  SESSION_CREATED: "session:created",
  SESSION_UPDATED: "session:updated",
  SESSION_DELETED: "session:deleted",
  SESSION_STATUS_CHANGED: "session:statusChanged",

  // Faculty evaluation sessions
  FACULTY_SESSION_CREATED: "facultySession:created",
  FACULTY_SESSION_UPDATED: "facultySession:updated",
  FACULTY_SESSION_DELETED: "facultySession:deleted",

  // Faculty evaluation assignments
  ASSIGNMENT_CREATED: "assignment:created",
  ASSIGNMENT_UPDATED: "assignment:updated",

  // Allocations (student votes/points)
  ALLOCATION_SUBMITTED: "allocation:submitted",
  ALLOCATION_DRAFT_SAVED: "allocation:draftSaved",

  // Normalized scores
  SCORES_RECALCULATED: "scores:recalculated",
  SCORES_UPDATED: "scores:updated",

  // Normalization config/weights
  WEIGHTS_UPDATED: "weights:updated",

  // What-If scenarios
  SCENARIO_SAVED: "scenario:saved",
  SCENARIO_DELETED: "scenario:deleted",

  // Scarcity
  SCARCITY_ALLOCATION_SUBMITTED: "scarcity:allocationSubmitted",
  SCARCITY_SESSION_UPDATED: "scarcity:sessionUpdated",

  // Comparative evaluation
  COMPARATIVE_ROUND_CREATED: "comparative:roundCreated",
  COMPARATIVE_ROUND_UPDATED: "comparative:roundUpdated",
  COMPARATIVE_ALLOCATION_SUBMITTED: "comparative:allocationSubmitted",

  // Peer ranking
  PEER_SURVEY_CREATED: "peerSurvey:created",
  PEER_RANKING_SUBMITTED: "peerRanking:submitted",

  // Projects
  PROJECT_CREATED: "project:created",
  PROJECT_UPDATED: "project:updated",
  PROJECT_DELETED: "project:deleted",

  // Credibility
  CREDIBILITY_UPDATED: "credibility:updated",

  // Cohorts
  COHORT_UPDATED: "cohort:updated",

  // Generic data change (catch-all)
  DATA_CHANGED: "data:changed",

  // Connection lifecycle
  CONNECTED: "connected",
};

// ============================================================
// INITIALIZE — Attach Socket.IO to the HTTP server
// ============================================================
function initialize(httpServer) {
  const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Optimize transport — start with polling, upgrade to websocket
    transports: ["websocket", "polling"],
    // Ping interval/timeout for connection health
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // ============================================================
  // AUTHENTICATION MIDDLEWARE — Verify JWT on connection
  // ============================================================
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, jwtConfig.JWT_SECRET, {
        algorithms: [jwtConfig.JWT_ALGORITHM],
        issuer: jwtConfig.JWT_ISSUER,
        audience: jwtConfig.JWT_AUDIENCE,
      });

      // Attach user info to socket
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      socket.personId = decoded.personId;
      socket.displayName = decoded.displayName || "Unknown";

      next();
    } catch (err) {
      logger.warn("Socket auth failed", { error: err.message });
      next(new Error("Invalid token"));
    }
  });

  // ============================================================
  // CONNECTION HANDLER — Room joining & lifecycle
  // ============================================================
  io.on("connection", (socket) => {
    const { userId, userRole, personId, displayName } = socket;

    logger.info("Socket connected", {
      userId,
      role: userRole,
      socketId: socket.id,
    });

    // Auto-join role room
    if (userRole) {
      socket.join(`role:${userRole}`);
    }

    // Auto-join private user room
    if (userId) {
      socket.join(`user:${userId}`);
    }
    if (personId) {
      socket.join(`person:${personId}`);
    }

    // Confirm connection to client
    socket.emit(EVENTS.CONNECTED, {
      socketId: socket.id,
      userId,
      role: userRole,
      timestamp: new Date().toISOString(),
    });

    // ---- Client can join/leave session-specific rooms ----
    socket.on("join:session", (sessionId) => {
      if (sessionId) {
        socket.join(`session:${sessionId}`);
        logger.debug("Socket joined session room", {
          socketId: socket.id,
          sessionId,
        });
      }
    });

    socket.on("leave:session", (sessionId) => {
      if (sessionId) {
        socket.leave(`session:${sessionId}`);
      }
    });

    // ---- Disconnect cleanup ----
    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected", {
        userId,
        socketId: socket.id,
        reason,
      });
    });
  });

  logger.info("Socket.IO initialized", {
    origins: allowedOrigins,
    transports: ["websocket", "polling"],
  });

  return io;
}

// ============================================================
// EMIT HELPERS — Used by controllers/services to broadcast events
// ============================================================

/**
 * Emit an event to ALL connected clients.
 */
function emitToAll(event, data) {
  if (!io) return;
  io.emit(event, { ...data, timestamp: new Date().toISOString() });
}

/**
 * Emit an event to clients with a specific role.
 * @param {"admin"|"faculty"|"student"} role
 */
function emitToRole(event, role, data) {
  if (!io) return;
  io.to(`role:${role}`).emit(event, {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit an event to a specific user.
 * @param {string} userId — internal_user_id
 */
function emitToUser(event, userId, data) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit an event to a specific person.
 * @param {string} personId — person_id from persons table
 */
function emitToPerson(event, personId, data) {
  if (!io) return;
  io.to(`person:${personId}`).emit(event, {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit an event to all clients watching a specific session.
 * @param {string} sessionId
 */
function emitToSession(event, sessionId, data) {
  if (!io) return;
  io.to(`session:${sessionId}`).emit(event, {
    ...data,
    sessionId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast a generic data-change event. Clients use entityType + entityId
 * to decide whether to refetch.
 * @param {string} entityType — e.g. "session", "allocation", "score"
 * @param {string} action — "created", "updated", "deleted"
 * @param {object} meta — additional context (sessionId, facultyId, etc.)
 */
function broadcastChange(entityType, action, meta = {}) {
  if (!io) return;
  const payload = {
    entityType,
    action,
    ...meta,
    timestamp: new Date().toISOString(),
  };
  io.emit(EVENTS.DATA_CHANGED, payload);
}

/**
 * Get the Socket.IO server instance (for advanced use).
 */
function getIO() {
  return io;
}

/**
 * Get count of connected clients.
 */
async function getConnectionCount() {
  if (!io) return 0;
  const sockets = await io.fetchSockets();
  return sockets.length;
}

module.exports = {
  initialize,
  getIO,
  getConnectionCount,
  emitToAll,
  emitToRole,
  emitToUser,
  emitToPerson,
  emitToSession,
  broadcastChange,
  EVENTS,
};
