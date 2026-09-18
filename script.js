const state = {
  ideas: ["", "", ""],
  selected: "",
  focus: localStorage.getItem("focusPractice.currentFocus") || "",
  history: ["home"]
};

const screens = [...document.querySelectorAll(".screen")];


function show(id, { push = true } = {}) {
  screens.forEach(screen => screen.classList.toggle("active", screen.id === id));
  if (push && state.history[state.history.length - 1] !== id) state.history.push(id);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (id === "celebrate") launchFireworks();
}

function back() {
  if (state.history.length > 1) {
    state.history.pop();
    show(state.history[state.history.length - 1], { push: false });
  } else show("home", { push: false });
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
}

function renderIdeas() {
  const container = document.getElementById("ideas");
  container.innerHTML = "";
  state.ideas.forEach((idea, index) => {
    const row = document.createElement("div");
    row.className = "idea-row";
    row.innerHTML = `<input type="text" value="${escapeHtml(idea)}" placeholder="Something you want to do…" aria-label="Idea ${index + 1}">
      ${state.ideas.length > 1 ? '<button class="remove-idea" type="button" aria-label="Remove idea">×</button>' : ""}`;
    const input = row.querySelector("input");
    input.addEventListener("input", e => state.ideas[index] = e.target.value);
    const remove = row.querySelector(".remove-idea");
    if (remove) remove.addEventListener("click", () => { state.ideas.splice(index, 1); renderIdeas(); });
    container.appendChild(row);
  });
}

function renderChoices() {
  const ideas = state.ideas.filter(Boolean);
  const container = document.getElementById("choiceList");
  container.innerHTML = "";
  ideas.forEach(idea => {
    const button = document.createElement("button");
    button.className = "choice" + (state.selected === idea ? " selected" : "");
    button.type = "button";
    button.textContent = idea;
    button.addEventListener("click", () => {
      state.selected = idea;
      renderChoices();
      useSelection();
    });
    container.appendChild(button);
  });
}

function useSelection() {
  document.getElementById("startingIdea").textContent = state.selected;
  document.getElementById("focusInput").value = "";
  document.getElementById("beginFocus").disabled = true;
  show("define");
  setTimeout(() => document.getElementById("focusInput").focus(), 350);
}

function resetForNewFocus() {
  state.ideas = ["", "", ""];
  state.selected = "";
  state.history = ["home"];
  renderIdeas();
}

function updateCoachingLink() {
  const link = document.getElementById("coachingLink");
  if (!link) return;
  const projects = state.ideas.filter(Boolean).map(x => x.trim());
  const list = projects.length ? projects.join(", ") : "a few different projects";
  const body = `Hey Judith! I was on your site and I'm trying to decide between ${list}. I'd love to discuss this more with you - talk to me about focus coaching`;
  link.href = `mailto:judithprays@gmail.com?subject=${encodeURIComponent("Focus coaching")}&body=${encodeURIComponent(body)}`;
}

