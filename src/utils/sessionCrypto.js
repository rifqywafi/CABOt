// src/utils/sessionCrypto.js
// Safe bidirectional encoder/decoder for Cabo room and player session URLs.
// Works seamlessly in both browser and Node.js environments without external dependencies.

const SECRET_SALT = 'CABO_SESSION_SALT_2026_KEY';

/**
 * Basic XOR cipher with rotating salt + base64url encoding
 */
function xorEncrypt(text, key) {
  const result = [];
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result.push(String.fromCharCode(charCode));
  }
  return result.join('');
}

function toBase64Url(str) {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window
      .btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } else {
    return Buffer.from(str, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}

function fromBase64Url(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return decodeURIComponent(escape(window.atob(base64)));
  } else {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
}

/**
 * Encrypt a player game session into an ultra-compact URL key (max length < 64 chars)
 * @param {Object} payload { roomId, playerName, gameMode, sessionToken }
 * @returns {string} e.g. "c_s_xxxxxx"
 */
export function encodeSessionKey(payload) {
  try {
    const r = (payload.roomId || '').trim();
    const p = (payload.playerName || '').trim();
    const m = payload.gameMode === 'endless' ? 'e' : 'c';
    const compactStr = `s~${r}~${p}~${m}`;
    const encrypted = xorEncrypt(compactStr, SECRET_SALT);
    return 'c_s_' + toBase64Url(encrypted);
  } catch (err) {
    console.error('Error encoding session key:', err);
    return payload.roomId || '';
  }
}

/**
 * Encrypt an invite-only link (max length < 64 chars, e.g. "c_i_xxxxxx")
 * @param {Object} payload { roomId, gameMode }
 * @returns {string}
 */
export function encodeInviteKey(payload) {
  try {
    const r = (payload.roomId || '').trim();
    const m = payload.gameMode === 'endless' ? 'e' : 'c';
    const compactStr = `i~${r}~${m}`;
    const encrypted = xorEncrypt(compactStr, SECRET_SALT);
    return 'c_i_' + toBase64Url(encrypted);
  } catch (err) {
    console.error('Error encoding invite key:', err);
    return payload.roomId || '';
  }
}

/**
 * Decrypt a session or invite key back to room & player info
 * Supports both new ultra-compact format (< 64 chars) and legacy format
 * @param {string} token
 * @returns {Object|null}
 */
export function decodeSessionKey(token) {
  if (!token) return null;

  // Handle plain room codes (fallback)
  const isCompactSession = token.startsWith('c_s_');
  const isCompactInvite = token.startsWith('c_i_');
  const isLegacySession = token.startsWith('cabo_s_');
  const isLegacyInvite = token.startsWith('cabo_i_');

  if (!isCompactSession && !isCompactInvite && !isLegacySession && !isLegacyInvite) {
    return {
      roomId: token.toUpperCase(),
      playerName: null,
      gameMode: 'classic',
      sessionToken: null,
      isEncrypted: false,
    };
  }

  try {
    const prefixLen = isCompactSession || isCompactInvite ? 4 : 7;
    const base64Part = token.slice(prefixLen);
    const decryptedRaw = xorEncrypt(fromBase64Url(base64Part), SECRET_SALT);

    // New compact format: s~ROOM~PLAYER~MODE or i~ROOM~MODE
    if (decryptedRaw.includes('~')) {
      const parts = decryptedRaw.split('~');
      const type = parts[0];
      if (type === 'i') {
        return {
          roomId: (parts[1] || '').toUpperCase(),
          playerName: null,
          gameMode: parts[2] === 'e' ? 'endless' : 'classic',
          sessionToken: null,
          isInvite: true,
          isEncrypted: true,
        };
      } else {
        return {
          roomId: (parts[1] || '').toUpperCase(),
          playerName: parts[2] || null,
          gameMode: parts[3] === 'e' ? 'endless' : 'classic',
          sessionToken: null,
          isInvite: false,
          isEncrypted: true,
        };
      }
    }

    // Legacy JSON format
    const data = JSON.parse(decryptedRaw);
    return {
      roomId: (data.r || '').toUpperCase(),
      playerName: data.p || null,
      gameMode: data.m || 'classic',
      sessionToken: data.s || null,
      isInvite: Boolean(data.invite),
      isEncrypted: true,
      timestamp: data.t,
    };
  } catch (err) {
    console.warn('Failed to decode session key:', err);
    return null;
  }
}

export const decodeInviteKey = decodeSessionKey;

/**
 * Generate a unique session token for client-side persistence
 */
export function generateUniqueSessionToken() {
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return `cabo_tok_${time}_${rand}`;
}
