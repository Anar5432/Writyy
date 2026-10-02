// Neon Serverless PostgreSQL Database Service for Writyy
import { neon } from '@neondatabase/serverless';

const STORAGE_URL_KEY = 'writyy_neon_url';
const STORAGE_SESSION_KEY = 'writyy_neon_session';

const DEFAULT_NEON_URL = 'postgresql://neondb_owner:npg_L9Gj3gmcASvO@ep-wispy-truth-b16e8gbw-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const DEFAULT_GOOGLE_CLIENT_ID = '158574308883-8f61eeshd0kccirl57hb4vqaq9a9epmf.apps.googleusercontent.com';

export function getGoogleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
}

// Retrieve active Neon connection string
export function getNeonUrl() {
  try {
    const custom = localStorage.getItem(STORAGE_URL_KEY);
    if (custom && custom.trim().length > 10) {
      return custom.trim();
    }
  } catch (e) {}

  return import.meta.env.VITE_NEON_DATABASE_URL || DEFAULT_NEON_URL;
}

export function saveNeonUrl(url) {
  try {
    localStorage.setItem(STORAGE_URL_KEY, (url || '').trim());
    window.location.reload();
  } catch (e) {
    console.error('Failed to save Neon URL:', e);
  }
}

export function isNeonConfigured() {
  const url = getNeonUrl();
  return Boolean(url && url.startsWith('postgres') && url.includes('@'));
}

// Get initialized Neon SQL client
export function getSql() {
  const url = getNeonUrl();
  if (!url || !url.startsWith('postgres')) return null;
  try {
    return neon(url);
  } catch (err) {
    console.error('[Neon] Client initialization error:', err);
    return null;
  }
}

// Automatically initialize users table if it does not exist yet
export async function initNeonTable() {
  const sql = getSql();
  if (!sql) return false;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS writyy_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    return true;
  } catch (err) {
    console.error('[Neon] Failed to ensure table exists:', err);
    return false;
  }
}

// Client-side SHA-256 password hashing
async function hashPassword(password) {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Account Registration
export async function signUpWithEmail(email, password, displayName = '', existingData = null) {
  const sql = getSql();
  if (!sql) {
    throw new Error('Neon database is not configured. Please paste your Neon Connection String in Settings.');
  }

  await initNeonTable();

  const cleanEmail = email.trim().toLowerCase();
  const hash = await hashPassword(password);

  // Check existing user
  const existing = await sql`
    SELECT email, password_hash, data FROM writyy_users WHERE LOWER(email) = ${cleanEmail} LIMIT 1
  `;
  if (existing && existing.length > 0) {
    if (existing[0].password_hash === hash) {
      // Existing user with correct password: auto-login seamlessly!
      const userData = existing[0].data || {};
      const userSession = {
        email: cleanEmail,
        displayName: userData.displayName || cleanEmail.split('@')[0]
      };
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(userSession));
      return { user: userSession, data: userData, autoLoggedIn: true };
    } else {
      throw new Error('An account with this email already exists. Please enter your password and click "Sign In".');
    }
  }

  const payloadData = existingData ? {
    displayName: displayName.trim() || cleanEmail.split('@')[0],
    stack1_mastered: existingData.stack1_mastered || [],
    stack2_spelling: existingData.stack2_spelling || [],
    stack3_meaning: existingData.stack3_meaning || [],
    customWords: (existingData.allWords || []).filter(w => w.id && w.id.startsWith('custom_')),
    stats: existingData.stats || { totalTested: 0, correctSpelling: 0 },
    history: (existingData.history || []).slice(-100),
    lastUpdated: new Date().toISOString()
  } : {
    displayName: displayName.trim() || cleanEmail.split('@')[0],
    stack1_mastered: [],
    stack2_spelling: [],
    stack3_meaning: [],
    customWords: [],
    stats: { totalTested: 0, correctSpelling: 0 },
    history: [],
    lastUpdated: new Date().toISOString()
  };

  await sql`
    INSERT INTO writyy_users (email, password_hash, data) 
    VALUES (${cleanEmail}, ${hash}, ${JSON.stringify(payloadData)}::jsonb)
  `;

  const userSession = {
    email: cleanEmail,
    displayName: payloadData.displayName
  };
  localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(userSession));
  return { user: userSession, data: payloadData, autoLoggedIn: false };
}

