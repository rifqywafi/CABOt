// src/utils/sessionStorage.js
// Storage helper for persisting active Cabo player sessions in localStorage and Cookie.

const STORAGE_KEY = 'cabo_active_session_v1';
const COOKIE_NAME = 'cabo_session_token';

/**
 * Save active session to localStorage and document.cookie
 */
export function saveActiveSession(sessionData) {
  if (typeof window === 'undefined') return;

  try {
    const payload = {
      ...sessionData,
      updatedAt: Date.now(),
    };
    const jsonStr = JSON.stringify(payload);
    localStorage.setItem(STORAGE_KEY, jsonStr);

    // Save lightweight cookie (expires in 48 hours)
    const maxAge = 48 * 60 * 60;
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(sessionData.sessionToken || '')}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch (err) {
    console.warn('Failed to save active session:', err);
  }
}

/**
 * Retrieve active session if still valid (within 24 hours)
 */
export function getActiveSession() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    const now = Date.now();
    // Expiration: 24 hours
    if (now - (data.updatedAt || 0) > 24 * 60 * 60 * 1000) {
      clearActiveSession();
      return null;
    }

    return data;
  } catch (err) {
    return null;
  }
}

/**
 * Clear saved session
 */
export function clearActiveSession() {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  } catch (err) {
    // Ignore
  }
}

