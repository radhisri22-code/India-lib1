import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiMail, FiLock, FiLogIn } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/shared/Toast';
import './Auth.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast('Welcome back!', 'success');
      navigate('/');
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential'
        ? 'Invalid email or password'
        : err.code === 'auth/user-not-found'
        ? 'No account found with this email'
        : 'Login failed. Please try again.';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
      toast('Logged in with Google!', 'success');
      navigate('/');
    } catch {
      toast('Google login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <div className="auth-logo">E</div>
          <h1>EduLive</h1>
          <p>Learn. Teach. Grow.</p>
        </div>

        <div className="auth-card card">
          <h2 className="auth-title">Welcome Back</h2>
          <p className="auth-subtitle">Sign in to continue learning</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div className="input-icon-wrap">
                <FiMail className="input-icon" size={16} />
                <input
                  type="email"
                  className="form-input input-with-icon"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="input-icon-wrap">
                <FiLock className="input-icon" size={16} />
                <input
                  type="password"
                  className="form-input input-with-icon"
                  placeholder="Your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading}>
              {loading ? <span className="spinner" /> : <><FiLogIn size={16} /> Sign In</>}
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>

          <button className="btn-google" onClick={handleGoogleLogin} disabled={loading}>
            <FcGoogle size={20} />
            Continue with Google
          </button>

          <p className="auth-footer">
            Don't have an account? <Link to="/register">Create one free</Link>
          </p>
        </div>
      </div>

      <div className="auth-illustration">
        <div className="illustration-content">
          <h2>Start Your Learning Journey</h2>
          <p>Access thousands of courses, join live classes, and learn from expert teachers.</p>
          <div className="feature-list">
            <div className="feature-item">Live interactive classes with screen sharing</div>
            <div className="feature-item">Watch recordings anytime, anywhere</div>
            <div className="feature-item">Real-time chat with teachers</div>
            <div className="feature-item">Secure content with enrolled-only access</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
