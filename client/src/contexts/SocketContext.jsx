// ============================================================
// SOCKET CONTEXT — Real-Time WebSocket Connection Provider
// ============================================================
// Manages a single Socket.IO connection shared across the React
// tree. Connects when the user is authenticated (has JWT token),
// disconnects on logout. Provides the socket instance to all
// child components via React Context + useSocket() hook.
//
// Usage:
//   <SocketProvider>
//     <App />
//   </SocketProvider>
//
//   const { socket, connected } = useSocket();
// ============================================================

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { io } from "socket.io-client";
import { getToken } from "../services/tokenManager";

// ============================================================
// Socket URL — derived from API base URL (strip /api suffix)
// e.g., http://localhost:5000/api → http://localhost:5000
// ============================================================
const SOCKET_URL = (() => {
  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
  return apiUrl.replace(/\/api\/?$/, "");
})();

// ============================================================
// EVENT TYPES — Must match server-side EVENTS in socket.js
// ============================================================
export const EVENTS = {
  // Connection
  CONNECTED: "connected",
  DATA_CHANGED: "data:changed",

  // Session
  SESSION_CREATED: "session:created",
  SESSION_UPDATED: "session:updated",
  SESSION_DELETED: "session:deleted",
  SESSION_FINALIZED: "session:finalized",

  // Faculty Evaluation
  FACULTY_SESSION_CREATED: "faculty:session:created",
  FACULTY_SESSION_UPDATED: "faculty:session:updated",
  FACULTY_ALLOCATION_SUBMITTED: "faculty:allocation:submitted",

  // Scores / Normalization
  SCORES_RECALCULATED: "scores:recalculated",
  WEIGHTS_UPDATED: "weights:updated",
  SCENARIO_SAVED: "scenario:saved",
  SCENARIO_DELETED: "scenario:deleted",

  // Scarcity
  SCARCITY_CONFIGURED: "scarcity:configured",
  SCARCITY_SUBMITTED: "scarcity:submitted",
  SCARCITY_SESSION_CREATED: "scarcity:session:created",

  // Comparative
  COMPARATIVE_ROUND_CREATED: "comparative:round:created",
  COMPARATIVE_ROUND_UPDATED: "comparative:round:updated",
  COMPARATIVE_ROUND_ACTIVATED: "comparative:round:activated",
  COMPARATIVE_ROUND_CLOSED: "comparative:round:closed",
  COMPARATIVE_SESSION_SUBMITTED: "comparative:session:submitted",

  // Peer Ranking
  PEER_SURVEY_CREATED: "peerSurvey:created",
  PEER_RANKING_SUBMITTED: "peerRanking:submitted",

  // Projects
  PROJECT_CREATED: "project:created",
  PROJECT_UPDATED: "project:updated",
  PROJECT_DELETED: "project:deleted",

  // Credibility
  CREDIBILITY_UPDATED: "credibility:updated",

  // Cohort
  COHORT_UPDATED: "cohort:updated",
};

// ============================================================
// Context
// ============================================================
const SocketContext = createContext({
  socket: null,
  connected: false,
  connectionCount: 0,
});

// ============================================================
// SOCKET PROVIDER — Manages the Socket.IO client lifecycle
// ============================================================
export const SocketProvider = ({ children }) => {
  const [connected, setConnected] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  // socketState is a reactive copy of socketRef.current so context
  // consumers re-render when the socket instance changes.
  const [socketState, setSocketState] = useState(null);
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  // ============================================================
  // Connect — called when a token becomes available
  // ============================================================
  const connect = useCallback(() => {
    const token = getToken();
    if (!token) return;

    // Don't reconnect if already connected
    if (socketRef.current?.connected) return;

    // Clean up any existing socket
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    socket.on("connect", () => {
      console.log("[Socket.IO] Connected:", socket.id);
      setConnected(true);
    });

    socket.on("connected", (data) => {
      if (data?.connectionCount) {
        setConnectionCount(data.connectionCount);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.IO] Disconnected:", reason);
      setConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.warn("[Socket.IO] Connection error:", err.message);
      setConnected(false);
    });

    socketRef.current = socket;
    setSocketState(socket); // reactive update for context consumers
  }, []);

  // ============================================================
  // Disconnect — called on logout or unmount
  // ============================================================
  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocketState(null); // clear reactive state
    }
    setConnected(false);
    setConnectionCount(0);
  }, []);

  // ============================================================
  // Effect: monitor token changes
  // Poll for token presence every second — connects when token
  // appears, disconnects when token is cleared (logout)
  // ============================================================
  useEffect(() => {
    // Try connecting immediately
    connect();

    const interval = setInterval(() => {
      const token = getToken();
      if (token && !socketRef.current?.connected) {
        connect();
      } else if (!token && socketRef.current) {
        disconnect();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      disconnect();
    };
  }, [connect, disconnect]);

  // ============================================================
  // Context value — memoized to prevent unnecessary re-renders
  // ============================================================
  const value = {
    socket: socketState,   // reactive — re-renders consumers on connect/disconnect
    connected,
    connectionCount,
    connect,
    disconnect,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};

// ============================================================
// useSocket hook — access socket instance and status
// ============================================================
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

export default SocketContext;
