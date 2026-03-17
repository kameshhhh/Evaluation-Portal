import api from "./api";

const BASE = "/github";

// Student: save GitHub PAT
export const saveGitHubToken = (token) =>
  api.post(`${BASE}/token`, { token }).then((r) => r.data);

// Student: get token status (linked/not, username, etc.)
export const getGitHubTokenStatus = () =>
  api.get(`${BASE}/token/status`).then((r) => r.data);

// Student: update token
export const updateGitHubToken = (token) =>
  api.put(`${BASE}/token`, { token }).then((r) => r.data);

// Student: delete token
export const deleteGitHubToken = () =>
  api.delete(`${BASE}/token`).then((r) => r.data);

// Student: re-validate token
export const validateGitHubToken = () =>
  api.post(`${BASE}/token/validate`).then((r) => r.data);

// Admin: fetch a student's full GitHub profile
export const getStudentGitHubProfile = (personId) =>
  api.get(`${BASE}/profile/${personId}`).then((r) => r.data);
