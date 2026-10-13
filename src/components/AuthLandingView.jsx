import React, { useState, useEffect, useRef } from 'react';
import { 
  loginWithEmail, 
  signUpWithEmail, 
  loginOrSignUpWithGoogle, 
  getGoogleClientId,
  isNeonConfigured 
} from '../utils/neonDb';
import { getStoredData } from '../utils/storage';

export default function AuthLandingView({ 
  onAuthSuccess, 
  onContinueAsGuest,
  initialMode = 'signup' // 'signup' | 'login'
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const googleBtnRef = useRef(null);
  const [googleReady, setGoogleReady] = useState(false);

  // Initialize official Google Identity Services button
  useEffect(() => {
    const clientId = getGoogleClientId();
    if (!clientId) return;

    let checkTimer = null;
    let attempts = 0;

    const renderGoogleBtn = () => {
      attempts++;
      if (window.google?.accounts?.id && googleBtnRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response) => {
              if (!response?.credential) return;
              setIsLoading(true);
              setErrorMsg('');
              try {
                // Pass guest/local data to be preserved into their new cloud account
                const localData = getStoredData();
                const res = await loginOrSignUpWithGoogle(response.credential, localData);
                setSuccessMsg(`🎉 Welcome, ${res.user.displayName || 'Learner'}! Connected to your database.`);
                setTimeout(() => {
                  onAuthSuccess(res.user, res.data);
                }, 400);
              } catch (err) {
                console.error('[Google Auth Error]', err);
                setErrorMsg(err.message || 'Google Sign-In failed. Please try again or use email.');
              } finally {
                setIsLoading(false);
              }
            }
          });

          googleBtnRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: mode === 'signup' ? 'signup_with' : 'signin_with',
            shape: 'pill',
            width: 300,
            logo_alignment: 'left'
          });
          setGoogleReady(true);
        } catch (e) {
          console.warn('[Google GSI Error]', e);
        }
      } else if (attempts < 30) {
        checkTimer = setTimeout(renderGoogleBtn, 150);
      }
    };

    renderGoogleBtn();

    return () => {
      if (checkTimer) clearTimeout(checkTimer);
    };
  }, [mode, onAuthSuccess]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const localData = getStoredData();
        const res = await signUpWithEmail(cleanEmail, password, displayName, localData);
        setSuccessMsg(
          res.autoLoggedIn 
            ? '✓ Welcome back! Signing in to your account...' 
            : '🎉 Account created! Your personal database is ready.'
        );
        setTimeout(() => {
          onAuthSuccess(res.user, res.data);
        }, 500);
      } else {
        const res = await loginWithEmail(cleanEmail, password);
        setSuccessMsg('✓ Logged in successfully! Loading your database...');
        setTimeout(() => {
          onAuthSuccess(res.user, res.data);
        }, 400);
      }
    } catch (err) {
      console.error('[Auth Error]', err);
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-landing-viewport">
      <div className="auth-landing-card">
        {/* Top Brand Header */}
        <div className="auth-landing-brand-row">
          <div className="brand-badge-large">
            <span className="brand-navy">lazy</span>
            <span className="brand-red">writyy</span>
            <span className="brand-dot"></span>
          </div>
          <span className="auth-version-pill">IELTS & AWL 2026</span>
        </div>

        {/* Hero Title & Subtitle */}
        <div className="auth-landing-hero">
          <h1 className="auth-hero-title">
            {mode === 'signup' ? 'Create Your Account' : 'Welcome Back'}
          </h1>
          <p className="auth-hero-subtitle">
            {mode === 'signup' 
              ? 'Join to master 5,941 IELTS & AWL words with your private cloud database and cross-device sync.' 
              : 'Sign in to access your saved vocabulary stacks, spelling history, and study notes.'}
          </p>
        </div>

        {/* Feature Highlights Pills */}
        <div className="auth-highlights-row">
          <span className="auth-highlight-chip">🎧 Auditory Recall</span>
          <span className="auth-highlight-chip">🎓 5,941 Words</span>
          <span className="auth-highlight-chip">☁️ Cloud Database</span>
          <span className="auth-highlight-chip">📱 100% Offline</span>
        </div>

        {/* Error / Success Feedback */}
        {errorMsg && (
          <div className="auth-alert error-alert fade-in">
            <span>⚠️ {errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-alert success-alert fade-in">
            <span>{successMsg}</span>
          </div>
        )}

        {/* 1-Click Google Sign In Section */}
        <div className="auth-google-wrapper">
          <div ref={googleBtnRef} className="google-btn-slot" />
          {!googleReady && !navigator.onLine && (
            <div className="auth-offline-notice">
              <span>📶 Offline: Google sign-in requires internet. You can use guest mode below.</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="auth-divider-line">
          <div className="divider-line" />
          <span className="divider-text">or continue with email</span>
          <div className="divider-line" />
        </div>

        {/* Segmented Mode Selector */}
        <div className="auth-segment-switch">
          <button 
            type="button"
            className={`auth-segment-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setErrorMsg(''); setSuccessMsg(''); }}
          >
            Create Account
          </button>
          <button 
            type="button"
            className={`auth-segment-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setErrorMsg(''); setSuccessMsg(''); }}
          >
            Sign In
          </button>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="auth-landing-form">
          {mode === 'signup' && (
            <div className="form-group-custom">
              <label htmlFor="auth-name-input">Full Name (Optional)</label>
              <input 
                id="auth-name-input"
                type="text"
                autoComplete="name"
                placeholder="e.g. Anar"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isLoading}
              />
            </div>
          )}

          <div className="form-group-custom">
            <label htmlFor="auth-email-input">Email Address</label>
            <input 
              id="auth-email-input"
              type="email"
              required
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="form-group-custom">
            <div className="form-label-row">
              <label htmlFor="auth-password-input">Password</label>
              <button 
                type="button"
                className="show-pwd-toggle-btn"
                onClick={() => setShowPassword(p => !p)}
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input 
              id="auth-password-input"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <button 
            type="submit" 
            className="auth-primary-submit-btn" 
            disabled={isLoading}
          >
            <span>
              {isLoading 
                ? 'Connecting to database...' 
                : (mode === 'signup' ? 'Create Free Account' : 'Sign In to Writyy')}
            </span>
            <span className="submit-arrow-circle">→</span>
          </button>
        </form>

        {/* Offline / Guest Mode Escape Hatch */}
        <div className="auth-guest-mode-box">
          <button 
            type="button" 
            className="auth-guest-mode-btn"
            onClick={onContinueAsGuest}
          >
            <span>⚡ Continue as Guest (Offline Mode)</span>
            <span className="guest-arrow">›</span>
          </button>
          <p className="auth-guest-caption">
            Use the app completely offline without creating an account.
          </p>
        </div>

        {/* Security & Database Note */}
        <div className="auth-footer-security">
          <span>🔒 Each account receives an isolated, secure PostgreSQL database store in Neon.</span>
        </div>
      </div>
    </div>
  );
}
