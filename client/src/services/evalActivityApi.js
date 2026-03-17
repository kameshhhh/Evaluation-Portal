import api from "./api";

const BASE = "/eval-activity";

const d = (promise) => promise.then((r) => r.data);

/** Admin: get evaluation activity overview stats */
export const getEvalActivityOverview = () => d(api.get(`${BASE}/overview`));

/** Admin: get paginated student list with filters */
export const getEvalActivityStudents = (filters = {}) =>
  d(api.get(`${BASE}/students`, { params: filters }));

/** Admin: get single student's detailed evaluation activity */
export const getEvalActivityStudentDetail = (personId) =>
  d(api.get(`${BASE}/students/${personId}/detail`));

/** Admin: export filtered data as CSV */
export const exportEvalActivityCSV = (filters = {}) =>
  api.get(`${BASE}/export`, { params: filters, responseType: "blob" });
