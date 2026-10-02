import React, { useState } from 'react';
import { 
  loginWithEmail, 
  signUpWithEmail, 
  logoutUser, 
  loginWithGoogle,
  isFirebaseConfigured, 
  getFirebaseConfig, 
  saveFirebaseConfig 
} from '../utils/firebase';

export default function AuthModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  onSyncNow, 
  isSyncing,
  lastSyncTime 
}) {
  const [tab, setTab] = useState('login'); // 'login' | 'signup' | 'config'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Firebase Config Form State
  const [configJson, setConfigJson] = useState(() => {
    return JSON.stringify(getFirebaseConfig(), null, 2);
  });

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      if (tab === 'login') {
        await loginWithEmail(email, password);
        setSuccessMsg('✓ Logged in successfully! Syncing your words...');
        setTimeout(() => {
          onClose();
        }, 1000);
      } else if (tab === 'signup') {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        await signUpWithEmail(email, password, displayName);
        setSuccessMsg('🎉 Account created! Your vocabulary is now synced to the cloud.');
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err) {
      console.error('[Auth Error]', err);
      let msg = err.message || 'Authentication failed.';
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        msg = 'Invalid email or password. If you haven\'t created an account yet, click "Create Account" above!';
      } else if (msg.includes('auth/user-not-found')) {
        msg = 'No account found with this email. Please switch to "Create Account" tab above.';
      } else if (msg.includes('auth/email-already-in-use')) {
        msg = 'An account with this email already exists. Switch to "Sign In" tab to log in.';
      } else if (msg.includes('auth/weak-password')) {
        msg = 'Password should be at least 6 characters.';
      } else if (msg.includes('auth/invalid-email')) {
        msg = 'Please enter a valid email address.';
      } else if (msg.includes('auth/unauthorized-domain')) {
        msg = 'Domain not authorized in Firebase Console (Settings > Authorized domains).';
      }
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      await loginWithGoogle();
      setSuccessMsg('✓ Signed in with Google! Syncing...');
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      console.error('[Google Auth Error]', err);
      let msg = err.message || 'Google sign-in failed.';
      if (msg.includes('auth/popup-closed-by-user')) {
        msg = 'Google popup was closed before completing sign-in.';
      } else if (msg.includes('auth/popup-blocked')) {
        msg = 'Google popup was blocked by your browser. Please allow popups.';
      } else if (msg.includes('auth/unauthorized-domain')) {
        msg = 'Domain not authorized. Please add writyy.onrender.com to Authorized domains in Firebase Console.';
      }
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setSuccessMsg('Logged out.');
      setTimeout(() => onClose(), 800);
    } catch (err) {
      setErrorMsg('Failed to logout.');
    }
  };

  const handleSaveConfig = () => {
    try {
      const parsed = JSON.parse(configJson);
      saveFirebaseConfig(parsed);
      setSuccessMsg('✓ Firebase configuration saved! Reloading...');
    } catch (err) {
      setErrorMsg('Invalid JSON format. Please paste valid Firebase config.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="install-guide-modal auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <div className="auth-modal-header-brand">
            <span className="auth-cloud-icon">☁️</span>
            <div>
              <h3>Cloud Sync & Account</h3>
              <p className="modal-sub" style={{ margin: 0 }}>
                Sync words across your phone, tablet, and computer.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* If User Is Already Logged In */}
        {currentUser ? (
          <div className="auth-logged-in-box">
            <div className="user-profile-summary">
              <div className="user-avatar-circle">
                {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : (currentUser.email ? currentUser.email[0].toUpperCase() : 'U')}
              </div>
              <div className="user-profile-meta">
                <span className="user-name-title">{currentUser.displayName || 'Vocabulary Learner'}</span>
                <span className="user-email-text">{currentUser.email}</span>
                <span className="user-sync-badge">
                  🟢 Connected to Cloud Database
                </span>
              </div>
            </div>

            {lastSyncTime && (
              <div className="sync-time-row">
                <span>Last Cloud Sync:</span>
                <strong>{new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
              </div>
            )}

            <div className="auth-action-buttons">
              <button 
                className="btn-download-pack" 
                onClick={onSyncNow}
                disabled={isSyncing}
                style={{ background: 'var(--oxford-blue)', marginBottom: '8px' }}
              >
                <span>🔄 {isSyncing ? 'Syncing Now...' : 'Force Sync With Cloud'}</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Phone ⇄ Web</span>
              </button>

              <button 
                className="btn-signout-danger"
                onClick={handleLogout}
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          /* Sign In / Sign Up Forms */
          <div className="auth-form-wrapper">
            <div className="auth-tab-row">
              <button 
                className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
                onClick={() => { setTab('login'); setErrorMsg(''); setSuccessMsg(''); }}
              >
                Sign In
              </button>
              <button 
                className={`auth-tab-btn ${tab === 'signup' ? 'active' : ''}`}
                onClick={() => { setTab('signup'); setErrorMsg(''); setSuccessMsg(''); }}
              >
                Create Account
              </button>
              <button 
                className={`auth-tab-btn ${tab === 'config' ? 'active' : ''}`}
                onClick={() => { setTab('config'); setErrorMsg(''); setSuccessMsg(''); }}
                title="Firebase Project Settings"
              >
                ⚙️ Config
              </button>
            </div>

            {errorMsg && (
              <div className="auth-alert error-alert">
                <span>⚠️ {errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="auth-alert success-alert">
                <span>{successMsg}</span>
              </div>
            )}

            {tab === 'config' ? (
              <div className="firebase-config-panel">
                <p style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '8px', lineHeight: 1.4 }}>
                  Paste your Firebase Project configuration JSON from your Firebase Console (Project Settings → Web Apps):
                </p>
                <textarea 
                  className="firebase-config-textarea"
                  value={configJson}
                  onChange={(e) => setConfigJson(e.target.value)}
                  rows={8}
                />
                <button 
                  className="cta-red-button"
                  onClick={handleSaveConfig}
                  style={{ marginTop: '10px' }}
                >
                  <span>Save Configuration</span>
                  <span className="btn-arrow-circle">✓</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="auth-form">
                {tab === 'signup' && (
                  <div className="form-group-custom">
                    <label>Full Name (Optional)</label>
                    <input 
                      type="text"
                      placeholder="e.g. Anar"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                )}

                <div className="form-group-custom">
                  <label>Email Address</label>
                  <input 
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="form-group-custom">
                  <label>Password</label>
                  <input 
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <button 
                  type="submit" 
                  className="cta-red-button" 
                  disabled={isLoading}
                  style={{ marginTop: '12px' }}
                >
                  <span>{isLoading ? 'Processing...' : (tab === 'login' ? 'Sign In to Writyy' : 'Create Free Account')}</span>
                  <span className="btn-arrow-circle">→</span>
                </button>

                <div className="auth-divider">
                  <span>OR</span>
                </div>

                <button 
                  type="button" 
                  className="btn-google-signin"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
