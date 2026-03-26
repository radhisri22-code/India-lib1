import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, onSnapshot, deleteDoc, doc,
  serverTimestamp, query, orderBy, updateDoc, arrayUnion
} from 'firebase/firestore';
import { FiSend, FiTrash2, FiSlash, FiMessageCircle, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from './Toast';
import './CommentSection.css';

const CommentSection = ({ courseId, contentId, contentType = 'video', isTeacher = false }) => {
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const commentsPath = `courses/${courseId}/content/${contentId}/comments`;

  useEffect(() => {
    const q = query(collection(db, commentsPath), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [courseId, contentId]);

  const addComment = async () => {
    if (!newComment.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, commentsPath), {
        text: newComment.trim(),
        userId: currentUser.uid,
        userName: userProfile?.displayName || currentUser.email,
        userPhotoURL: userProfile?.photoURL || null,
        isTeacher: userProfile?.role === 'teacher',
        createdAt: serverTimestamp(),
        courseId,
        contentId
      });
      setNewComment('');
      toast('Comment posted!', 'success');
    } catch (err) {
      toast('Failed to post comment', 'error');
    } finally {
      setLoading(false);
    }
  };

  const deleteComment = async (commentId) => {
    try {
      await deleteDoc(doc(db, commentsPath, commentId));
      toast('Comment deleted', 'info');
    } catch {
      toast('Failed to delete comment', 'error');
    }
  };

  const blockUser = async (userId, userName) => {
    if (!isTeacher) return;
    try {
      await updateDoc(doc(db, 'courses', courseId), {
        blockedUsers: arrayUnion(userId)
      });
      toast(`${userName} has been blocked`, 'warning');
    } catch {
      toast('Failed to block user', 'error');
    }
  };

  const canDelete = (comment) => {
    return isTeacher || comment.userId === currentUser?.uid;
  };

  return (
    <div className="comment-section">
      <div className="comment-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="flex items-center gap-2">
          <FiMessageCircle size={18} />
          <h3>Comments ({comments.length})</h3>
        </div>
        {collapsed ? <FiChevronDown size={18} /> : <FiChevronUp size={18} />}
      </div>

      {!collapsed && (
        <>
          {/* Add comment */}
          {currentUser && (
            <div className="add-comment">
              <div className="avatar avatar-sm" style={{ background: userProfile?.role === 'teacher' ? 'var(--primary)' : 'var(--secondary)' }}>
                {userProfile?.photoURL
                  ? <img src={userProfile.photoURL} alt="" />
                  : (userProfile?.displayName?.[0] || 'U').toUpperCase()}
              </div>
              <div className="comment-input-wrap">
                <textarea
                  className="form-input comment-input"
                  placeholder="Share your thoughts or ask a question..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  rows={2}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); }
                  }}
                />
                <div className="comment-input-actions">
                  <span className="text-xs text-muted">Press Enter to post</span>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={addComment}
                    disabled={loading || !newComment.trim()}
                  >
                    {loading ? <span className="spinner" /> : <><FiSend size={14} /> Post</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Comments list */}
          <div className="comments-list">
            {comments.length === 0 ? (
              <div className="no-comments">
                <FiMessageCircle size={32} />
                <p>No comments yet. Be the first to comment!</p>
              </div>
            ) : (
              comments.map(comment => (
                <div key={comment.id} className={`comment-item ${comment.isTeacher ? 'teacher' : ''}`}>
                  <div className="avatar avatar-sm" style={{ background: comment.isTeacher ? 'var(--primary)' : 'var(--secondary)' }}>
                    {comment.userPhotoURL
                      ? <img src={comment.userPhotoURL} alt="" />
                      : (comment.userName?.[0] || 'U').toUpperCase()}
                  </div>
                  <div className="comment-content">
                    <div className="comment-meta">
                      <span className="comment-author">{comment.userName}</span>
                      {comment.isTeacher && <span className="badge badge-primary" style={{ fontSize: '0.6rem' }}>Teacher</span>}
                      <span className="comment-time text-muted text-xs">
                        {comment.createdAt?.toDate
                          ? new Date(comment.createdAt.toDate()).toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })
                          : 'Just now'}
                      </span>
                    </div>
                    <p className="comment-text">{comment.text}</p>
                    {(canDelete(comment) || isTeacher) && (
                      <div className="comment-actions">
                        {canDelete(comment) && (
                          <button className="comment-action-btn danger" onClick={() => deleteComment(comment.id)}>
                            <FiTrash2 size={12} /> Delete
                          </button>
                        )}
                        {isTeacher && comment.userId !== currentUser?.uid && (
                          <button className="comment-action-btn danger" onClick={() => blockUser(comment.userId, comment.userName)}>
                            <FiSlash size={12} /> Block User
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CommentSection;
