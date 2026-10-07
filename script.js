const SUPABASE_URL = "https://gsfuumnfnclufrjibmiw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_jNLDH1M8SEDhGiOo4k3-wA_Zzzy93YJ";

const focusSupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let currentFocusId = null;
let currentFocus = null;
let currentSessions = [];


/* -----------------------------
   BASIC HELPERS
----------------------------- */

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

function escapeHtml(value) {
  if (value === null || value === undefined) return "";

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


/* -----------------------------
   HOME
----------------------------- */

async function showHome() {
  showOnly("homeScreen");

  await loadPublicFocuses();
}

async function loadPublicFocuses() {
  const list = $("publicFocusesList");

  if (!list) return;

  list.innerHTML = `<p class="empty-state">Loading...</p>`;

  const { data, error } = await focusSupabase
    .from("focuses")
    .select("*")
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    list.innerHTML = `<p class="empty-state">Couldn't load Focuses.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = `
      <p class="empty-state">
        No shared Focuses yet.
      </p>
    `;
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

      return `
        <button
          class="public-focus-card"
          onclick="showPublicFocus('${focus.id}')"
        >
          <p class="eyebrow">${statusLabel}</p>
          <h3>${escapeHtml(focus.title)}</h3>

          ${
            focus.completion_text
              ? `<p>${escapeHtml(focus.completion_text)}</p>`
              : ""
          }

          ${
            focus.learning
              ? `<p class="public-focus-learning">${escapeHtml(
                  focus.learning
                )}</p>`
              : ""
          }
        </button>
      `;
    })
    .join("");
}


/* -----------------------------
   CREATE FOCUS
----------------------------- */

function showCreateFocus() {
  showOnly("createFocusScreen");

  $("focusTitle").value = "";

  setTimeout(() => {
    $("focusTitle").focus();
  }, 50);
}

async function startNewFocus() {
  const title = $("focusTitle").value.trim();

  if (!title) {
    $("focusTitle").focus();
    return;
  }

  const { data, error } = await focusSupabase
    .from("focuses")
    .insert({
      title,
      status: "active",
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    alert("Couldn't start this Focus. Please try again.");
    return;
  }

  currentFocusId = data.id;
  currentFocus = data;

  showOnly("focusScreen");

  await showFocus();
}


/* -----------------------------
   ACTIVE FOCUS
----------------------------- */

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

  if (error) {
    console.error(error);
    return;
  }

  currentFocus = data;

  renderFocusState();

  await loadSessions();
}

function renderFocusState() {
  if (!currentFocus) return;

  $("focusTitleDisplay").textContent = currentFocus.title;

  $("focusStarted").textContent =
    currentFocus.started_at
      ? `Started ${formatDate(currentFocus.started_at.split("T")[0])}`
      : "";

  $("focusEndingSection").classList.remove("hidden");
  $("completeFocusSection").classList.add("hidden");
  $("abandonFocusSection").classList.add("hidden");
  $("shareSection").classList.add("hidden");

  if (currentFocus.status === "completed") {
    $("focusEndingSection").classList.add("hidden");
  }

  if (currentFocus.status === "abandoned") {
    $("focusEndingSection").classList.add("hidden");
  }
}


/* -----------------------------
   SESSIONS
----------------------------- */

async function loadSessions() {
  if (!currentFocusId) return;

  const { data, error } = await focusSupabase
    .from("sessions")
    .select("*")
    .eq("focus_id", currentFocusId)
    .order("session_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  currentSessions = data || [];

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

  list.innerHTML = currentSessions
    .map((session, index) => {
      return `
        <article class="session-card">

          <div class="session-card-header">
            <p class="eyebrow">SESSION ${index + 1}</p>
            <p class="session-date">${formatDate(session.session_date)}</p>
          </div>

          <div class="session-main">
            <p>${escapeHtml(session.body)}</p>
          </div>

          ${renderSessionDetail(
            "Things accomplished",
            session.accomplished
          )}

          ${renderSessionDetail(
            "Funny things that happened",
            session.funny
          )}

          ${renderSessionDetail(
            "Excitements",
            session.excitements
          )}

          ${renderSessionDetail(
            "Mistakes",
            session.mistakes
          )}

          ${renderSessionDetail(
            "Things I learned",
            session.learned
          )}

          ${renderSessionDetail(
            "For next time",
            session.next_time
          )}

          ${renderSessionDetail(
            "Time spent",
            session.time_spent
          )}

        </article>
      `;
    })
    .join("");
}

function renderSessionDetail(label, value) {
  if (!value) return "";

  return `
    <div class="session-detail">
      <div class="session-detail-label">${escapeHtml(label)}</div>
      <div class="session-detail-text">${escapeHtml(value)}</div>
    </div>
  `;
}

function openSessionForm() {
  $("newSessionForm").classList.remove("hidden");

  $("sessionDate").value = todayString();

  setTimeout(() => {
    $("sessionText").focus();
  }, 50);

  window.scrollTo({
    top: $("newSessionForm").offsetTop - 30,
    behavior: "smooth"
  });
}

function closeSessionForm() {
  $("newSessionForm").classList.add("hidden");

  $("sessionText").value = "";
  $("sessionAccomplished").value = "";
  $("sessionFunny").value = "";
  $("sessionExcitements").value = "";
  $("sessionMistakes").value = "";
  $("sessionLearned").value = "";
  $("sessionNextTime").value = "";
  $("sessionTimeSpent").value = "";

  $("sessionDate").value = todayString();
}

async function saveSession() {
  const date = $("sessionDate").value;
  const body = $("sessionText").value.trim();

  if (!date) {
    $("sessionDate").focus();
    return;
  }

  if (!body) {
    $("sessionText").focus();
    return;
  }

  const session = {
    focus_id: currentFocusId,
    session_date: date,
    body,
    accomplished:
      $("sessionAccomplished").value.trim() || null,
    funny:
      $("sessionFunny").value.trim() || null,
    excitements:
      $("sessionExcitements").value.trim() || null,
    mistakes:
      $("sessionMistakes").value.trim() || null,
    learned:
      $("sessionLearned").value.trim() || null,
    next_time:
      $("sessionNextTime").value.trim() || null,
    time_spent:
      $("sessionTimeSpent").value.trim() || null
  };

  const { error } = await focusSupabase
    .from("sessions")
    .insert(session);

  if (error) {
    console.error(error);
    alert("Couldn't save this session. Please try again.");
    return;
  }

  closeSessionForm();

  await loadSessions();
}


/* -----------------------------
   COMPLETE
----------------------------- */

function showCompleteFocus() {
  $("focusEndingSection").classList.add("hidden");
  $("completeFocusSection").classList.remove("hidden");
  $("abandonFocusSection").classList.add("hidden");

  $("completionText").value = "";
  $("completionLearning").value = "";
  $("completionPublic").checked = false;

  window.scrollTo({
    top: $("completeFocusSection").offsetTop - 30,
    behavior: "smooth"
  });
}

async function completeFocus() {
  const completionText = $("completionText").value.trim();
  const learning = $("completionLearning").value.trim();
  const isPublic = $("completionPublic").checked;

  if (!completionText) {
    $("completionText").focus();
    return;
  }

  if (!learning) {
    $("completionLearning").focus();
    return;
  }

  const { data, error } = await focusSupabase
    .from("focuses")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completion_text: completionText,
      learning,
      is_public: isPublic
    })
    .eq("id", currentFocusId)
    .select()
    .single();

  if (error) {
    console.error(error);
    alert("Couldn't complete this Focus. Please try again.");
    return;
  }

  currentFocus = data;

  $("completeFocusSection").classList.add("hidden");
  $("focusEndingSection").classList.add("hidden");
  $("shareSection").classList.remove("hidden");

  window.scrollTo({
    top: $("shareSection").offsetTop - 30,
    behavior: "smooth"
  });
}


/* -----------------------------
   ABANDON
----------------------------- */

function showAbandonFocus() {
  $("focusEndingSection").classList.add("hidden");
  $("abandonFocusSection").classList.remove("hidden");
  $("completeFocusSection").classList.add("hidden");

  $("abandonLearning").value = "";

  window.scrollTo({
    top: $("abandonFocusSection").offsetTop - 30,
    behavior: "smooth"
  });
}

async function abandonFocus() {
  const learning = $("abandonLearning").value.trim();

  if (!learning) {
    $("abandonLearning").focus();
    return;
  }

  const { data, error } = await focusSupabase
    .from("focuses")
    .update({
      status: "abandoned",
      abandoned_at: new Date().toISOString(),
      learning,
      is_public: false
    })
    .eq("id", currentFocusId)
    .select()
    .single();

  if (error) {
    console.error(error);
    alert("Couldn't abandon this Focus. Please try again.");
    return;
  }

  currentFocus = data;

  $("abandonFocusSection").classList.add("hidden");
  $("focusEndingSection").classList.add("hidden");
  $("shareSection").classList.remove("hidden");

  $("shareSection").querySelector(".eyebrow").textContent = "ABANDONED";
  $("shareSection").querySelector("h2").textContent =
    "You learned something. That's part of the practice.";

  window.scrollTo({
    top: $("shareSection").offsetTop - 30,
    behavior: "smooth"
  });
}


/* -----------------------------
   PUBLIC FOCUS
----------------------------- */

async function showPublicFocus(focusId) {
  showOnly("publicFocusScreen");

  $("publicFocusContent").innerHTML = `
    <p class="empty-state">Loading...</p>
  `;

  const { data: focus, error: focusError } = await focusSupabase
    .from("focuses")
    .select("*")
    .eq("id", focusId)
    .eq("is_public", true)
    .single();

  if (focusError) {
    console.error(focusError);

    $("publicFocusContent").innerHTML = `
      <p class="empty-state">
        Couldn't load this Focus.
      </p>
    `;

    return;
  }

  const { data: sessions, error: sessionsError } =
    await focusSupabase
      .from("sessions")
      .select("*")
      .eq("focus_id", focusId)
      .order("session_date", { ascending: true })
      .order("created_at", { ascending: true });

  if (sessionsError) {
    console.error(sessionsError);
  }

  const sessionData = sessions || [];

  const statusLabel =
    focus.status === "completed"
      ? "COMPLETED"
      : focus.status === "abandoned"
        ? "ABANDONED"
        : "ACTIVE";

  $("publicFocusContent").innerHTML = `
    <div class="public-focus-header">

      <p class="eyebrow">${statusLabel}</p>

      <h1>${escapeHtml(focus.title)}</h1>

      <p class="focus-started">
        Started ${formatDate(focus.started_at.split("T")[0])}
      </p>

    </div>

    ${
      focus.completion_text
        ? `
          <div class="public-focus-section">
            <p class="eyebrow">WHAT HAPPENED</p>
            <p class="public-focus-large">
              ${escapeHtml(focus.completion_text)}
            </p>
          </div>
        `
        : ""
    }

    ${
      focus.learning
        ? `
          <div class="public-focus-section">
            <p class="eyebrow">WHAT I LEARNED</p>
            <p class="public-focus-large">
              ${escapeHtml(focus.learning)}
            </p>
          </div>
        `
        : ""
    }

    ${
      sessionData.length
        ? `
          <div class="public-focus-section">
            <div class="section-heading">
              <p class="eyebrow">SESSION LOG</p>
              <h2>What happened along the way?</h2>
            </div>

            <div class="sessions-list">
              ${sessionData
                .map((session, index) => {
                  return `
                    <article class="session-card">

                      <div class="session-card-header">
                        <p class="eyebrow">SESSION ${index + 1}</p>
                        <p class="session-date">
                          ${formatDate(session.session_date)}
                        </p>
                      </div>

                      <div class="session-main">
                        <p>${escapeHtml(session.body)}</p>
                      </div>

                      ${renderSessionDetail(
                        "Things accomplished",
                        session.accomplished
                      )}

                      ${renderSessionDetail(
                        "Funny things that happened",
                        session.funny
                      )}

                      ${renderSessionDetail(
                        "Excitements",
                        session.excitements
                      )}

                      ${renderSessionDetail(
                        "Mistakes",
                        session.mistakes
                      )}

                      ${renderSessionDetail(
                        "Things I learned",
                        session.learned
                      )}

                      ${renderSessionDetail(
                        "For next time",
                        session.next_time
                      )}

                      ${renderSessionDetail(
                        "Time spent",
                        session.time_spent
                      )}

                    </article>
                  `;
                })
                .join("")}
            </div>
          </div>
        `
        : ""
    }

    ${
      focus.status === "completed"
        ? `
          <div class="public-focus-footer">
            <p class="eyebrow">
              ${sessionData.length} ${
                sessionData.length === 1 ? "SESSION" : "SESSIONS"
              }
            </p>
            <p>
              It took ${sessionData.length} ${
                sessionData.length === 1 ? "session" : "sessions"
              } to complete this Focus.
            </p>
          </div>
        `
        : ""
    }
  `;
}


/* -----------------------------
   INITIAL LOAD
----------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  showHome();
});