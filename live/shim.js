/* Live-site adapter: implements the subset of the Claude artifact runtime (window.claude.use "db" | "user" | "assets")
   that site-src/index.html uses: Firebase Auth + Firestore for sign-in and data, Supabase Storage for uploaded files. Loaded as a classic script before the
   page's own script, so window.claude exists when boot() runs. Config comes from window.LIVE_CONFIG (config.js). */
(function () {
  const CFG = window.LIVE_CONFIG;
  const V = "10.14.1";
  const sdk = name => import(`https://www.gstatic.com/firebasejs/${V}/firebase-${name}.js`);
  const MAX_BYTES = 20 * 1024 * 1024;
  const ALLOWED = /^(application\/pdf|image\/|video\/|text\/)/;

  // The page links uploaded files as "/_blob/<id>"; the build rewrites those to __blobUrl(id).
  // Files migrated from the Claude version are served from the site itself (assets-map.js, written by the build);
  // new uploads live in a public Supabase Storage bucket. Without CFG.supabase the page offers links only.
  const SB = CFG.supabase && CFG.supabase.url && CFG.supabase.anonKey ? CFG.supabase : null;
  window.__blobUrl = id => (window.STATIC_ASSETS || {})[id]
    || (SB ? `${SB.url}/storage/v1/object/public/${SB.bucket}/${encodeURIComponent(id)}` : "");

  const err = (code, cause) => Object.assign(new Error(code), { code, cause });
  const mapErr = x => {
    const c = (x && x.code) || "";
    const status = String((x && (x.statusCode || x.status)) || "");
    if (c.includes("permission-denied") || c.includes("unauthorized") || status === "403" || status === "401") return err("invalid_argument", x);
    if (status === "413") return err("too_large", x);
    if (status === "415") return err("unsupported_type", x);
    if (c.includes("quota") || c.includes("resource-exhausted")) return err("quota_exceeded", x);
    return x;
  };
  const wrap = p => p.catch(x => { throw mapErr(x); });

  let ready;
  const start = () => ready || (ready = (async () => {
    if (!CFG.firebase.apiKey || CFG.firebase.apiKey === "REPLACE_ME") { comingSoon(); await new Promise(() => {}); }
    const [{ initializeApp }, A, F] = await Promise.all([sdk("app"), sdk("auth"), sdk("firestore")]);
    const app = initializeApp(CFG.firebase);
    const auth = A.getAuth(app), fs = F.getFirestore(app);
    if (CFG.emulators) await useEmulators(CFG.emulators, { A, F, auth, fs });
    const user = await new Promise(res => {
      const off = A.onAuthStateChanged(auth, u => { if (u) { off(); res(u); } else loginScreen(auth, A); });
    });
    document.getElementById("live-login")?.remove();
    signOutButton(auth, A);
    const me = { id: user.uid, name: user.displayName || user.email || "", avatarUrl: user.photoURL || "" };
    F.setDoc(F.doc(fs, "profiles", user.uid), { name: me.name, avatarUrl: me.avatarUrl, updatedAt: Date.now() }).catch(() => {});
    const facSnap = await F.getDoc(F.doc(fs, "facilitators", (user.email || "").toLowerCase())).catch(() => null);
    const isFac = !!(facSnap && facSnap.exists());
    // Supabase accepts the Firebase ID token (Third-party Auth), so its storage policies see who is uploading.
    const sb = SB ? (await import(SB.sdk || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm"))
      .createClient(SB.url, SB.anonKey, { accessToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null) }) : null;
    const env = { A, F, auth, fs, sb, me, isFac, uid: user.uid };
    if (isFac) offerSeed(env);
    return env;
  })());

  // Local testing only (scripts/test): Firebase emulators, optionally signed in as a fake Google account.
  async function useEmulators(em, { A, F, auth, fs }) {
    A.connectAuthEmulator(auth, `http://${em.host}:9099`, { disableWarnings: true });
    F.connectFirestoreEmulator(fs, em.host, 8080);
    if (em.signInAs) {
      const claims = { sub: em.signInAs.uid, email: em.signInAs.email, email_verified: true, name: em.signInAs.name };
      await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify(claims)));
    }
  }

  /* ---------- db ---------- */
  const docSnap = s => ({ id: s.id, exists: s.exists(), data: () => s.data() });
  function makeDb({ F, fs }) {
    const docRef = path => {
      const r = F.doc(fs, path);
      return {
        id: r.id,
        get: () => wrap(F.getDoc(r)).then(docSnap),
        set: data => wrap(F.setDoc(r, data)),
        update: data => wrap(F.updateDoc(r, data)),
        delete: () => wrap(F.deleteDoc(r)),
        onSnapshot: (cb, onErr) => F.onSnapshot(r, s => cb(docSnap(s)), e => onErr && onErr(mapErr(e))),
      };
    };
    return {
      doc: docRef,
      collection: name => {
        const c = F.collection(fs, name);
        return {
          add: data => wrap(F.addDoc(c, data)).then(r => docRef(name + "/" + r.id)),
          doc: id => docRef(name + "/" + id),
          onSnapshot: (cb, onErr) => F.onSnapshot(c, s => cb({ docs: s.docs.map(docSnap), size: s.size, empty: s.empty }), e => onErr && onErr(mapErr(e))),
        };
      },
    };
  }

  /* ---------- user ---------- */
  function makeUser({ F, fs, me, isFac }) {
    return {
      me: async () => me,
      isOwner: async () => isFac,
      can: async () => true,
      profiles: async ids => {
        const out = {};
        await Promise.all(ids.map(async id => {
          const s = await F.getDoc(F.doc(fs, "profiles", id)).catch(() => null);
          out[id] = s && s.exists() ? s.data() : { name: "" };
        }));
        return out;
      },
    };
  }

  /* ---------- assets ---------- */
  // Object names start with the uploader's uid, which the storage policies use to let people delete only their own files.
  const newId = uid => uid + "-" + [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
  const sbCall = p => p.then(({ data, error }) => { if (error) throw mapErr(error); return data; });
  function makeAssets({ sb, uid }) {
    const bucket = sb.storage.from(SB.bucket);
    return {
      upload: async (file, opts = {}) => {
        const contentType = opts.type || file.type || "application/octet-stream";
        if (file.size > MAX_BYTES) throw err("too_large");
        if (!ALLOWED.test(contentType)) throw err("unsupported_type");
        const id = newId(uid);
        await sbCall(bucket.upload(id, file, { contentType, upsert: false }));
        return { id, contentType, size: file.size };
      },
      delete: async id => {
        if ((window.STATIC_ASSETS || {})[id]) throw err("invalid_argument");
        const removed = await sbCall(bucket.remove([id]));
        if (!removed || !removed.length) throw err("invalid_argument");
      },
      url: id => window.__blobUrl(id),
    };
  }

  window.claude = {
    use: async name => {
      const env = await start();
      if (name === "db") return makeDb(env);
      if (name === "user") return makeUser(env);
      if (name === "assets") return env.sb ? makeAssets(env) : null;
      return null;
    },
  };

  /* ---------- sign-in UI ---------- */
  const css = `
#live-login{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:var(--bg,#f3f6f5)}
#live-login .card{max-width:440px;width:100%;background:var(--surface,#fff);border-top:4px solid var(--accent,#0e5446);border-radius:4px;padding:32px;box-shadow:0 30px 60px -24px rgba(0,0,0,.35);text-align:center;direction:rtl}
#live-login h1{font-family:var(--f-display,sans-serif);font-size:1.8rem;font-weight:900;letter-spacing:-.02em;margin:0 0 8px}
#live-login p{color:var(--muted,#566a70);margin:0 0 20px}
#live-login button,#live-signout{font:inherit;cursor:pointer;border-radius:10px;border:1px solid var(--line,#d3dedb)}
#live-login button{background:var(--accent,#0e5446);color:var(--accent-ink,#fff);border:0;border-radius:4px;padding:12px 20px;font-weight:700;width:100%}
#live-login .msg{min-height:1.4em;margin-top:12px;font-size:.9rem;color:var(--danger,#b23a2e)}
#live-signout{background:transparent;border:0;color:var(--muted,#566a70);padding:4px 8px;font-size:.84rem;font-weight:700;flex:none}
#live-signout:hover{color:var(--ink,#17211d)}
#live-seed{position:fixed;bottom:12px;right:12px;left:12px;z-index:60;max-width:520px;margin:auto;background:var(--official,#fbf3dd);border:1px solid var(--official-line,#e3c56f);color:var(--ink,#14252b);border-radius:12px;padding:14px 16px;direction:rtl;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
#live-seed button{font:inherit;cursor:pointer;border-radius:8px;border:0;background:var(--accent,#0d6b5e);color:var(--accent-ink,#fff);padding:8px 14px;font-weight:700}`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);

  function loginScreen(auth, A) {
    if (document.getElementById("live-login")) return;
    const el = document.createElement("div");
    el.id = "live-login";
    el.innerHTML = `<div class="card"><h1>${CFG.siteName}</h1><p>כדי לצפות בתכנים ולהשתתף, יש להתחבר עם חשבון Google.</p><button type="button">התחברות עם Google</button><div class="msg" role="status"></div></div>`;
    const msg = el.querySelector(".msg");
    el.querySelector("button").onclick = async () => {
      msg.textContent = "";
      try { await A.signInWithPopup(auth, new A.GoogleAuthProvider()); }
      catch (x) {
        if (x && x.code === "auth/popup-blocked") { A.signInWithRedirect(auth, new A.GoogleAuthProvider()); return; }
        if (x && x.code !== "auth/popup-closed-by-user" && x.code !== "auth/cancelled-popup-request") msg.textContent = "ההתחברות לא הצליחה. נסו שוב.";
      }
    };
    (document.body || document.documentElement).appendChild(el);
  }

  // Shown until live/config.js holds a real Firebase config.
  function comingSoon() {
    const el = document.createElement("div");
    el.id = "live-login";
    el.innerHTML = `<div class="card"><h1>${CFG.siteName}</h1><p>האתר יעלה לאוויר בקרוב.</p></div>`;
    (document.body || document.documentElement).appendChild(el);
  }

  function signOutButton(auth, A) {
    const b = document.createElement("button");
    b.id = "live-signout"; b.type = "button"; b.textContent = "התנתקות";
    b.onclick = () => A.signOut(auth).then(() => location.reload());
    // Sits in the page header next to the user's name; the page re-renders #who, not its parent row.
    const row = document.querySelector(".top-row");
    if (row) row.appendChild(b); else document.body.appendChild(b);
  }

  /* ---------- first-run import of the content migrated from the Claude version ---------- */
  async function offerSeed({ F, fs }) {
    const home = await F.getDoc(F.doc(fs, "official", "home")).catch(() => null);
    if (!home || home.exists()) return;
    const res = await fetch("seed/data.json").catch(() => null);
    if (!res || !res.ok) return;
    const seed = await res.json();
    const bar = document.createElement("div");
    bar.id = "live-seed";
    bar.innerHTML = `<span style="flex:1">האתר עדיין ריק. לייבא את התוכן שהוכן בגרסת Claude?</span><button type="button">ייבוא</button>`;
    document.body.appendChild(bar);
    bar.querySelector("button").onclick = async () => {
      const span = bar.querySelector("span"); bar.querySelector("button").remove();
      try {
        span.textContent = "שומר תכנים…";
        const batch = F.writeBatch(fs);
        for (const [path, data] of Object.entries(seed.docs)) batch.set(F.doc(fs, path), data);
        await batch.commit();
        span.textContent = "הייבוא הושלם.";
        setTimeout(() => bar.remove(), 2500);
      } catch (x) { console.error(x); span.textContent = "הייבוא נכשל: " + (x.code || x.message); }
    };
  }
})();
