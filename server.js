'use strict';

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static("public"));

/* ===============================
   SERVER CONFIG
================================ */
const TICK_RATE = 60;
const FIXED_DT = 1000 / TICK_RATE;
let serverFrame = 0;

/* ===============================
   AUTHORITATIVE STATE
================================ */
const state = {
  players: {},
  boss: null,
  hitboxes: [],
};

/* ===============================
   PLAYER CREATION
================================ */
function createPlayer(id) {
  return {
    id,
    x: 100 + Math.random() * 600,
    y: 400,
    vx: 0,
    vy: 0,
    facing: 1,
    hp: 100,
    invuln: 0,
    hitstun: 0,
    weapon: "katana",
    pendingInputs: {},
    confirmedFrame: 0,
    dead: false
  };
}

/* ===============================
   BOSS CREATION
================================ */
function createBoss() {
  state.boss = {
    x: 500,
    y: 200,
    vx: 0,
    hp: 500,

    armor: 120,
    stagger: 0,
    staggerThreshold: 120,

    phase: 1,
    attackCooldown: 0,

    executionWindow: false,
    executionTimer: 0,
    executed: false,

    state: "idle"
  };
}

/* ===============================
   SOCKET HANDLING
================================ */
io.on("connection", socket => {
  console.log("Connected:", socket.id);

  state.players[socket.id] = createPlayer(socket.id);

  socket.on("playerInput", data => {
    // rollback-safe buffering
    state.players[socket.id].pendingInputs[data.frame] = data.keys;
  });

  socket.on("disconnect", () => {
    delete state.players[socket.id];
  });
});

/* ===============================
   INPUT APPLICATION
================================ */
function applyInput(p, keys) {
  if (p.dead) return;

  const SPEED = 3;

  if (keys.left) {
    p.vx = -SPEED;
    p.facing = -1;
  } else if (keys.right) {
    p.vx = SPEED;
    p.facing = 1;
  } else {
    p.vx = 0;
  }

  if (keys.jump && p.y >= 400) {
    p.vy = -10;
  }

  // Attacks are validated server-side later
}

/* ===============================
   PHYSICS STEP
================================ */
function physicsStep(p) {
  p.vy += 0.5;
  p.x += p.vx;
  p.y += p.vy;

  if (p.y >= 400) {
    p.y = 400;
    p.vy = 0;
  }
}

/* ===============================
   BOSS AI
================================ */
function updateBoss() {
  const b = state.boss;
  if (!b || b.executed) return;

  if (b.hp <= 0) {
    b.executed = true;
    b.state = "dead";
    return;
  }

  if (b.hp < 350) b.phase = 2;
  if (b.hp < 150) b.phase = 3;

  if (b.executionWindow) {
    b.executionTimer--;
    if (b.executionTimer <= 0) {
      b.executionWindow = false;
    }
    return;
  }

  if (b.attackCooldown > 0) {
    b.attackCooldown--;
    return;
  }

  // Choose target
  const players = Object.values(state.players).filter(p => !p.dead);
  if (players.length === 0) return;

  const target = players.reduce((a, c) =>
    Math.abs(c.x - b.x) < Math.abs(a.x - b.x) ? c : a
  );

  const dist = Math.abs(target.x - b.x);

  if (dist < 80 && Math.random() < 0.3) {
    b.executionWindow = true;
    b.executionTimer = 120;
    b.state = "execution";
    return;
  }

  // Normal attack
  b.attackCooldown = 60 - b.phase * 10;
  b.vx = target.x > b.x ? 6 : -6;
}

/* ===============================
   EXECUTION CONFIRMATION
================================ */
function checkExecutionConfirm() {
  const b = state.boss;
  if (!b || !b.executionWindow) return;

  const closePlayers = Object.values(state.players)
    .filter(p => !p.dead && Math.abs(p.x - b.x) < 80);

  if (closePlayers.length >= 2) {
    b.executed = true;
    b.executionWindow = false;
    b.state = "executed";
  }
}

/* ===============================
   MAIN GAME LOOP
================================ */
setInterval(() => {
  // Apply buffered inputs
  for (const id in state.players) {
    const p = state.players[id];
    const inputs = p.pendingInputs[serverFrame];
    if (inputs) {
      applyInput(p, inputs);
      delete p.pendingInputs[serverFrame];
    }
  }

  // Physics
  for (const id in state.players) {
    physicsStep(state.players[id]);
  }

  // Boss update
  updateBoss();
  checkExecutionConfirm();

  // Broadcast authoritative state
  io.emit("stateUpdate", {
    frame: serverFrame,
    players: state.players,
    boss: state.boss
  });

  serverFrame++;
}, FIXED_DT);

/* ===============================
   START
================================ */
createBoss();

server.listen(3000, () =>
  console.log("Server running at http://localhost:3000")
);
