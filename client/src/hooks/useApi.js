import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * useApi — thin wrapper around fetch that injects the auth header.
 *
 * On SUCCESS: returns the parsed JSON data directly.
 * On ERROR:   throws an Error with the message from the server.
 *
 * This matches the original pattern used by TeachersPage, StudentsPage etc.
 *
 * apiCall(url, options)      — JSON body requests
 * apiUpload(url, formData)   — multipart/form-data (file upload)
 */
export function useApi() {
  const { getAuthHeader } = useAuth();

  const apiCall = useCallback(async (url, { method = 'GET', body, headers = {} } = {}) => {
    let res;
    try {
      res = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      throw new Error('Network error — is the server running?');
    }

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        // Cookie was overwritten in another tab or expired. 
        // Clear local role state and force a hard reload to re-sync with the actual cookie.
        localStorage.removeItem('activeRole');
        window.location.href = '/';
        // Return a never-resolving promise so the component doesn't proceed to throw/render error
        return new Promise(() => {});
      }
      throw new Error(data.error || data.message || `Request failed (${res.status})`);
    }

    return data;
  }, [getAuthHeader]);

  /** For multipart/form-data (profile pics, CSV). Do NOT set Content-Type — browser must set the boundary. */
  const apiUpload = useCallback(async (url, formData, method = 'POST') => {
    let res;
    try {
      res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { ...getAuthHeader() },
        body: formData,
      });
    } catch (networkErr) {
      throw new Error('Network error — is the server running?');
    }

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('activeRole');
        window.location.href = '/';
        return new Promise(() => {});
      }
      throw new Error(data.error || data.message || `Upload failed (${res.status})`);
    }

    return data;
  }, [getAuthHeader]);

  return { apiCall, apiUpload };
}
