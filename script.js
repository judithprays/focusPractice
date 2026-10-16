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

async function uploadSessionImages(files, sessionId) {
  const urls = [];
  for (const file of Array.from(files || [])) {
    if (!file.type.startsWith("image/")) throw new Error(`"${file.name}" is not an image.`);
    if (file.size > MAX_IMAGE_SIZE_BYTES) throw new Error(`"${file.name}" is larger than 8 MB. Please choose a smaller image.`);
    const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
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
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);


  if (error) {

    console.error(error);

    list.innerHTML =
      `<p class="empty-state">
        Couldn't load Focuses.
      </p>`;

    return;
  }


  if (!data || data.length === 0) { list.innerHTML = '<div class="current-focus-empty"><h1>Nothing needs your attention yet.</h1><p>Choose something you want to give your attention to.</p><button class="primary-button" onclick="showCreateFocus()">Start a Focus</button></div>'; return; }
  currentFocus = data[0]; currentFocusId = currentFocus.id; updateNavigation();
  list.innerHTML = '<button class="current-focus-card" onclick="openFocus(\'' + currentFocus.id + '\')"><h1>' + escapeHtml(currentFocus.title) + '</h1><p>' + escapeHtml(currentFocus.goal || "Small steps. Big momentum. ♡") + '</p><span>Open your focus log ↗</span></button>';
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
  const editButton = $("editGoalButton");
  const cancelButton = $("cancelGoalButton");
  if (!display || !editor || !editButton) return;

  display.textContent = goal ? `Goal: ${goal}` : "";
  display.classList.toggle("hidden", !goal);
  editButton.classList.toggle("hidden", !goal);
  editor.classList.toggle("hidden", Boolean(goal));
  if (cancelButton) cancelButton.classList.add("hidden");
  $("goalSaveStatus").textContent = "";
}

function editFocusGoal() {
  const editor = document.querySelector(".focus-goal-editor");
  if (!editor) return;
  $("focusGoalEdit").value = currentFocus?.goal || "";
  editor.classList.remove("hidden");
  $("editGoalButton").classList.add("hidden");
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
  const coverImage = $("focusCoverImage");
  if (!coverBanner || !coverImage) return;

  // Prefer a cover the user explicitly selected. Otherwise, use the newest
  // photo in this project's session log automatically.
  let coverUrl = isSafeImageUrl(currentFocus?.cover_image_url)
    ? currentFocus.cover_image_url
    : "";

  if (!coverUrl) {
    for (let sessionIndex = currentSessions.length - 1; sessionIndex >= 0 && !coverUrl; sessionIndex--) {
      const urls = Array.isArray(currentSessions[sessionIndex].image_urls)
        ? currentSessions[sessionIndex].image_urls
        : [];
      for (let imageIndex = urls.length - 1; imageIndex >= 0; imageIndex--) {
        if (isSafeImageUrl(urls[imageIndex])) {
          coverUrl = urls[imageIndex];
          break;
        }
      }
    }
  }

  if (coverUrl) {
    if (coverImage.src !== coverUrl) coverImage.src = coverUrl;
    coverBanner.classList.remove("hidden");
  } else {
    coverImage.removeAttribute("src");
    coverBanner.classList.add("hidden");
  }
}


function renderFocusState() {

  if (!currentFocus) return;


  $("focusTitleDisplay").textContent =
    currentFocus.title;

  updateFocusCoverBanner();

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


function renderSessions() {
  const section = $("sessionLogSection");
  const list = $("sessionsList");
  if (!section || !list) return;

  if (currentSessions.length === 0) {
    section.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");
  list.innerHTML = currentSessions.map((session, index) => {
    const summary = (session.summary || session.body || "").trim();
    const summaryPreview = summary.length > 180 ? summary.slice(0, 177).trimEnd() + "…" : summary;
    const emoji = session.summary_emoji || "📝";
    const dateLabel = formatDate(session.session_date);
    const dayLabel = formatWeekday(session.session_date);

    return `
      <details class="session-card">
        <summary class="session-collapsed-header">
          <div class="session-heading-top">
            <span class="eyebrow session-number">SESSION ${index + 1}</span>
            <span class="session-date">${escapeHtml(dayLabel)} · ${escapeHtml(dateLabel)}</span>
            <span class="session-time">${escapeHtml(session.time_spent || "Time not logged")}</span>
          </div>
          <div class="session-tldr">
            <span class="session-tldr-emoji">${escapeHtml(emoji)}</span>
            <span class="session-tldr-text">${escapeHtml(summaryPreview || "Add a short summary next time.")}</span>
            <span class="session-expand-indicator" aria-hidden="true">＋</span>
          </div>
        </summary>

        <div class="session-expanded-content">
          <div class="session-main">
            <p>${escapeHtml(session.body)}</p>
          </div>

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
    `;
  }).join("");
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

function openSessionForm() {

  $("newSessionForm")
    .classList.remove("hidden");


  $("sessionDate").value =
    todayString();


  setTimeout(() => {
    $("sessionText").focus();
  }, 50);


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

  $("sessionAccomplished").value = "";

  $("sessionFunny").value = "";

  $("sessionExcitements").value = "";

  $("sessionMistakes").value = "";

  $("sessionLearned").value = "";

  $("sessionNextTime").value = "";

  $("sessionTimeSpent").value = "";
  $("sessionSummaryEmoji").value = "";
  $("sessionSummary").value = "";

  $("sessionDate").value =
    todayString();
}


async function saveSession() {

  const date =
    $("sessionDate").value;

  const body =
    $("sessionText").value.trim();


  if (!date) {

    $("sessionDate").focus();

    return;
  }


  if (!body) {

    $("sessionText").focus();

    return;
  }


  const selectedImages = $("sessionImages").files;
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
