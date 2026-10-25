/* Public config (safe to commit: access is enforced by firestore.rules and supabase/storage.sql). */
window.LIVE_CONFIG = {
  siteName: "מרחב הלמידה המשותף",
  firebase: {
    apiKey: "REPLACE_ME",
    authDomain: "REPLACE_ME.firebaseapp.com",
    projectId: "REPLACE_ME",
    messagingSenderId: "REPLACE_ME",
    appId: "REPLACE_ME",
  },
  // Uploaded files go to this public Supabase Storage bucket (see supabase/storage.sql). Leave url empty for links only.
  supabase: {
    url: "https://cwavefingrlviboswtya.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3YXZlZmluZ3Jsdmlib3N3dHlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MTIzMDksImV4cCI6MjEwODQ4ODMwOX0._9LYRO3KyUULBg8D67HJblRty12joBJU41k7FaY0ySA",
    bucket: "yad-hanadiv-study",
  },
};
