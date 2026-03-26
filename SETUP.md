# EduLive - Online Classroom App Setup Guide

## 🚀 Quick Start

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable the following services:
   - **Authentication** → Sign-in methods → Enable Email/Password + Google
   - **Firestore Database** → Create database (start in test mode)
   - **Realtime Database** → Create database
   - **Storage** → Get started

4. Go to **Project Settings → General → Your apps → Web app**
5. Copy the config values to your `.env` file

### 2. Google Drive API Setup (for video storage)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select the same project as Firebase (or link them)
3. Enable **Google Drive API**
4. Go to **APIs & Services → Credentials**
5. Create **OAuth 2.0 Client ID** (Web application type)
6. Add authorized JavaScript origins: `http://localhost:3000`
7. Create **API Key** and restrict to Drive API
8. Copy both to `.env` file

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in all values.

### 4. Deploy Firebase Rules

```bash
npm install -g firebase-tools
firebase login
firebase use --add  # select your project
firebase deploy --only firestore:rules,storage,database
```

### 5. Install & Run

```bash
npm install
npm start
```

---

## 📋 Features

### Teacher Features
| Feature | Description |
|---------|-------------|
| Register/Login | Email + Google auth |
| Create Courses | Multi-step form with thumbnail |
| Upload Videos | Stored on Google Drive (same account) |
| Add YouTube Links | Embed YouTube videos in courses |
| Go Live | WebRTC-powered live class |
| Screen Share | Share screen during live class |
| Floating Notepad | Type notes live, students see in real-time |
| Record Sessions | Auto-save recording to Google Drive |
| Chat Moderation | Mute/unmute chat, delete messages, block users |

### Student Features
| Feature | Description |
|---------|-------------|
| Browse Courses | Search & filter published courses |
| Enroll | One-click enrollment |
| Watch Videos | YouTube & uploaded videos (enrolled only) |
| Join Live Class | Real-time live streaming |
| Watch Recordings | Access saved live session recordings |
| Live Chat | Real-time chat during live classes |
| Comments | Comment on all content types |
| View Notes | See teacher's live notepad |

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React.js 18 |
| Authentication | Firebase Auth |
| Database | Firebase Firestore |
| Real-time | Firebase Realtime Database |
| File Storage | Google Drive API + Firebase Storage (fallback) |
| Live Video | WebRTC (browser native) |
| Recording | MediaRecorder API |
| Routing | React Router v6 |
| Styling | Custom CSS (no framework) |

---

## 🔐 Security

- All course content is protected behind enrollment check
- Firebase Security Rules enforce access control
- Videos stored securely on Google Drive with permission-based access
- Teachers can block students from courses
- Chat moderation tools built-in

---

## 🔑 Default Admin Account

- Email: `hackthetech0000@gmail.com`
- Password: `Radhika@981`
- Role: Set to **Teacher** during registration

---

## 📁 Project Structure

```
src/
├── components/
│   └── shared/
│       ├── Header.jsx          # Navigation
│       ├── Toast.jsx           # Notifications
│       ├── CommentSection.jsx  # Comments on all content
│       └── Notepad.jsx         # Floating notepad (live sync)
├── contexts/
│   └── AuthContext.jsx         # Auth state management
├── firebase/
│   ├── config.js               # Firebase initialization
│   └── googleDrive.js          # Google Drive integration
├── pages/
│   ├── auth/
│   │   ├── Login.jsx
│   │   └── Register.jsx
│   ├── teacher/
│   │   ├── TeacherDashboard.jsx
│   │   ├── CreateCourse.jsx
│   │   └── LiveClassroom.jsx   # Live class + recording + chat
│   ├── student/
│   │   ├── StudentDashboard.jsx
│   │   └── CourseBrowser.jsx
│   └── CourseDetail.jsx        # Video player + curriculum + comments
├── App.jsx                     # Routes + guards
└── index.css                   # Global styles
```
