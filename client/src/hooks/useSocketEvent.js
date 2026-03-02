// ============================================================
// useSocketEvent — Subscribe to Socket.IO Events with Cleanup
// ============================================================
// A convenience hook that subscribes to a specific Socket.IO
// event and automatically removes the listener on unmount or
// when the event/callback changes. Handles the case where the
// socket is not yet connected gracefully.
//
// Usage:
//   useSocketEvent('data:changed', (payload) => {
//     if (payload.entityType === 'project') refetch();
//   });
//
//   useSocketEvent('session:finalized', (data) => {
//     setSession(prev => ({ ...prev, status: 'finalized' }));
//   });
// ============================================================

import { useEffect, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";

/**
 * Subscribe to a Socket.IO event with automatic cleanup.
 *
 * @param {string|string[]} eventName - Event(s) to listen for
 * @param {Function} callback - Handler called with event data
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.enabled=true] - Enable/disable the listener
 */
const useSocketEvent = (eventName, callback, options = {}) => {
  const { socket } = useSocket();
  const { enabled = true } = options;

  // Store the latest callback in a ref to avoid stale closures
  // without needing to re-subscribe on every render
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!socket || !enabled) return;

    // Normalize to array for multi-event support
    const events = Array.isArray(eventName) ? eventName : [eventName];

    const handler = (...args) => {
      callbackRef.current(...args);
    };

    // Subscribe to all events
    events.forEach((evt) => socket.on(evt, handler));

    // Cleanup — remove listeners on unmount or dependency change
    return () => {
      events.forEach((evt) => socket.off(evt, handler));
    };
  }, [socket, eventName, enabled]);
};

/**
 * Subscribe to the generic 'data:changed' event and filter by
 * entity type. This is the most common pattern — controllers
 * emit broadcastChange(entityType, action, meta) and this hook
 * triggers a refetch when the entity type matches.
 *
 * @param {string|string[]} entityTypes - Entity type(s) to listen for
 * @param {Function} callback - Handler called with { entityType, action, ...meta }
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.enabled=true] - Enable/disable the listener
 */
export const useDataChange = (entityTypes, callback, options = {}) => {
  const types = Array.isArray(entityTypes) ? entityTypes : [entityTypes];
  // typesRef is fine as it's just for the filter check, but we need to ensure callback is stable
  const typesRef = useRef(types);
  typesRef.current = types;

  useSocketEvent(
    "data:changed",
    (payload) => {
      // payload will be { entityType, action, meta... }
      if (typesRef.current.includes(payload.entityType)) {
        callback(payload);
      }
    },
    options
  );
};

export default useSocketEvent;
