/* Public Firebase web config (safe to commit: access is enforced by firestore.rules / storage.rules). */
window.LIVE_CONFIG = {
  siteName: "מרחב הלמידה המשותף",
  // File uploads to Firebase Storage need the paid Blaze plan; while off, participants add files as links.
  uploads: false,
  firebase: {
    apiKey: "REPLACE_ME",
    authDomain: "REPLACE_ME.firebaseapp.com",
    projectId: "REPLACE_ME",
    storageBucket: "REPLACE_ME.firebasestorage.app",
    messagingSenderId: "REPLACE_ME",
    appId: "REPLACE_ME",
  },
};
