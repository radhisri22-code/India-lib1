import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { onValue, ref as dbRef, off } from 'firebase/database';
import { FiPlay, FiX, FiUsers } from 'react-icons/fi';
import { rtdb } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import './LiveNotification.css';

/**
 * Global floating banner — shows when any enrolled course goes live.
 * Rendered once at the app level (inside AppRoutes).
 */
const LiveNotification = () => {
  const { userProfile } = useAuth();
  const location = useLocation();
  const [activeLive, setActiveLive]       = useState(null);
  const [dismissed, setDismissed]         = useState(false);
  const [prevSessionId, setPrevSessionId] = useState(null);

  const enrolled = userProfile?.enrolledCourses || [];

  useEffect(() => {
    if (enrolled.length === 0) return;
    const ref = dbRef(rtdb, 'liveSessions');
    onValue(ref, snap => {
      const data = snap.val();
      if (!data) { setActiveLive(null); return; }

      // Find first live session for an enrolled course
      const entry = Object.entries(data).find(
        ([, s]) => s.isLive && enrolled.includes(s.courseId)
      );
      if (!entry) { setActiveLive(null); return; }

      const [sessionId, session] = entry;
      setActiveLive({ sessionId, ...session });

      // Reset dismissed flag if a new session started
      if (sessionId !== prevSessionId) {
        setPrevSessionId(sessionId);
        setDismissed(false);
      }
    });
    return () => off(ref);
  }, [enrolled.join(',')]); // eslint-disable-line

  if (!activeLive || dismissed) return null;

  // Don't show if already on the live page
  if (/\/(teacher\/)?live\//.test(location.pathname)) return null;

  return (
    <div className="live-notification">
      <div className="live-notif-pulse" />
      <div className="live-notif-body">
        <div className="live-notif-tag">
          <div className="live-dot" /> LIVE NOW
        </div>
        <div className="live-notif-info">
          <span className="live-notif-title">{activeLive.title || 'Live Class'}</span>
          <span className="live-notif-sub">
            {activeLive.teacherName && `by ${activeLive.teacherName}`}
            {activeLive.viewers && <><FiUsers size={11} /> {Object.keys(activeLive.viewers || {}).length} watching</>}
          </span>
        </div>
      </div>
      <Link
        to={`/live/${activeLive.courseId}/${activeLive.sessionId}`}
        className="live-notif-join"
      >
        <FiPlay size={14} /> Join Now
      </Link>
      <button className="live-notif-close" onClick={() => setDismissed(true)}>
        <FiX size={15} />
      </button>
    </div>
  );
};

export default LiveNotification;
