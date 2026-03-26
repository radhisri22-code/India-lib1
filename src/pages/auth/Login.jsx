import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { FiUserCheck, FiUser } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/shared/Toast';
import './Auth.css';

const Login = () => {
  const [role, setRole] = useState('student');
  const [loading, setLoading] = useState(false);
  const { loginWithGoogle } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await loginWithGoogle(role);
      toast('Welcome to EduLive!', 'success');
      navigate('/');
    } catch (err) {
      toast('Login failed. Please try again.', 'error');
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
          <h2 className="auth-title">Welcome to EduLive</h2>
          <p className="auth-subtitle">Sign in with your Google account to continue</p>

          {/* Role Selector */}
          <div className="role-selector">
            <button
              type="button"
              className={`role-btn ${role === 'student' ? 'active' : ''}`}
              onClick={() => setRole('student')}
            >
              <FiUser size={20} />
              I'm a Student
            </button>
            <button
              type="button"
              className={`role-btn ${role === 'teacher' ? 'active' : ''}`}
              onClick={() => setRole('teacher')}
            >
              <FiUserCheck size={20} />
              I'm a Teacher
            </button>
          </div>

          <button
            className="btn-google"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading
              ? <span className="spinner" />
              : <><FcGoogle size={24} /> Continue with Google</>}
          </button>

          <p className="auth-note">
            First time? Just sign in — your account is created automatically.
          </p>
        </div>
      </div>

      <div className="auth-illustration">
        <div className="illustration-content">
          {role === 'teacher' ? (
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
              <h2>Start Your Learning Journey</h2>
              <p>Access courses, join live classes, and learn from expert teachers.</p>
              <div className="feature-list">
                <div className="feature-item">Live interactive classes</div>
                <div className="feature-item">Watch recordings anytime</div>
                <div className="feature-item">Real-time chat with teachers</div>
                <div className="feature-item">Enrolled-only secure content</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
