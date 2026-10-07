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

  const list = $("publicFocusesList");

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
    .order("created_at", {
      ascending: false
    });


  if (error) {

    console.error(error);

    list.innerHTML =
      `<p class="empty-state">
        Couldn't load Focuses.
      </p>`;

    return;
  }


  if (!data || data.length === 0) {

    list.innerHTML =
      `<p class="empty-state">
        No Focuses yet. Start one.
      </p>`;

    return;
  }


  list.innerHTML = data
    .map(renderFocusCard)
    .join("");
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


      return `
        <button
          class="collection-card"
          onclick="openFocus('${focus.id}')"
        >

          <p class="focus-status ${focus.status}">
            ${statusLabel}
          </p>

          <h3>
            ${escapeHtml(focus.title)}
          </h3>

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

function showCreateFocus() {

  clearFocusUrl();

  showOnly("createFocusScreen");

  $("focusTitle").value = "";

  setTimeout(() => {
    $("focusTitle").focus();
  }, 50);
}


async function startNewFocus() {

  const title =
    $("focusTitle").value.trim();


  if (!title) {

    $("focusTitle").focus();

    return;
  }


  setLoading(true);


  const { data, error } = await focusSupabase
    .from("focuses")
    .insert({

      title,

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

function renderFocusState() {

  if (!currentFocus) return;


  $("focusTitleDisplay").textContent =
    currentFocus.title;


  $("focusStarted").textContent =
    currentFocus.started_at
      ? `Started ${formatDate(
          currentFocus.started_at.split("T")[0]
        )}`
      : "";


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

  renderSessions();
}


function renderSessions() {

  const section =
    $("sessionLogSection");

  const list =
    $("sessionsList");


  if (!section || !list) return;


  if (currentSessions.length === 0) {

    section.classList.add("hidden");

    list.innerHTML = "";

    return;
  }


  section.classList.remove("hidden");


  list.innerHTML =
    currentSessions
      .map((session, index) => {

        return `
          <article class="session-card">

            <div class="session-card-header">

              <p class="eyebrow">
                SESSION ${index + 1}
              </p>

              <p class="session-date">
                ${formatDate(session.session_date)}
              </p>

            </div>


            <div class="session-main">

              <p>
                ${escapeHtml(session.body)}
              </p>

            </div>


            <div class="session-details">

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

            </div>

          </article>
        `;
      })
      .join("");
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

  $("sessionAccomplished").value = "";

  $("sessionFunny").value = "";

  $("sessionExcitements").value = "";

  $("sessionMistakes").value = "";

  $("sessionLearned").value = "";

  $("sessionNextTime").value = "";

  $("sessionTimeSpent").value = "";

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
        .value.trim() || null
  };


  setLoading(true);


  const { error } =
    await focusSupabase
      .from("sessions")
      .insert(session);


  setLoading(false);


  if (error) {

    console.error(error);

    alert(
      "Couldn't save this session. Please try again."
    );

    return;
  }


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