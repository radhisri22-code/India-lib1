/**
 * Notifications utility
 * - Writes to Firestore `notifications` collection for in-app bell
 * - Writes to Firestore `mail` collection for email
 *   (connect Firebase Trigger Email extension to actually send emails)
 */

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

// ─── Create in-app notification ────────────────────────────────────────────────
export const createNotification = async ({ userId, type, title, body, link = '', courseId = '', courseName = '' }) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId, type, title, body, link, courseId, courseName,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.warn('Notification write failed:', e.message);
  }
};

// ─── Send enrollment email (writes to `mail` collection) ─────────────────────
// Install "Trigger Email" Firebase Extension to actually send emails.
// Extension watches this collection and sends via your SMTP config.
export const sendEnrollmentEmail = async ({ studentEmail, studentName, courseName, teacherName, courseId }) => {
  try {
    await addDoc(collection(db, 'mail'), {
      to: [studentEmail],
      message: {
        subject: `🎉 You're enrolled in "${courseName}"!`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:2rem;background:#fff;border-radius:12px;">
            <div style="text-align:center;margin-bottom:1.5rem;">
              <div style="font-size:3rem;">🎓</div>
              <h1 style="color:#6c63ff;margin:0.5rem 0;">Congratulations, ${studentName}!</h1>
            </div>
            <p style="font-size:1rem;color:#374151;line-height:1.7;">
              You have successfully enrolled in <strong>${courseName}</strong>
              ${teacherName ? ` by <strong>${teacherName}</strong>` : ''}.
            </p>
            <div style="background:#f3f4f6;border-radius:8px;padding:1.25rem;margin:1.5rem 0;">
              <p style="margin:0;color:#6c63ff;font-weight:700;font-size:0.95rem;">What's next?</p>
              <ul style="margin:0.75rem 0 0;padding-left:1.25rem;color:#374151;line-height:2;">
                <li>Watch all video lessons at your own pace</li>
                <li>Join live classes when the teacher goes live</li>
                <li>Use the chat to ask questions during live sessions</li>
              </ul>
            </div>
            <div style="text-align:center;margin-top:2rem;">
              <a href="${window.location.origin}/student/courses/${courseId}"
                style="background:#6c63ff;color:white;padding:0.75rem 2rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.95rem;">
                Start Learning →
              </a>
            </div>
            <p style="text-align:center;color:#9ca3af;font-size:0.8rem;margin-top:2rem;">
              EduLive · Learn. Teach. Grow.
            </p>
          </div>
        `
      }
    });
  } catch (e) {
    console.warn('Email write failed:', e.message);
  }
};

// ─── Notify teacher of new enrollment ────────────────────────────────────────
export const notifyTeacherEnrollment = async ({ teacherId, studentName, courseName, courseId }) => {
  await createNotification({
    userId:     teacherId,
    type:       'new_enrollment',
    title:      'New Student Enrolled!',
    body:       `${studentName} just enrolled in "${courseName}"`,
    link:       `/teacher/courses/${courseId}`,
    courseId,
    courseName
  });
};

// ─── Notify student of enrollment ─────────────────────────────────────────────
export const notifyStudentEnrollment = async ({ studentId, courseName, courseId }) => {
  await createNotification({
    userId:     studentId,
    type:       'enrollment',
    title:      `Welcome to "${courseName}"! 🎉`,
    body:       'You are now enrolled. Start watching your lessons.',
    link:       `/student/courses/${courseId}`,
    courseId,
    courseName
  });
};

// ─── Notify enrolled students when course goes live ───────────────────────────
export const notifyStudentsGoLive = async ({ enrolledUserIds, courseName, courseId, sessionId }) => {
  const promises = enrolledUserIds.map(userId =>
    createNotification({
      userId,
      type:       'live',
      title:      `🔴 "${courseName}" is LIVE now!`,
      body:       'Your teacher just started a live class. Join now!',
      link:       `/live/${courseId}/${sessionId}`,
      courseId,
      courseName
    })
  );
  await Promise.allSettled(promises);
};