function updateShareLink() {
  const link = document.getElementById("shareFocus");
  if (!link) return;
  const subject = "My current focus";
  const body = `Hey Judith! My current focus is: ${state.focus}`;
  link.href = `mailto:judithprays@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

document.querySelectorAll("[data-start]").forEach(btn => btn.addEventListener("click", () => { resetForNewFocus(); show("dump"); }));
document.querySelectorAll("[data-home]").forEach(btn => btn.addEventListener("click", e => { e.preventDefault(); state.history = ["home"]; show("home", { push: false }); }));
document.querySelectorAll("[data-back]").forEach(btn => btn.addEventListener("click", back));
document.getElementById("addIdea").addEventListener("click", () => {
  state.ideas.push("");
  renderIdeas();
  const inputs = document.querySelectorAll("#ideas input");
  inputs[inputs.length - 1].focus();
});

document.getElementById("stuckDump").addEventListener("click", () => {
  state.ideas = state.ideas.map(x => x.trim()).filter(Boolean);
  if (!state.ideas.length) { toast("Give yourself at least one possibility."); return; }
  state.selected = "";
  renderChoices();
  updateCoachingLink();
  show("choose");
  document.getElementById("chooseCoaching").classList.remove("hidden");
});

document.getElementById("doneDump").addEventListener("click", () => {
  state.ideas = state.ideas.map(x => x.trim()).filter(Boolean);
  if (!state.ideas.length) { toast("Give yourself at least one possibility."); return; }
  state.selected = "";
  renderChoices();
  updateCoachingLink();
  show("choose");
});

document.getElementById("stuckChoose").addEventListener("click", () => {
  document.getElementById("chooseCoaching").classList.remove("hidden");
  updateCoachingLink();
});

document.getElementById("focusInput").addEventListener("input", e => {
  document.getElementById("beginFocus").disabled = !e.target.value.trim();
});

document.getElementById("beginFocus").addEventListener("click", () => {
  state.focus = document.getElementById("focusInput").value.trim();
  localStorage.setItem("focusPractice.currentFocus", state.focus);
  document.getElementById("focusTitle").textContent = state.focus;
  document.getElementById("celebrationFocus").textContent = state.focus;
  updateShareLink();
  show("celebrate");
});

document.getElementById("celebrationNext").addEventListener("click", () => show("focus"));

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}

async function makeFocusImage() {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = 1200 * scale;
  canvas.height = 760 * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#f7f3ea";
  ctx.fillRect(0, 0, 1200, 760);
  ctx.fillStyle = "#1e1e1b";
  ctx.font = "700 18px Helvetica, Arial, sans-serif";
  ctx.fillText("THE FOCUS PRACTICE", 70, 70);
  ctx.fillStyle = "#c65f4d";
  ctx.font = "700 15px Helvetica, Arial, sans-serif";
  ctx.fillText("YOUR CURRENT FOCUS", 70, 150);

  ctx.fillStyle = "#fffdf8";
  ctx.strokeStyle = "#1e1e1b";
  ctx.lineWidth = 2;
  roundedRect(ctx, 70, 180, 1060, 400, 4);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = "#1e1e1b";
  ctx.font = "400 52px Georgia, serif";
  const endY = wrapText(ctx, state.focus, 115, 280, 970, 68);
  ctx.strokeStyle = "#d9d0c0";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(115, endY + 45); ctx.lineTo(1085, endY + 45); ctx.stroke();
  ctx.fillStyle = "#777269";
  ctx.font = "400 22px Helvetica, Arial, sans-serif";
  wrapText(ctx, "This is the one thing you're giving your attention to right now.", 115, endY + 95, 900, 32);
  ctx.font = "400 18px Helvetica, Arial, sans-serif";
  ctx.fillText("You chose it. Now give it a chance to become real.", 70, 680);
  ctx.fillStyle = "#c65f4d";
  ctx.font = "700 15px Helvetica, Arial, sans-serif";
  ctx.fillText("FOCUS CHOSEN ✓", 70, 720);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create focus image")), "image/png");
  });
}

function downloadFocusImage(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-focus.png";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function launchFireworks() {
  const container = document.getElementById("fireworks");
  container.innerHTML = "";
  for (let i = 0; i < 90; i++) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.setProperty("--x", `${Math.random() * 100}vw`);
    spark.style.setProperty("--y", `${Math.random() * 75 + 5}vh`);
    spark.style.setProperty("--dx", `${(Math.random() - .5) * 260}px`);
    spark.style.setProperty("--dy", `${(Math.random() - .5) * 260}px`);
    spark.style.setProperty("--delay", `${Math.random() * .7}s`);
    container.appendChild(spark);
  }
}

if (state.focus) {
  document.getElementById("focusTitle").textContent = state.focus;
  document.getElementById("celebrationFocus").textContent = state.focus;
  updateShareLink();
}
renderIdeas();
