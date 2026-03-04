"use strict";

(function () {
  const coords = Array.from(document.querySelectorAll(".coord"));
  const frame = document.getElementById("experiment-frame");
  const soundToggle = document.getElementById("sound-toggle");
  const clockNode = document.querySelector(".meta-stack");
  const placeholderLabel = document.getElementById("placeholder-label");
  const panelState = document.getElementById("panel-state");
  const simShell = document.getElementById("sim-shell");
  const simCanvas = document.getElementById("sim-canvas");
  const hudPop = document.getElementById("hud-pop");
  const hudFood = document.getElementById("hud-food");
  const hudEvents = document.getElementById("hud-events");
  const toolStatus = document.getElementById("sim-tool-status");
  const simTooltip = document.getElementById("sim-tooltip");
  const utopiaToggle = document.getElementById("utopia-toggle");
  const toolButtons = Array.from(document.querySelectorAll(".tool-icon"));

  let soundEnabled = false;
  let audioCtx = null;
  let transitionTimer = null;
  let sim = null;

  function bootAudio() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      audioCtx = new AudioCtx();
    }
    return audioCtx;
  }

  function playTone(config) {
    if (!soundEnabled) return;
    const ctx = bootAudio();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = config.type || "sine";
    osc.frequency.value = config.freq || 220;
    if (typeof config.slideTo === "number") {
      osc.frequency.exponentialRampToValueAtTime(config.slideTo, now + (config.duration || 0.08));
    }
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(config.gain || 0.02, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (config.duration || 0.08));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (config.duration || 0.08));
  }

  const audioSystem = {
    play: function (name) {
      if (!soundEnabled) return;
      if (name === "uiToolSelect") return playTone({ freq: 260, duration: 0.06, gain: 0.018, type: "triangle" });
      if (name === "toolPlaceFood") return playTone({ freq: 190, slideTo: 230, duration: 0.09, gain: 0.014, type: "sine" });
      if (name === "toolPlaceHazard") return playTone({ freq: 150, slideTo: 110, duration: 0.11, gain: 0.016, type: "triangle" });
      if (name === "toolPlaceFertility") return playTone({ freq: 280, slideTo: 330, duration: 0.09, gain: 0.014, type: "sine" });
      if (name === "toolPlaceMutation") return playTone({ freq: 350, slideTo: 490, duration: 0.08, gain: 0.015, type: "triangle" });
      if (name === "toolPlaceCull") return playTone({ freq: 120, duration: 0.07, gain: 0.017, type: "square" });
      if (name === "toolPlaceSwarm") return playTone({ freq: 220, slideTo: 260, duration: 0.05, gain: 0.01, type: "sine" });
      if (name === "toolPlaceSpawnMutant") return playTone({ freq: 96, slideTo: 140, duration: 0.12, gain: 0.019, type: "triangle" });
      if (name === "toolPlaceBuildWall") return playTone({ freq: 170, slideTo: 185, duration: 0.04, gain: 0.009, type: "square" });
      if (name === "toolEraseWall") return playTone({ freq: 210, slideTo: 140, duration: 0.05, gain: 0.01, type: "triangle" });
      if (name === "uiUtopiaOn") return playTone({ freq: 300, slideTo: 410, duration: 0.08, gain: 0.012, type: "sine" });
      if (name === "uiUtopiaOff") return playTone({ freq: 250, slideTo: 180, duration: 0.08, gain: 0.012, type: "triangle" });
      if (name === "cellFeed") return playTone({ freq: 430, duration: 0.05, gain: 0.006, type: "sine" });
      if (name === "cellHit") return playTone({ freq: 180, duration: 0.03, gain: 0.007, type: "square" });
      if (name === "cellDeath") return playTone({ freq: 130, slideTo: 90, duration: 0.08, gain: 0.008, type: "triangle" });
      if (name === "cellBirth") return playTone({ freq: 360, slideTo: 420, duration: 0.07, gain: 0.007, type: "sine" });
      if (name === "cellMutate") return playTone({ freq: 520, slideTo: 700, duration: 0.04, gain: 0.006, type: "triangle" });
      if (name === "locustFeed") return playTone({ freq: 300, duration: 0.03, gain: 0.005, type: "sine" });
      playTone({ freq: 210, duration: 0.06, gain: 0.01, type: "triangle" });
    }
  };

  const panelDeck = {
    alpha: {
      label: "EXPERIMENT SLOT / CELL_AQUARIUM_GODMODE",
      state: "STATE: LIVE_SIMULATION",
      border: "var(--line)"
    },
    beta: {
      label: "COMING SOON / BETA_EXPERIENCE",
      state: "STATE: COMING_SOON",
      border: "var(--cobalt)"
    },
    gamma: {
      label: "COMING SOON / GAMMA_EXPERIENCE",
      state: "STATE: COMING_SOON",
      border: "var(--machine-green)"
    }
  };

  function bootSim() {
    if (sim || !simCanvas || !window.BrapSimCore) return;
    sim = window.BrapSimCore.createSim(simCanvas, {
      width: 640,
      height: 360,
      initialCells: 58
    });
    sim.setHudNodes({
      pop: hudPop,
      food: hudFood,
      events: hudEvents,
      tool: toolStatus
    });
    sim.setSoundController(audioSystem);
    if (window.BrapSimTools) {
      window.BrapSimTools.initTools(sim, {
        toolButtons: toolButtons,
        canvas: simCanvas,
        tooltip: simTooltip,
        utopiaToggle: utopiaToggle,
        audio: audioSystem
      });
    }
  }

  function setPanelVisibility(panelKey) {
    if (!simShell || !placeholderLabel) return;
    const isAlpha = panelKey === "alpha";
    simShell.classList.toggle("is-inactive", !isAlpha);
    simShell.setAttribute("aria-hidden", String(!isAlpha));
    placeholderLabel.classList.toggle("is-hidden", isAlpha);

    if (isAlpha) {
      bootSim();
      if (sim) sim.start();
    } else {
      if (simTooltip) {
        simTooltip.hidden = true;
      }
      if (sim) sim.stop();
    }
  }

  function updateClock() {
    if (!clockNode) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    clockNode.innerHTML =
      "SWAMP_GAS_<br>LAT 69.3965N<br>LON 30.6100E<br>CLOCK " + hh + ":" + mm + ":" + ss;
  }

  function uiTick(freq, duration) {
    playTone({ freq: freq, duration: duration, gain: 0.02, type: "square" });
  }

  coords.forEach((btn, idx) => {
    btn.addEventListener("click", function () {
      coords.forEach((c) => c.classList.remove("is-active"));
      btn.classList.add("is-active");
      if (!frame) return;

      const panelKey = btn.dataset.panel || "alpha";
      const nextPanel = panelDeck[panelKey] || panelDeck.alpha;
      const shift = (idx - 1) * 8;

      // Suspend sim immediately when leaving ALPHA, so it cannot run in background.
      if (panelKey !== "alpha") {
        setPanelVisibility(panelKey);
      }

      frame.classList.remove("panel-enter");
      frame.classList.add("panel-exit");
      frame.style.transform = "translateX(" + shift + "px) scale(0.997)";
      frame.style.borderColor = nextPanel.border;
      frame.style.boxShadow = "0 1px 0 #fff inset, 0 -1px 0 rgba(0, 0, 0, 0.25) inset, 10px 10px 0 rgba(0, 0, 0, 0.18)";

      if (transitionTimer) {
        window.clearTimeout(transitionTimer);
      }

      transitionTimer = window.setTimeout(function () {
        setPanelVisibility(panelKey);
        if (placeholderLabel) {
          placeholderLabel.textContent = nextPanel.label;
        }
        if (panelState) {
          panelState.textContent = nextPanel.state;
        }
        frame.classList.remove("panel-exit");
        frame.classList.add("panel-enter");
        frame.style.transform = "translateX(" + shift + "px) scale(1)";
        frame.style.boxShadow = "0 1px 0 #fff inset, 0 -1px 0 rgba(0, 0, 0, 0.25) inset, 8px 8px 0 rgba(0, 0, 0, 0.15)";
      }, 180);

      uiTick(220 + idx * 55, 0.08);
    });

    btn.addEventListener("mouseenter", function () {
      uiTick(180 + idx * 30, 0.06);
    });
  });

  if (soundToggle) {
    soundToggle.addEventListener("click", async function () {
      soundEnabled = !soundEnabled;
      soundToggle.classList.toggle("is-on", soundEnabled);
      soundToggle.setAttribute("aria-pressed", String(soundEnabled));
      soundToggle.textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";

      const ctx = bootAudio();
      if (ctx && ctx.state === "suspended") {
        await ctx.resume();
      }
      uiTick(soundEnabled ? 310 : 140, 0.07);
    });
  }

  updateClock();
  window.setInterval(updateClock, 1000);
  setPanelVisibility("alpha");
})();
