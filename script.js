const state = {
  ideas: ["", "", ""],
  selected: "",
  focus: "",
  journal: []
};

const screens = [...document.querySelectorAll(".screen")];

function show(id) {
  screens.forEach(screen => screen.classList.toggle("active", screen.id === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function renderIdeas() {
  const container = document.getElementById("ideas");
  container.innerHTML = "";
  state.ideas.forEach((idea, index) => {
    const row = document.createElement("div");
    row.className = "idea-row";
    row.innerHTML = `
      <input type="text" value="${escapeHtml(idea)}" placeholder="Something you want to do…" aria-label="Idea ${index + 1}">
      ${state.ideas.length > 1 ? '<button class="remove-idea" type="button" aria-label="Remove idea">×</button>' : ""}
    `;
    const input = row.querySelector("input");
    input.addEventListener("input", e => state.ideas[index] = e.target.value);
    const remove = row.querySelector(".remove-idea");
    if (remove) {
      remove.addEventListener("click", () => {
        state.ideas.splice(index, 1);
        renderIdeas();
      });
    }
    container.appendChild(row);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function renderChoices() {
  const container = document.getElementById("choiceList");
  container.innerHTML = "";
  state.ideas.filter(Boolean).forEach(idea => {
    const button = document.createElement("button");
    button.className = "choice" + (state.selected === idea ? " selected" : "");
    button.type = "button";
    button.textContent = idea;
    button.addEventListener("click", () => {
      state.selected = idea;
      renderChoices();
      document.getElementById("confirmChoice").disabled = false;
    });
    container.appendChild(button);
  });
}

document.querySelectorAll("[data-start]").forEach(btn => btn.addEventListener("click", () => {
  state.ideas = ["", "", ""];
  state.selected = "";
  state.focus = "";
  renderIdeas();
  show("dump");
}));

document.querySelectorAll("[data-home]").forEach(btn => btn.addEventListener("click", e => {
  e.preventDefault();
  show("home");
}));

document.getElementById("resetBtn").addEventListener("click", () => {
  state.ideas = ["", "", ""];
  state.selected = "";
  state.focus = "";
  renderIdeas();
  show("home");
});

document.getElementById("addIdea").addEventListener("click", () => {
  state.ideas.push("");
  renderIdeas();
  const inputs = document.querySelectorAll("#ideas input");
  inputs[inputs.length - 1].focus();
});

document.getElementById("doneDump").addEventListener("click", () => {
  state.ideas = state.ideas.map(x => x.trim()).filter(Boolean);
  if (!state.ideas.length) {
    toast("Give yourself at least one possibility.");
    return;
  }
  renderChoices();
  show("choose");
});

const techniqueMessages = {
  results: "Which focus gets you the result you most want right now?",
  feel: "Imagine making each one your focus. Notice which one feels best in your body.",
  visual: "Moodboard the top ideas. Sometimes one becomes obvious when you can see it.",
  easy: "When you're overwhelmed, momentum is a strategy. Start with the easiest win.",
  random: "Sometimes you just need to choose. Pick one and give it a chance."
};

document.querySelectorAll("[data-technique]").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.technique;
    const message = document.getElementById("techniqueMessage");
    message.textContent = techniqueMessages[type];
    if (type === "random") {
      const choices = state.ideas.filter(Boolean);
      if (choices.length) {
        state.selected = choices[Math.floor(Math.random() * choices.length)];
        renderChoices();
        document.getElementById("confirmChoice").disabled = false;
      }
    }
  });
});

document.getElementById("confirmChoice").addEventListener("click", () => {
  document.getElementById("startingIdea").textContent = state.selected;
  document.getElementById("focusInput").value = "";
  document.getElementById("beginFocus").disabled = true;
  show("define");
  setTimeout(() => document.getElementById("focusInput").focus(), 350);
});

document.getElementById("focusInput").addEventListener("input", e => {
  document.getElementById("beginFocus").disabled = !e.target.value.trim();
});

document.getElementById("beginFocus").addEventListener("click", () => {
  state.focus = document.getElementById("focusInput").value.trim();
  document.getElementById("focusTitle").textContent = state.focus;
  document.getElementById("journal").value = "";
  document.getElementById("dipPanel").classList.add("hidden");
  show("focus");
});

document.getElementById("logStep").addEventListener("click", () => {
  const text = document.getElementById("journal").value.trim();
  if (!text) {
    toast("Write down even the tiniest step.");
    return;
  }
  state.journal.push(text);
  document.getElementById("journal").value = "";
  toast("Saved. Keep going.");
});

document.getElementById("stuckBtn").addEventListener("click", () => {
  document.getElementById("dipPanel").classList.toggle("hidden");
});

const dipResponses = {
  big: "Shrink it. What is the least you can do to get something shippable?",
  next: "Your next focus might actually be: “Figure out what comes next.”",
  help: "Who could make this easier? Delegation and feedback count as progress.",
  quit: "Don't quit accidentally. Document what happened, create a new rule, extract the learning, then choose again."
};

document.querySelectorAll("[data-dip]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById("dipResponse").textContent = dipResponses[btn.dataset.dip];
  });
});

document.getElementById("completeBtn").addEventListener("click", () => {
  document.getElementById("completedFocus").textContent = state.focus;
  show("complete");
});

document.getElementById("shareBtn").addEventListener("click", async () => {
  const shareText = `I chose a focus: ${state.focus}. I finished it.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "My Focus", text: shareText });
    } catch {}
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(shareText);
    toast("Copied. Now go tell someone.");
  } else {
    toast("I chose a focus: " + state.focus);
  }
});

document.getElementById("recoverBtn").addEventListener("click", () => show("recover"));

renderIdeas();
