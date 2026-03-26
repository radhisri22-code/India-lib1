import React, { useState, useEffect, useRef } from 'react';
import { ref as dbRef, set, onValue, off } from 'firebase/database';
import { FiEdit3, FiX, FiMaximize2, FiMinimize2, FiSave } from 'react-icons/fi';
import { rtdb } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from './Toast';
import './Notepad.css';

// Floating notepad - teacher types, students see in real-time via RTDB
const Notepad = ({ sessionId, onClose, readOnly = false }) => {
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const noteRef = useRef(null);
  const syncTimerRef = useRef(null);

  const notepadDbRef = sessionId ? dbRef(rtdb, `liveSessions/${sessionId}/notepad`) : null;

  // Sync content from RTDB (for students: read only)
  useEffect(() => {
    if (!notepadDbRef) return;
    onValue(notepadDbRef, snap => {
      const data = snap.val();
      if (data && readOnly) {
        setContent(data.content || '');
      } else if (data && !content) {
        setContent(data.content || '');
      }
    });
    return () => off(notepadDbRef);
  }, [sessionId, readOnly]);

  // Debounced sync for teacher
  const handleChange = (e) => {
    const val = e.target.value;
    setContent(val);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncToRTDB(val);
    }, 400);
  };

  const syncToRTDB = async (val) => {
    if (!notepadDbRef || readOnly) return;
    try {
      await set(notepadDbRef, {
        content: val,
        updatedAt: Date.now(),
        updatedBy: userProfile?.displayName || currentUser?.email
      });
    } catch (err) {
      console.error('Notepad sync error:', err);
    }
  };

  const saveNote = () => {
    syncToRTDB(content);
    toast('Notes synced to students!', 'success');
  };

  // Drag logic
  const handleMouseDown = (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 380, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 400, e.clientY - dragOffset.y))
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  return (
    <div
      ref={noteRef}
      className={`notepad ${minimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
    >
      <div className="notepad-header" onMouseDown={handleMouseDown}>
        <div className="notepad-title">
          <FiEdit3 size={14} />
          <span>{readOnly ? 'Teacher Notes (Live)' : 'Notepad'}</span>
          {!readOnly && <span className="notepad-sync-indicator" />}
        </div>
        <div className="notepad-actions">
          {!readOnly && !minimized && (
            <button className="notepad-btn" onClick={saveNote} title="Sync notes">
              <FiSave size={14} />
            </button>
          )}
          <button className="notepad-btn" onClick={() => setMinimized(!minimized)} title="Minimize">
            {minimized ? <FiMaximize2 size={14} /> : <FiMinimize2 size={14} />}
          </button>
          <button className="notepad-btn danger" onClick={onClose} title="Close">
            <FiX size={14} />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="notepad-body">
          <textarea
            className="notepad-textarea"
            value={content}
            onChange={handleChange}
            placeholder={readOnly
              ? "Teacher hasn't added notes yet..."
              : "Type your notes here...\nStudents will see this in real-time!\n\nTip: Use this alongside screen share for live coding explanations."}
            readOnly={readOnly}
            spellCheck={false}
          />
          <div className="notepad-footer">
            <span>{content.length} chars</span>
            {!readOnly && <span className="text-success">● Live sync</span>}
            {readOnly && <span className="text-primary">● Teacher is typing...</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Notepad;
