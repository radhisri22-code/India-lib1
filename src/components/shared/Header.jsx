import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FiLogOut, FiUser, FiMenu, FiX, FiBook, FiVideo, FiHome } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from './Toast';
import './Header.css';

const Header = () => {
  const { currentUser, userProfile, logout, isTeacher } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      toast('Logged out successfully', 'success');
      navigate('/login');
    } catch {
      toast('Failed to logout', 'error');
    }
  };

  const avatarLetter = (userProfile?.displayName || currentUser?.email || 'U')[0].toUpperCase();

  const navLinks = isTeacher
    ? [
        { to: '/teacher', icon: <FiHome size={16} />, label: 'Dashboard' },
        { to: '/teacher/courses', icon: <FiBook size={16} />, label: 'My Courses' },
        { to: '/teacher/live', icon: <FiVideo size={16} />, label: 'Go Live' }
      ]
    : [
        { to: '/student', icon: <FiHome size={16} />, label: 'Dashboard' },
        { to: '/student/courses', icon: <FiBook size={16} />, label: 'Browse Courses' },
        { to: '/student/enrolled', icon: <FiVideo size={16} />, label: 'My Learning' }
      ];

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="header-logo">
          <div className="logo-icon">E</div>
          <span className="logo-text">EduLive</span>
        </Link>

        {currentUser && (
          <>
            <nav className={`header-nav ${mobileOpen ? 'open' : ''}`}>
              {navLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`nav-link ${location.pathname === link.to ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.icon}
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="header-actions">
              <div className="user-info">
                <div className="avatar avatar-sm" style={{ background: isTeacher ? 'var(--primary)' : 'var(--secondary)' }}>
                  {userProfile?.photoURL
                    ? <img src={userProfile.photoURL} alt="avatar" />
                    : avatarLetter}
                </div>
                <div className="user-details">
                  <span className="user-name">{userProfile?.displayName || 'User'}</span>
                  <span className="user-role">{isTeacher ? 'Teacher' : 'Student'}</span>
                </div>
              </div>
              <button className="btn btn-sm btn-secondary" onClick={handleLogout} title="Logout">
                <FiLogOut size={14} /> Logout
              </button>
              <button className="mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <FiX size={20} /> : <FiMenu size={20} />}
              </button>
            </div>
          </>
        )}

        {!currentUser && (
          <div className="header-actions">
            <Link to="/login" className="btn btn-outline btn-sm">Login</Link>
            <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
