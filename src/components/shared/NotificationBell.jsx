import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, updateDoc, doc, writeBatch
} from 'firebase/firestore';
import { FiBell, FiCheck, FiX } from 'react-icons/fi';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import './NotificationBell.css';

const ICONS = {
  enrollment:     '🎓',
  new_enrollment: '🙋',
  live:           '🔴',
  new_lesson:     '📚',
  default:        '🔔'
};

const timeAgo = (ts) => {
  if (!ts) return '';
  const ms   = Date.now() - (ts.seconds ? ts.seconds * 1000 : ts);
  const mins = Math.floor(ms / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const NotificationBell = () => {
  const { currentUser } = useAuth();
  const navigate        = useNavigate();
  const [open, setOpen]     = useState(false);
  const [notifs, setNotifs] = useState([]);
  const dropRef = useRef(null);

  const unread = notifs.filter(n => !n.read).length;

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q, snap => {
      setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return unsub;
  }, [currentUser]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (notif) => {
    if (!notif.read) {
      await updateDoc(doc(db, 'notifications', notif.id), { read: true });
    }
    if (notif.link) {
      setOpen(false);
      navigate(notif.link);
    }
  };

  const markAllRead = async () => {
    const unreadNotifs = notifs.filter(n => !n.read);
    if (!unreadNotifs.length) return;
    const batch = writeBatch(db);
    unreadNotifs.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }));
    await batch.commit();
  };

  if (!currentUser) return null;

  return (
    <div className="notif-wrapper" ref={dropRef}>
      <button
        className={`notif-bell-btn ${unread > 0 ? 'has-unread' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Notifications"
      >
        <FiBell size={18} />
        {unread > 0 && (
          <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span className="notif-header-title">Notifications</span>
            {unread > 0 && (
              <button className="notif-mark-all" onClick={markAllRead}>
                <FiCheck size={13} /> Mark all read
              </button>
            )}
            <button className="notif-close" onClick={() => setOpen(false)}>
              <FiX size={16} />
            </button>
          </div>

          <div className="notif-list">
            {notifs.length === 0 && (
              <div className="notif-empty">
                <FiBell size={28} />
                <p>No notifications yet</p>
              </div>
            )}
            {notifs.map(n => (
              <div
                key={n.id}
                className={`notif-item ${!n.read ? 'unread' : ''} ${n.link ? 'clickable' : ''}`}
                onClick={() => markRead(n)}
              >
                <div className="notif-icon">{ICONS[n.type] || ICONS.default}</div>
                <div className="notif-content">
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-body">{n.body}</div>
                  <div className="notif-time">{timeAgo(n.createdAt)}</div>
                </div>
                {!n.read && <div className="notif-dot" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
