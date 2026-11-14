// Talks to the school server. The address comes from EXPO_PUBLIC_API_URL
// (set it to http://<computer-ip>:5000 when testing on a phone at school).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://portal.mathaschool.in').replace(/\/$/, '');

let token = null;
let onSignedOut = null;

export const setToken = (t) => { token = t; };
/** Called when the server says the login is no longer valid (e.g. the school reset the PIN). */
export const setSignedOutHandler = (fn) => { onSignedOut = fn; };

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}/api/app${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No internet connection. Please check and try again.');
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && token) onSignedOut?.();
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

/** Address of a child's photo (needs the login header). */
export const photoSource = (childId) => ({
  uri: `${API_URL}/api/app/children/${childId}/photo`,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});
