const SUPABASE_URL =
  "https://gsfuumnfnclufrjibmiw.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_jNLDH1M8SEDhGiOo4k3-wA_Zzzy93YJ";

const focusSupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);


let currentFocusId = null;
let currentFocus = null;
let currentSessions = [];
let forceReadOnlyFocusView = false;
let currentUser = null;
let authMode = "login";
let authIntent = "home";

const SESSION_IMAGES_BUCKET = "session-images";
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;


/* --------------------------------
   BASIC HELPERS
-------------------------------- */

function $(id) {
  return document.getElementById(id);
}


function todayString() {
  return new Date().toISOString().split("T")[0];
}


function formatDate(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString + "T12:00:00");

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}


function formatWeekday(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString + "T12:00:00");
  return date.toLocaleDateString("en-US", { weekday: "long" });
}


function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function showOnly(screenId) {

  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.add("hidden");
  });

  const screen = $(screenId);

  if (screen) {
    screen.classList.remove("hidden");
  }

  window.scrollTo({
    top: 0,
    behavior: "instant"
  });
}


function setLoading(isLoading) {
  document.body.classList.toggle("is-loading", isLoading);
}

function getPublicImageUrl(path) {
  const { data } = focusSupabase.storage.from(SESSION_IMAGES_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

function isSafeImageUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}


function getSessionVideoUrl(body) {
  const match = String(body || "").match(/(?:^|\n)Video:\s*(https?:\/\/[^\s]+)/i);
  if (!match) return "";
  try {
    const url = new URL(match[1].replace(/[),.]+$/, ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}


function getSessionLink(body) {
  const match = String(body || "").match(/(?:^|\n)Link:\s*(https?:\/\/[^\s]+)/i);
  if (!match) return "";
  try { const url = new URL(match[1].replace(/[),.]+$/, "")); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}
function getSessionLinkCaption(body) {
  const match = String(body || "").match(/(?:^|\n)\[link-caption\]([\s\S]*?)\[\/link-caption\]/i);
  return match ? match[1].trim() : "";
}
function renderSessionLink(session) {
  const url = getSessionLink(session.body); if (!url) return "";
  let host = url; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  const caption = getSessionLinkCaption(session.body);
  return '<a class="session-link-preview" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer"><span class="session-link-domain">' + escapeHtml(host) + '</span><strong>' + escapeHtml(caption || host) + '</strong><span class="session-link-url">' + escapeHtml(url) + '</span></a>';
}

function renderSessionVideo(session) {
  const url = getSessionVideoUrl(session.body); if (!url) return "";
  const caption = getSessionImageCaption(session.body);
  let host = url; try { host = new URL(url).hostname.replace(/^www\\./, ""); } catch {}
  return '<a class="session-link-preview session-video-preview" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer"><span class="session-link-domain">VIDEO · ' + escapeHtml(host) + '</span><strong>' + escapeHtml(caption || "Open video") + '</strong><span class="session-link-url">' + escapeHtml(url) + '</span></a>';
}

function getSessionImageCaption(body) {
  const match = String(body || "").match(/(?:^|\n)\[image-caption\]([\s\S]*?)\[\/image-caption\]/i);
  return match ? match[1].trim() : "";
}

function stripSessionImageCaption(body) {
  return String(body || "").replace(/(?:^|\n)\[image-caption\][\s\S]*?\[\/image-caption\]/i, "").trim();
}


async function saveSessionDate(sessionId, value) {
  if (!isCurrentUserOwner() || !value) return;
  const { error } = await focusSupabase.from("sessions").update({ session_date: value }).eq("id", sessionId).eq("focus_id", currentFocusId);
  if (error) { console.error(error); alert("Could not save the session date."); return; }
  await loadSessions();
}


function readSessionTagsMap() { try { return JSON.parse(localStorage.getItem("focusPractice.sessionTags") || "{}") || {}; } catch { return {}; } }
function getSessionTags(session) { const match = String(session.body || "").match(/(?:^|\n)\[focus-tags\]([\s\S]*?)\[\/focus-tags\]/i); try { if (match) { const parsed = JSON.parse(match[1]); if (Array.isArray(parsed)) return parsed; } } catch {} return readSessionTagsMap()[String(session.id)] || []; }
async function saveSessionTags(sessionId, value) {
  if (!isCurrentUserOwner()) return;
  const tags = [...new Set(String(value || "").split(",").map(tag => tag.trim().replace(/^#/, "")).filter(Boolean))];
  const map = readSessionTagsMap(); map[String(sessionId)] = tags;
  try { localStorage.setItem("focusPractice.sessionTags", JSON.stringify(map)); } catch {}
  const session = currentSessions.find(item => String(item.id) === String(sessionId));
  if (session) { const existing = String(session.body || "").replace(/(?:\n?\[focus-tags\][\s\S]*?\[\/focus-tags\])/ig, "").trim(); const body = tags.length ? existing + (existing ? "\n\n" : "") + "[focus-tags]" + JSON.stringify(tags) + "[/focus-tags]" : existing; const { error } = await focusSupabase.from("sessions").update({ body }).eq("id", sessionId).eq("focus_id", currentFocusId); if (error) { console.error(error); alert("Could not save tags."); return; } }
  await loadSessions();
}
function renderSessionTags(session) {
  return getSessionTags(session).map(tag => '<button type="button" class="session-tag" data-tag="' + escapeHtml(tag) + '" onclick="event.preventDefault(); event.stopPropagation(); openFirstSessionWithTag(this.dataset.tag)">#' + escapeHtml(tag) + '</button>').join("");
}
function renderSessionTagCloud() {
  const cloud = $("sessionTagCloud"); if (!cloud) return;
  const tags = [...new Set(currentSessions.flatMap(getSessionTags))].sort((a,b) => a.localeCompare(b));
  cloud.innerHTML = tags.map(tag => '<button type="button" class="session-tag" data-tag="' + escapeHtml(tag) + '" onclick="event.preventDefault(); event.stopPropagation(); openFirstSessionWithTag(this.dataset.tag)">#' + escapeHtml(tag) + '</button>').join("");
}
function openFirstSessionWithTag(tag) {
  const target = currentSessions.find(session => getSessionTags(session).some(value => value.toLowerCase() === String(tag).toLowerCase()));
  if (!target) return;
  const card = document.querySelector('.session-card-item[data-session-id="' + CSS.escape(String(target.id)) + '"] .session-card');
  if (card) { card.open = false; card.scrollIntoView({ behavior: "smooth", block: "center" }); }
}


function updateSessionImageFlip(sessionId, value) {
  if (!["none", "flip-horizontal", "flip-vertical", "flip-both"].includes(value)) return;
  const styles = readSessionCardStyles(); styles[String(sessionId)] = { ...(styles[String(sessionId)] || {}), imageFlip: value };
  try { localStorage.setItem("focusPractice.sessionCardStyles", JSON.stringify(styles)); } catch {}
  const item = Array.from(document.querySelectorAll(".session-card-item")).find(el => el.dataset.sessionId === String(sessionId));
  const image = item && item.querySelector(".session-card-visual img");
  if (image) image.className = value === "none" ? "" : value;
}
let sessionTimerSeconds = 0, sessionTimerStartedAt = null, sessionTimerInterval = null;
function formatTimer(seconds) { return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0"); }
function updateSessionTimerDisplay() { const el = $("sessionTimerReadout"); if (el) el.textContent = formatTimer(sessionTimerSeconds + (sessionTimerStartedAt ? Math.floor((Date.now() - sessionTimerStartedAt) / 1000) : 0)); }
function toggleSessionTimer() { const panel = $("sessionTimerPanel"); if (panel) panel.classList.toggle("hidden"); updateSessionTimerDisplay(); }
function startPauseSessionTimer() {
  const button = $("sessionTimerPanel")?.querySelector("button.secondary-button");
  if (sessionTimerStartedAt) { sessionTimerSeconds += Math.floor((Date.now() - sessionTimerStartedAt) / 1000); sessionTimerStartedAt = null; clearInterval(sessionTimerInterval); sessionTimerInterval = null; if (button) button.textContent = "Start"; }
  else { sessionTimerStartedAt = Date.now(); sessionTimerInterval = setInterval(updateSessionTimerDisplay, 1000); if (button) button.textContent = "Pause"; }
  updateSessionTimerDisplay();
}
function resetSessionTimer() { sessionTimerSeconds = 0; sessionTimerStartedAt = null; clearInterval(sessionTimerInterval); sessionTimerInterval = null; const button = $("sessionTimerPanel")?.querySelector("button.secondary-button"); if (button) button.textContent = "Start"; updateSessionTimerDisplay(); }
function togglePollComposer() { $("sessionPollPanel")?.classList.toggle("hidden"); }
function attachSessionPoll() {
  const question = $("sessionPollQuestion").value.trim();
  const options = $("sessionPollOptions").value.split("\n").map(value => value.trim()).filter(Boolean);
  if (!question || options.length < 2) { $("sessionPollStatus").textContent = "Add a question and at least two options."; return; }
  $("sessionText").dataset.poll = JSON.stringify({ question, options });
  $("sessionPollStatus").textContent = "Poll attached. Save this step to publish it.";
}
function renderSessionPoll(session) {
  const match = String(session.body || "").match(/(?:^|\n)\[focus-poll\]([\s\S]*?)\[\/focus-poll\]/);
  let poll; try { poll = match ? JSON.parse(match[1]) : null; } catch {}
  if (!poll || !poll.question || !Array.isArray(poll.options)) return "";
  const votes = (() => { try { return JSON.parse(localStorage.getItem("focusPractice.pollVotes") || "{}") || {}; } catch { return {}; } })();
  return '<div class="session-poll-card"><strong>' + escapeHtml(poll.question) + '</strong>' + poll.options.map((option, i) => '<label class="session-poll-option"><input type="radio" name="poll-' + escapeHtml(session.id) + '" value="' + i + '" ' + (votes[String(session.id)] === i ? "checked" : "") + ' onchange="voteInSessionPoll(\'' + escapeHtml(session.id) + '\',' + i + ')"> ' + escapeHtml(option) + '</label>').join("") + '</div>';
}
function voteInSessionPoll(sessionId, option) { let votes = {}; try { votes = JSON.parse(localStorage.getItem("focusPractice.pollVotes") || "{}") || {}; } catch {} votes[String(sessionId)] = option; try { localStorage.setItem("focusPractice.pollVotes", JSON.stringify(votes)); } catch {} }

function renderSessionCardVisual(session) {
  const urls = Array.isArray(session.image_urls) ? session.image_urls.filter(isSafeImageUrl) : [];
  const visuals = [];
  const image = urls[0];
  const caption = getSessionImageCaption(session.body);
  const style = readSessionCardStyles()[String(session.id)] || {};
  const captionMode = style.captionDisplay || "below";
  const flipClass = ["flip-horizontal", "flip-vertical", "flip-both"].includes(style.imageFlip) ? style.imageFlip : "";
  if (image) {
    const isDrawing = /session-drawing\.png(?:$|[?#])/i.test(image);
    visuals.push(`<div class="session-card-visual ${isDrawing ? "session-card-visual-drawing" : ""} ${((readSessionCardStyles()[String(session.id)] || {}).imageFrame === "polaroid") ? "image-frame-polaroid" : ""}">
      <img class="${flipClass}" src="${escapeHtml(image)}" alt="${isDrawing ? "Drawing from this session" : "Visual added to this session"}" loading="lazy">
      ${caption ? `<p class="session-image-caption caption-${captionMode}">${escapeHtml(caption)}</p>` : ""}
    </div>`);
  }

  const videoUrl = getSessionVideoUrl(session.body);
  if (videoUrl) {
    let embedUrl = "";
    try {
      const url = new URL(videoUrl);
      if (url.hostname === "youtu.be") {
        embedUrl = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(url.pathname.slice(1));
      } else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
        const id = url.searchParams.get("v");
        if (id) embedUrl = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id);
        else if (url.pathname.startsWith("/embed/")) embedUrl = "https://www.youtube-nocookie.com" + url.pathname;
      } else if (["vimeo.com", "www.vimeo.com"].includes(url.hostname)) {
        const id = url.pathname.split("/").filter(Boolean).pop();
        if (id && /^\d+$/.test(id)) embedUrl = "https://player.vimeo.com/video/" + id;
      } else if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) {
        visuals.push(`<div class="session-card-visual session-card-video"><video controls preload="metadata" playsinline src="${escapeHtml(videoUrl)}"></video></div>`);
      }
    } catch {}

    if (embedUrl) {
      visuals.push(`<div class="session-card-visual session-card-video"><iframe src="${escapeHtml(embedUrl)}" title="Video from this session" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`);
    } else if (!visuals.some(markup => markup.includes("<video "))) {
      visuals.push(`<a class="session-card-visual session-card-video-link" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer"><span>▶</span><strong>Watch this session video</strong><span class="video-link-arrow">↗</span></a>`);
    }
  }

  return visuals.join("");
}

function renderSessionImages(session) {
  const urls = Array.isArray(session.image_urls) ? session.image_urls : [];
  if (!urls.length) return "";
  const canEdit = isCurrentUserOwner();
  return `<div class="session-images">${urls.map((url, imageIndex) => {
    if (!isSafeImageUrl(url)) return "";
    const isCover = currentFocus?.cover_image_url === url;
    return `<figure class="session-image-item">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open session image in a new tab"><img src="${escapeHtml(url)}" alt="Image from session ${session.session_date ? escapeHtml(session.session_date) : ""}" loading="lazy"></a>
      <figcaption><button type="button" class="image-cover-button ${canEdit ? "" : "hidden"} ${isCover ? "is-cover" : ""}" onclick="setCoverImage('${escapeHtml(session.id)}', ${imageIndex})">${isCover ? "✓ Project cover" : "Use as cover"}</button></figcaption>
    </figure>`;
  }).join("")}</div>`;
}

async function prepareSessionImage(file) {
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  const mimeType = String(file.type || "").toLowerCase();
  const isHeic = ["heic", "heif"].includes(extension) || ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"].includes(mimeType);

  if (!isHeic) {
    if (!mimeType.startsWith("image/")) throw new Error(`"${file.name}" is not an image.`);
    if (file.size > MAX_IMAGE_SIZE_BYTES) throw new Error(`"${file.name}" is larger than 8 MB. Please choose a smaller image.`);
    return file;
  }

  // Allow a larger original HEIC file because conversion usually makes it smaller.
  // Keep a generous input limit to avoid trying to decode extremely large files.
  if (file.size > 25 * 1024 * 1024) throw new Error(`"${file.name}" is larger than 25 MB. Please choose a smaller photo.`);
  if (typeof window.HeicTo !== "function") throw new Error("HEIC conversion couldn't load. Refresh the page and try again, or export the photo as JPEG.");

  try {
    const converted = await window.HeicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
    const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
    if (!jpegBlob || typeof jpegBlob.size !== "number") throw new Error("The converter did not return a JPEG image.");
    return new File([jpegBlob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg", lastModified: Date.now() });
  } catch (error) {
    console.error("HEIC conversion failed:", error);
    throw new Error(`Couldn't convert "${file.name}" to JPEG. Try another photo or export it as JPEG. ${error?.message ? `Details: ${error.message}` : ""}`.trim());
  }
}

async function uploadSessionImages(files, sessionId) {
  const urls = [];
  for (const originalFile of Array.from(files || [])) {
    const file = await prepareSessionImage(originalFile);
    if (file.size > MAX_IMAGE_SIZE_BYTES) throw new Error(`"${originalFile.name}" is larger than 8 MB after conversion. Please choose a smaller image.`);
    const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image.jpg";
    const path = `${currentFocusId}/${sessionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const { error } = await focusSupabase.storage.from(SESSION_IMAGES_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) throw error;
    urls.push(getPublicImageUrl(path));
  }
  return urls;
}


/* --------------------------------
   URL / ROUTING
-------------------------------- */

function getFocusIdFromUrl() {
  const params = new URLSearchParams(window.location.search);

  return params.get("focus");
}


function setFocusUrl(focusId) {

  const url = new URL(window.location.href);
  url.searchParams.delete("profile");

  if (focusId) {
    url.searchParams.set("focus", focusId);
  } else {
    url.searchParams.delete("focus");
  }

  window.history.pushState(
    {},
    "",
    url
  );
}


function clearFocusUrl() {

  const url = new URL(window.location.href);

  url.searchParams.delete("focus");
  url.searchParams.delete("profile");

  window.history.pushState(
    {},
    "",
    url
  );
}


/* --------------------------------
   NAVIGATION
-------------------------------- */

function updateNavigation() {
  $("authNavLink")?.classList.toggle("hidden", Boolean(currentUser));
  $("myFocusesNavLink")?.classList.toggle("hidden", !currentUser);
  $("profileNavWrap")?.classList.toggle("hidden", !currentUser);
  if (currentUser) refreshProfileNav();
}
function toggleProfileMenu() { $("profileNavMenu")?.classList.toggle("hidden"); }
document.addEventListener("click", (event) => {
  const wrap = $("profileNavWrap");
  if (wrap && !wrap.contains(event.target)) $("profileNavMenu")?.classList.add("hidden");
});
async function refreshProfileNav() {
  if (!currentUser) return;
  const {data}=await focusSupabase.from("profiles").select("display_name,avatar_url").eq("id",currentUser.id).maybeSingle();
  const name=data?.display_name || currentUser.email?.split("@")[0] || "Profile";
  const image=$("profileNavAvatar"), initials=$("profileNavInitials");
  if(initials){initials.textContent=(name.trim()[0]||"J").toUpperCase();initials.classList.toggle("hidden",Boolean(data?.avatar_url));}
  if(image){image.src=data?.avatar_url||"";image.classList.toggle("hidden",!data?.avatar_url);}
}
function isCurrentUserOwner() {
  return Boolean(!forceReadOnlyFocusView && currentUser && currentFocus && String(currentFocus.owner_id) === String(currentUser.id));
}
function isCurrentUserOwner() {
  return Boolean(currentUser && currentFocus && String(currentFocus.owner_id) === String(currentUser.id));
}
function requireAuth(intent = "home") {
  if (currentUser) return true;
  authIntent = intent; showAuth(); return false;
}
function showAuth(intent) {
  if (intent) authIntent = intent;
  showOnly("authScreen"); renderAuthMode(); $("authEmail")?.focus();
}
function renderAuthMode() {
  const signup = authMode === "signup";
  $("authHeading").textContent = signup ? "Create your account" : "Log in";
  $("authIntro").textContent = signup ? "Your focuses and logs will live in your own collection." : "Log in to start and manage your focuses.";
  $("authSubmitButton").textContent = signup ? "Create account" : "Log in";
  $("authPassword").autocomplete = signup ? "new-password" : "current-password";
  $("authSwitchPrompt").textContent = signup ? "Already have an account?" : "New here?";
  $("authSwitchButton").textContent = signup ? "Log in" : "Create an account";
  $("forgotPasswordButton").classList.toggle("hidden", signup);
  $("authMessage").textContent = "";
}
function toggleAuthMode() { authMode = authMode === "login" ? "signup" : "login"; renderAuthMode(); }
async function submitAuth(event) {
  event.preventDefault();
  const email = $("authEmail").value.trim(), password = $("authPassword").value;
  const button = $("authSubmitButton"), message = $("authMessage");
  button.disabled = true; message.textContent = authMode === "signup" ? "Creating your account…" : "Logging in…";
  const mode = authMode;
  const result = mode === "signup"
    ? await focusSupabase.auth.signUp({email,password})
    : await focusSupabase.auth.signInWithPassword({email,password});
  button.disabled = false;
  if (result.error) { console.error(result.error); message.textContent = result.error.message || "Couldn't authenticate. Please try again."; return; }
  if (mode === "signup" && !result.data.session) {
    authMode = "login"; renderAuthMode();
    $("authMessage").textContent = "Check your email to confirm your account, then log in here.";
    return;
  }
  currentUser = result.data.user || result.data.session?.user || null;
  updateNavigation(); await continueAfterAuth();
}
async function sendPasswordReset() {
  const email = $("authEmail").value.trim();
  if (!email) { $("authMessage").textContent = "Enter your email address first."; $("authEmail").focus(); return; }
  const {error}=await focusSupabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});
  $("authMessage").textContent=error ? error.message : "If an account exists for that email, a password reset link is on its way.";
}
async function signOut() {
  const {error}=await focusSupabase.auth.signOut();
  if(error){console.error(error);alert("Couldn't log out. Please try again.");return;}
  currentUser=null; currentFocus=null; currentFocusId=null; currentSessions=[];
  clearFocusUrl(); updateNavigation(); await showHome();
}
async function continueAfterAuth() {
  const intent=authIntent; authIntent="home"; authMode="login"; updateNavigation();
  if(intent==="start-focus") await showCreateFocus();
  else if(intent==="my-focuses") await showMyCollection();
  else await showHome();
}

function goToCurrentFocus() {

  if (
    currentFocus &&
    currentFocus.status === "active"
  ) {

    currentFocusId = currentFocus.id;

    setFocusUrl(currentFocus.id);

    showFocus();

  }
}


function showHome() {

  clearFocusUrl();

  showOnly("homeScreen");

  loadHomeFocuses();

}


async function showMyProfile() {
  if (!currentUser) { showAuth(); return; }
  $("profileNavMenu")?.classList.add("hidden");
  await showProfile(currentUser.id);
}
async function showProfile(userId) {
  clearFocusUrl();
  const profileUrl = new URL(window.location.href);
  profileUrl.searchParams.set("profile", userId);
  window.history.pushState({}, "", profileUrl);
  showOnly("profileScreen");
  const view = $("profileView");
  view.innerHTML = '<p class="empty-state">Loading profile…</p>';
  const { data: profile, error } = await focusSupabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    console.error(error);
    view.innerHTML = '<p class="empty-state">Could not load profile. Run the profile migration in Supabase, then refresh.</p>';
    return;
  }
  const { data: focuses, error: focusError } = await focusSupabase.from("focuses").select("*").eq("owner_id", userId).order("created_at", { ascending: false });
  if (focusError) console.error(focusError);
  const all = focuses || [];
  const active = all.find(f => f.status === "active");
  const featured = active || all[0] || null;
  const own = Boolean(currentUser && String(currentUser.id) === String(userId));
  const name = profile?.display_name || (own ? currentUser.email?.split("@")[0] : "Focus creator");
  const avatar = profile?.avatar_url;
  let tagMarkup = "";
  if (all.length) {
    const { data: sessions, error: tagError } = await focusSupabase.from("sessions").select("id,focus_id,body,session_date,summary").in("focus_id", all.map(f => f.id)).order("session_date", { ascending: false });
    if (tagError) console.error(tagError);
    else {
      const seen = new Map();
      (sessions || []).forEach(session => getSessionTags(session).forEach(tag => {
        const key = tag.toLowerCase();
        if (!seen.has(key)) seen.set(key, { label: tag, focusId: session.focus_id, sessionId: session.id, date: session.session_date || "" });
      }));
      const tags = [...seen.values()].sort((a,b) => String(b.date).localeCompare(String(a.date)));
      if (tags.length) tagMarkup = '<section class="profile-tag-index"><p class="eyebrow">TAGS</p><div class="session-tag-cloud">' +
        tags.map(t => '<button type="button" class="session-tag" onclick="openCollectionTagTarget(\'' + escapeHtml(t.focusId) + '\',\'' + escapeHtml(t.sessionId) + '\')">#' + escapeHtml(t.label) + '</button>').join("") +
        '</div></section>';
    }
  }
  const other = all.filter(f => f.id !== featured?.id);
  view.innerHTML =
    (own ? '<button type="button" class="profile-edit-toggle" onclick="toggleProfileEdit()" aria-label="Edit profile" title="Edit profile">✎</button>' : '') +
    (own ? '<form id="profileEditForm" class="profile-edit-form hidden" onsubmit="saveProfile(event)"><h2>Edit your profile</h2><label for="profileNameInput">Name</label><input id="profileNameInput" type="text" maxlength="80" value="' + escapeHtml(name) + '" required><label for="profileAvatarFile">Profile picture</label><input id="profileAvatarFile" class="profile-picture-upload" type="file" accept="image/*,.heic,.heif"><p class="form-hint">Choose an image from your device. JPG, PNG, WebP, and HEIC are supported.</p><button class="primary-button" type="submit">Save profile</button><p id="profileSaveStatus" class="save-status" role="status"></p></form>' : '') +
    '<section class="profile-current-focus"><p class="eyebrow profile-focus-eyebrow">' +
    (avatar ? '<img class="profile-eyebrow-avatar" src="' + escapeHtml(avatar) + '" alt="">' : '') +
    escapeHtml(name) + '’s ' + (active ? 'active' : 'most recent') + ' focus</p>' +
    (featured ? '<button class="focus-collection-board profile-featured-board" onclick="openFocus(\'' + escapeHtml(featured.id) + '\')" aria-label="Open focus"><h2>' + escapeHtml(featured.title || "Untitled focus") + '</h2></button>' : '<p class="empty-state">No focuses yet.</p>') +
    '</section>' +
    (other.length ? '<button type="button" class="text-button profile-other-link" onclick="toggleProfileFocuses()" aria-expanded="false">Explore more (' + other.length + ') ↓</button>' : '') +
    '<section id="profileOtherFocuses" class="profile-other-focuses hidden"><div class="focus-collection-boards">' +
    other.map(f => '<button class="focus-collection-board" onclick="openFocus(\'' + escapeHtml(f.id) + '\')" aria-label="Open focus"><h2>' + escapeHtml(f.title || "Untitled focus") + '</h2></button>').join('') +
    '</div></section>' + tagMarkup;
}

function toggleProfileEdit() {
  const form = $("profileEditForm");
  if (!form) return;
  form.classList.toggle("hidden");
  if (!form.classList.contains("hidden")) {
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("profileNameInput")?.focus();
  }
}
async function saveProfile(event) {
  event.preventDefault();
  if (!currentUser) return;
  const name = $("profileNameInput").value.trim();
  const status = $("profileSaveStatus");
  const file = $("profileAvatarFile")?.files?.[0];
  status.textContent = "Saving…";
  let avatarUrl = null;
  if (file) {
    try {
      const image = await prepareSessionImage(file);
      if (image.size > MAX_IMAGE_SIZE_BYTES) throw new Error("Please choose an image smaller than 8 MB.");
      const extension = (image.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = currentUser.id + "/avatar-" + Date.now() + "." + extension;
      const { error: uploadError } = await focusSupabase.storage.from("profile-images").upload(path, image, {
        cacheControl: "3600", upsert: true, contentType: image.type || "image/jpeg"
      });
      if (uploadError) throw uploadError;
      avatarUrl = focusSupabase.storage.from("profile-images").getPublicUrl(path).data?.publicUrl || null;
      if (!avatarUrl) throw new Error("Could not get the uploaded image URL.");
    } catch (error) {
      console.error(error);
      status.textContent = error.message || "Could not upload your picture. Check the profile-images storage setup.";
      return;
    }
  } else {
    const { data: existing } = await focusSupabase.from("profiles").select("avatar_url").eq("id", currentUser.id).maybeSingle();
    avatarUrl = existing?.avatar_url || null;
  }
  const { error } = await focusSupabase.from("profiles").upsert({
    id: currentUser.id, display_name: name, avatar_url: avatarUrl, updated_at: new Date().toISOString()
  });
  if (error) {
    console.error(error);
    status.textContent = "Could not save. Make sure the profile migration has been run.";
    return;
  }
  await refreshProfileNav();
  await showProfile(currentUser.id);
}
function toggleProfileFocuses() { const section=$("profileOtherFocuses"); if(!section)return; const opening=section.classList.contains("hidden"); section.classList.toggle("hidden",!opening); const button=document.querySelector(".profile-other-link"); if(button){button.setAttribute("aria-expanded",String(opening));button.textContent=opening?"Explore more ↑":"Explore more ↓";} }
async function renderFocusCreator() {
  const el=$("focusCreator"); if(!el||!currentFocus)return;
  const owner=currentFocus.owner_id;
  if(!owner){el.textContent="";return;}
  const own=Boolean(currentUser&&String(currentUser.id)===String(owner));
  let name=own?(currentUser.email?.split("@")[0]||"you"):"the creator";
  const {data}=await focusSupabase.from("profiles").select("display_name").eq("id",owner).maybeSingle();
  if(data?.display_name)name=data.display_name;
  el.innerHTML='<a href="#" onclick="showProfile(\''+escapeHtml(owner)+'\');return false;">By '+escapeHtml(name)+'</a>';
}

function showAbout() {

  clearFocusUrl();

  showOnly("aboutScreen");

}


async function showCollection() {
  clearFocusUrl();
  showOnly("collectionScreen");
  $("collectionFocusAction")?.replaceChildren();
  await renderExploreHome($("collectionList"));
}
async function showMyCollection() {
  if (!requireAuth("my-focuses")) return;
  clearFocusUrl(); showOnly("collectionScreen"); await loadCollection("mine");
}

/* --------------------------------
   HOME
-------------------------------- */

async function loadHomeFocuses() {
  const list = $("currentFocusHomeContent"); if (!list) return;
  list.innerHTML = '<p class="empty-state">Loading…</p>';
  if (!currentUser) {
    currentFocus = null; currentFocusId = null; updateNavigation();
    document.querySelector(".current-focus-home")?.classList.add("no-active-focus");
    await renderExploreHome(list);
    return;
  }
  const { data, error } = await focusSupabase.from("focuses").select("*").eq("owner_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { console.error(error); list.innerHTML = '<p class="empty-state">Could not load your focus. Please refresh and try again.</p>'; return; }
  const focuses = data || [], active = focuses.find(f => f.status === "active");
  if (!active) {
    currentFocus = null; currentFocusId = null;
    document.querySelector(".current-focus-home")?.classList.add("no-active-focus");
    list.innerHTML = '<button class="primary-button home-start-focus" onclick="showCreateFocus()">Start a new focus</button>';
    return;
  }
  document.querySelector(".current-focus-home")?.classList.remove("no-active-focus");
  currentFocus = active; currentFocusId = active.id; updateNavigation();
  list.innerHTML = '<button class="current-focus-card" onclick="openFocus(\'' + escapeHtml(active.id) + '\')"><h1>' + escapeHtml(active.title || "Untitled focus") + '</h1><span>Open your focus log ↗</span></button>';
}

async function renderExploreHome(list) {
  if (!list) return;
  const { data: focusRows, error } = await focusSupabase.from("focuses").select("*").in("status", ["active", "completed", "abandoned"]).order("created_at", { ascending: false });
  if (error) { console.error(error); list.innerHTML = '<p class="empty-state">Could not load Explore.</p>'; return; }
  const focuses = focusRows || [];
  const completed = focuses.filter(f => f.status === "completed").sort((a, b) => String(b.completed_at || b.created_at || "").localeCompare(String(a.completed_at || a.created_at || "")));
  const featured = completed[0] || null;
  const board = f => `<button class="focus-collection-board" onclick="openFocus('${escapeHtml(f.id)}')" aria-label="Open focus"><h2>${escapeHtml(f.title || "Untitled focus")}</h2></button>`;
  const { data: sessions } = focuses.length
    ? await focusSupabase.from("sessions").select("id,focus_id,body,session_date,summary").in("focus_id", focuses.map(f => f.id)).order("session_date", { ascending: false })
    : { data: [] };
  const tagMap = new Map();
  (sessions || []).forEach(session => getSessionTags(session).forEach(tag => {
    const key = tag.toLowerCase();
    if (!tagMap.has(key)) tagMap.set(key, { label: tag, focusId: session.focus_id, sessionId: session.id, date: session.session_date || "" });
  }));
  const tags = [...tagMap.values()].sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0,50);
  list.innerHTML =
    '<div class="explore-random">' +
      '<p class="eyebrow explore-featured-eyebrow">Most recently completed focus</p>' +
      (featured ? board(featured) : '<p class="empty-state">No completed focuses yet.</p>') +
      (tags.length ? '<div class="explore-tags"><div class="hairline"></div><p class="eyebrow explore-tags-eyebrow">Explore tags</p><div class="session-tag-cloud">' + tags.map(t => `<button type="button" class="session-tag" onclick="openCollectionTagTarget('${escapeHtml(t.focusId)}','${escapeHtml(t.sessionId)}')">#${escapeHtml(t.label)}</button>`).join("") + '</div></div>' : '') +
    '</div>';
}

function toggleExploreMore() {
  const section = $("exploreMoreFocuses");
  if (!section) return;
  const opening = section.classList.contains("hidden");
  section.classList.toggle("hidden", !opening);
  const button = document.querySelector(".explore-more-toggle");
  if (button) {
    button.setAttribute("aria-expanded", String(opening));
    button.textContent = opening ? "Explore more ↑" : "Explore more ↓";
  }
}

function renderFocusCard(focus) {

  const statusLabel =
    focus.status === "completed"
      ? "COMPLETED"
      : focus.status === "abandoned"
        ? "ABANDONED"
        : "ACTIVE";


  const completionText =
    focus.completion_text
      ? `
        <p>
          ${escapeHtml(focus.completion_text)}
        </p>
      `
      : "";


  const learning =
    focus.learning
      ? `
        <p class="public-focus-learning">
          ${escapeHtml(focus.learning)}
        </p>
      `
      : "";


  return `
    <button
      class="public-focus-card"
      onclick="openFocus('${focus.id}')"
    >

      <p class="focus-status ${focus.status}">
        ${statusLabel}
      </p>

      <h3>
        ${escapeHtml(focus.title)}
      </h3>

      <p class="public-focus-meta">
        Started ${formatDate(
          focus.started_at
            ? focus.started_at.split("T")[0]
            : ""
        )}
      </p>

      ${completionText}

      ${learning}

    </button>
  `;
}


/* --------------------------------
   FOCUS COLLECTION
-------------------------------- */

async function loadCollection(scope="all") {
  const list=$("collectionList");if(!list)return;
  const mine=scope==="mine";const eyebrow=$("collectionEyebrow");
  if(eyebrow)eyebrow.textContent=mine?"MY FOCUSES":"EXPLORE FOCUSES";
  list.innerHTML='<p class="empty-state">Loading...</p>';
  let query=focusSupabase.from("focuses").select("*").order("created_at",{ascending:false});
  if(mine)query=query.eq("owner_id",currentUser.id);
  const {data,error}=await query;
  if(error){console.error(error);list.innerHTML='<p class="empty-state">Could not load the Focus Collection.</p>';return;}
  const focuses=data||[],ongoing=focuses.filter(f=>!["completed","abandoned"].includes(String(f.status||"").toLowerCase())),active=ongoing.find(f=>f.status==="active")||ongoing[0],completed=focuses.filter(f=>f.status==="completed"),abandoned=focuses.filter(f=>f.status==="abandoned");
  const action=$("collectionFocusAction");
  if(action)action.innerHTML=!mine?"":active
    ? '<div class="active-focus-notice"><p class="eyebrow">ONE FOCUS AT A TIME</p><p>You already have an active focus: <strong>'+escapeHtml(active.title)+'</strong></p><button class="secondary-button" onclick="openFocus(\''+escapeHtml(active.id)+'\')">Return to your current focus ↗</button></div>'
    : '<button class="primary-button" onclick="showCreateFocus()">Start a focus</button>';
  const board=f=>'<button class="focus-collection-board" onclick="openFocus(\''+escapeHtml(f.id)+'\')" aria-label="Open '+escapeHtml(f.title)+' focus log"><h2>'+escapeHtml(f.title||"Untitled focus")+'</h2></button>';
  const section=(label,items)=>items.length?'<section class="focus-collection-group"><p class="eyebrow">'+label+'</p><div class="focus-collection-boards">'+items.map(board).join("")+'</div></section>':"";
  const sections=[section(mine?"CURRENT FOCUSES":"CURRENT FOCUSES",ongoing),section("COMPLETED FOCUSES",completed),section("ABANDONED FOCUSES",abandoned)].filter(Boolean).join("");
  let tagsMarkup="";
  if(mine&&focuses.length){
    const {data:sessions,error:tagError}=await focusSupabase.from("sessions").select("id,focus_id,body,session_date,summary").in("focus_id",focuses.map(f=>f.id)).order("session_date",{ascending:true});
    if(tagError)console.error(tagError);else{
      const seen=new Map();(sessions||[]).forEach(s=>getSessionTags(s).forEach(tag=>{const key=tag.toLowerCase();if(!seen.has(key))seen.set(key,{label:tag,targets:[]});seen.get(key).targets.push({focusId:s.focus_id,sessionId:s.id});}));
      const all=[...seen.values()].sort((a,b)=>a.label.localeCompare(b.label));
      if(all.length)tagsMarkup='<section class="collection-tag-index"><p class="eyebrow">TAGS</p><div class="session-tag-cloud">'+all.map(t=>'<button type="button" class="session-tag" onclick="openCollectionTagTarget(\''+escapeHtml(t.targets[0].focusId)+'\',\''+escapeHtml(t.targets[0].sessionId)+'\')">#'+escapeHtml(t.label)+'</button>').join("")+'</div></section>';
    }
  }
  list.innerHTML=(sections||'<p class="empty-state">'+(mine?"Your Focus Collection is empty. Start a focus to begin.":"No focuses have been shared yet.")+'</p>')+tagsMarkup;
}

async function openCollectionTagTarget(focusId, sessionId) {
  await openFocus(focusId, true);
  requestAnimationFrame(() => {
    const item = document.querySelector('.session-card-item[data-session-id="' + CSS.escape(String(sessionId)) + '"]');
    const card = item?.querySelector(".session-card");
    if (card) {
      card.open = true;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}


/* --------------------------------
   CREATE FOCUS
-------------------------------- */

async function showCreateFocus() {
  if (!requireAuth("start-focus")) return;

  const { data: activeFocus, error } = await focusSupabase
    .from("focuses")
    .select("*")
    .eq("owner_id", currentUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(error);
    alert("Couldn't check whether you already have an active focus. Please try again.");
    return;
  }

  if (activeFocus) {
    currentFocus = activeFocus;
    currentFocusId = activeFocus.id;
    setFocusUrl(activeFocus.id);
    await showFocus();
    alert("Finish or abandon your current focus before starting another one.");
    return;
  }

  clearFocusUrl();

  showOnly("createFocusScreen");

  $("focusTitle").value = "";
  $("focusGoalInput").value = "";

  setTimeout(() => {
    $("focusTitle").focus();
  }, 50);
}


async function startNewFocus() {
  if (!requireAuth("start-focus")) return;

  const title = $("focusTitle").value.trim();
  const goal = $("focusGoalInput").value.trim() || null;

  if (!title) {

    $("focusTitle").focus();

    return;
  }


  setLoading(true);

  // Re-check immediately before inserting so a second active focus cannot
  // be started from another tab or a stale collection page.
  const { data: existingActiveFocus, error: activeCheckError } = await focusSupabase
    .from("focuses")
    .select("*")
    .eq("owner_id", currentUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeCheckError) {
    setLoading(false);
    console.error(activeCheckError);
    alert("Couldn't check whether you already have an active focus. Please try again.");
    return;
  }

  if (existingActiveFocus) {
    setLoading(false);
    currentFocus = existingActiveFocus;
    currentFocusId = existingActiveFocus.id;
    setFocusUrl(existingActiveFocus.id);
    await showFocus();
    alert("You already have an active focus. Finish or abandon it before starting another.");
    return;
  }

  const { data, error } = await focusSupabase
    .from("focuses")
    .insert({

      title,
      goal,
      status: "active",
      owner_id: currentUser.id,

      started_at:
        new Date().toISOString()

    })
    .select()
    .single();


  setLoading(false);


  if (error) {

    console.error(error);

    alert(
      "Couldn't start this Focus. Please try again."
    );

    return;
  }


  currentFocusId = data.id;

  currentFocus = data;

  setFocusUrl(data.id);

  updateNavigation();

  await showFocus();
}


/* --------------------------------
   OPEN FOCUS
-------------------------------- */

async function openFocus(focusId, readOnly = false) {

  forceReadOnlyFocusView = Boolean(readOnly);
  currentFocusId = focusId;

  setFocusUrl(focusId);

  await showFocus();

}


async function saveFocusTitle() {
  if (!currentFocusId || !currentFocus || !isCurrentUserOwner()) return;
  const input = $("focusTitleEdit");
  const title = input?.value.trim();
  if (!title) { $("focusTitleSaveStatus").textContent = "Add a title before saving."; return; }
  $("focusTitleSaveStatus").textContent = "Saving…";
  const { data, error } = await focusSupabase.from("focuses").update({ title }).eq("id", currentFocusId).select().single();
  if (error) {
    console.error("Focus title update error:", error);
    $("focusTitleSaveStatus").textContent = "Could not save. Try again.";
    return;
  }
  currentFocus = data;
  $("focusTitleDisplay").textContent = data.title || "";
  $("focusTitleEdit").value = data.title || "";
  $("focusTitleEditor").classList.add("hidden");
  $("focusTitleSaveStatus").textContent = "";
}

function editFocusTitle() {
  if (!isCurrentUserOwner()) return;
  $("focusTitleEdit").value = currentFocus?.title || "";
  $("focusTitleEditor").classList.remove("hidden");
  $("focusTitleSaveStatus").textContent = "";
  $("focusTitleEdit").focus();
}

function cancelEditFocusTitle() {
  $("focusTitleEditor").classList.add("hidden");
  $("focusTitleSaveStatus").textContent = "";
}
async function saveFocusGoal() {
  if (!currentFocusId || !currentFocus || !isCurrentUserOwner()) return;
  const goal = $("focusGoalEdit").value.trim() || null;
  $("goalSaveStatus").textContent = "Saving…";
  const { data, error } = await focusSupabase.from("focuses").update({ goal }).eq("id", currentFocusId).select().single();
  if (error) {
    console.error("Goal update error:", error);
    $("goalSaveStatus").textContent = "Couldn't save. Try again.";
    return;
  }
  currentFocus = data;
  renderFocusGoal();
}

function renderFocusGoal() {
  const goal = currentFocus?.goal?.trim() || "";
  const display = $("focusGoalDisplay");
  const editor = document.querySelector(".focus-goal-editor");
  const cancelButton = $("cancelGoalButton");
  if (!display || !editor) return;

  display.textContent = goal || "Add a goal";
  display.classList.toggle("hidden", false);
  display.classList.toggle("is-empty-goal", !goal);
  editor.classList.toggle("hidden", Boolean(goal));
  if (cancelButton) cancelButton.classList.add("hidden");
  $("goalSaveStatus").textContent = "";
}

function editFocusGoal() {
  if (!isCurrentUserOwner()) return;
  const editor = document.querySelector(".focus-goal-editor");
  if (!editor) return;
  $("focusGoalEdit").value = currentFocus?.goal || "";
  editor.classList.remove("hidden");
  $("cancelGoalButton").classList.remove("hidden");
  $("focusGoalEdit").focus();
}

function cancelEditFocusGoal() {
  $("focusGoalEdit").value = currentFocus?.goal || "";
  renderFocusGoal();
}

async function setCoverImage(sessionId, imageIndex) {
  if (!isCurrentUserOwner()) return;
  const session = currentSessions.find(item => String(item.id) === String(sessionId));
  const url = session?.image_urls?.[imageIndex];
  if (!url || !currentFocusId) return;
  const { data, error } = await focusSupabase.from("focuses").update({ cover_image_url: url }).eq("id", currentFocusId).select().single();
  if (error) {
    console.error("Cover image update error:", error);
    alert("Couldn't set the cover image. Please try again.");
    return;
  }
  currentFocus = data;
  renderSessions();
}

async function showFocus() {

  if (!currentFocusId) {

    showHome();

    return;
  }


  showOnly("focusScreen");


  const { data, error } = await focusSupabase
    .from("focuses")
    .select("*")
    .eq("id", currentFocusId)
    .single();


  if (error || !data) {

    console.error(error);

    clearFocusUrl();

    showOnly("homeScreen");

    await loadHomeFocuses();

    return;
  }


  currentFocus = data;


  document.body.classList.toggle("editing-own-focus", isCurrentUserOwner());
  updateNavigation();
  renderFocusState();
  await loadSessions();
}


/* --------------------------------
   FOCUS STATE
-------------------------------- */

function updateFocusCoverBanner() {
  const coverBanner = $("focusCoverBanner");
  if (!coverBanner) return;
  coverBanner.classList.remove("no-cover");
  coverBanner.classList.remove("hidden");
}

function renderFocusState() {
  if (!currentFocus) return;
  const canEdit=isCurrentUserOwner();
  document.body.classList.toggle("editing-own-focus",canEdit);

  $("focusTitleDisplay").textContent = currentFocus.title || "";
  $("focusTitleEditButton")?.classList.toggle("hidden", !canEdit);
  $("focusTitleEdit").value = currentFocus.title || "";
  $("focusTitleEditor")?.classList.add("hidden");
  updateFocusCoverBanner();
  const boardTitle = $("focusTitleDisplay");
  if (boardTitle) {
    boardTitle.textContent = currentFocus.title || "";
    const angle = (Math.random() * 10 - 5).toFixed(2) + "deg";
    boardTitle.style.setProperty("--board-angle", angle);
  }

  const startedLabel = currentFocus.started_at
    ? `Started ${formatDate(currentFocus.started_at.split("T")[0])}`
    : "";
  const endingDate = currentFocus.status === "completed" ? currentFocus.completed_at : currentFocus.status === "abandoned" ? currentFocus.abandoned_at : null;
  const endingLabel = currentFocus.status === "completed"
    ? `Finished${endingDate ? " " + formatDate(endingDate.split("T")[0]) : ""}`
    : currentFocus.status === "abandoned"
      ? `Abandoned${endingDate ? " " + formatDate(endingDate.split("T")[0]) : ""}`
      : "";
  $("focusStarted").textContent = [startedLabel, endingLabel].filter(Boolean).join(" · ");
  renderFocusCreator();

  $("focusGoalEdit").value = currentFocus.goal || "";
  renderFocusGoal();

  const statusLabel = currentFocus.status === "completed"
    ? "COMPLETED"
    : currentFocus.status === "abandoned"
      ? "ABANDONED"
      : "MY CURRENT FOCUS";

  $("focusStatusLabel").textContent = statusLabel;

  const isActive = currentFocus.status === "active";
  const canAddSteps = canEdit && (isActive || currentFocus.status === "completed");
  $("addSessionButton").classList.toggle("hidden", !canAddSteps);
  $("focusEndingSection").classList.toggle("hidden", !canEdit || !isActive);
  $("focusStepActions")?.classList.toggle("hidden", !canEdit || !isActive);
  $("deleteFocusButton")?.classList.toggle("hidden", !canEdit);
  $("focusGoalDisplay")?.classList.toggle("goal-click-to-edit",canEdit);
  if ($("focusGoalDisplay")) $("focusGoalDisplay").disabled = !canEdit;
  if ($("focusGoalDisplay")) $("focusGoalDisplay").disabled = !canEdit;

  $("newSessionForm").classList.add("hidden");
  $("abandonFocusSection").classList.add("hidden");
}


/* --------------------------------
   DELETE FOCUS
-------------------------------- */

async function deleteCurrentFocus() {
  if (!currentFocusId || !isCurrentUserOwner()) return;

  const title = currentFocus?.title || "this Focus";

  const confirmed = window.confirm(
    `Delete "${title}"?\n\nThis will permanently delete the Focus and its session log.`
  );

  if (!confirmed) return;

  setLoading(true);

  /*
    First delete the sessions belonging to this Focus.
  */
  const { error: sessionsError } = await focusSupabase
    .from("sessions")
    .delete()
    .eq("focus_id", currentFocusId);

  if (sessionsError) {
    console.error("Session delete error:", sessionsError);

    setLoading(false);

    alert(
      "Couldn't delete the session log. The Focus was not deleted."
    );

    return;
  }

  /*
    Delete the Focus itself.

    .select("id") makes Supabase return the deleted row.
    If RLS prevents the delete, this will reveal that
    nothing was actually deleted.
  */
  const { data: deletedFocus, error: focusError } =
    await focusSupabase
      .from("focuses")
      .delete()
      .eq("id", currentFocusId)
      .select("id")
      .maybeSingle();

  setLoading(false);

  if (focusError) {
    console.error("Focus delete error:", focusError);

    alert(
      "Couldn't delete this Focus. Please try again."
    );

    return;
  }

  /*
    If Supabase returns no deleted row, the DELETE was
    blocked by RLS or another database rule.
  */
  if (!deletedFocus) {
    console.error(
      "Focus was not deleted. Supabase returned no deleted row."
    );

    alert(
      "The Focus wasn't actually deleted. This is probably a Supabase permission (RLS) issue."
    );

    return;
  }

  /*
    Clear local state.
  */
  currentFocusId = null;
  currentFocus = null;
  currentSessions = [];

  clearFocusUrl();

  updateNavigation();

  /*
    Go home and reload directly from Supabase.
  */
  await showHome();
}


/* --------------------------------
   SESSIONS
-------------------------------- */

async function loadSessions() {

  if (!currentFocusId) return;


  const { data, error } = await focusSupabase
    .from("sessions")
    .select("*")
    .eq("focus_id", currentFocusId)
    .order("session_date", {
      ascending: true
    })
    .order("created_at", {
      ascending: true
    });


  if (error) {

    console.error(error);

    return;
  }


  currentSessions = data || [];

  updateFocusCoverBanner();
  renderSessions();
}


function formatSessionBody(value) {
  const safe = escapeHtml(value || "");
  return safe.split("\n").map(line => {
    if (line.startsWith("## ")) return "<h3>" + line.slice(3) + "</h3>";
    if (line.startsWith("> ")) return "<blockquote>" + line.slice(2) + "</blockquote>";
    return line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }).join("<br>");
}

const SESSION_CARD_SIZES_KEY = "focusPractice.sessionCardSizes";
const SESSION_CARD_ORDER_KEY = "focusPractice.sessionCardOrder";
const SESSION_CARD_ANGLES_KEY = "focusPractice.sessionCardAngles";
function getSessionCardAngle(sessionId) { let angles = {}; try { angles = JSON.parse(localStorage.getItem(SESSION_CARD_ANGLES_KEY) || "{}") || {}; } catch {} const id = String(sessionId); if (!Number.isFinite(Number(angles[id]))) { angles[id] = Math.round((Math.random() * 10 - 5) * 10) / 10; try { localStorage.setItem(SESSION_CARD_ANGLES_KEY, JSON.stringify(angles)); } catch {} } return Number(angles[id]); }
function readSessionCardSizes() { try { const value = JSON.parse(localStorage.getItem(SESSION_CARD_SIZES_KEY) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; } }
function getSessionCardSize(session, index) { const saved = readSessionCardSizes()[String(session.id)]; if (Number.isFinite(Number(saved)) && saved >= 25 && saved <= 100) return Number(saved); return [44, 46, 40, 48, 42][index % 5]; }
function updateSessionCardSize(sessionId, value) { const size = Math.max(25, Math.min(100, Number(value) || 48)); const item = Array.from(document.querySelectorAll(".session-card-item")).find(element => element.dataset.sessionId === String(sessionId)); if (!item) return; item.style.setProperty("--session-card-width", size + "%"); const output = item.querySelector(".session-card-size-value"); if (output) output.textContent = size + "%"; const sizes = readSessionCardSizes(); sizes[String(sessionId)] = size; try { localStorage.setItem(SESSION_CARD_SIZES_KEY, JSON.stringify(sizes)); } catch {} }
function renderSessions() {
  const section = $("sessionLogSection");
  const list = $("sessionsList");
  if (!section || !list) return;
  section.classList.remove("hidden");
  const addButton = $("addSessionButton");
  const composer = $("newSessionForm");
  const focusStepActions = $("focusStepActions");
  let actionStack = $("focusActionStack");
  if (!actionStack) {
    actionStack = document.createElement("div");
    actionStack.id = "focusActionStack";
    actionStack.className = "focus-action-stack";
  }
  list.innerHTML = currentSessions.map((session, index) => {
    const videoUrl = getSessionVideoUrl(session.body);
    const linkUrl = getSessionLink(session.body);
    const bodyWithoutVideo = stripSessionImageCaption((videoUrl
      ? String(session.body || "").replace(/(?:^|\n)Video:\s*https?:\/\/[^\s]+/i, "")
      : session.body).replace(/(?:^|\n)Link:\s*https?:\/\/[^\s]+/i, "").replace(/(?:\n?\[link-caption\][\s\S]*?\[\/link-caption\])/ig, "").replace(/(?:\n?\[focus-poll\][\s\S]*?\[\/focus-poll\])/ig, "").replace(/(?:\n?\[focus-tags\][\s\S]*?\[\/focus-tags\])/ig, ""));
    const summary = (session.summary || bodyWithoutVideo || "").trim();
    const summaryPreview = summary.length > 180 ? summary.slice(0, 177).trimEnd() + "…" : summary;
    const emoji = (session.summary_emoji || "").trim();
    const dateLabel = formatDate(session.session_date);
    const dayLabel = formatWeekday(session.session_date);
    const timeSpent = (session.time_spent || "").trim();
    const visual = renderSessionCardVisual(session);
    const size = getSessionCardSize(session, index);
    const safeId = escapeHtml(session.id);
    const canEdit = isCurrentUserOwner();
    const cardStyle = readSessionCardStyles()[String(session.id)] || {};
    const cardAngle = getSessionCardAngle(session.id);
    const cardTiltStyle = `--session-card-tilt:${cardAngle}deg`;
    const hasText = Boolean(bodyWithoutVideo.trim());
    const isTextCard = !visual && !linkUrl && !videoUrl;
    const showDate = isTextCard ? cardStyle.showDate !== false : Boolean(cardStyle.showDate);
    const textStyle = `--text-card-font-size:${Math.max(14, Math.min(48, Number(cardStyle.fontSize) || 22))}px;--text-card-font-family:${escapeHtml(cardStyle.fontFamily || "'Courier New', monospace")}`;
    const timeMarkup = timeSpent ? `<span class="session-time">${escapeHtml(timeSpent)}</span>` : "";
    const visualSummary = `${emoji ? `<span class="session-tldr-emoji">${escapeHtml(emoji)}</span>` : ""}${summaryPreview ? `<span class="session-tldr-text">${escapeHtml(summaryPreview)}</span>` : ""}`;
    const pollMatch = String(session.body || "").match(/\[focus-poll\]([\s\S]*?)\[\/focus-poll\]/);
    let pollQuestion = ""; try { pollQuestion = pollMatch ? (JSON.parse(pollMatch[1]).question || "") : ""; } catch {}
    const emptyPreview = pollQuestion ? "📊 " + pollQuestion : (timeSpent ? "⏱ " + timeSpent : "Add a note");
    const textSummary = hasText ? `<div class="text-card-preview" style="${textStyle}">${formatSessionBody(bodyWithoutVideo)}</div>` : (pollQuestion ? "" : `<div class="text-card-preview text-card-empty" style="${textStyle}">${escapeHtml(timeSpent ? "⏱ " + timeSpent : "Add a note")}</div>`);
    return `
      <div class="session-card-item ${isTextCard ? "text-card-item" : "visual-card-item"}" data-session-id="${safeId}" style="--session-card-width:${size}%;${cardTiltStyle}">
        <details class="session-card ${visual ? "has-session-visual" : "text-only-step"}">
          <summary class="session-collapsed-header">
            ${showDate ? `<span class="session-card-date">${escapeHtml(dateLabel || "Date not set")}</span>` : ""}
            ${visual}
            ${videoUrl ? renderSessionVideo(session) : ""}
            ${linkUrl ? renderSessionLink(session) : ""}
            ${isTextCard ? textSummary : `<div class="session-overlay-copy"><div class="session-tldr">${visualSummary}</div></div>`}
            
          </summary>
          <div class="session-expanded-content">
            <div class="session-edit-controls${canEdit ? "" : " read-only-hidden"}">
              <label for="sessionDateEdit-${safeId}">Session date</label><input id="sessionDateEdit-${safeId}" type="date" value="${escapeHtml(session.session_date || "")}" onchange="saveSessionDate(\'${safeId}\', this.value)">
              <label for="sessionTagsEdit-${safeId}">Tags</label><div class="session-edit-tags">${getSessionTags(session).map(tag => '<span class="session-tag">#' + escapeHtml(tag) + '</span>').join("")}</div><input id="sessionTagsEdit-${safeId}" class="session-tags-input" type="text" value="${escapeHtml(getSessionTags(session).join(", "))}" onchange="saveSessionTags(\'${safeId}\', this.value)" placeholder="Add tags, separated by commas">
              <label for="sessionDateDisplay-${safeId}">Display date on card</label><select id="sessionDateDisplay-${safeId}" onchange="updateSessionDateDisplay('${safeId}', this.value)"><option value="off" ${showDate ? "" : "selected"}>Hidden</option><option value="on" ${showDate ? "selected" : ""}>Show date</option></select>
              <label for="sessionCardSize-${safeId}">Width <output class="session-card-size-value">${size}%</output></label>
              <input id="sessionCardSize-${safeId}" type="range" min="25" max="100" step="1" value="${size}" aria-label="Adjust width" oninput="updateSessionCardSize('${safeId}', this.value)">
              ${isTextCard ? `<label for="textCardHeight-${safeId}">Text card height <output>${Math.max(80,Math.min(420,Number(cardStyle.height)||150))}px</output></label><input id="textCardHeight-${safeId}" type="range" min="80" max="420" step="10" value="${Math.max(80,Math.min(420,Number(cardStyle.height)||150))}" oninput="updateTextCardStyle('${safeId}','height',this.value)"><label for="textCardFont-${safeId}">Font</label><select id="textCardFont-${safeId}" onchange="updateTextCardStyle('${safeId}','fontFamily',this.value)"><option value="Georgia, serif" ${cardStyle.fontFamily==="Georgia, serif"?"selected":""}>Editorial serif</option><option value="Helvetica, Arial, sans-serif" ${cardStyle.fontFamily==="Helvetica, Arial, sans-serif"?"selected":""}>Clean sans-serif</option><option value="'Courier New', monospace" ${(!cardStyle.fontFamily||cardStyle.fontFamily==="'Courier New', monospace")?"selected":""}>Typewriter</option><option value="Arial, sans-serif" ${cardStyle.fontFamily==="Arial, sans-serif"?"selected":""}>Bold simple</option></select><label for="textCardFontSize-${safeId}">Text size <output>${Math.max(14,Math.min(48,Number(cardStyle.fontSize)||22))}px</output></label><input id="textCardFontSize-${safeId}" type="range" min="14" max="48" step="1" value="${Math.max(14,Math.min(48,Number(cardStyle.fontSize)||22))}" oninput="updateTextCardStyle('${safeId}','fontSize',this.value)">` : ""}
              ${!isTextCard ? renderCaptionDisplayControl(safeId, cardStyle) : ""}
              ${(Array.isArray(session.image_urls) && session.image_urls.some(isSafeImageUrl)) ? '<label for="sessionImageCaptionEdit-' + safeId + '">Caption</label><input id="sessionImageCaptionEdit-' + safeId + '" class="session-image-caption-edit" type="text" maxlength="300" value="' + escapeHtml(getSessionImageCaption(session.body)) + '" placeholder="Add a caption (optional)" onchange="saveSessionImageCaption(this.id.replace(\'sessionImageCaptionEdit-\', \'\'), this.value)">' : ""}
              <button type="button" class="step-delete-button edit-delete-button" aria-label="Delete step ${index + 1}" title="Delete step" onclick="deleteSession(event, '${safeId}')">Delete card</button>
              <button type="button" class="session-save-button" onclick="this.closest(\'details\').removeAttribute(\'open\')">Save</button>
            </div>
            <div class="session-main"><div class="session-body-content" contenteditable="${canEdit ? "true" : "false"}" data-session-id="${safeId}" onblur="saveEditedSessionText(this)" aria-label="Edit session text">${formatSessionBody(bodyWithoutVideo)}</div></div>
            <div class="session-details">
              ${renderSessionDetail("Things accomplished", session.accomplished)}
              ${renderSessionDetail("Funny things that happened", session.funny)}
              ${renderSessionDetail("Excitements", session.excitements)}
              ${renderSessionDetail("Mistakes", session.mistakes)}
              ${renderSessionDetail("Things I learned", session.learned)}
              ${renderSessionDetail("For next time", session.next_time)}
            </div>
            ${renderSessionImages(session)}
          </div>
        </details>
        ${renderSessionPoll(session)}
      </div>`;
  }).join("");
  renderSessionTagCloud();
  if (actionStack.parentElement !== list) list.appendChild(actionStack);
  if (addButton) actionStack.appendChild(addButton);
  if (focusStepActions) actionStack.appendChild(focusStepActions);
  if (composer && composer.parentElement !== list) list.appendChild(composer);
  if (composer) list.appendChild(composer);
  if (addButton) addButton.classList.toggle("hidden", !currentFocus || currentFocus.status !== "active" || !composer.classList.contains("hidden"));
  if (focusStepActions) focusStepActions.classList.toggle("hidden", !currentFocus || currentFocus.status !== "active");
}
function renderCaptionDisplayControl(sessionId, style) {
  const mode = style.captionDisplay || "below";
  const frame = style.imageFrame || "plain";
  const flip = style.imageFlip || "none";
  return '<label for="captionDisplay-' + sessionId + '">Image caption</label><select id="captionDisplay-' + sessionId + '" onchange="updateSessionCaptionDisplay(\'' + sessionId + '\', this.value)">' +
    '<option value="below" ' + (mode === "below" ? "selected" : "") + '>Below image</option>' +
    '<option value="on-image" ' + (mode === "on-image" ? "selected" : "") + '>On image</option>' +
    '<option value="hover" ' + (mode === "hover" ? "selected" : "") + '>On hover</option></select>' +
    '<label for="imageFrame-' + sessionId + '">Image style</label><select id="imageFrame-' + sessionId + '" onchange="updateSessionImageFrame(\'' + sessionId + '\', this.value)">' +
    '<option value="plain" ' + (frame === "plain" ? "selected" : "") + '>Plain image</option>' +
    '<option value="polaroid" ' + (frame === "polaroid" ? "selected" : "") + '>Polaroid with bottom caption</option></select>' + '<label for="imageFlip-' + sessionId + '">Flip image</label><select id="imageFlip-' + sessionId + '" onchange="updateSessionImageFlip(\'' + sessionId + '\', this.value)"><option value="none" ' + (flip === "none" ? "selected" : "") + '>Original</option><option value="flip-horizontal" ' + (flip === "flip-horizontal" ? "selected" : "") + '>Flip horizontal</option><option value="flip-vertical" ' + (flip === "flip-vertical" ? "selected" : "") + '>Flip vertical</option><option value="flip-both" ' + (flip === "flip-both" ? "selected" : "") + '>Flip both</option></select>';
}
function readSessionCardStyles() { try { const value = JSON.parse(localStorage.getItem("focusPractice.sessionCardStyles") || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; } }
function updateSessionDateDisplay(sessionId, value) {
  const styles = readSessionCardStyles();
  styles[String(sessionId)] = { ...(styles[String(sessionId)] || {}), showDate: value === "on" };
  try { localStorage.setItem("focusPractice.sessionCardStyles", JSON.stringify(styles)); } catch {}
  const item = Array.from(document.querySelectorAll(".session-card-item")).find(element => element.dataset.sessionId === String(sessionId));
  const session = currentSessions.find(entry => String(entry.id) === String(sessionId));
  const summary = item?.querySelector(".session-collapsed-header");
  if (summary && session) {
    const existing = summary.querySelector(".session-card-date");
    if (value === "on" && !existing) summary.insertAdjacentHTML("afterbegin", '<span class="session-card-date">' + escapeHtml(formatDate(session.session_date) || "Date not set") + '</span>');
    if (value !== "on" && existing) existing.remove();
  }
}
function updateSessionImageFrame(sessionId, value) { if (!["plain", "polaroid"].includes(value)) return; const styles = readSessionCardStyles(); styles[String(sessionId)] = { ...(styles[String(sessionId)] || {}), imageFrame: value }; try { localStorage.setItem("focusPractice.sessionCardStyles", JSON.stringify(styles)); } catch {} const item = Array.from(document.querySelectorAll(".session-card-item")).find(el => el.dataset.sessionId === String(sessionId)); const visual = item && item.querySelector(".session-card-visual"); if (visual) visual.classList.toggle("image-frame-polaroid", value === "polaroid"); }
async function saveEditedSessionText(element) {
  if (!isCurrentUserOwner()) return;
  const sessionId = element && element.dataset.sessionId;
  const session = currentSessions.find(item => String(item.id) === String(sessionId));
  if (!session || !element || element.dataset.saving === "true") return;
  const oldBody = String(session.body || "");
  const pollMatch = oldBody.match(/(?:^|\n)(\[focus-poll\][\s\S]*?\[\/focus-poll\])/i);
  const tagsMatch = oldBody.match(/(?:^|\n)(\[focus-tags\][\s\S]*?\[\/focus-tags\])/i);
  const linkMatch = oldBody.match(/(?:^|\n)(Link:\s*https?:\/\/[^\s]+)/i);
  const linkCaptionMatch = oldBody.match(/(?:^|\n)(\[link-caption\][\s\S]*?\[\/link-caption\])/i);
  const videoMatch = oldBody.match(/(?:^|\n)Video:\s*https?:\/\/[^\s]+/i);
  const captionMatch = oldBody.match(/(?:^|\n)\[image-caption\][\s\S]*?\[\/image-caption\]/i);
  let body = element.innerText.trim();
  if (pollMatch) body += (body ? "\n\n" : "") + pollMatch[1].trim();
  if (videoMatch) body += (body ? "\n\n" : "") + videoMatch[0].trim();
  if (captionMatch) body += (body ? "\n\n" : "") + captionMatch[0].trim();
  if (tagsMatch) body += (body ? "\n\n" : "") + tagsMatch[1].trim();
  if (linkMatch) body += (body ? "\n\n" : "") + linkMatch[1].trim();
  if (linkCaptionMatch) body += (body ? "\n\n" : "") + linkCaptionMatch[1].trim();
  if (body === oldBody) return;
  element.dataset.saving = "true";
  const { error } = await focusSupabase.from("sessions").update({ body }).eq("id", sessionId);
  delete element.dataset.saving;
  if (error) { console.error(error); alert("Could not save this text. Please try again."); return; }
  await loadSessions();
}
async function saveSessionImageCaption(sessionId, value) {
  if (!isCurrentUserOwner()) return;
  const session = currentSessions.find(item => String(item.id) === String(sessionId));
  if (!session) return;
  const oldBody = String(session.body || "");
  const caption = String(value || "").trim();
  const withoutCaption = oldBody.replace(/\[image-caption\][\s\S]*?\[\/image-caption\]/i, "").trim();
  const body = caption ? withoutCaption + (withoutCaption ? "\n\n" : "") + "[image-caption]" + caption + "[/image-caption]" : withoutCaption;
  const { error } = await focusSupabase.from("sessions").update({ body }).eq("id", sessionId).eq("focus_id", currentFocusId);
  if (error) { console.error(error); alert("Could not save the caption. Please try again."); return; }
  await loadSessions();
}

function updateSessionCaptionDisplay(sessionId, value) {
  if (!["below", "on-image", "hover"].includes(value)) return;
  const styles = readSessionCardStyles();
  styles[String(sessionId)] = { ...(styles[String(sessionId)] || {}), captionDisplay: value };
  try { localStorage.setItem("focusPractice.sessionCardStyles", JSON.stringify(styles)); } catch {}
  const item = Array.from(document.querySelectorAll(".session-card-item")).find(el => el.dataset.sessionId === String(sessionId));
  const caption = item && item.querySelector(".session-image-caption");
  if (caption) caption.className = "session-image-caption caption-" + value;
}
function updateTextCardStyle(sessionId, key, value) {
  const styles = readSessionCardStyles();
  styles[String(sessionId)] = styles[String(sessionId)] || {};
  styles[String(sessionId)][key] = key === "fontFamily" ? value : Number(value);
  try { localStorage.setItem("focusPractice.sessionCardStyles", JSON.stringify(styles)); } catch {}
  const item = Array.from(document.querySelectorAll(".session-card-item")).find(element => element.dataset.sessionId === String(sessionId));
  if (!item) return;
  const style = styles[String(sessionId)];
  const preview = item.querySelector(".text-card-preview");
  if (preview) {
    preview.style.setProperty("--text-card-font-size", (Number(style.fontSize) || 22) + "px");
    preview.style.setProperty("--text-card-font-family", style.fontFamily || "'Courier New', monospace");
  }
  const output = item.querySelector(`#textCardFontSize-${CSS.escape(String(sessionId))}`)?.previousElementSibling?.querySelector("output");
  if (output) output.textContent = value + "px";
}

async function deleteSession(event, sessionId) {
  event.preventDefault();
  if (!isCurrentUserOwner()) return;
  event.stopPropagation();
  if (!sessionId || !currentFocusId) return;
  if (!window.confirm("Delete this step? This can't be undone.")) return;

  const { error } = await focusSupabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("focus_id", currentFocusId);

  if (error) {
    console.error("Could not delete step:", error);
    alert("Couldn't delete this step. Please try again.");
    return;
  }

  currentSessions = currentSessions.filter(session => String(session.id) !== String(sessionId));
  renderSessions();
  updateFocusCoverBanner();
}
function renderSessionDetail(
  label,
  value
) {

  if (!value) return "";


  return `
    <div class="session-detail">

      <div class="session-detail-label">
        ${escapeHtml(label)}
      </div>

      <div class="session-detail-text">
        ${escapeHtml(value)}
      </div>

    </div>
  `;
}


/* --------------------------------
   SESSION FORM
-------------------------------- */

function updateSessionTimeLabel() {
  const slider = $("sessionTimeSlider"), label = $("sessionTimeValue"), hidden = $("sessionTimeSpent");
  if (!slider || !label || !hidden) return;
  const minutes = Number(slider.value);
  label.textContent = minutes >= 60 ? (Math.floor(minutes/60) + "h" + (minutes%60 ? " " + (minutes%60) + "m" : "")) : (minutes + " min");
  hidden.value = label.textContent;
}

function hideSessionInputs(except) {
  const inputs = {
    text: $("sessionText"),
    image: $("sessionImages"),
    video: $("sessionVideoUrl"),
    link: $("sessionLinkFields"),
    time: $("composerTimeControl"),
    emoji: $("composerEmojiControl"),
    drawing: $("sessionDrawingPanel")
  };
  Object.entries(inputs).forEach(([key, element]) => {
    if (!element || key === except) return;
    if (key === "text") element.classList.add("hidden");
    else if (key === "image" || key === "video" || key === "link") element.classList.remove("is-visible");
    else if (key === "time" || key === "emoji") element.classList.remove("is-open");
    else element.classList.add("hidden");
  });
  $("sessionImageCaption")?.classList.toggle("is-visible", except === "image" || except === "video");
  $("sessionImageFrameWrap")?.classList.toggle("is-open", except === "image");
  $("sessionPrompt").closest(".composer-prompt")?.classList.toggle("is-open", except === "text");
  $("sessionLinkFields")?.classList.toggle("is-visible", except === "link");
  $("sessionTextFormatting")?.classList.toggle("hidden", except !== "text");
}

function focusSessionText() {
  hideSessionInputs("text");
  $("sessionPrompt").closest(".composer-prompt")?.classList.add("is-open");
  const field = $("sessionText");
  field.classList.remove("hidden");
  $("sessionTextFormatting")?.classList.remove("hidden");
  field.focus();
  field.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatSessionText(kind) {
  const field = $("sessionText");
  const start = field.selectionStart, end = field.selectionEnd;
  const selected = field.value.slice(start, end) || "your text";
  let before = "", after = "";
  if (kind === "bold") { before = "**"; after = "**"; }
  if (kind === "heading") before = "## ";
  if (kind === "quote") before = "> ";
  field.setRangeText(before + selected + after, start, end, "select");
  field.focus();
  resizeSessionTextarea(field);
}

function showSessionDrawing() {
  hideSessionInputs("drawing");
  $("sessionDrawingPanel").classList.remove("hidden");
  initSessionDrawing();
}

function paintSessionDrawingBackground(ctx, canvas) {
  ctx.fillStyle = "#fffefa";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e8e2d8";
  for (let x = 18; x < canvas.width; x += 24) {
    for (let y = 18; y < canvas.height; y += 24) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function initSessionDrawing() {
  const canvas = $("sessionDrawingCanvas");
  if (!canvas || canvas.dataset.ready) return;
  const ctx = canvas.getContext("2d");
  paintSessionDrawingBackground(ctx, canvas);
  ctx.strokeStyle = "#292720";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  let drawing = false;
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  canvas.addEventListener("pointerdown", event => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener("pointermove", event => {
    if (!drawing) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.dataset.ready = "true";
}

function clearSessionDrawing() {
  const canvas = $("sessionDrawingCanvas");
  const ctx = canvas.getContext("2d");
  paintSessionDrawingBackground(ctx, canvas);
}

function showSessionImages() {
  hideSessionInputs("image");
  $("sessionImageFrameWrap")?.classList.add("is-open");
  const field = $("sessionImages");
  field.classList.add("is-visible");
  $("sessionImageCaption")?.classList.add("is-visible");
  field.focus();
}

function focusSessionLink() {
  hideSessionInputs("link");
  $("sessionLinkFields")?.classList.add("is-visible");
  $("sessionLinkUrl")?.focus();
}

function focusSessionVideo() {
  hideSessionInputs("video");
  $("sessionImageCaption")?.classList.add("is-visible");
  const field = $("sessionVideoUrl");
  field.classList.add("is-visible");
  field.focus();
}

function focusSessionTime() {
  const control = $("composerTimeControl");
  const wasOpen = control.classList.contains("is-open");
  hideSessionInputs(wasOpen ? "" : "time");
  if (!wasOpen) { updateSessionTimeLabel(); control.classList.add("is-open"); $("sessionTimeSlider").focus(); }
}

function focusSessionEmoji() {
  const control = $("composerEmojiControl");
  const wasOpen = control.classList.contains("is-open");
  hideSessionInputs(wasOpen ? "" : "emoji");
  if (!wasOpen) { control.classList.add("is-open"); $("sessionSummaryEmoji").focus(); }
}

function openSessionForm() {
  if (!isCurrentUserOwner()) return;

  $("newSessionForm").classList.remove("hidden");
  $("addSessionButton")?.classList.add("hidden");

  $("sessionDate").value = todayString();
  if ($("sessionTagsInput")) $("sessionTagsInput").value = "";
  if ($("sessionText")) delete $("sessionText").dataset.poll;
  $("sessionPollPanel")?.classList.add("hidden"); $("sessionTimerPanel")?.classList.add("hidden"); resetSessionTimer();
  clearSessionDrawing();
  $("sessionImages").value = "";
  $("sessionImageCaption").value = "";
  $("sessionImageCaption")?.classList.remove("is-visible");
  $("sessionImageFrameWrap")?.classList.remove("is-open");
  $("sessionPrompt").closest(".composer-prompt")?.classList.remove("is-open");
  if ($("sessionImageFrame")) $("sessionImageFrame").value = "plain";
  $("sessionVideoUrl").value = "";
  $("sessionImages").classList.remove("is-visible");
  $("sessionText").classList.add("hidden");
  $("sessionTextFormatting")?.classList.add("hidden");
  $("sessionDrawingPanel")?.classList.add("hidden");
  $("sessionTimeSlider").value = "45";
  updateSessionTimeLabel();
  document.querySelector(".composer-extra-fields")?.classList.add("hidden");
  document.getElementById("composerTimeControl")?.classList.remove("is-open");
  document.getElementById("composerEmojiControl")?.classList.remove("is-open");

  window.scrollTo({
    top:
      $("newSessionForm").offsetTop - 30,
    behavior: "smooth"
  });
}


function closeSessionForm() {

  $("newSessionForm").classList.add("hidden");
  $("addSessionButton")?.classList.remove("hidden");

  $("sessionText").value = "";
  delete $("sessionText").dataset.poll;
  if ($("sessionTagsInput")) $("sessionTagsInput").value = "";
  $("sessionPollPanel")?.classList.add("hidden"); $("sessionTimerPanel")?.classList.add("hidden"); resetSessionTimer();
  $("sessionImages").value = "";
  $("sessionImageCaption").value = "";
  $("sessionImageCaption")?.classList.remove("is-visible");
  $("sessionImageFrameWrap")?.classList.remove("is-open");
  $("sessionPrompt").closest(".composer-prompt")?.classList.remove("is-open");
  $("sessionLinkUrl").value = "";
  $("sessionLinkCaption").value = "";
  $("sessionLinkFields")?.classList.remove("is-visible");
  $("sessionVideoUrl").value = "";
  $("sessionImages").classList.remove("is-visible");
  $("sessionText").classList.add("hidden");
  $("sessionTextFormatting")?.classList.add("hidden");
  $("sessionDrawingPanel")?.classList.add("hidden");
  $("sessionPrompt").value = "";
  if ($("sessionIncludePrompt")) $("sessionIncludePrompt").checked = false;

  $("sessionAccomplished").value = "";

  $("sessionFunny").value = "";

  $("sessionExcitements").value = "";

  $("sessionMistakes").value = "";

  $("sessionLearned").value = "";

  $("sessionNextTime").value = "";

  $("sessionTimeSpent").value = "";
  $("sessionSummaryEmoji").value = "";
  $("sessionSummary").value = "";
  $("sessionVideoUrl").value = "";
  document.querySelector(".composer-extra-fields")?.classList.add("hidden");
  document.getElementById("composerTimeControl")?.classList.remove("is-open");
  document.getElementById("composerEmojiControl")?.classList.remove("is-open");

  $("sessionDate").value =
    todayString();
}


async function saveSession() {
  if (!isCurrentUserOwner()) return;

  const date = $("sessionDate").value;

  // Read the note field at submit time, even if the toolbar hid it moments earlier.
  const textField = $("sessionText");
  let body = String(textField?.value || "").trim();
  if (textField?.dataset.poll) body = body + (body ? "\n\n" : "") + "[focus-poll]" + textField.dataset.poll + "[/focus-poll]";
  const tagValues = [...new Set(String($("sessionTagsInput")?.value || "").split(",").map(tag => tag.trim().replace(/^#/, "")).filter(Boolean))];
  if (sessionTimerStartedAt) { sessionTimerSeconds += Math.floor((Date.now() - sessionTimerStartedAt) / 1000); sessionTimerStartedAt = null; clearInterval(sessionTimerInterval); sessionTimerInterval = null; }
  if (sessionTimerSeconds > 0) $("sessionTimeSpent").value = Math.max(1, Math.round(sessionTimerSeconds / 60)) + " min";
  const imageCaption = $("sessionImageCaption").value.trim();
  const hasImages = Boolean(($("sessionImages").files && $("sessionImages").files.length) || !$("sessionDrawingPanel").classList.contains("hidden"));
  const videoUrl = $("sessionVideoUrl").value.trim();
  const linkUrl = $("sessionLinkUrl")?.value.trim() || "";
  const linkCaption = $("sessionLinkCaption")?.value.trim() || "";
  const prompt = $("sessionPrompt").value;
  const includePrompt = $("sessionIncludePrompt")?.checked;
  if (includePrompt && prompt && body) body = prompt + "\n\n" + body;
  else if (includePrompt && prompt) body = prompt;
  if (videoUrl) body = (body ? body + "\n\n" : "") + "Video: " + videoUrl;
  if (linkUrl) { try { const parsedLink = new URL(linkUrl); if (!["http:", "https:"].includes(parsedLink.protocol)) throw new Error("bad protocol"); body = (body ? body + "\n\n" : "") + "Link: " + parsedLink.href; if (linkCaption) body += "\n[link-caption]" + linkCaption + "[/link-caption]"; } catch { $("sessionLinkUrl").focus(); alert("Please enter a valid http or https link."); return; } }
  if (imageCaption) body = (body ? body + "\n\n" : "") + "[image-caption]" + imageCaption + "[/image-caption]";
  if (tagValues.length) body = body + (body ? "\n\n" : "") + "[focus-tags]" + JSON.stringify(tagValues) + "[/focus-tags]";


  if (!date) {

    $("sessionDate").focus();

    return;
  }


  if (!body && !($("sessionImages").files || []).length && $("sessionDrawingPanel").classList.contains("hidden") && !$("sessionTimeSpent").value.trim()) {
    $("sessionText").focus();
    return;
  }


  const selectedImages = Array.from($("sessionImages").files || []);
  const drawingCanvas = $("sessionDrawingCanvas");
  const drawingVisible = !$("sessionDrawingPanel").classList.contains("hidden");
  if (drawingVisible && drawingCanvas) {
    const drawingFile = await new Promise(resolve => drawingCanvas.toBlob(blob => resolve(blob ? new File([blob], "session-drawing.png", { type: "image/png" }) : null), "image/png"));
    if (drawingFile) selectedImages.push(drawingFile);
  }
  const session = {
    focus_id: currentFocusId,

    session_date: date,

    body,

    accomplished:
      $("sessionAccomplished")
        .value.trim() || null,

    funny:
      $("sessionFunny")
        .value.trim() || null,

    excitements:
      $("sessionExcitements")
        .value.trim() || null,

    mistakes:
      $("sessionMistakes")
        .value.trim() || null,

    learned:
      $("sessionLearned")
        .value.trim() || null,

    next_time:
      $("sessionNextTime")
        .value.trim() || null,

    time_spent:
      $("sessionTimeSpent")
        .value.trim() || null,

    summary:
      $("sessionSummary")
        .value.trim() || null,

    summary_emoji:
      $("sessionSummaryEmoji")
        .value.trim() || null
  };


  setLoading(true);


  const { data: insertedSession, error } = await focusSupabase.from("sessions").insert(session).select().single();
  if (error) {
    setLoading(false);
    console.error(error);
    alert("Couldn't save this session. Please try again.");
    return;
  }

  if (tagValues.length) { const tagMap = readSessionTagsMap(); tagMap[String(insertedSession.id)] = tagValues; try { localStorage.setItem("focusPractice.sessionTags", JSON.stringify(tagMap)); } catch {} }
  // Persist the image style chosen on the initial composer screen.
  if (selectedImages.length) {
    const styles = readSessionCardStyles();
    styles[String(insertedSession.id)] = { ...(styles[String(insertedSession.id)] || {}), imageFrame: $("sessionImageFrame")?.value === "polaroid" ? "polaroid" : "plain" };
    try { localStorage.setItem("focusPractice.sessionCardStyles", JSON.stringify(styles)); } catch {}
  }
  // Ensure the initial note is persisted if the insert response differs from the submitted value.
  if (body && String(insertedSession.body || "") !== body) {
    const { error: bodySaveError } = await focusSupabase.from("sessions").update({ body }).eq("id", insertedSession.id);
    if (bodySaveError) console.error("Could not confirm initial note save:", bodySaveError);
  }

  try {
    if (selectedImages && selectedImages.length) {
      const uploadedUrls = await uploadSessionImages(selectedImages, insertedSession.id);
      const { error: imageSaveError } = await focusSupabase.from("sessions").update({ image_urls: uploadedUrls }).eq("id", insertedSession.id);
      if (imageSaveError) throw imageSaveError;
    }
  } catch (imageError) {
    console.error("Session image upload error:", imageError);
    setLoading(false);
    alert(`The session was saved, but the images could not be uploaded. ${imageError.message || "Please try again."}`);
    closeSessionForm();
    await loadSessions();
    return;
  }

  setLoading(false);
  closeSessionForm();

  await loadSessions();
}


/* --------------------------------
   COMPLETE
-------------------------------- */

async function completeFocus() {
  if (!currentFocusId || !isCurrentUserOwner()) return;


  const confirmed = window.confirm(
    "Mark this Focus as finished?"
  );


  if (!confirmed) return;


  setLoading(true);


  const {
    data,
    error
  } = await focusSupabase
    .from("focuses")
    .update({

      status: "completed",

      completed_at:
        new Date().toISOString(),

      /*
        We are no longer asking for a
        completion reflection or consent.
      */

      is_public: true

    })
    .eq("id", currentFocusId)
    .select()
    .single();


  setLoading(false);


  if (error) {

    console.error(error);

    alert(
      "Couldn't complete this Focus. Please try again."
    );

    return;
  }


  currentFocus = data;


  /*
    Important:
    There is NO completion page anymore.

    Once completed, go straight home.
  */

  currentFocusId = null;

  clearFocusUrl();

  updateNavigation();

  await showHome();
}


/* --------------------------------
   ABANDON
-------------------------------- */

function showAbandonFocus() {

  $("focusEndingSection")
    .classList.add("hidden");


  $("abandonFocusSection")
    .classList.remove("hidden");


  $("abandonLearning").value = "";


  window.scrollTo({
    top:
      $("abandonFocusSection").offsetTop - 30,
    behavior: "smooth"
  });
}


async function abandonFocus() {
  if (!isCurrentUserOwner()) return;

  const learning =
    $("abandonLearning")
      .value.trim();


  const {
    data,
    error
  } = await focusSupabase
    .from("focuses")
    .update({

      status: "abandoned",

      abandoned_at:
        new Date().toISOString(),

      learning:

        learning || null,

      is_public: true

    })
    .eq("id", currentFocusId)
    .select()
    .single();


  if (error) {

    console.error(error);

    alert(
      "Couldn't abandon this Focus. Please try again."
    );

    return;
  }


  currentFocus = data;

  currentFocusId = null;


  clearFocusUrl();

  updateNavigation();

  await showHome();
}


/* --------------------------------
   SHARED FOCUS VIEW
-------------------------------- */

async function showPublicFocus(focusId) {

  await openFocus(focusId);

}


/* --------------------------------
   INITIAL LOAD
-------------------------------- */

async function initializeApp() {
  const {data:{session}}=await focusSupabase.auth.getSession();
  currentUser=session?.user||null;
  focusSupabase.auth.onAuthStateChange((_event,nextSession)=>{currentUser=nextSession?.user||null;updateNavigation();});
  updateNavigation();
  const params=new URLSearchParams(window.location.search);
  const profileId=params.get("profile");
  if(profileId){await showProfile(profileId);return;}
  const focusId=getFocusIdFromUrl();
  if(focusId){currentFocusId=focusId;await showFocus();return;}
  await showHome();
}

/*
  Browser back / forward support.
*/

window.addEventListener(
  "popstate",
  async () => {

    const params=new URLSearchParams(window.location.search);
    const profileId=params.get("profile");
    if(profileId){await showProfile(profileId);return;}
    const focusId =
      getFocusIdFromUrl();


    if (focusId) {

      currentFocusId = focusId;

      await showFocus();

    } else {

      currentFocusId = null;

      currentFocus = null;

      await showHome();

    }

  }
);


document.addEventListener(
  "DOMContentLoaded",
  initializeApp
);

/* Session text fields start compact and grow to fit their content. */
function resizeSessionTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

function resizeSessionTextareas() {
  document.querySelectorAll(".new-session-form textarea").forEach(resizeSessionTextarea);
}

document.addEventListener("input", (event) => {
  if (event.target.matches(".new-session-form textarea")) {
    resizeSessionTextarea(event.target);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "sessionPrompt" && event.target.value) {
    focusSessionText();
    $("sessionText").value = event.target.value + "\n";
    resizeSessionTextarea($("sessionText"));
    $("sessionText").setSelectionRange($("sessionText").value.length, $("sessionText").value.length);
  }
  if (event.target.id === "sessionImages") {
    const existing = document.getElementById("sessionImageSelection");
    if (existing) existing.remove();
    if (event.target.files && event.target.files.length) {
      const note = document.createElement("p");
      note.id = "sessionImageSelection";
      note.className = "composer-attachment-note";
      note.textContent = event.target.files.length === 1
        ? event.target.files[0].name
        : event.target.files.length + " images selected";
      event.target.closest(".session-composer").querySelector(".composer-attachments").prepend(note);
    }
  }
});


document.addEventListener("click", function(event) {
  const insideCard = event.target.closest(".session-card");
  document.querySelectorAll(".session-card[open]").forEach(function(card) {
    if (card !== insideCard) card.removeAttribute("open");
  });
});


/* Hover preview: preload all images and crossfade through the full image set. */
const focusBoardPreviewTimers = new WeakMap();
const focusBoardPreviewCache = new Map();

function getFocusBoardId(board) {
  const match = String(board?.getAttribute("onclick") || "").match(/openFocus\(['"]([^'"]+)['"]\)/);
  return match ? match[1] : "";
}

async function loadPreviewImages(urls) {
  const results = await Promise.all(urls.map(url => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = () => resolve(null);
    image.src = url;
  })));
  return results.filter(Boolean);
}

async function startFocusBoardPreview(board) {
  if (!board || board.dataset.previewing === "true") return;
  const focusId = getFocusBoardId(board);
  if (!focusId) return;
  board.dataset.previewing = "true";

  let previewData = focusBoardPreviewCache.get(focusId);
  if (!previewData) {
    const { data, error } = await focusSupabase
      .from("sessions")
      .select("image_urls,session_date,body")
      .eq("focus_id", focusId)
      .order("session_date", { ascending: true });
    if (error) {
      console.error("Could not load focus board image preview:", error);
      board.dataset.previewing = "false";
      return;
    }
    const urls = [...new Set((data || []).flatMap(session =>
      Array.isArray(session.image_urls) ? session.image_urls.filter(isSafeImageUrl) : []
    ))];
    const tags = [...new Set((data || []).flatMap(session => {
      const match = String(session.body || "").match(/(?:^|\n)\[focus-tags\]([\s\S]*?)\[\/focus-tags\]/i);
      try {
        const parsed = match ? JSON.parse(match[1]) : [];
        return Array.isArray(parsed) ? parsed.map(tag => String(tag).trim().replace(/^#/, "")).filter(Boolean) : [];
      } catch { return []; }
    }))];
    previewData = { urls, tags };
    focusBoardPreviewCache.set(focusId, previewData);
  }

  const urls = Array.isArray(previewData) ? previewData : previewData.urls;
  const tags = Array.isArray(previewData) ? [] : (previewData.tags || []);
  if (!board.isConnected || !board.matches(":hover") || !urls.length) {
    board.dataset.previewing = "false";
    return;
  }

  const loadedUrls = await loadPreviewImages(urls);
  if (!board.isConnected || !board.matches(":hover") || !loadedUrls.length) {
    board.dataset.previewing = "false";
    return;
  }

  let layer = board.querySelector(".focus-board-hover-image");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "focus-board-hover-image";
    layer.setAttribute("aria-hidden", "true");
    board.prepend(layer);
  }
  layer.replaceChildren();

  const first = document.createElement("img");
  const second = document.createElement("img");
  const tagSlide = document.createElement("span");
  first.alt = "";
  second.alt = "";
  first.className = "is-current";
  first.src = loadedUrls[0];
  second.src = loadedUrls.length > 1 ? loadedUrls[1] : loadedUrls[0];
  tagSlide.className = "focus-board-hover-tag";
  layer.append(first, second, tagSlide);

  // Keep showing tags until every tag has appeared. If there are fewer
  // images than needed, loop through the images again to make room for them.
  const imageSlideCount = Math.max(loadedUrls.length, tags.length * 2);
  const slides = [];
  let tagIndex = 0;
  for (let index = 0; index < imageSlideCount; index++) {
    slides.push({ type: "image", index: index % loadedUrls.length });
    if ((index + 1) % 2 === 0 && tagIndex < tags.length) {
      slides.push({ type: "tag", index: tagIndex });
      tagIndex++;
    }
  }

  requestAnimationFrame(() => {
    if (board.isConnected && board.matches(":hover") && board.dataset.previewing === "true") {
      layer.classList.add("is-visible");
    }
  });

  if (slides.length > 1) {
    let slideIndex = 0;
    let current = first;
    let next = second;
    const advancePreview = () => {
      if (!board.isConnected || !board.matches(":hover")) {
        stopFocusBoardPreview(board);
        return;
      }
      slideIndex = (slideIndex + 1) % slides.length;
      const slide = slides[slideIndex];
      if (slide.type === "tag") {
        current.classList.remove("is-current");
        next.classList.remove("is-current");
        tagSlide.textContent = "#" + tags[slide.index % tags.length];
        tagSlide.classList.add("is-current");
        layer.classList.add("showing-tag");
      } else {
        layer.classList.remove("showing-tag");
        tagSlide.classList.remove("is-current");
        next.src = loadedUrls[slide.index];
        next.classList.add("is-current");
        current.classList.remove("is-current");
        const previous = current;
        current = next;
        next = previous;
      }
      const duration = slide.type === "tag" ? 500 : 333;
      focusBoardPreviewTimers.set(board, window.setTimeout(advancePreview, duration));
    };
    focusBoardPreviewTimers.set(board, window.setTimeout(advancePreview, 333));
  }
}
function stopFocusBoardPreview(board) {
  if (!board) return;
  const timer = focusBoardPreviewTimers.get(board);
  if (timer) window.clearInterval(timer);
  focusBoardPreviewTimers.delete(board);
  board.dataset.previewing = "false";
  board.querySelector(".focus-board-hover-image")?.remove();
}

document.addEventListener("pointerover", event => {
  const board = event.target.closest(".focus-collection-board");
  if (board && !board.contains(event.relatedTarget)) startFocusBoardPreview(board);
});
document.addEventListener("pointerout", event => {
  const board = event.target.closest(".focus-collection-board");
  if (board && !board.contains(event.relatedTarget)) stopFocusBoardPreview(board);
});
document.addEventListener("focusin", event => {
  const board = event.target.closest(".focus-collection-board");
  if (board) startFocusBoardPreview(board);
});
document.addEventListener("focusout", event => {
  const board = event.target.closest(".focus-collection-board");
  if (board) stopFocusBoardPreview(board);
});
