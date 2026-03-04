"use strict";

(function () {
  const TOOL_TYPES = ["food", "hazard", "fertility", "mutation", "cull", "swarm", "spawnMutant", "buildWall"];
  const WALL_BUCKET_SIZE = 28;
  const WALL_THICKNESS = 5;
  const STATE_SEARCH = 0;
  const STATE_EVADE = 1;
  const STATE_HUNT = 2;
  const STATE_MATE = 3;
  const STATE_RECOVER = 4;
  const STATE_WANDER = 5;
  const STATE_NAMES = ["searchFood", "evadeThreat", "huntWeak", "mateSeek", "recover", "idleWander"];
  const MUTATION_COLORS = {
    base: "#6e8f4b",
    speed: "#37a6ff",
    vision: "#ffd447",
    aggression: "#ff4f5f",
    fertility: "#89ff57",
    instability: "#c25bff"
  };

  const BASE_CONFIG = {
    width: 640,
    height: 360,
    initialCells: 58,
    naturalFoodCap: 210,
    minPopulation: 26,
    maxPopulation: 168
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function distSq(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return dx * dx + dy * dy;
  }

  function closestPointOnSegment(px, py, ax, ay, bx, by, lenSq) {
    if (lenSq <= 0.0001) {
      return { x: ax, y: ay, t: 0 };
    }
    const t = clamp(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lenSq, 0, 1);
    return {
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
      t: t
    };
  }

  function createCell(id, x, y, parentA, parentB) {
    const p1 = parentA || null;
    const p2 = parentB || null;
    const inheritedSpeed = p1 && p2 ? (p1.speed + p2.speed) * 0.5 : randRange(16, 28);
    const inheritedVision = p1 && p2 ? (p1.vision + p2.vision) * 0.5 : randRange(24, 52);
    const inheritedAggro = p1 && p2 ? (p1.aggression + p2.aggression) * 0.5 : randRange(0.18, 0.72);
    const inheritedFertility = p1 && p2 ? (p1.fertility + p2.fertility) * 0.5 : randRange(0.3, 0.8);
    const inheritedMut = p1 && p2 ? (p1.mutationChance + p2.mutationChance) * 0.5 : randRange(0.02, 0.07);

    return {
      id: id,
      x: x,
      y: y,
      vx: randRange(-10, 10),
      vy: randRange(-10, 10),
      radius: randRange(3.2, 5.4),
      hp: 100,
      energy: randRange(58, 88),
      age: 0,
      maxAge: randRange(70, 130),
      stateId: STATE_WANDER,
      stateCooldown: 0,
      senseCooldown: 0,
      lastMateAt: -9999,
      speed: inheritedSpeed,
      vision: inheritedVision,
      aggression: inheritedAggro,
      fertility: inheritedFertility,
      mutationChance: inheritedMut,
      mutationTag: "base",
      mutationTier: 0,
      morphSpike: 0,
      morphTumor: 0,
      mutationSeed: Math.floor(randRange(0, 997)),
      isMutant: false,
      alive: true
    };
  }

  function applyResidualMutationFromParents(child, parentA, parentB) {
    const p1 = parentA || null;
    const p2 = parentB || null;
    if (!p1 && !p2) return;

    const p1Tier = p1 ? p1.mutationTier || 0 : 0;
    const p2Tier = p2 ? p2.mutationTier || 0 : 0;
    const p1Mut = p1 ? p1Tier > 0 || p1.isMutant : false;
    const p2Mut = p2 ? p2Tier > 0 || p2.isMutant : false;
    if (!p1Mut && !p2Mut) return;

    let chosenTag = "base";
    if (p1Mut && p2Mut) {
      chosenTag = Math.random() < 0.5 ? p1.mutationTag : p2.mutationTag;
    } else if (p1Mut) {
      chosenTag = p1.mutationTag;
    } else {
      chosenTag = p2.mutationTag;
    }

    const residualTier = clamp(Math.floor((p1Tier + p2Tier) * 0.35 + randRange(0, 1.2)), 1, 4);
    child.mutationTag = chosenTag || "base";
    child.mutationTier = residualTier;

    const p1Spike = p1 ? p1.morphSpike || 0 : 0;
    const p2Spike = p2 ? p2.morphSpike || 0 : 0;
    const p1Tumor = p1 ? p1.morphTumor || 0 : 0;
    const p2Tumor = p2 ? p2.morphTumor || 0 : 0;
    child.morphSpike = clamp((p1Spike + p2Spike) * 0.25 + randRange(0.02, 0.08), 0, 0.45);
    child.morphTumor = clamp((p1Tumor + p2Tumor) * 0.22 + randRange(0.01, 0.06), 0, 0.35);

    // Small trait carry-over aligned to inherited mutation identity.
    if (child.mutationTag === "speed") {
      child.speed = clamp(child.speed + 1.8 + randRange(0, 1.4), 10, 46);
    } else if (child.mutationTag === "vision") {
      child.vision = clamp(child.vision + 3.2 + randRange(0, 2.2), 14, 92);
    } else if (child.mutationTag === "aggression") {
      child.aggression = clamp(child.aggression + 0.12 + randRange(0, 0.1), 0, 1);
    } else if (child.mutationTag === "fertility") {
      child.fertility = clamp(child.fertility + 0.1 + randRange(0, 0.08), 0.1, 1);
    } else if (child.mutationTag === "instability") {
      child.mutationChance = clamp(child.mutationChance + 0.02 + randRange(0, 0.012), 0.01, 0.26);
    }
  }

  function mutateCell(cell, intensity) {
    const scale = intensity || 1;
    const dSpeed = randRange(-4, 6) * scale;
    const dVision = randRange(-5, 10) * scale;
    const dAggro = randRange(-0.22, 0.28) * scale;
    const dFertility = randRange(-0.2, 0.3) * scale;
    const dMutChance = randRange(-0.015, 0.03) * scale;

    cell.speed = clamp(cell.speed + dSpeed, 10, 46);
    cell.vision = clamp(cell.vision + dVision, 14, 92);
    cell.aggression = clamp(cell.aggression + dAggro, 0, 1);
    cell.fertility = clamp(cell.fertility + dFertility, 0.1, 1);
    cell.mutationChance = clamp(cell.mutationChance + dMutChance, 0.01, 0.26);

    const scoreSpeed = Math.abs(dSpeed / 6);
    const scoreVision = Math.abs(dVision / 10);
    const scoreAggro = Math.abs(dAggro / 0.28);
    const scoreFert = Math.abs(dFertility / 0.3);
    const scoreInstability = Math.abs(dMutChance / 0.03);
    let bestTag = "speed";
    let best = scoreSpeed;
    if (scoreVision > best) {
      bestTag = "vision";
      best = scoreVision;
    }
    if (scoreAggro > best) {
      bestTag = "aggression";
      best = scoreAggro;
    }
    if (scoreFert > best) {
      bestTag = "fertility";
      best = scoreFert;
    }
    if (scoreInstability > best) {
      bestTag = "instability";
    }

    cell.mutationTag = bestTag;
    cell.mutationTier = clamp(cell.mutationTier + 1, 0, 7);
    cell.morphSpike = clamp(cell.morphSpike + randRange(0.06, 0.22) * scale, 0, 0.55);
    cell.morphTumor = clamp(cell.morphTumor + randRange(0.04, 0.14) * scale, 0, 0.42);
  }

  function createSim(canvas, options) {
    const cfg = Object.assign({}, BASE_CONFIG, options || {});
    const ctx = canvas.getContext("2d", { alpha: false });
    canvas.width = cfg.width;
    canvas.height = cfg.height;
    ctx.imageSmoothingEnabled = false;

    const world = {
      cells: [],
      locusts: [],
      foods: [],
      fields: [],
      walls: [],
      wallBuckets: Object.create(null),
      wallQueryStamp: 1,
      wallStroke: null,
      pings: [],
      sound: null,
      soundGate: {},
      mutantCount: 0,
      utopiaEnabled: true,
      autoFoodTimer: 0.9,
      autoCellTimer: 2.8,
      running: false,
      activeTool: "food",
      latestEvent: "boot",
      simTime: 0,
      stepAccum: 0,
      lastStamp: 0,
      nextId: 1,
      rafId: 0,
      hud: null
    };

    function spawnFood(x, y, amount) {
      world.foods.push({
        x: clamp(x, 2, cfg.width - 2),
        y: clamp(y, 2, cfg.height - 2),
        value: amount || randRange(6, 12),
        ttl: randRange(30, 95)
      });
    }

    function seedWorld() {
      world.cells.length = 0;
      world.locusts.length = 0;
      world.foods.length = 0;
      world.fields.length = 0;
      world.walls.length = 0;
      world.wallBuckets = Object.create(null);
      world.wallStroke = null;
      world.pings.length = 0;
      world.mutantCount = 0;
      world.utopiaEnabled = true;
      world.autoFoodTimer = 0.9;
      world.autoCellTimer = 2.8;
      world.simTime = 0;
      world.latestEvent = "seed";
      for (let i = 0; i < cfg.initialCells; i += 1) {
        world.cells.push(createCell(world.nextId++, randRange(6, cfg.width - 6), randRange(6, cfg.height - 6)));
      }
      for (let i = 0; i < 160; i += 1) {
        spawnFood(randRange(3, cfg.width - 3), randRange(3, cfg.height - 3));
      }
      render();
      updateHud();
    }

    function setHudNodes(nodes) {
      world.hud = nodes;
      updateHud();
    }

    function setTool(toolName) {
      if (TOOL_TYPES.indexOf(toolName) >= 0) {
        world.activeTool = toolName;
        updateHud();
      }
    }

    function setSoundController(controller) {
      world.sound = controller || null;
    }

    function setUtopiaEnabled(enabled) {
      world.utopiaEnabled = !!enabled;
      world.latestEvent = world.utopiaEnabled ? "utopiaOn" : "utopiaOff";
      updateHud();
    }

    function isUtopiaEnabled() {
      return !!world.utopiaEnabled;
    }

    function emitSound(name, minInterval) {
      if (!world.sound || typeof world.sound.play !== "function") return;
      const now = world.simTime;
      const gate = minInterval || 0;
      const last = world.soundGate[name] || -9999;
      if (now - last < gate) return;
      world.soundGate[name] = now;
      world.sound.play(name);
    }

    function updateHud() {
      if (!world.hud) return;
      if (world.hud.pop) {
        world.hud.pop.textContent =
          "POP " + String(world.cells.length).padStart(3, "0") + " L" + String(world.locusts.length).padStart(2, "0");
      }
      if (world.hud.food) world.hud.food.textContent = "FOOD " + String(world.foods.length).padStart(3, "0");
      if (world.hud.events) world.hud.events.textContent = "EVENT " + world.latestEvent;
      if (world.hud.tool) world.hud.tool.textContent = "TOOL " + world.activeTool;
    }

    function addPing(type, x, y, ttl) {
      world.pings.push({ type: type, x: x, y: y, ttl: ttl || 0.4, age: 0 });
    }

    function wallBucketKey(gx, gy) {
      return gx + ":" + gy;
    }

    function indexWallSegment(seg, idx) {
      const minGX = Math.floor((seg.minX - seg.thickness) / WALL_BUCKET_SIZE);
      const maxGX = Math.floor((seg.maxX + seg.thickness) / WALL_BUCKET_SIZE);
      const minGY = Math.floor((seg.minY - seg.thickness) / WALL_BUCKET_SIZE);
      const maxGY = Math.floor((seg.maxY + seg.thickness) / WALL_BUCKET_SIZE);
      for (let gy = minGY; gy <= maxGY; gy += 1) {
        for (let gx = minGX; gx <= maxGX; gx += 1) {
          const key = wallBucketKey(gx, gy);
          if (!world.wallBuckets[key]) world.wallBuckets[key] = [];
          world.wallBuckets[key].push(idx);
        }
      }
    }

    function rebuildWallBuckets() {
      world.wallBuckets = Object.create(null);
      for (let i = 0; i < world.walls.length; i += 1) {
        indexWallSegment(world.walls[i], i);
      }
    }

    function addWallSegment(x1, y1, x2, y2) {
      const ax = clamp(x1, 0, cfg.width);
      const ay = clamp(y1, 0, cfg.height);
      const bx = clamp(x2, 0, cfg.width);
      const by = clamp(y2, 0, cfg.height);
      const dx = bx - ax;
      const dy = by - ay;
      const lenSqRaw = dx * dx + dy * dy;
      // Accept micro-segments so drawing stays continuous at slow cursor speeds.
      const lenSq = Math.max(lenSqRaw, 0.0001);

      const seg = {
        x1: ax,
        y1: ay,
        x2: bx,
        y2: by,
        lenSq: lenSq,
        thickness: WALL_THICKNESS,
        minX: Math.min(ax, bx),
        minY: Math.min(ay, by),
        maxX: Math.max(ax, bx),
        maxY: Math.max(ay, by),
        stamp: 0
      };
      world.walls.push(seg);
      indexWallSegment(seg, world.walls.length - 1);
      return true;
    }

    function beginWallStroke(x, y) {
      world.wallStroke = { x: x, y: y };
      world.latestEvent = "wallBuild";
      emitSound("toolPlaceBuildWall", 0.05);
      updateHud();
    }

    function extendWallStroke(x, y) {
      if (!world.wallStroke) return;
      const prevX = world.wallStroke.x;
      const prevY = world.wallStroke.y;
      if (addWallSegment(prevX, prevY, x, y)) {
        emitSound("toolPlaceBuildWall", 0.1);
      }
      world.wallStroke.x = x;
      world.wallStroke.y = y;
    }

    function endWallStroke() {
      world.wallStroke = null;
    }

    function eraseWallsAt(x, y, radius) {
      const r = radius || 10;
      const rSq = r * r;
      let removed = 0;
      const kept = [];
      for (let i = 0; i < world.walls.length; i += 1) {
        const seg = world.walls[i];
        const cp = closestPointOnSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2, seg.lenSq);
        const d2 = distSq(x, y, cp.x, cp.y);
        const hitR = r + seg.thickness * 0.5;
        if (d2 <= hitR * hitR) {
          removed += 1;
        } else {
          kept.push(seg);
        }
      }
      if (removed > 0) {
        world.walls = kept;
        rebuildWallBuckets();
        world.latestEvent = "wallErase";
        emitSound("toolEraseWall", 0.05);
        updateHud();
      }
      return removed;
    }

    function spawnLocust(x, y) {
      world.locusts.push({
        x: clamp(x, 1, cfg.width - 1),
        y: clamp(y, 1, cfg.height - 1),
        vx: randRange(-12, 12),
        vy: randRange(-12, 12),
        life: randRange(2.6, 4.2),
        maxLife: randRange(3.4, 5.6)
      });
    }

    function spawnMutantCell(x, y) {
      const mutant = createCell(world.nextId++, x, y, null, null);
      mutant.radius = 11.8;
      mutant.hp = 280;
      mutant.energy = 200;
      mutant.speed = 33;
      mutant.vision = 96;
      mutant.aggression = 1;
      mutant.fertility = 0;
      mutant.mutationChance = 0.02;
      mutant.maxAge = 180;
      mutant.isMutant = true;
      mutant.mutationTag = "aggression";
      mutant.mutationTier = 5;
      mutant.morphSpike = 0.52;
      mutant.morphTumor = 0.25;
      mutant.stateId = STATE_HUNT;
      world.cells.push(mutant);
      world.mutantCount += 1;
      addPing("danger", x, y, 0.75);
    }

    function regularPopulationCount() {
      return Math.max(0, world.cells.length - world.mutantCount);
    }

    function applyToolAt(x, y) {
      const tx = clamp(x, 0, cfg.width);
      const ty = clamp(y, 0, cfg.height);
      const tool = world.activeTool;

      if (tool === "food") {
        for (let i = 0; i < 18; i += 1) {
          spawnFood(tx + randRange(-20, 20), ty + randRange(-20, 20), randRange(8, 16));
        }
        world.latestEvent = "foodDrop";
        addPing("player", tx, ty, 0.42);
        emitSound("toolPlaceFood", 0.03);
      } else if (tool === "hazard") {
        world.fields.push({ type: "hazard", x: tx, y: ty, radius: 48, strength: 1, ttl: 10 });
        world.latestEvent = "hazardPulse";
        addPing("danger", tx, ty, 0.6);
        emitSound("toolPlaceHazard", 0.03);
      } else if (tool === "fertility") {
        world.fields.push({ type: "fertility", x: tx, y: ty, radius: 56, strength: 1, ttl: 12 });
        world.latestEvent = "fertilityZone";
        addPing("player", tx, ty, 0.6);
        emitSound("toolPlaceFertility", 0.03);
      } else if (tool === "mutation") {
        world.fields.push({ type: "mutation", x: tx, y: ty, radius: 42, strength: 1, ttl: 8 });
        world.latestEvent = "catalyst";
        addPing("mutate", tx, ty, 0.6);
        emitSound("toolPlaceMutation", 0.03);
      } else if (tool === "cull") {
        let nearest = null;
        let nearDist = 999999;
        for (let i = 0; i < world.cells.length; i += 1) {
          const c = world.cells[i];
          const d = distSq(c.x, c.y, tx, ty);
          if (d < nearDist) {
            nearDist = d;
            nearest = c;
          }
        }
        if (nearest && nearDist < 40 * 40) {
          nearest.hp = 0;
          nearest.energy = 0;
          world.latestEvent = "cull";
          addPing("danger", nearest.x, nearest.y, 0.45);
          emitSound("toolPlaceCull", 0.03);
        }
      } else if (tool === "swarm") {
        for (let i = 0; i < 28; i += 1) {
          spawnLocust(tx + randRange(-18, 18), ty + randRange(-18, 18));
        }
        world.latestEvent = "swarm";
        addPing("player", tx, ty, 0.35);
        emitSound("toolPlaceSwarm", 0.03);
      } else if (tool === "spawnMutant") {
        let mutantCount = 0;
        for (let i = 0; i < world.cells.length; i += 1) {
          if (world.cells[i].isMutant) mutantCount += 1;
        }
        if (mutantCount < 3) {
          spawnMutantCell(tx, ty);
          world.latestEvent = "mutantSpawn";
          emitSound("toolPlaceSpawnMutant", 0.03);
        } else {
          world.latestEvent = "mutantCap";
        }
      } else if (tool === "buildWall") {
        world.latestEvent = "wallTool";
      }
      updateHud();
    }

    function nearestFood(cell) {
      let best = null;
      let bestD = cell.vision * cell.vision;
      for (let i = 0; i < world.foods.length; i += 1) {
        const f = world.foods[i];
        const d = distSq(cell.x, cell.y, f.x, f.y);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      return best;
    }

    function evaluateNeighbors(cell) {
      let nearestThreat = null;
      let nearestWeak = null;
      let nearestMate = null;
      let nearestMutant = null;
      let dThreat = cell.vision * cell.vision;
      let dWeak = cell.vision * cell.vision;
      let dMate = cell.vision * cell.vision;
      let dMutant = cell.vision * cell.vision;
      const canMate = cell.energy > 52 && world.simTime - cell.lastMateAt > 8;

      for (let i = 0; i < world.cells.length; i += 1) {
        const other = world.cells[i];
        if (other === cell || !other.alive) continue;
        const d = distSq(cell.x, cell.y, other.x, other.y);
        if (d > cell.vision * cell.vision) continue;

        if (other.isMutant && d < dMutant) {
          dMutant = d;
          nearestMutant = other;
        }
        if (other.radius > cell.radius * 1.2 && d < dThreat) {
          dThreat = d;
          nearestThreat = other;
        }
        if (other.radius < cell.radius * 0.86 && d < dWeak) {
          dWeak = d;
          nearestWeak = other;
        }
        if (canMate && other.energy > 52 && world.simTime - other.lastMateAt > 8 && d < dMate) {
          dMate = d;
          nearestMate = other;
        }
      }

      return {
        nearestThreat: nearestThreat,
        nearestWeak: nearestWeak,
        nearestMate: nearestMate,
        nearestMutant: nearestMutant,
        mutantDistSq: dMutant
      };
    }

    function chooseState(cell, food, neighbors, fieldForces) {
      const braveScore = clamp(
        (cell.radius / 9.5) * 0.45 + (cell.hp / 120) * 0.35 + (1 - cell.age / cell.maxAge) * 0.2,
        0,
        1
      );
      const weights = {
        searchFood: 0.4,
        evadeThreat: neighbors.nearestThreat ? 2.6 : 0,
        huntWeak: neighbors.nearestWeak ? cell.aggression * 1.8 : 0,
        mateSeek: neighbors.nearestMate ? cell.fertility * 1.5 : 0,
        recover: cell.energy < 24 ? 1.8 : 0,
        idleWander: 0.6
      };
      if (food) weights.searchFood += 0.9;
      if (fieldForces.hazard > 0.3) weights.evadeThreat += 2.2;
      if (fieldForces.fertility > 0.2) weights.mateSeek += 0.8;
      if (fieldForces.mutation > 0.2) weights.idleWander += 0.3;
      if (neighbors.nearestMutant) {
        if (braveScore < 0.62) {
          weights.evadeThreat += 4;
        } else {
          weights.huntWeak += 1.2;
        }
      }

      let bestState = cell.stateId;
      let bestWeight = -1;
      for (let i = 0; i < STATE_NAMES.length; i += 1) {
        const st = STATE_NAMES[i];
        if (weights[st] > bestWeight) {
          bestWeight = weights[st];
          bestState = i;
        }
      }
      return bestState;
    }

    function fieldInfluence(cell) {
      const sum = { ax: 0, ay: 0, hazard: 0, fertility: 0, mutation: 0 };
      for (let i = 0; i < world.fields.length; i += 1) {
        const f = world.fields[i];
        const dx = f.x - cell.x;
        const dy = f.y - cell.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > f.radius * f.radius || d2 < 0.001) continue;
        const d = Math.sqrt(d2);
        const n = 1 - d / f.radius;
        if (f.type === "hazard") {
          sum.ax -= (dx / d) * 12 * n;
          sum.ay -= (dy / d) * 12 * n;
          sum.hazard += n;
          cell.hp -= 8 * n;
        } else if (f.type === "fertility") {
          sum.ax += (dx / d) * 5 * n;
          sum.ay += (dy / d) * 5 * n;
          sum.fertility += n;
          cell.energy += 2.4 * n;
        } else if (f.type === "mutation") {
          sum.mutation += n;
          if (Math.random() < 0.02 * n) {
            mutateCell(cell, 0.6);
            world.latestEvent = "mutate";
            addPing("mutate", cell.x, cell.y, 0.35);
            emitSound("cellMutate", 0.16);
          }
        }
      }
      return sum;
    }

    function steerToward(cell, tx, ty, scale) {
      const dx = tx - cell.x;
      const dy = ty - cell.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      cell.vx += (dx / d) * scale;
      cell.vy += (dy / d) * scale;
    }

    function steerAway(cell, tx, ty, scale) {
      const dx = cell.x - tx;
      const dy = cell.y - ty;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      cell.vx += (dx / d) * scale;
      cell.vy += (dy / d) * scale;
    }

    function resolveWallCollision(cell) {
      if (!world.walls.length) return;
      const queryId = world.wallQueryStamp++;
      const reach = cell.radius + WALL_THICKNESS * 0.75;
      const minGX = Math.floor((cell.x - reach) / WALL_BUCKET_SIZE);
      const maxGX = Math.floor((cell.x + reach) / WALL_BUCKET_SIZE);
      const minGY = Math.floor((cell.y - reach) / WALL_BUCKET_SIZE);
      const maxGY = Math.floor((cell.y + reach) / WALL_BUCKET_SIZE);

      for (let gy = minGY; gy <= maxGY; gy += 1) {
        for (let gx = minGX; gx <= maxGX; gx += 1) {
          const bucket = world.wallBuckets[wallBucketKey(gx, gy)];
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i += 1) {
            const seg = world.walls[bucket[i]];
            if (!seg || seg.stamp === queryId) continue;
            seg.stamp = queryId;

            const cp = closestPointOnSegment(cell.x, cell.y, seg.x1, seg.y1, seg.x2, seg.y2, seg.lenSq);
            const dx = cell.x - cp.x;
            const dy = cell.y - cp.y;
            const d2 = dx * dx + dy * dy;
            const hitR = cell.radius + seg.thickness * 0.5;
            if (d2 > hitR * hitR) continue;

            const d = Math.sqrt(d2) || 0.001;
            let nx = dx / d;
            let ny = dy / d;
            if (d < 0.01) {
              const sdx = seg.x2 - seg.x1;
              const sdy = seg.y2 - seg.y1;
              const sl = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
              nx = -sdy / sl;
              ny = sdx / sl;
            }

            const push = hitR - d;
            cell.x += nx * push;
            cell.y += ny * push;

            const vn = cell.vx * nx + cell.vy * ny;
            if (vn < 0) {
              cell.vx -= vn * nx * 1.12;
              cell.vy -= vn * ny * 1.12;
            }
          }
        }
      }
    }

    function maybeBreed(a, b) {
      if (regularPopulationCount() >= cfg.maxPopulation) return;
      if (!a.alive || !b.alive) return;
      if (a.energy < 54 || b.energy < 54) return;
      if (world.simTime - a.lastMateAt < 8 || world.simTime - b.lastMateAt < 8) return;

      const d2 = distSq(a.x, a.y, b.x, b.y);
      const r = (a.radius + b.radius) * 1.6;
      if (d2 > r * r) return;

      if (Math.random() > 0.012 * ((a.fertility + b.fertility) * 0.5)) return;

      const child = createCell(world.nextId++, (a.x + b.x) * 0.5, (a.y + b.y) * 0.5, a, b);
      applyResidualMutationFromParents(child, a, b);
      if (Math.random() < child.mutationChance * 0.9) {
        mutateCell(child, 1);
      }
      child.energy = 44;
      world.cells.push(child);
      a.energy -= 16;
      b.energy -= 16;
      a.lastMateAt = world.simTime;
      b.lastMateAt = world.simTime;
      world.latestEvent = "birth";
      addPing("player", child.x, child.y, 0.35);
      emitSound("cellBirth", 0.28);
    }

    function cellVsCell() {
      for (let i = 0; i < world.cells.length; i += 1) {
        const a = world.cells[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < world.cells.length; j += 1) {
          const b = world.cells[j];
          if (!b.alive) continue;
          const r = a.radius + b.radius;
          const d2 = distSq(a.x, a.y, b.x, b.y);
          if (d2 > r * r) continue;

          if ((a.stateId === STATE_HUNT || b.stateId === STATE_HUNT) && Math.abs(a.radius - b.radius) > 0.8) {
            const stronger = a.radius > b.radius ? a : b;
            const weaker = stronger === a ? b : a;
            let damage = 8 + stronger.aggression * 12;
            if (stronger.isMutant) damage *= 1.9;
            weaker.hp -= damage;
            stronger.energy += 4;
            addPing("danger", weaker.x, weaker.y, 0.2);
            emitSound("cellHit", 0.05);
          } else {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.sqrt(d2) || 1;
            const push = (r - d) * 0.3;
            const nx = dx / d;
            const ny = dy / d;
            a.vx -= nx * push;
            a.vy -= ny * push;
            b.vx += nx * push;
            b.vy += ny * push;
          }

          maybeBreed(a, b);
        }
      }
    }

    function updateLocusts(dt) {
      for (let i = world.locusts.length - 1; i >= 0; i -= 1) {
        const l = world.locusts[i];
        l.life -= dt;
        if (l.life <= 0) {
          world.locusts.splice(i, 1);
          continue;
        }

        let bestFood = null;
        let bestD = 70 * 70;
        for (let n = 0; n < world.foods.length; n += 1) {
          const f = world.foods[n];
          const d = distSq(l.x, l.y, f.x, f.y);
          if (d < bestD) {
            bestD = d;
            bestFood = f;
          }
        }

        if (bestFood) {
          const dx = bestFood.x - l.x;
          const dy = bestFood.y - l.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          l.vx += (dx / d) * 34 * dt;
          l.vy += (dy / d) * 34 * dt;
        } else {
          l.vx += randRange(-6, 6) * dt;
          l.vy += randRange(-6, 6) * dt;
        }

        const sp = Math.sqrt(l.vx * l.vx + l.vy * l.vy) || 1;
        const maxSp = 76;
        if (sp > maxSp) {
          const s = maxSp / sp;
          l.vx *= s;
          l.vy *= s;
        }

        l.x += l.vx * dt;
        l.y += l.vy * dt;
        l.vx *= 0.92;
        l.vy *= 0.92;

        l.x = clamp(l.x, 1, cfg.width - 1);
        l.y = clamp(l.y, 1, cfg.height - 1);

        for (let f = world.foods.length - 1; f >= 0; f -= 1) {
          const food = world.foods[f];
          if (distSq(l.x, l.y, food.x, food.y) <= 9) {
            world.foods.splice(f, 1);
            l.life = clamp(l.life + 0.55, 0, l.maxLife + 1.1);
            world.latestEvent = "swarmFeed";
            // Suppress repetitive ambient chirping from swarm auto-feeding.
            break;
          }
        }
      }
    }

    function eatFood(cell) {
      for (let i = world.foods.length - 1; i >= 0; i -= 1) {
        const f = world.foods[i];
        const d2 = distSq(cell.x, cell.y, f.x, f.y);
        const r = cell.radius + 2.4;
        if (d2 <= r * r) {
          cell.energy += f.value * 0.8;
          cell.radius = clamp(cell.radius + f.value * 0.012, 2.8, 9.4);
          world.foods.splice(i, 1);
          world.latestEvent = "feed";
          // Keep autonomous feeding mostly silent to avoid repetitive UI fatigue.
          if (Math.random() < 0.08) {
            emitSound("cellFeed", 1.1);
          }
          return;
        }
      }
    }

    function update(dt) {
      world.simTime += dt;

      if (world.utopiaEnabled) {
        world.autoFoodTimer -= dt;
        world.autoCellTimer -= dt;
        const foodTarget = Math.floor(cfg.naturalFoodCap * 0.75);
        const regularTarget = Math.min(cfg.maxPopulation, Math.max(cfg.minPopulation, cfg.initialCells));
        const regularPop = regularPopulationCount();
        const foodDeficit = foodTarget - world.foods.length;
        const popDeficit = regularTarget - regularPop;

        if (foodDeficit > 0 && world.autoFoodTimer <= 0) {
          spawnFood(randRange(4, cfg.width - 4), randRange(4, cfg.height - 4), randRange(5, 11));
          world.autoFoodTimer = clamp(0.65 - Math.min(foodDeficit, 90) * 0.002, 0.26, 0.65);
        }

        if (popDeficit > 0 && regularPop < cfg.maxPopulation && world.autoCellTimer <= 0) {
          world.cells.push(createCell(world.nextId++, randRange(6, cfg.width - 6), randRange(6, cfg.height - 6)));
          world.latestEvent = "utopiaGrow";
          world.autoCellTimer = clamp(2.9 - Math.min(popDeficit, 36) * 0.05, 0.95, 2.9);
        }
      }

      for (let i = world.fields.length - 1; i >= 0; i -= 1) {
        const f = world.fields[i];
        f.ttl -= dt;
        if (f.ttl <= 0) world.fields.splice(i, 1);
      }
      for (let i = world.pings.length - 1; i >= 0; i -= 1) {
        const p = world.pings[i];
        p.age += dt;
        if (p.age > p.ttl) world.pings.splice(i, 1);
      }
      for (let i = world.foods.length - 1; i >= 0; i -= 1) {
        world.foods[i].ttl -= dt;
        if (world.foods[i].ttl <= 0) {
          world.foods.splice(i, 1);
        }
      }

      for (let i = 0; i < world.cells.length; i += 1) {
        const cell = world.cells[i];
        if (!cell.alive) continue;

        cell.age += dt;
        cell.energy -= (0.75 + cell.radius * 0.06 + cell.speed * 0.008) * dt;
        cell.stateCooldown -= dt;
        cell.senseCooldown -= dt;

        const nearbyFood = nearestFood(cell);
        const neighbors = evaluateNeighbors(cell);
        const fields = fieldInfluence(cell);

        if (cell.senseCooldown <= 0 || cell.stateCooldown <= 0) {
          const chosen = chooseState(cell, nearbyFood, neighbors, fields);
          if (chosen !== cell.stateId) {
            cell.stateId = chosen;
            cell.stateCooldown = randRange(0.45, 1.2);
          }
          cell.senseCooldown = randRange(0.18, 0.38);
        }

        if (cell.isMutant) {
          let prey = null;
          let preyD = cell.vision * cell.vision;
          for (let p = 0; p < world.cells.length; p += 1) {
            const other = world.cells[p];
            if (other === cell || !other.alive || other.isMutant) continue;
            const d = distSq(cell.x, cell.y, other.x, other.y);
            if (d < preyD) {
              preyD = d;
              prey = other;
            }
          }
          if (prey) {
            steerToward(cell, prey.x, prey.y, 28 * dt);
          }
        } else if (cell.stateId === STATE_SEARCH && nearbyFood) {
          steerToward(cell, nearbyFood.x, nearbyFood.y, 20 * dt);
        } else if (cell.stateId === STATE_EVADE && neighbors.nearestThreat) {
          steerAway(cell, neighbors.nearestThreat.x, neighbors.nearestThreat.y, 26 * dt);
        } else if (cell.stateId === STATE_HUNT && neighbors.nearestWeak) {
          steerToward(cell, neighbors.nearestWeak.x, neighbors.nearestWeak.y, 20 * dt);
        } else if (cell.stateId === STATE_MATE && neighbors.nearestMate) {
          steerToward(cell, neighbors.nearestMate.x, neighbors.nearestMate.y, 16 * dt);
        } else if (cell.stateId === STATE_RECOVER) {
          cell.vx *= 0.98;
          cell.vy *= 0.98;
        } else {
          cell.vx += randRange(-3, 3) * dt;
          cell.vy += randRange(-3, 3) * dt;
        }

        cell.vx += fields.ax * dt;
        cell.vy += fields.ay * dt;

        const speed = Math.sqrt(cell.vx * cell.vx + cell.vy * cell.vy);
        const maxSpeed = cell.speed * (cell.stateId === STATE_EVADE ? 1.3 : 1);
        if (speed > maxSpeed) {
          const sc = maxSpeed / speed;
          cell.vx *= sc;
          cell.vy *= sc;
        }

        cell.x += cell.vx * dt;
        cell.y += cell.vy * dt;
        cell.vx *= 0.97;
        cell.vy *= 0.97;

        if (cell.x < cell.radius) {
          cell.x = cell.radius;
          cell.vx = Math.abs(cell.vx) * 0.7;
        }
        if (cell.y < cell.radius) {
          cell.y = cell.radius;
          cell.vy = Math.abs(cell.vy) * 0.7;
        }
        if (cell.x > cfg.width - cell.radius) {
          cell.x = cfg.width - cell.radius;
          cell.vx = -Math.abs(cell.vx) * 0.7;
        }
        if (cell.y > cfg.height - cell.radius) {
          cell.y = cfg.height - cell.radius;
          cell.vy = -Math.abs(cell.vy) * 0.7;
        }

        resolveWallCollision(cell);
        eatFood(cell);

        if (cell.energy > 90) {
          cell.hp = clamp(cell.hp + 7 * dt, 0, 120);
        }
        if (cell.energy <= 0 || cell.hp <= 0 || cell.age > cell.maxAge) {
          cell.alive = false;
          world.latestEvent = "death";
          addPing("danger", cell.x, cell.y, 0.4);
          emitSound("cellDeath", 0.14);
          for (let n = 0; n < 4; n += 1) {
            spawnFood(cell.x + randRange(-5, 5), cell.y + randRange(-5, 5), randRange(5, 10));
          }
        }
      }

      cellVsCell();
      updateLocusts(dt);
      world.cells = world.cells.filter((c) => c.alive);
      let mutants = 0;
      for (let i = 0; i < world.cells.length; i += 1) {
        if (world.cells[i].isMutant) mutants += 1;
      }
      world.mutantCount = mutants;
      updateHud();
    }

    function getCellInfoAt(x, y) {
      let nearest = null;
      let nearestD = 999999;
      for (let i = 0; i < world.cells.length; i += 1) {
        const c = world.cells[i];
        if (!c.alive) continue;
        const d2 = distSq(x, y, c.x, c.y);
        const hitR = c.radius + 2;
        if (d2 <= hitR * hitR && d2 < nearestD) {
          nearestD = d2;
          nearest = c;
        }
      }
      if (!nearest) return null;

      return {
        id: nearest.id,
        state: STATE_NAMES[nearest.stateId] || "unknown",
        hp: Math.round(nearest.hp),
        energy: Math.round(nearest.energy),
        age: Number(nearest.age.toFixed(1)),
        radius: Number(nearest.radius.toFixed(1)),
        mutationTag: nearest.mutationTag,
        mutant: !!nearest.isMutant
      };
    }

    function drawCell(cell) {
      const px = Math.round(cell.x);
      const py = Math.round(cell.y);
      const fill = MUTATION_COLORS[cell.mutationTag] || MUTATION_COLORS.base;
      const radius = Math.round(cell.radius);
      const distorted = cell.isMutant || cell.mutationTier > 1;

      ctx.fillStyle = fill;
      ctx.strokeStyle = "#10220f";
      ctx.lineWidth = 1;

      if (!distorted) {
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, radius - 1), 0, Math.PI * 2);
        ctx.stroke();
        return;
      }

      const seg = 11;
      const wobble = (cell.morphSpike + (cell.isMutant ? 0.2 : 0)) * radius;
      ctx.beginPath();
      for (let i = 0; i <= seg; i += 1) {
        const t = (i / seg) * Math.PI * 2;
        const waveA = Math.sin(t * 3 + cell.mutationSeed * 0.11) * wobble;
        const waveB = Math.sin(t * 7 + cell.mutationSeed * 0.07) * cell.morphTumor * radius;
        const rr = radius + waveA * 0.24 + waveB * 0.2;
        const x = px + Math.cos(t) * rr;
        const y = py + Math.sin(t) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    function drawField(field) {
      const x = Math.round(field.x);
      const y = Math.round(field.y);
      const r = Math.round(field.radius);
      if (field.type === "hazard") ctx.strokeStyle = "#ef5f2f";
      if (field.type === "fertility") ctx.strokeStyle = "#6e8f4b";
      if (field.type === "mutation") ctx.strokeStyle = "#ff4fd8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    function drawPing(p) {
      const life = 1 - p.age / p.ttl;
      const r = Math.max(2, Math.round(14 * life));
      if (p.type === "danger") ctx.strokeStyle = "#ef5f2f";
      if (p.type === "mutate") ctx.strokeStyle = "#ff4fd8";
      if (p.type === "player") ctx.strokeStyle = "#37a6ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(Math.round(p.x), Math.round(p.y), r, 0, Math.PI * 2);
      ctx.stroke();
    }

    function render() {
      ctx.fillStyle = "#c8d8af";
      ctx.fillRect(0, 0, cfg.width, cfg.height);

      ctx.strokeStyle = "#9fb182";
      for (let x = 0; x <= cfg.width; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, cfg.height);
        ctx.stroke();
      }
      for (let y = 0; y <= cfg.height; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(cfg.width, y + 0.5);
        ctx.stroke();
      }

      for (let i = 0; i < world.fields.length; i += 1) {
        drawField(world.fields[i]);
      }

      if (world.walls.length) {
        ctx.lineWidth = WALL_THICKNESS;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#1a2f19";
        for (let i = 0; i < world.walls.length; i += 1) {
          const w = world.walls[i];
          ctx.beginPath();
          ctx.moveTo(Math.round(w.x1), Math.round(w.y1));
          ctx.lineTo(Math.round(w.x2), Math.round(w.y2));
          ctx.stroke();
        }
        ctx.lineWidth = 1;
      }

      ctx.fillStyle = "#2f4f2f";
      for (let i = 0; i < world.foods.length; i += 1) {
        const f = world.foods[i];
        ctx.fillRect(Math.round(f.x), Math.round(f.y), 2, 2);
      }

      ctx.fillStyle = "#10220f";
      for (let i = 0; i < world.locusts.length; i += 1) {
        const l = world.locusts[i];
        ctx.fillRect(Math.round(l.x), Math.round(l.y), 1, 1);
      }

      for (let i = 0; i < world.cells.length; i += 1) {
        drawCell(world.cells[i]);
      }
      for (let i = 0; i < world.pings.length; i += 1) {
        drawPing(world.pings[i]);
      }
    }

    function loop(ts) {
      if (!world.running) return;
      if (!world.lastStamp) world.lastStamp = ts;
      const delta = Math.min((ts - world.lastStamp) / 1000, 0.2);
      world.lastStamp = ts;
      world.stepAccum += delta;

      const step = 1 / 60;
      while (world.stepAccum >= step) {
        update(step);
        world.stepAccum -= step;
      }
      render();
      world.rafId = window.requestAnimationFrame(loop);
    }

    function start() {
      if (world.running) return;
      world.running = true;
      world.lastStamp = 0;
      world.rafId = window.requestAnimationFrame(loop);
    }

    function stop() {
      world.running = false;
      if (world.rafId) {
        window.cancelAnimationFrame(world.rafId);
        world.rafId = 0;
      }
    }

    seedWorld();

    return {
      start: start,
      stop: stop,
      setTool: setTool,
      setHudNodes: setHudNodes,
      setSoundController: setSoundController,
      setUtopiaEnabled: setUtopiaEnabled,
      isUtopiaEnabled: isUtopiaEnabled,
      applyToolAt: applyToolAt,
      beginWallStroke: beginWallStroke,
      extendWallStroke: extendWallStroke,
      endWallStroke: endWallStroke,
      eraseWallsAt: eraseWallsAt,
      getCellInfoAt: getCellInfoAt,
      world: world
    };
  }

  window.BrapSimCore = {
    createSim: createSim
  };
})();
