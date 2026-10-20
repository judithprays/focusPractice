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

function getSessionImageCaption(body) {
  const match = String(body || "").match(/(?:^|\n)\[image-caption\]([\s\S]*?)\[\/image-caption\]/i);
  return match ? match[1].trim() : "";
}

function stripSessionImageCaption(body) {
  return String(body || "").replace(/(?:^|\n)\[image-caption\][\s\S]*?\[\/image-caption\]/i, "").trim();
}

function renderSessionCardVisual(session) {
  const urls = Array.isArray(session.image_urls) ? session.image_urls.filter(isSafeImageUrl) : [];
  const visuals = [];
  const image = urls[0];
  const caption = getSessionImageCaption(session.body);
  if (image) {
    const isDrawing = /session-drawing\.png(?:$|[?#])/i.test(image);
    visuals.push(`<div class="session-card-visual ${isDrawing ? "session-card-visual-drawing" : ""}">
      <img src="${escapeHtml(image)}" alt="${isDrawing ? "Drawing from this session" : "Visual added to this session"}" loading="lazy">
      ${caption ? `<p class="session-image-caption">${escapeHtml(caption)}</p>` : ""}
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
  return `<div class="session-images">${urls.map((url, imageIndex) => {
    if (!isSafeImageUrl(url)) return "";
    const isCover = currentFocus?.cover_image_url === url;
    return `<figure class="session-image-item">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open session image in a new tab"><img src="${escapeHtml(url)}" alt="Image from session ${session.session_date ? escapeHtml(session.session_date) : ""}" loading="lazy"></a>
      <figcaption><button type="button" class="image-cover-button ${isCover ? "is-cover" : ""}" onclick="setCoverImage('${escapeHtml(session.id)}', ${imageIndex})">${isCover ? "✓ Project cover" : "Use as cover"}</button></figcaption>
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

  const currentFocusNav = $("currentFocusNav");

  if (!currentFocusNav) return;

  if (
    currentFocus &&
    currentFocus.status === "active"
  ) {

    currentFocusNav.classList.remove("hidden");

  } else {

    currentFocusNav.classList.add("hidden");

  }
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


async function showCollection() {

  clearFocusUrl();

  showOnly("collectionScreen");

  await loadCollection();

}


function showAbout() {

  clearFocusUrl();

  showOnly("aboutScreen");

}


/* --------------------------------
   HOME
-------------------------------- */

async function loadHomeFocuses() {

  const list = $("currentFocusHomeContent");

  if (!list) return;

  list.innerHTML =
    `<p class="empty-state">Loading...</p>`;


  /*
    For now, all started focuses are visible.
    We intentionally do NOT filter by is_public.
  */

  const { data, error } = await focusSupabase
    .from("focuses")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Home focus query failed:", error);
    list.innerHTML = `<p class="empty-state">Couldn't load your focus. Please refresh and try again.</p>`;
    return;
  }

  // Prefer the active focus, but tolerate older records whose status value
  // predates the current active/completed/abandoned convention.
  const focuses = data || [];
  const focusToShow =
    focuses.find((focus) => focus.status === "active") ||
    focuses.find((focus) => !["completed", "abandoned"].includes(String(focus.status || "").toLowerCase()));

  if (!focusToShow) {
    const home = document.querySelector(".current-focus-home");
    if (home) home.classList.add("no-active-focus");
    list.innerHTML = '<button class="primary-button home-start-focus" onclick="showCreateFocus()">Find your focus</button>';
    return;
  }

  const home = document.querySelector(".current-focus-home");
  if (home) home.classList.remove("no-active-focus");
  currentFocus = focusToShow;
  currentFocusId = currentFocus.id;
  updateNavigation();
  const titleLetters = Array.from(currentFocus.title || "").map((character) => {
    if (character === " ") return '<span class="letter-tile letter-space" aria-hidden="true"> </span>';
    return '<span class="letter-tile">' + escapeHtml(character) + '</span>';
  }).join("");
  list.innerHTML = '<button class="current-focus-card" onclick="openFocus(\'' + currentFocus.id + '\')"><h1 aria-label="' + escapeHtml(currentFocus.title) + '">' + titleLetters + '</h1><p>' + escapeHtml(currentFocus.goal || "Small steps. Big momentum. ♡") + '</p><span>Open your focus log ↗</span></button>';
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

async function loadCollection() {

  const list = $("collectionList");

  if (!list) return;

  list.innerHTML =
    `<p class="empty-state">Loading...</p>`;


  const { data, error } = await focusSupabase
    .from("focuses")
    .select("*")
    .order("created_at", {
      ascending: false
    });


  if (error) {

    console.error(error);

    list.innerHTML =
      `<p class="empty-state">
        Couldn't load the Focus Collection.
      </p>`;

    return;
  }


  const activeFocus = (data || []).find((focus) => focus.status === "active");
  const action = $("collectionFocusAction");
  if (action) {
    action.innerHTML = activeFocus
      ? `<div class="active-focus-notice"><p class="eyebrow">ONE FOCUS AT A TIME</p><p>You already have an active focus: <strong>${escapeHtml(activeFocus.title)}</strong></p><button class="secondary-button" onclick="openFocus('${activeFocus.id}')">Return to your current focus ↗</button></div>`
      : `<button class="primary-button" onclick="showCreateFocus()">+ Start a new focus</button>`;
  }

  if (!data || data.length === 0) {

    list.innerHTML =
      `<p class="empty-state">
        Your Focus Collection is empty.
      </p>`;

    return;
  }


  list.innerHTML = data
    .map((focus) => {

      const statusLabel =
        focus.status === "completed"
          ? "COMPLETED"
          : focus.status === "abandoned"
            ? "ABANDONED"
            : "ACTIVE";


      const cover = isSafeImageUrl(focus.cover_image_url)
        ? `<div class="collection-cover" style="background-image: linear-gradient(0deg, rgba(0,0,0,.66), rgba(0,0,0,0) 72%), url('${escapeHtml(focus.cover_image_url)}')"><h3>${escapeHtml(focus.title)}</h3></div>`
        : `<div class="collection-cover collection-cover-empty"><h3>${escapeHtml(focus.title)}</h3></div>`;

      return `
        <button class="collection-card" onclick="openFocus('${focus.id}')">
          ${cover}
          <p class="focus-status ${focus.status}">
            ${statusLabel}
          </p>
          <p class="collection-meta">
            Started ${formatDate(
              focus.started_at
                ? focus.started_at.split("T")[0]
                : ""
            )}
          </p>

          ${
            focus.completion_text
              ? `
                <p>
                  ${escapeHtml(focus.completion_text)}
                </p>
              `
              : ""
          }

        </button>
      `;
    })
    .join("");
}


/* --------------------------------
   CREATE FOCUS
-------------------------------- */

async function showCreateFocus() {

  const { data: activeFocus, error } = await focusSupabase
    .from("focuses")
    .select("*")
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

async function openFocus(focusId) {

  currentFocusId = focusId;

  setFocusUrl(focusId);

  await showFocus();

}


async function saveFocusGoal() {
  if (!currentFocusId || !currentFocus) return;
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


  $("focusTitleDisplay").textContent =
    currentFocus.title;

  updateFocusCoverBanner();
  const boardTitle = $("focusTitleDisplay");
  if (boardTitle) { boardTitle.textContent = currentFocus.title || ""; const angle = (Math.random() * 10 - 5).toFixed(2) + "deg"; boardTitle.style.setProperty("--board-angle", angle); }

  $("focusStarted").textContent =
    currentFocus.started_at
      ? `Started ${formatDate(currentFocus.started_at.split("T")[0])}`
      : "";

  $("focusGoalEdit").value = currentFocus.goal || "";
  renderFocusGoal();

  const statusLabel =
    currentFocus.status === "completed"
      ? "COMPLETED"
      : currentFocus.status === "abandoned"
        ? "ABANDONED"
        : "MY CURRENT FOCUS";


  $("focusStatusLabel").textContent =
    statusLabel;


  /*
    Only active focuses can be worked on.
  */

  const isActive =
    currentFocus.status === "active";


  if (isActive) {

    $("addSessionButton")
      .classList.remove("hidden");

    $("focusEndingSection")
      .classList.remove("hidden");

  } else {

    $("addSessionButton")
      .classList.add("hidden");

    $("focusEndingSection")
      .classList.add("hidden");

  }


  $("newSessionForm")
    .classList.add("hidden");

  $("abandonFocusSection")
    .classList.add("hidden");
}


/* --------------------------------
   DELETE FOCUS
-------------------------------- */

async function deleteCurrentFocus() {
  if (!currentFocusId) return;

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
function readSessionCardSizes() { try { const value = JSON.parse(localStorage.getItem(SESSION_CARD_SIZES_KEY) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; } }
function getSessionCardSize(session, index) { const saved = readSessionCardSizes()[String(session.id)]; if (Number.isFinite(Number(saved)) && saved >= 25 && saved <= 100) return Number(saved); return [44, 46, 40, 48, 42][index % 5]; }
function updateSessionCardSize(sessionId, value) { const size = Math.max(25, Math.min(100, Number(value) || 48)); const item = Array.from(document.querySelectorAll(".session-card-item")).find(element => element.dataset.sessionId === String(sessionId)); if (!item) return; item.style.setProperty("--session-card-width", size + "%"); const output = item.querySelector(".session-card-size-value"); if (output) output.textContent = size + "%"; const sizes = readSessionCardSizes(); sizes[String(sessionId)] = size; try { localStorage.setItem(SESSION_CARD_SIZES_KEY, JSON.stringify(sizes)); } catch {} }
function renderSessions() {
  const section = $("sessionLogSection");
  const list = $("sessionsList");
  if (!section || !list) return;
  if (currentSessions.length === 0) { section.classList.add("hidden"); list.innerHTML = ""; return; }
  section.classList.remove("hidden");
  list.innerHTML = currentSessions.map((session, index) => {
    const videoUrl = getSessionVideoUrl(session.body);
    const bodyWithoutVideo = stripSessionImageCaption(videoUrl
      ? String(session.body || "").replace(/(?:^|\n)Video:\s*https?:\/\/[^\s]+/i, "")
      : session.body);
    const summary = (session.summary || bodyWithoutVideo || "").trim();
    const summaryPreview = summary.length > 180 ? summary.slice(0, 177).trimEnd() + "…" : summary;
    const emoji = (session.summary_emoji || "").trim();
    const dateLabel = formatDate(session.session_date);
    const dayLabel = formatWeekday(session.session_date);
    const timeSpent = (session.time_spent || "").trim();
    const visual = renderSessionCardVisual(session);
    const size = getSessionCardSize(session, index);
    const safeId = escapeHtml(session.id);
    const cardStyle = readSessionCardStyles()[String(session.id)] || {};
    const hasText = Boolean(bodyWithoutVideo.trim());
    const isTextCard = !visual;
    const textStyle = `--text-card-height:${Math.max(80, Math.min(420, Number(cardStyle.height) || 150))}px;--text-card-font-size:${Math.max(14, Math.min(48, Number(cardStyle.fontSize) || 22))}px;--text-card-font-family:${["Helvetica, Arial, sans-serif","Georgia, serif","'Courier New', monospace","Arial, sans-serif"].includes(cardStyle.fontFamily) ? cardStyle.fontFamily : "Georgia, serif"}`;
    const timeMarkup = timeSpent ? `<span class="session-time">${escapeHtml(timeSpent)}</span>` : "";
    const visualSummary = `${emoji ? `<span class="session-tldr-emoji">${escapeHtml(emoji)}</span>` : ""}${summaryPreview ? `<span class="session-tldr-text">${escapeHtml(summaryPreview)}</span>` : ""}`;
    const textSummary = hasText ? `<div class="text-card-preview" style="${textStyle}">${formatSessionBody(bodyWithoutVideo)}</div>` : '<div class="text-card-preview text-card-empty">Add a note</div>';
    return `
      <div class="session-card-item ${isTextCard ? "text-card-item" : "visual-card-item"}" data-session-id="${safeId}" style="--session-card-width:${size}%">
        <details class="session-card ${visual ? "has-session-visual" : "text-only-step"}">
          <summary class="session-collapsed-header">
            ${visual}
            ${isTextCard ? textSummary : `<div class="session-overlay-copy"><div class="session-tldr">${visualSummary}</div></div>`}
            
            <button type="button" class="step-delete-button" aria-label="Delete step ${index + 1}" title="Delete step" onclick="deleteSession(event, '${safeId}')">×</button>
          </summary>
          <div class="session-expanded-content">
            <div class="session-edit-controls">
              <label for="sessionCardSize-${safeId}">Width <output class="session-card-size-value">${size}%</output></label>
              <input id="sessionCardSize-${safeId}" type="range" min="25" max="100" step="1" value="${size}" aria-label="Adjust width" oninput="updateSessionCardSize('${safeId}', this.value)">
              ${isTextCard ? `<label for="textCardHeight-${safeId}">Text card height <output>${Math.max(80,Math.min(420,Number(cardStyle.height)||150))}px</output></label><input id="textCardHeight-${safeId}" type="range" min="80" max="420" step="10" value="${Math.max(80,Math.min(420,Number(cardStyle.height)||150))}" oninput="updateTextCardStyle('${safeId}','height',this.value)"><label for="textCardFont-${safeId}">Font</label><select id="textCardFont-${safeId}" onchange="updateTextCardStyle('${safeId}','fontFamily',this.value)"><option value="Georgia, serif" ${(!cardStyle.fontFamily||cardStyle.fontFamily==="Georgia, serif")?"selected":""}>Editorial serif</option><option value="Helvetica, Arial, sans-serif" ${cardStyle.fontFamily==="Helvetica, Arial, sans-serif"?"selected":""}>Clean sans-serif</option><option value="'Courier New', monospace" ${cardStyle.fontFamily==="'Courier New', monospace"?"selected":""}>Typewriter</option><option value="Arial, sans-serif" ${cardStyle.fontFamily==="Arial, sans-serif"?"selected":""}>Bold simple</option></select><label for="textCardFontSize-${safeId}">Text size <output>${Math.max(14,Math.min(48,Number(cardStyle.fontSize)||22))}px</output></label><input id="textCardFontSize-${safeId}" type="range" min="14" max="48" step="1" value="${Math.max(14,Math.min(48,Number(cardStyle.fontSize)||22))}" oninput="updateTextCardStyle('${safeId}','fontSize',this.value)">` : ""}
              <button type="button" class="session-save-button" onclick="this.closest(\'details\').removeAttribute(\'open\')">Save</button>
            </div>
            <div class="session-main"><div class="session-body-content" contenteditable="true" data-session-id="${safeId}" onblur="saveEditedSessionText(this)" aria-label="Edit session text">${formatSessionBody(bodyWithoutVideo)}</div></div>
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
      </div>`;
  }).join("");
}
function readSessionCardStyles() { try { const value = JSON.parse(localStorage.getItem("focusPractice.sessionCardStyles") || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; } }
async function saveEditedSessionText(element) {
  const sessionId = element && element.dataset.sessionId;
  const session = currentSessions.find(item => String(item.id) === String(sessionId));
  if (!session || !element) return;
  const body = element.innerText.trim();
  const { error } = await focusSupabase.from("sessions").update({ body }).eq("id", sessionId);
  if (error) { console.error(error); alert("Could not save this text. Please try again."); return; }
  session.body = body;
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
    preview.style.setProperty("--text-card-height", (Number(style.height) || 150) + "px");
    preview.style.setProperty("--text-card-font-size", (Number(style.fontSize) || 22) + "px");
    preview.style.setProperty("--text-card-font-family", style.fontFamily || "Georgia, serif");
  }
  const output = item.querySelector(`#textCard${key === "height" ? "Height" : key === "fontSize" ? "FontSize" : "Font"}-${CSS.escape(String(sessionId))}`)?.previousElementSibling?.querySelector("output");
  if (output) output.textContent = key === "fontFamily" ? value : value + "px";
}

async function deleteSession(event, sessionId) {
  event.preventDefault();
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
    time: $("composerTimeControl"),
    emoji: $("composerEmojiControl"),
    drawing: $("sessionDrawingPanel")
  };
  Object.entries(inputs).forEach(([key, element]) => {
    if (!element || key === except) return;
    if (key === "text") element.classList.add("hidden");
    else if (key === "image" || key === "video") element.classList.remove("is-visible");
    else if (key === "time" || key === "emoji") element.classList.remove("is-open");
    else element.classList.add("hidden");
  });
  $("sessionImageCaption")?.classList.toggle("is-visible", except === "image");
  $("sessionTextFormatting")?.classList.toggle("hidden", except !== "text");
}

function focusSessionText() {
  hideSessionInputs("text");
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
  const field = $("sessionImages");
  field.classList.add("is-visible");
  $("sessionImageCaption")?.classList.add("is-visible");
  field.focus();
}

function focusSessionVideo() {
  hideSessionInputs("video");
  const field = $("sessionVideoUrl");
  field.classList.add("is-visible");
  field.focus();
}

function focusSessionTime() {
  const control = $("composerTimeControl");
  const wasOpen = control.classList.contains("is-open");
  hideSessionInputs(wasOpen ? "" : "time");
  if (!wasOpen) { control.classList.add("is-open"); $("sessionTimeSlider").focus(); }
}

function focusSessionEmoji() {
  const control = $("composerEmojiControl");
  const wasOpen = control.classList.contains("is-open");
  hideSessionInputs(wasOpen ? "" : "emoji");
  if (!wasOpen) { control.classList.add("is-open"); $("sessionSummaryEmoji").focus(); }
}

function openSessionForm() {

  $("newSessionForm")
    .classList.remove("hidden");


  $("sessionDate").value = todayString();
  clearSessionDrawing();
  $("sessionImages").value = "";
  $("sessionImageCaption").value = "";
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

  $("newSessionForm")
    .classList.add("hidden");


  $("sessionText").value = "";
  $("sessionImages").value = "";
  $("sessionImageCaption").value = "";
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

  const date =
    $("sessionDate").value;

  let body = $("sessionText").value.trim();
  const imageCaption = $("sessionImageCaption").value.trim();
  const hasImages = Boolean(($("sessionImages").files && $("sessionImages").files.length) || !$("sessionDrawingPanel").classList.contains("hidden"));
  const videoUrl = $("sessionVideoUrl").value.trim();
  const prompt = $("sessionPrompt").value;
  const includePrompt = $("sessionIncludePrompt")?.checked;
  if (includePrompt && prompt && body) body = prompt + "\n\n" + body;
  else if (includePrompt && prompt) body = prompt;
  if (videoUrl) body = (body ? body + "\n\n" : "") + "Video: " + videoUrl;
  if (imageCaption) body = (body ? body + "\n\n" : "") + "[image-caption]" + imageCaption + "[/image-caption]";


  if (!date) {

    $("sessionDate").focus();

    return;
  }


  if (!body && !($("sessionImages").files || []).length && $("sessionDrawingPanel").classList.contains("hidden")) {
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

  if (!currentFocusId) return;


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

  const focusId =
    getFocusIdFromUrl();


  if (focusId) {

    currentFocusId = focusId;

    await showFocus();

    return;
  }


  await showHome();


  /*
    If there is an active Focus in the database,
    make it available in the persistent menu.
  */

  const {
    data,
    error
  } = await focusSupabase
    .from("focuses")
    .select("*")
    .eq("status", "active")
    .order("created_at", {
      ascending: false
    })
    .limit(1)
    .maybeSingle();


  if (!error && data) {

    currentFocus = data;

    currentFocusId = data.id;

    updateNavigation();

    /*
      We don't change the page here.
      The user remains on Home.
    */

  }
}


/*
  Browser back / forward support.
*/

window.addEventListener(
  "popstate",
  async () => {

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
