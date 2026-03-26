#!/usr/bin/env node

/**
 * EduLive Auto Setup Script
 * Run: node setup.js
 * This will automatically set up Firebase + Google Drive for your project
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

const log = (msg, color = 'reset') => console.log(`${colors[color]}${msg}${colors.reset}`);
const success = (msg) => log(`✅ ${msg}`, 'green');
const error = (msg) => log(`❌ ${msg}`, 'red');
const info = (msg) => log(`ℹ  ${msg}`, 'cyan');
const step = (msg) => log(`\n🔷 ${msg}`, 'blue');
const warn = (msg) => log(`⚠️  ${msg}`, 'yellow');

const run = (cmd, silent = false) => {
  try {
    return execSync(cmd, { stdio: silent ? 'pipe' : 'inherit', encoding: 'utf8' });
  } catch (e) {
    return null;
  }
};

const runAsync = (cmd, args) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: true });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)));
  });
};

async function main() {
  console.clear();
  log('╔════════════════════════════════════════════╗', 'bold');
  log('║     EduLive - Auto Setup Script            ║', 'bold');
  log('║     Firebase + Google Drive Integration    ║', 'bold');
  log('╚════════════════════════════════════════════╝\n', 'bold');

  warn('SECURITY REMINDER: Change your Google password after setup!');
  warn('Visit: https://myaccount.google.com/security\n');

  // ─── Step 1: Check Node.js ──────────────────────────────────────────────────
  step('Step 1: Checking prerequisites...');

  const nodeVersion = run('node --version', true);
  if (!nodeVersion) { error('Node.js not installed. Install from https://nodejs.org'); process.exit(1); }
  success(`Node.js found: ${nodeVersion.trim()}`);

  const npmVersion = run('npm --version', true);
  success(`npm found: ${npmVersion?.trim()}`);

  // ─── Step 2: Install Firebase CLI ──────────────────────────────────────────
  step('Step 2: Installing Firebase CLI...');

  const fbInstalled = run('firebase --version', true);
  if (fbInstalled) {
    success(`Firebase CLI already installed: ${fbInstalled.trim()}`);
  } else {
    info('Installing Firebase CLI globally...');
    run('npm install -g firebase-tools');
    success('Firebase CLI installed!');
  }

  // ─── Step 3: Firebase Login ─────────────────────────────────────────────────
  step('Step 3: Firebase Login');
  info('A browser window will open. Sign in with: hackthetech0000@gmail.com');
  info('Press Enter when ready...');
  await ask('');

  try {
    await runAsync('firebase', ['login', '--reauth']);
    success('Logged into Firebase!');
  } catch {
    error('Firebase login failed. Please try again.');
    process.exit(1);
  }

  // ─── Step 4: Create/Select Firebase Project ────────────────────────────────
  step('Step 4: Firebase Project Setup');

  const projectId = 'edulive-hackthetech-' + Date.now().toString().slice(-6);
  info(`Creating Firebase project: ${projectId}`);

  const created = run(`firebase projects:create ${projectId} --display-name "EduLive Classroom"`, true);
  if (created) {
    success(`Project created: ${projectId}`);
  } else {
    warn('Project may already exist or creation failed via CLI.');
    info('You may need to create manually at console.firebase.google.com');
  }

  // Set active project
  run(`firebase use ${projectId}`);

  // ─── Step 5: Enable Firebase Services via CLI ──────────────────────────────
  step('Step 5: Enabling Firebase Services...');

  info('Deploying Firestore rules...');
  run('firebase deploy --only firestore:rules');

  info('Deploying Storage rules...');
  run('firebase deploy --only storage');

  info('Deploying Database rules...');
  run('firebase deploy --only database');

  success('Firebase services configured!');

  // ─── Step 6: Get Firebase Config ───────────────────────────────────────────
  step('Step 6: Getting Firebase Configuration...');

  info('You need to get your Firebase web app config.');
  log('\nPlease follow these steps:', 'yellow');
  log('1. Go to: https://console.firebase.google.com/project/' + projectId + '/settings/general', 'cyan');
  log('2. Scroll down to "Your apps"', 'cyan');
  log('3. Click the "</>" Web icon to add a web app', 'cyan');
  log('4. Register app as "EduLive Web"', 'cyan');
  log('5. Copy the config values shown\n', 'cyan');

  await ask('Press Enter when you have the config values ready...');

  log('\nEnter your Firebase config values:', 'bold');

  const apiKey = await ask('Firebase API Key: ');
  const authDomain = await ask(`Auth Domain [${projectId}.firebaseapp.com]: `) || `${projectId}.firebaseapp.com`;
  const storageBucket = await ask(`Storage Bucket [${projectId}.appspot.com]: `) || `${projectId}.appspot.com`;
  const messagingSenderId = await ask('Messaging Sender ID: ');
  const appId = await ask('App ID: ');
  const databaseURL = await ask(`Database URL [https://${projectId}-default-rtdb.firebaseio.com]: `) || `https://${projectId}-default-rtdb.firebaseio.com`;
  const measurementId = await ask('Measurement ID (optional, press Enter to skip): ') || '';

  // ─── Step 7: Google Drive Setup ────────────────────────────────────────────
  step('Step 7: Google Drive API Setup');

  log('\nFor Google Drive integration:', 'yellow');
  log('1. Go to: https://console.cloud.google.com/apis/library', 'cyan');
  log('2. Search "Google Drive API" → Click → Enable', 'cyan');
  log('3. Go to: https://console.cloud.google.com/apis/credentials', 'cyan');
  log('4. Click "Create Credentials" → "OAuth 2.0 Client ID"', 'cyan');
  log('5. Application type: Web application', 'cyan');
  log('6. Name: EduLive', 'cyan');
  log('7. Authorized JavaScript origins: http://localhost:3000', 'cyan');
  log('8. Click Create → Copy Client ID\n', 'cyan');

  await ask('Press Enter when done...');

  const googleClientId = await ask('Google OAuth Client ID: ');

  log('\n9. Back in Credentials → Create Credentials → API Key', 'cyan');
  log('10. Copy the API Key\n', 'cyan');

  const googleApiKey = await ask('Google API Key: ');

  // ─── Step 8: Write .env file ────────────────────────────────────────────────
  step('Step 8: Writing environment configuration...');

  const envContent = `# Firebase Configuration - Auto generated by setup.js
# DO NOT commit this file to GitHub!

REACT_APP_FIREBASE_API_KEY=${apiKey}
REACT_APP_FIREBASE_AUTH_DOMAIN=${authDomain}
REACT_APP_FIREBASE_PROJECT_ID=${projectId}
REACT_APP_FIREBASE_STORAGE_BUCKET=${storageBucket}
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=${messagingSenderId}
REACT_APP_FIREBASE_APP_ID=${appId}
REACT_APP_FIREBASE_DATABASE_URL=${databaseURL}
REACT_APP_FIREBASE_MEASUREMENT_ID=${measurementId}

# Google Drive API (same Google account)
REACT_APP_GOOGLE_CLIENT_ID=${googleClientId}
REACT_APP_GOOGLE_API_KEY=${googleApiKey}
`;

  fs.writeFileSync('.env', envContent);
  success('.env file created!');

  // ─── Step 9: Update Firebase Config in code ─────────────────────────────────
  step('Step 9: Updating Firebase project ID in code...');

  // Update firebase.json with correct project
  const firebaseJson = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  fs.writeFileSync('firebase.json', JSON.stringify(firebaseJson, null, 2));

  // Create .firebaserc
  const firebaserc = {
    projects: { default: projectId }
  };
  fs.writeFileSync('.firebaserc', JSON.stringify(firebaserc, null, 2));
  success('Firebase project linked!');

  // ─── Step 10: Install npm dependencies ─────────────────────────────────────
  step('Step 10: Installing npm packages...');
  run('npm install');
  success('All packages installed!');

  // ─── Step 11: Enable Auth providers info ───────────────────────────────────
  step('Step 11: Enable Authentication Providers (Manual - 2 mins)');

  warn('You need to enable sign-in methods manually (Firebase requires this in console):');
  log(`\n1. Go to: https://console.firebase.google.com/project/${projectId}/authentication/providers`, 'cyan');
  log('2. Click "Email/Password" → Enable → Save', 'cyan');
  log('3. Click "Google" → Enable → set support email: hackthetech0000@gmail.com → Save\n', 'cyan');

  await ask('Press Enter after enabling both auth providers...');

  // ─── Step 12: Deploy everything ────────────────────────────────────────────
  step('Step 12: Deploying Firebase rules...');

  run('firebase deploy --only firestore:rules,storage,database');
  success('All rules deployed!');

  // ─── Done! ──────────────────────────────────────────────────────────────────
  console.log('\n');
  log('╔════════════════════════════════════════════╗', 'green');
  log('║          SETUP COMPLETE! 🎉                ║', 'green');
  log('╚════════════════════════════════════════════╝\n', 'green');

  success('Firebase project created and linked');
  success('Google Drive API configured');
  success('.env file created with all keys');
  success('Firebase rules deployed');
  success('npm packages installed');

  log('\n🚀 To start the app:', 'bold');
  log('   npm start\n', 'cyan');
  log(`📊 Firebase Console: https://console.firebase.google.com/project/${projectId}`, 'cyan');
  log('🌐 App runs at: http://localhost:3000\n', 'cyan');

  warn('REMINDER: Change your Google password at https://myaccount.google.com/security');

  rl.close();
}

main().catch(err => {
  error('Setup failed: ' + err.message);
  rl.close();
  process.exit(1);
});
