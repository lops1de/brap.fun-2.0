"use strict";

(function () {
  function pointerToCanvas(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * sx,
      y: (evt.clientY - rect.top) * sy
    };
  }

  function initTools(sim, nodes) {
    const toolButtons = nodes.toolButtons || [];
    const canvas = nodes.canvas;
    const tooltip = nodes.tooltip || null;
    const utopiaToggle = nodes.utopiaToggle || null;
    const audio = nodes.audio || null;
    if (!sim || !canvas) return;
    if (tooltip && tooltip.parentElement !== document.body) {
      document.body.appendChild(tooltip);
    }

    function hideTooltip() {
      if (!tooltip) return;
      tooltip.hidden = true;
    }

    let activeTool = "food";
    const activeBtn = toolButtons.find((b) => b.classList.contains("is-active"));
    if (activeBtn && activeBtn.dataset.tool) activeTool = activeBtn.dataset.tool;
    let drawingWall = false;
    let wallPointerId = null;

    function setUtopiaUi(enabled) {
      if (!utopiaToggle) return;
      utopiaToggle.classList.toggle("is-on", enabled);
      utopiaToggle.setAttribute("aria-pressed", String(enabled));
      utopiaToggle.title = enabled ? "Utopia mode on" : "Utopia mode off";
    }

    function placeTooltip(tooltipNode, clientX, clientY) {
      const offset = 8;
      let left = clientX + offset;
      let top = clientY + offset;
      const pad = 6;
      const rect = tooltipNode.getBoundingClientRect();

      if (left + rect.width + pad > window.innerWidth) {
        left = clientX - rect.width - offset;
      }
      if (top + rect.height + pad > window.innerHeight) {
        top = clientY - rect.height - offset;
      }
      if (left < pad) left = pad;
      if (top < pad) top = pad;

      tooltipNode.style.left = left + "px";
      tooltipNode.style.top = top + "px";
    }

    toolButtons.forEach((btn) => {
      btn.addEventListener("click", function () {
        const tool = btn.dataset.tool || "food";
        activeTool = tool;
        sim.setTool(tool);
        toolButtons.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        if (audio && typeof audio.play === "function") {
          audio.play("uiToolSelect");
        }
      });
    });

    if (utopiaToggle && typeof sim.setUtopiaEnabled === "function") {
      const startEnabled = typeof sim.isUtopiaEnabled === "function" ? sim.isUtopiaEnabled() : true;
      setUtopiaUi(startEnabled);
      utopiaToggle.addEventListener("click", function () {
        const next = !utopiaToggle.classList.contains("is-on");
        sim.setUtopiaEnabled(next);
        setUtopiaUi(next);
        if (audio && typeof audio.play === "function") {
          audio.play(next ? "uiUtopiaOn" : "uiUtopiaOff");
        }
      });
    }

    canvas.addEventListener("contextmenu", function (evt) {
      if (activeTool === "buildWall") {
        evt.preventDefault();
      }
    });

    canvas.addEventListener("pointerdown", function (evt) {
      const p = pointerToCanvas(canvas, evt);
      if (activeTool === "buildWall" && evt.button === 2) {
        evt.preventDefault();
        if (typeof sim.eraseWallsAt === "function") {
          sim.eraseWallsAt(p.x, p.y, 12);
        }
        hideTooltip();
        return;
      }

      if (evt.button !== 0) return;

      if (activeTool === "buildWall" && typeof sim.beginWallStroke === "function") {
        drawingWall = true;
        wallPointerId = evt.pointerId;
        sim.beginWallStroke(p.x, p.y);
        canvas.setPointerCapture(evt.pointerId);
        hideTooltip();
        return;
      }

      sim.applyToolAt(p.x, p.y);
    });

    canvas.addEventListener("pointermove", function (evt) {
      if (activeTool === "buildWall" && (evt.buttons & 2) === 2) {
        const p = pointerToCanvas(canvas, evt);
        if (typeof sim.eraseWallsAt === "function") {
          sim.eraseWallsAt(p.x, p.y, 12);
        }
        hideTooltip();
        return;
      }

      if (drawingWall && wallPointerId === evt.pointerId) {
        const p = pointerToCanvas(canvas, evt);
        if (typeof sim.extendWallStroke === "function") {
          sim.extendWallStroke(p.x, p.y);
        }
        hideTooltip();
        return;
      }

      if (!tooltip || typeof sim.getCellInfoAt !== "function") return;
      const p = pointerToCanvas(canvas, evt);
      const info = sim.getCellInfoAt(p.x, p.y);
      if (!info) {
        hideTooltip();
        return;
      }

      const lines = [
        "ID " + info.id + (info.mutant ? " [M]" : ""),
        "STATE " + info.state,
        "HP " + info.hp + "  EN " + info.energy,
        "AGE " + info.age + "  R " + info.radius,
        "MUT " + info.mutationTag
      ];
      tooltip.textContent = lines.join("\n");
      tooltip.hidden = false;
      placeTooltip(tooltip, evt.clientX, evt.clientY);
    });

    function endWallDraw(evt) {
      if (!drawingWall) return;
      if (wallPointerId !== null && evt && evt.pointerId !== wallPointerId) return;
      if (evt && canvas.hasPointerCapture && canvas.hasPointerCapture(evt.pointerId)) {
        canvas.releasePointerCapture(evt.pointerId);
      }
      drawingWall = false;
      wallPointerId = null;
      if (typeof sim.endWallStroke === "function") {
        sim.endWallStroke();
      }
    }

    canvas.addEventListener("pointerup", endWallDraw);
    canvas.addEventListener("pointercancel", endWallDraw);
    canvas.addEventListener("pointerleave", hideTooltip);
  }

  window.BrapSimTools = {
    initTools: initTools
  };
})();
