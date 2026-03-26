import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiMail, FiLock, FiUser, FiUserCheck } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/shared/Toast';
import './Auth.css';

const Register = () => {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: 'student' });
  const [loading, setLoading] = useState(false);
  const { register, loginWithGoogle } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { toast('Passwords do not match', 'error'); return; }
    if (form.password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    setLoading(true);
    try {
      await register(form.email, form.password, form.name, form.role);
      toast(`Welcome to EduLive, ${form.name}!`, 'success');
      navigate('/');
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use'
        ? 'Email already registered. Please login.'
        : 'Registration failed. Please try again.';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setLoading(true);
    try {
      await loginWithGoogle(form.role);
      toast('Account created with Google!', 'success');
      navigate('/');
    } catch {
      toast('Google signup failed', 'error');
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
          <h2 className="auth-title">Create Account</h2>
          <p className="auth-subtitle">Join our learning community</p>

          {/* Role Selector */}
          <div className="role-selector">
            <button
              type="button"
              className={`role-btn ${form.role === 'student' ? 'active' : ''}`}
              onClick={() => setForm(p => ({ ...p, role: 'student' }))}
            >
              <FiUser size={18} />
              I'm a Student
            </button>
            <button
              type="button"
              className={`role-btn ${form.role === 'teacher' ? 'active' : ''}`}
              onClick={() => setForm(p => ({ ...p, role: 'teacher' }))}
            >
              <FiUserCheck size={18} />
              I'm a Teacher
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div className="input-icon-wrap">
                <FiUser className="input-icon" size={16} />
                <input name="name" type="text" className="form-input input-with-icon"
                  placeholder="Your full name" value={form.name} onChange={handleChange} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div className="input-icon-wrap">
                <FiMail className="input-icon" size={16} />
                <input name="email" type="email" className="form-input input-with-icon"
                  placeholder="you@example.com" value={form.email} onChange={handleChange} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="input-icon-wrap">
                <FiLock className="input-icon" size={16} />
                <input name="password" type="password" className="form-input input-with-icon"
                  placeholder="Min 6 characters" value={form.password} onChange={handleChange} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <div className="input-icon-wrap">
                <FiLock className="input-icon" size={16} />
                <input name="confirm" type="password" className="form-input input-with-icon"
                  placeholder="Repeat password" value={form.confirm} onChange={handleChange} required />
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create Account'}
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>

          <button className="btn-google" onClick={handleGoogleRegister} disabled={loading}>
            <FcGoogle size={20} />
            Sign up with Google
          </button>

          <p className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>

      <div className="auth-illustration">
        <div className="illustration-content">
          {form.role === 'teacher' ? (
            <>
              <h2>Start Teaching Today</h2>
              <p>Create courses, host live classes, share your screen, and build your student community.</p>
              <div className="feature-list">
                <div className="feature-item">HD live streaming with screen share</div>
                <div className="feature-item">Built-in notepad for live teaching</div>
                <div className="feature-item">Chat moderation & student management</div>
                <div className="feature-item">Google Drive video storage</div>
              </div>
            </>
          ) : (
            <>
              <h2>Learn From the Best</h2>
              <p>Enroll in courses, join live classes, and get access to recordings forever.</p>
              <div className="feature-list">
                <div className="feature-item">Live & recorded class access</div>
                <div className="feature-item">Comment & chat with teachers</div>
                <div className="feature-item">YouTube & uploaded content</div>
                <div className="feature-item">Learn at your own pace</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Register;