// Account Login
export async function loginWithEmail(email, password) {
  const sql = getSql();
  if (!sql) {
    throw new Error('Neon database is not configured. Please paste your Neon Connection String in Settings.');
  }

  await initNeonTable();

  const cleanEmail = email.trim().toLowerCase();
  const hash = await hashPassword(password);

  const rows = await sql`
    SELECT email, password_hash, data 
    FROM writyy_users 
    WHERE LOWER(email) = ${cleanEmail} 
    LIMIT 1
  `;

  if (!rows || rows.length === 0) {
    throw new Error('No account found with this email. Please switch to "Create Account".');
  }

  if (rows[0].password_hash !== hash) {
    throw new Error('Invalid email or password.');
  }

  const userData = rows[0].data || {};
  const userSession = {
    email: cleanEmail,
    displayName: userData.displayName || cleanEmail.split('@')[0]
  };

  localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(userSession));
  return { user: userSession, data: userData };
}

// Decode Google JWT credential token
export function decodeJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to decode Google JWT token:', e);
    return null;
  }
}

// 1-Click Google Sign-In / Sign-Up with Neon Cloud Sync
export async function loginOrSignUpWithGoogle(jwtCredential, existingLocalData = null) {
  const profile = decodeJwt(jwtCredential);
  if (!profile || !profile.email) {
    throw new Error('Could not read user profile from Google credential.');
  }

  const sql = getSql();
  if (!sql) {
    throw new Error('Neon database is not configured.');
  }

  await initNeonTable();

  const cleanEmail = profile.email.trim().toLowerCase();
  const displayName = profile.name || cleanEmail.split('@')[0];
  const photoUrl = profile.picture || '';

  // Check if account already exists in Neon
  const existing = await sql`
    SELECT email, data FROM writyy_users WHERE LOWER(email) = ${cleanEmail} LIMIT 1
  `;

  let userData = {};
  if (existing && existing.length > 0) {
    // Existing user: retrieve data
    userData = existing[0].data || {};
    if (!userData.displayName || !userData.photoUrl) {
      userData.displayName = userData.displayName || displayName;
      userData.photoUrl = userData.photoUrl || photoUrl;
      await sql`
        UPDATE writyy_users 
        SET data = ${JSON.stringify(userData)}::jsonb, updated_at = NOW() 
        WHERE LOWER(email) = ${cleanEmail}
      `;
    }
  } else {
    // New user with Google: preserve any local progress from this device!
    userData = existingLocalData ? {
      displayName,
      photoUrl,
      stack1_mastered: existingLocalData.stack1_mastered || [],
      stack2_spelling: existingLocalData.stack2_spelling || [],
      stack3_meaning: existingLocalData.stack3_meaning || [],
      customWords: (existingLocalData.allWords || []).filter(w => w.id && w.id.startsWith('custom_')),
      stats: existingLocalData.stats || { totalTested: 0, correctSpelling: 0 },
      history: (existingLocalData.history || []).slice(-100),
      lastUpdated: new Date().toISOString()
    } : {
      displayName,
      photoUrl,
      stack1_mastered: [],
      stack2_spelling: [],
      stack3_meaning: [],
      customWords: [],
      stats: { totalTested: 0, correctSpelling: 0 },
      history: [],
      lastUpdated: new Date().toISOString()
    };

    const googleHash = 'google_oauth_' + (profile.sub || Math.random().toString(36));
    await sql`
      INSERT INTO writyy_users (email, password_hash, data) 
      VALUES (${cleanEmail}, ${googleHash}, ${JSON.stringify(userData)}::jsonb)
    `;
  }

  const userSession = {
    email: cleanEmail,
    displayName: userData.displayName || displayName,
    photoUrl: userData.photoUrl || photoUrl,
    provider: 'google'
  };

  localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(userSession));
  return { user: userSession, data: userData };
}

// Session management
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function logoutUser() {
  try {
    localStorage.removeItem(STORAGE_SESSION_KEY);
  } catch (e) {}
}

// Pull progress from Neon PostgreSQL
export async function fetchUserData(email) {
  const sql = getSql();
  if (!sql || !email) return null;

  try {
    const rows = await sql`
      SELECT data FROM writyy_users WHERE LOWER(email) = LOWER(${email.trim()}) LIMIT 1
    `;
    if (rows && rows.length > 0) {
      return rows[0].data;
    }
    return null;
  } catch (err) {
    console.warn('[Neon] Fetch error:', err);
    return null;
  }
}

// Push progress to Neon PostgreSQL
export async function pushUserData(email, dataPayload) {
  const sql = getSql();
  if (!sql || !email) return false;

  try {
    await sql`
      UPDATE writyy_users 
      SET data = ${JSON.stringify(dataPayload)}::jsonb, updated_at = NOW() 
      WHERE LOWER(email) = LOWER(${email.trim()})
    `;
    return true;
  } catch (err) {
    console.warn('[Neon] Push error:', err);
    return false;
  }
}
