import React, { useState, useEffect, useRef } from 'react';
import { 
  loginWithEmail, 
  signUpWithEmail, 
  loginOrSignUpWithGoogle,
  logoutUser, 
  getNeonUrl, 
  saveNeonUrl, 
  getGoogleClientId,
  isNeonConfigured 
} from '../utils/neonDb';
import { getStoredData } from '../utils/storage';

export default function AuthModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  onSyncNow, 
  isSyncing,
  lastSyncTime,
  onUserAuthChange,
  data,
  xpBalance = 0,
  todayTested = 0,
  todayCorrect = 0,
  todayWrong = 0,
  total = 0,
  correct = 0,
  wrong = 0,
  accuracy = 0,
  estimatedBand = 'N/A',
  onResetProgress,
  onOpenDownload
}) {
  const [tab, setTab] = useState('login'); // 'login' | 'signup' | 'config'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const googleBtnContainerRef = useRef(null);

  // Initialize & Render Google Identity Services (GIS) Button
  useEffect(() => {
    if (!isOpen || currentUser || tab === 'config') return;

    const clientId = getGoogleClientId();
    if (!clientId) return;

    let checkTimer = null;
    let attempts = 0;

    const renderGoogleBtn = () => {
      attempts++;
      if (window.google?.accounts?.id && googleBtnContainerRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response) => {
              if (!response?.credential) return;
              setIsLoading(true);
              setErrorMsg('');
              try {
                const localData = getStoredData();
                const res = await loginOrSignUpWithGoogle(response.credential, localData);
                setSuccessMsg(`🎉 Welcome, ${res.user.displayName}! Synced with Neon.`);
                if (onUserAuthChange) onUserAuthChange(res.user, res.data);
                setTimeout(() => onClose(), 800);
              } catch (err) {
                console.error('[Google Auth Error]', err);
                setErrorMsg(err.message || 'Google sign-in failed.');
              } finally {
                setIsLoading(false);
              }
            }
          });

          googleBtnContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            width: 280,
            logo_alignment: 'left'
          });
        } catch (e) {
          console.warn('[Google GSI Error]', e);
        }
      } else if (attempts < 25) {
        checkTimer = setTimeout(renderGoogleBtn, 150);
      }
    };

    renderGoogleBtn();

    return () => {
      if (checkTimer) clearTimeout(checkTimer);
    };
  }, [isOpen, currentUser, tab]);

  // Neon DB Connection Form State
  const [neonUrlInput, setNeonUrlInput] = useState(() => getNeonUrl());

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      if (tab === 'login') {
        const res = await loginWithEmail(email, password);
        setSuccessMsg('✓ Logged in successfully! Syncing vocabulary...');
        if (onUserAuthChange) onUserAuthChange(res.user, res.data);
        setTimeout(() => onClose(), 800);
      } else if (tab === 'signup') {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        const localData = getStoredData();
        const res = await signUpWithEmail(email, password, displayName, localData);
        setSuccessMsg(res.autoLoggedIn ? '✓ Connected to your existing account! Syncing vocabulary...' : '🎉 Account created! Connected to Neon Cloud Database.');
        if (onUserAuthChange) onUserAuthChange(res.user, res.data);
        setTimeout(() => onClose(), 800);
      }
    } catch (err) {
      console.error('[Auth Error]', err);
      setErrorMsg(err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logoutUser();
    if (onUserAuthChange) onUserAuthChange(null, null);
    setSuccessMsg('Logged out.');
    setTimeout(() => onClose(), 600);
  };

  const handleSaveConfig = () => {
    const trimmed = (neonUrlInput || '').trim();
    if (!trimmed.startsWith('postgres')) {
      setErrorMsg('Please enter a valid PostgreSQL connection string (starts with postgresql:// or postgres://)');
      return;
    }
    saveNeonUrl(trimmed);
    setSuccessMsg('✓ Neon connection saved! Reloading...');
  };

  const renderStatsAndXp = () => (
    <>
      {/* Strict XP & Today's Performance Card */}
      <div className={`user-xp-box ${xpBalance >= 0 ? 'is-green' : 'is-red'}`}>
        <div className="user-xp-box-header">
          <span className="user-xp-title">Account XP Balance</span>
          <span className={`user-xp-val ${xpBalance >= 0 ? 'green-text' : 'red-text'}`}>
            {xpBalance >= 0 ? `+${xpBalance} XP` : `${xpBalance} XP`}
          </span>
        </div>
        <div className="user-xp-box-detail">
          <span>Today: <strong>{todayTested}</strong> words ({todayCorrect} correct, {todayWrong} wrong)</span>
        </div>
      </div>

      {/* Comprehensive Learning Statistics */}
      <div className="modal-stats-section">
        <div className="modal-stats-section-title">
          <span>📊 Learning Performance</span>
        </div>

        <div className="modal-metric-triad">
          <div className="m-metric-box">
            <span className="m-metric-label">Accuracy</span>
            <span className="m-metric-val blue-val">{accuracy}%</span>
            <span className="m-metric-sub">{correct} correct · {wrong} wrong</span>
          </div>
          <div className="m-metric-box">
            <span className="m-metric-label">Words Taken</span>
            <span className="m-metric-val dark-val">{total}</span>
            <span className="m-metric-sub">Total Attempts</span>
          </div>
          <div className="m-metric-box">
            <span className="m-metric-label">IELTS Band</span>
            <span className="m-metric-val red-val">{estimatedBand}</span>
            <span className="m-metric-sub">Estimated</span>
          </div>
        </div>

        {/* Stacks Breakdown */}
        <div className="modal-stacks-row">
          <div className="modal-stack-chip s1-chip">
            <span className="m-stack-title">Stack 1 (Mastered)</span>
            <span className="m-stack-count">{data?.stack1_mastered?.length || 0} words</span>
          </div>
          <div className="modal-stack-chip s2-chip">
            <span className="m-stack-title">Stack 2 (Spelling)</span>
            <span className="m-stack-count">{data?.stack2_spelling?.length || 0} words</span>
          </div>
          <div className="modal-stack-chip s3-chip">
            <span className="m-stack-title">Stack 3 (Meaning)</span>
            <span className="m-stack-count">{data?.stack3_meaning?.length || 0} words</span>
          </div>
        </div>

        {data?.struggledHistory && data.struggledHistory.length > 0 && (
          <div className="modal-history-note">
            <span>📚 <strong>{data.struggledHistory.length} words</strong> preserved in your Review History Bank</span>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="install-guide-modal auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <div className="auth-modal-header-brand">
            <span className="auth-cloud-icon">👤</span>
            <div>
              <h3>Account & Statistics</h3>
              <p className="modal-sub" style={{ margin: 0 }}>
                {currentUser ? `Connected as ${currentUser.displayName || currentUser.email}` : 'Profile, Cloud Sync & Learning Performance'}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* If User Is Already Logged In */}
        {currentUser ? (
          <div className="auth-logged-in-box">
            <div className="user-profile-summary">
              <div className="user-avatar-circle" style={{ overflow: 'hidden' }}>
                {currentUser.photoUrl ? (
                  <img src={currentUser.photoUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  currentUser.displayName ? currentUser.displayName[0].toUpperCase() : (currentUser.email ? currentUser.email[0].toUpperCase() : 'U')
                )}
              </div>
              <div className="user-profile-meta">
                <span className="user-name-title">{currentUser.displayName || 'Vocabulary Learner'}</span>
                <span className="user-email-text">{currentUser.email}</span>
                <span className="user-sync-badge">
                  {currentUser.provider === 'google' ? '🟢 Google Account & Neon Synced' : '🟢 Connected to Neon Database'}
                </span>
              </div>
            </div>

            {/* Strict XP & Comprehensive Learning Statistics */}
            {renderStatsAndXp()}

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
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Phone ⇄ Laptop</span>
              </button>

              <button 
                className="btn-signout-danger"
                onClick={handleLogout}
              >
                Sign Out
              </button>
            </div>

            {onResetProgress && (
              <div className="modal-reset-link-wrap">
                <button className="reset-link-btn" onClick={onResetProgress}>
                  🗑️ Reset All Progress Stacks
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Sign In / Sign Up Forms & Guest Performance */
          <div className="auth-form-wrapper">
            {/* Strict XP & Comprehensive Learning Statistics */}
            {renderStatsAndXp()}

            {onResetProgress && (
              <div className="modal-reset-link-wrap" style={{ marginBottom: '14px' }}>
                <button className="reset-link-btn" onClick={onResetProgress}>
                  🗑️ Reset All Progress Stacks
                </button>
              </div>
            )}

            <div className="modal-stats-section-title" style={{ marginTop: '8px', marginBottom: '8px' }}>
              <span>☁️ Cloud Sync & Account Sign In</span>
            </div>

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
                title="Neon Database Settings"
              >
                ⚙️ Database
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
                  Enter your Neon PostgreSQL connection string (from console.neon.tech):
                </p>
                <textarea 
                  className="firebase-config-textarea"
                  value={neonUrlInput}
                  onChange={(e) => setNeonUrlInput(e.target.value)}
                  placeholder="postgresql://user:password@ep-xyz.region.neon.tech/neondb?sslmode=require"
                  rows={4}
                />
                <button 
                  className="cta-red-button" 
                  onClick={handleSaveConfig}
                  style={{ marginTop: '10px' }}
                >
                  <span>Save Connection String</span>
                  <span className="btn-arrow-circle">✓</span>
                </button>
              </div>
            ) : (
              <div>
                <div className="google-auth-section" style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div 
                    ref={googleBtnContainerRef} 
                    style={{ minHeight: '44px', display: 'flex', justifyContent: 'center', width: '100%' }}
                  />
                  <div className="auth-divider-line" style={{ display: 'flex', alignItems: 'center', width: '100%', margin: '14px 0 10px 0', color: '#94a3b8', fontSize: '0.78rem' }}>
                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                    <span style={{ padding: '0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or with email</span>
                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                {tab === 'signup' && (
                  <div className="form-group-custom">
                    <label>Your Name (Optional)</label>
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
              </form>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
}
