// ================================
// SILSONG-STYLE ONLINE PvP ENGINE
// CHUNK 1 — CORE ENGINE FOUNDATION
// ================================

'use strict';

/* ===============================
   CONFIG
================================ */
const CONFIG = {
  WIDTH: 1000,
  HEIGHT: 600,
  FPS: 60,
  FIXED_DT: 1000 / 60,

  GRAVITY: 0.9,
  TERMINAL_VEL: 18,
  GROUND_Y: 520,

  INVULN_FRAMES: 18,
};

/* ===============================
   VECTOR MATH
================================ */
class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
  }

  clone() {
    return new Vec2(this.x, this.y);
  }
}

/* ===============================
   INPUT BUFFER (ROLLBACK-SAFE)
================================ */
class InputBuffer {
  constructor() {
    this.buffer = {};
    this.frame = 0;
  }

  record(playerId, input) {
    if (!this.buffer[this.frame]) this.buffer[this.frame] = {};
    this.buffer[this.frame][playerId] = JSON.parse(JSON.stringify(input));
  }

  get(frame, playerId) {
    return this.buffer[frame]?.[playerId] || {};
  }

  nextFrame() {
    this.frame++;
  }
}

/* ===============================
   ENTITY BASE CLASS
================================ */
class Entity {
  constructor(x, y, w, h) {
    this.pos = new Vec2(x, y);
    this.vel = new Vec2(0, 0);
    this.w = w;
    this.h = h;

    this.onGround = false;
  }

  applyGravity() {
    if (!this.onGround) {
      this.vel.y += CONFIG.GRAVITY;
      if (this.vel.y > CONFIG.TERMINAL_VEL) {
        this.vel.y = CONFIG.TERMINAL_VEL;
      }
    }
  }

  physics() {
    this.applyGravity();
    this.pos.add(this.vel);

    if (this.pos.y + this.h >= CONFIG.GROUND_Y) {
      this.pos.y = CONFIG.GROUND_Y - this.h;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }
}

/* ===============================
   HITBOX SYSTEM
================================ */
class Hitbox {
  constructor(
    owner,
    x, y,
    w, h,
    damage = 0,
    kbX = 0,
    kbY = 0,
    stun = 0
  ) {
    this.owner = owner;
    this.pos = new Vec2(x, y);
    this.w = w;
    this.h = h;

    this.damage = damage;
    this.kbX = kbX;
    this.kbY = kbY;
    this.stun = stun;

    this.active = true;
    this.onHit = null;
  }

  intersects(entity) {
    return !(
      this.pos.x + this.w < entity.pos.x ||
      this.pos.x > entity.pos.x + entity.w ||
      this.pos.y + this.h < entity.pos.y ||
      this.pos.y > entity.pos.y + entity.h
    );
  }
}

/* ===============================
   PLAYER
================================ */
class Player extends Entity {
  constructor(id, x) {
    super(x, CONFIG.GROUND_Y - 60, 40, 60);

    this.id = id;
    this.hp = 100;
    this.facing = 1;

    this.invuln = 0;
    this.hitstun = 0;

    this.weapon = null;
    this.comboCounter = 0;
  }

  equipWeapon(weapon) {
    this.weapon = weapon;
    weapon.owner = this;
  }

  update(input) {
    if (this.invuln > 0) this.invuln--;
    if (this.hitstun > 0) {
      this.hitstun--;
      return;
    }

    // Horizontal movement
    if (input.left) {
      this.vel.x = -4;
      this.facing = -1;
    } else if (input.right) {
      this.vel.x = 4;
      this.facing = 1;
    } else {
      this.vel.x *= 0.8;
    }

    // Jump
    if (input.jump && this.onGround) {
      this.vel.y = -14;
      this.onGround = false;
    }

    // Weapon input delegated later (Chunk 2)
    if (this.weapon) {
      this.weapon.handleInput(input);
      this.weapon.update();
    }
  }

  takeHit(hitbox) {
    if (this.invuln > 0) return;

    this.hp -= hitbox.damage;
    this.vel.x = hitbox.kbX;
    this.vel.y = hitbox.kbY;
    this.hitstun = hitbox.stun;
    this.invuln = CONFIG.INVULN_FRAMES;
  }
}

/* ===============================
   GAME CORE
================================ */
class Game {
  constructor() {
    this.players = [];
    this.hitboxes = [];
    this.inputs = new InputBuffer();
    this.frame = 0;

    // boss, damage numbers, HUD etc come later
    this.boss = null;
  }

  addPlayer(player) {
    this.players.push(player);
  }

  update() {
    // Player update
    for (const p of this.players) {
      const input = this.inputs.get(this.frame, p.id);
      p.update(input);
      p.physics();
    }

    // Hit detection
    for (const hb of this.hitboxes) {
      if (!hb.active) continue;

      for (const p of this.players) {
        if (p !== hb.owner && hb.intersects(p)) {
          p.takeHit(hb);
          if (hb.onHit) hb.onHit(p);
          hb.active = false;
        }
      }
    }

    // Cleanup
    this.hitboxes = this.hitboxes.filter(h => h.active);

    this.inputs.nextFrame();
    this.frame++;
  }
}

/* ===============================
   EXPORT
================================ */
if (typeof module !== 'undefined') {
  module.exports = {
    Game,
    Player,
    Entity,
    Hitbox,
    Vec2,
    InputBuffer,
    CONFIG
  };
}
/* ===============================
   WEAPON BASE
================================ */
class Weapon {
  constructor() {
    this.owner = null;
    this.cooldowns = {};
  }

  handleInput(_) {}
  update() {}
}

/* ===============================
   WEAPON STATE MACHINE
================================ */
class WeaponState {
  constructor(name, duration, onStart, onUpdate, onEnd) {
    this.name = name;
    this.duration = duration;
    this.onStart = onStart;
    this.onUpdate = onUpdate;
    this.onEnd = onEnd;
    this.frame = 0;
  }
}

class CombatWeapon extends Weapon {
  constructor(game) {
    super();
    this.game = game;
    this.state = null;
    this.queue = null;
  }

  setState(state) {
    this.state = state;
    state.frame = 0;
    if (state.onStart) state.onStart();
  }

  update() {
    if (!this.state) return;

    this.state.frame++;

    if (this.state.onUpdate) {
      this.state.onUpdate(this.state.frame);
    }

    if (this.state.frame >= this.state.duration) {
      if (this.state.onEnd) this.state.onEnd();
      this.state = null;

      if (this.queue) {
        const q = this.queue;
        this.queue = null;
        this.setState(q);
      }
    }
  }
}

/* ===============================
   KATANA WEAPON
================================ */
class Katana extends CombatWeapon {
  handleInput(input) {
    if (this.state) return;

    if (input.light) this.light();
    else if (input.heavy) this.heavy();
    else if (input.charge) this.chargedHeavy();
    else if (input.grab && !this.owner.onGround) this.aerialGrab();
  }

  light() {
    this.setState(new WeaponState(
      "katana_light",
      24,
      () => {
        const hb = new Hitbox(
          this.owner,
          this.owner.pos.x + this.owner.facing * 30,
          this.owner.pos.y + 15,
          40, 20,
          18,
          this.owner.facing * 6,
          -2,
          12
        );
        hb.onHit = () => {
          this.owner.comboCounter++;
        };
        this.game.hitboxes.push(hb);
      }
    ));
  }

  heavy() {
    this.setState(new WeaponState(
      "katana_heavy",
      32,
      () => {
        const hb = new Hitbox(
          this.owner,
          this.owner.pos.x + this.owner.facing * 35,
          this.owner.pos.y + 10,
          45, 30,
          22,
          this.owner.facing * 8,
          -3,
          18
        );
        hb.onHit = () => {
          this.owner.comboCounter += 2;
        };
        this.game.hitboxes.push(hb);
      }
    ));
  }

  chargedHeavy() {
    this.setState(new WeaponState(
      "katana_charged",
      48,
      null,
      frame => {
        if (frame === 40) {
          const hb = new Hitbox(
            this.owner,
            this.owner.pos.x + this.owner.facing * 25,
            this.owner.pos.y,
            60, 40,
            28,
            this.owner.facing * 10,
            -4,
            24
          );
          hb.onHit = () => {
            this.owner.comboCounter += 3;
          };
          this.game.hitboxes.push(hb);
        }
      }
    ));
  }

  aerialGrab() {
    this.setState(new WeaponState(
      "katana_aerial_grab",
      40,
      () => {
        const hb = new Hitbox(
          this.owner,
          this.owner.pos.x + this.owner.facing * 20,
          this.owner.pos.y + 20,
          30, 30,
          0,
          0,
          0,
          30
        );

        hb.onHit = target => {
          target.vel.y = 14;
          target.hp -= 40;
          this.owner.comboCounter += 4;
        };

        this.game.hitboxes.push(hb);
      }
    ));
  }
}

/* ===============================
   GAME HELPERS
================================ */
Game.prototype.spawnKatanaFor = function(player) {
  const katana = new Katana(this);
  player.equipWeapon(katana);
};

/* ===============================
   EXPORT UPDATE
================================ */
if (typeof module !== 'undefined') {
  module.exports = {
    Game,
    Player,
    Entity,
    Hitbox,
    Vec2,
    InputBuffer,
    Weapon,
    CombatWeapon,
    WeaponState,
    Katana,
    CONFIG
  };
}
// ===============================
// CHUNK 3 — BOSS, EXECUTION, HUD
// ===============================

// ---------- CAMERA ----------
let camera = {
  x: 0,
  y: 0,
  shake: 0
};

function applyCameraShake(intensity = 6) {
  camera.shake = Math.max(camera.shake, intensity);
}

function updateCamera(target) {
  camera.x = target.x - canvas.width / 2;
  camera.y = target.y - canvas.height / 2;

  if (camera.shake > 0) {
    camera.x += (Math.random() - 0.5) * camera.shake;
    camera.y += (Math.random() - 0.5) * camera.shake;
    camera.shake *= 0.85;
  }
}

// ---------- BOSS ----------
function drawBoss(boss) {
  if (!boss) return;

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Body
  ctx.fillStyle = boss.executionWindow ? "#ff3333" : "#aa2222";
  ctx.fillRect(boss.x - 60, boss.y - 80, 120, 160);

  // Armor bar
  ctx.fillStyle = "#444";
  ctx.fillRect(boss.x - 60, boss.y - 100, 120, 8);
  ctx.fillStyle = "#00aaff";
  ctx.fillRect(
    boss.x - 60,
    boss.y - 100,
    120 * (boss.armor / 100),
    8
  );

  // HP bar
  ctx.fillStyle = "#333";
  ctx.fillRect(boss.x - 60, boss.y - 115, 120, 10);
  ctx.fillStyle = "#ff2222";
  ctx.fillRect(
    boss.x - 60,
    boss.y - 115,
    120 * (boss.hp / 500),
    10
  );

  // Execution marker
  if (boss.executionWindow) {
    ctx.strokeStyle = "#ffff00";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, 90, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ---------- EXECUTION UI ----------
function drawExecutionPrompt(boss) {
  if (!boss.executionWindow) return;

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "EXECUTE TOGETHER!",
    canvas.width / 2,
    80
  );

  ctx.font = "18px sans-serif";
  ctx.fillText(
    "Both players must be close",
    canvas.width / 2,
    110
  );
}

// ---------- HUD ----------
function drawHUD() {
  hud.innerHTML = "";

  const me = players[myId];
  if (!me) return;

  // Player HP
  const hpBar = document.createElement("div");
  hpBar.style.margin = "8px";
  hpBar.innerHTML = `
    <div>HP</div>
    <div style="width:200px;height:10px;background:#333">
      <div style="width:${me.hp * 2}px;height:10px;background:#0f0"></div>
    </div>
  `;
  hud.appendChild(hpBar);

  // Boss info
  if (boss) {
    const bossBar = document.createElement("div");
    bossBar.style.margin = "8px";
    bossBar.innerHTML = `
      <div>BOSS</div>
      <div style="width:300px;height:12px;background:#333">
        <div style="width:${boss.hp * 0.6}px;height:12px;background:#f00"></div>
      </div>
    `;
    hud.appendChild(bossBar);

    if (boss.executionWindow) {
      const exec = document.createElement("div");
      exec.style.color = "#ff0";
      exec.innerText = "EXECUTION WINDOW ACTIVE";
      hud.appendChild(exec);
    }
  }
}
// -------------------------------
// GENERALIZED CO-OP EXECUTIONS
// -------------------------------

Game.prototype.checkExecutionWindow = function() {
  if (!this.boss || !this.boss.executionWindow) return;

  const EXEC_RADIUS = 80;      // distance from boss
  const REQUIRED_PLAYERS = Math.min(2, this.players.length); // can scale with more players

  // Count players in range
  const inRange = this.players.filter(p => p.hp > 0 && distance(p, this.boss) <= EXEC_RADIUS);

  if (inRange.length >= REQUIRED_PLAYERS) {
    // Trigger execution
    this.boss.executionWindow = false;
    this.boss.executed = true;
    this.boss.state = "executing";
    this.boss.executionTimer = 120;

    // Apply execution effects to all in-range players
    inRange.forEach(p => {
      // Reset player state and HP
      p.hp = 0;
      p.invuln = 0;
      p.vel = new Vec2(0, -6); // cinematic lift
      console.log(`Player ${p.id} executed!`);
      Cinematic.focus(p);
    });

    // Co-op prompt for surviving players
    const survivors = this.players.filter(p => p.hp > 0);
    if (survivors.length > 0) {
      Cinematic.coOpPrompt(survivors);
    }

    // Camera shake
    applyCameraShake(16);
  }
};

// ---------- STATE HANDLING ----------
function handleBossState(boss) {
  if (!boss) return;

  if (boss.executed) {
    applyCameraShake(12);
  }

  if (boss.state === "executing") {
    applyCameraShake(8);
  }
}

// ---------- MAIN DRAW EXTENSION ----------
const originalDraw = draw;

draw = function () {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const me = players[myId];
  if (me) updateCamera(me);

  // World
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Ground
  ctx.fillStyle = "#333";
  ctx.fillRect(-2000, 420, 4000, 200);

  // Players
  for (const id in players) {
    drawPlayer(players[id]);
  }

  ctx.restore();

  // Boss
  drawBoss(boss);

  // UI
  if (boss) drawExecutionPrompt(boss);
  drawHUD();
};
// ================================
// CHUNK 4 — COMBAT, HITBOXES, STAGGER, DAMAGE SYNC
// ================================

// -------------------------------
// HITBOX CLASS
// -------------------------------
class Hitbox {
  constructor(owner, x, y, w, h, damage = 10, kbX = 0, kbY = -2, stun = 10) {
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.damage = damage;
    this.kbX = kbX;
    this.kbY = kbY;
    this.stun = stun;
    this.active = true;
    this.onHit = null;
  }

  intersects(entity) {
    return !(
      entity.pos.x + entity.w < this.x ||
      entity.pos.x > this.x + this.w ||
      entity.pos.y + entity.h < this.y ||
      entity.pos.y > this.y + this.h
    );
  }
}

// -------------------------------
// DAMAGE APPLICATION
// -------------------------------
Game.prototype.applyHit = function(hitbox, target) {
  if (!hitbox.active) return;
  if (target.invuln > 0) return;

  // Apply damage
  target.hp -= hitbox.damage;
  target.vel.x = hitbox.kbX;
  target.vel.y = hitbox.kbY;
  target.hitstun = hitbox.stun;
  target.invuln = CONFIG.INVULN_FRAMES;

  // Stagger buildup for boss
  if (target instanceof Boss) {
    target.stagger = (target.stagger || 0) + hitbox.damage;
    if (target.stagger >= (target.staggerThreshold || 100)) {
      target.stagger = 0;
      target.state = "staggered";
      applyCameraShake(12);
      console.log("Boss staggered!");
    }
  }

  // Combo increment for player
  if (hitbox.owner instanceof Player) {
    hitbox.owner.comboCounter = (hitbox.owner.comboCounter || 0) + 1;
  }

  // Trigger onHit callback
  if (hitbox.onHit) hitbox.onHit(target);

  // Mark hitbox as consumed
  hitbox.active = false;

  // Spawn floating damage
  this.spawnDamage(target.pos.x + target.w / 2, target.pos.y, hitbox.damage);

  // Sync damage over network
  if (typeof socket !== "undefined") {
    socket.emit("playerHit", {
      targetId: target.id,
      damage: hitbox.damage,
      kbX: hitbox.kbX,
      kbY: hitbox.kbY
    });
  }
};

// -------------------------------
// HIT DETECTION LOOP
// -------------------------------
Game.prototype.updateHitboxes = function() {
  for (const hb of this.hitboxes) {
    if (!hb.active) continue;

    // Player vs Player
    for (const p of this.players) {
      if (p !== hb.owner) this.applyHit(hb, p);
    }

    // Player vs Boss
    if (this.boss && hb.owner instanceof Player) this.applyHit(hb, this.boss);

    // Boss vs Players
    if (hb.owner instanceof Boss) {
      for (const p of this.players) this.applyHit(hb, p);
    }
  }

  // Remove inactive hitboxes
  this.hitboxes = this.hitboxes.filter(h => h.active);
};

// -------------------------------
// COMBO & HITSTUN MANAGEMENT
// -------------------------------
Game.prototype.updatePlayerCombat = function() {
  for (const p of this.players) {
    if (p.hitstun > 0) {
      p.hitstun--;
      // prevent input during hitstun
      continue;
    }
    // reset combo if idle
    if (p.state === "idle" && p.comboCounter > 0) p.comboCounter = 0;
  }
};

// -------------------------------
// STAGGER & DAMAGE SYNC
// -------------------------------
Game.prototype.updateBossCombat = function() {
  if (!this.boss) return;

  // Reduce stagger gradually
  if (this.boss.stagger > 0 && this.boss.state !== "staggered") {
    this.boss.stagger -= 0.2;
  }

  // Exit stagger after timer
  if (this.boss.state === "staggered") {
    if (!this.boss.staggerTimer) this.boss.staggerTimer = 40;
    this.boss.staggerTimer--;
    if (this.boss.staggerTimer <= 0) {
      this.boss.state = "idle";
      this.boss.staggerTimer = null;
    }
  }
};

// -------------------------------
// SPAWN HITBOX UTILITY
// -------------------------------
Game.prototype.spawnHitbox = function(owner, x, y, w, h, damage = 10, kbX = 0, kbY = -2, stun = 10, onHit = null) {
  const hb = new Hitbox(owner, x, y, w, h, damage, kbX, kbY, stun);
  hb.onHit = onHit;
  this.hitboxes.push(hb);
  return hb;
};

// -------------------------------
// MAIN UPDATE EXTENSIONS
// -------------------------------
const updateOriginal = Game.prototype.update;
Game.prototype.update = function() {
  // Base update (movement, inputs, physics)
  updateOriginal.call(this);

  // Combat
  this.updateHitboxes();
  this.updatePlayerCombat();
  this.updateBossCombat();
  this.checkExecutionWindow();
  this.checkCoOpFinisher();
};
// ================================
// CHUNK 5 — ANIMATIONS, WEAPON ARCS, PARTICLES
// ================================

// -------------------------------
// SPRITE / ARC PLACEHOLDER
// -------------------------------
class WeaponArc {
  constructor(owner, x, y, radius, angleStart, angleEnd, duration) {
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.angleStart = angleStart;
    this.angleEnd = angleEnd;
    this.duration = duration;
    this.frame = 0;
    this.active = true;
  }

  update() {
    this.frame++;
    if (this.frame >= this.duration) this.active = false;
  }

  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, this.angleStart, this.angleEnd);
    ctx.stroke();
    ctx.restore();
  }
}

// -------------------------------
// GAME ARC & PARTICLE MANAGEMENT
// -------------------------------
Game.prototype.weaponArcs = [];
Game.prototype.particles = [];

Game.prototype.spawnArc = function(owner, radius = 50, start = 0, end = Math.PI / 2, duration = 12) {
  const arc = new WeaponArc(owner, owner.pos.x + owner.w/2, owner.pos.y + owner.h/2, radius, start, end, duration);
  this.weaponArcs.push(arc);
  return arc;
};

Game.prototype.spawnParticle = function(x, y, color = "orange") {
  const p = {
    pos: new Vec2(x, y),
    vel: new Vec2((Math.random() - 0.5) * 3, -Math.random() * 3),
    life: 30,
    color: color
  };
  this.particles.push(p);
  return p;
};

// -------------------------------
// PARTICLE UPDATE & DRAW
// -------------------------------
Game.prototype.updateParticles = function(ctx) {
  this.particles.forEach(p => {
    p.pos.add(p.vel);
    p.vel.y += 0.15; // gravity
    ctx.fillStyle = p.color;
    ctx.fillRect(p.pos.x, p.pos.y, 4, 4);
    p.life--;
  });
  this.particles = this.particles.filter(p => p.life > 0);
};

// -------------------------------
// WEAPON ARC UPDATE & DRAW
// -------------------------------
Game.prototype.updateArcs = function(ctx) {
  this.weaponArcs.forEach(a => {
    a.update();
    a.draw(ctx);
  });
  this.weaponArcs = this.weaponArcs.filter(a => a.active);
};

// -------------------------------
// INTEGRATE VISUALS INTO WEAPON ATTACKS
// -------------------------------
CombatWeapon.prototype.spawnVisualHit = function(hitbox) {
  const x = hitbox.x + hitbox.w / 2;
  const y = hitbox.y + hitbox.h / 2;

  // Spawn arc
  const radius = Math.max(hitbox.w, hitbox.h);
  const startAngle = 0;
  const endAngle = Math.PI * (Math.random() * 0.5 + 0.25);
  game.spawnArc(this.owner, radius, startAngle, endAngle, 10);

  // Spawn particle explosion
  for (let i = 0; i < 5; i++) {
    game.spawnParticle(x, y, "yellow");
  }

  // Spawn floating damage
  game.spawnDamage(x, y, hitbox.damage);
};

// -------------------------------
// HOOK COMBAT HIT FOR VISUALS
// -------------------------------
const originalApplyHit = Game.prototype.applyHit;
Game.prototype.applyHit = function(hitbox, target) {
  originalApplyHit.call(this, hitbox, target);

  // spawn visuals if hit registered
  if (!hitbox.active) this.spawnVisualHit(hitbox);
};

// -------------------------------
// PLAYER ANIMATION STATE
// -------------------------------
Player.prototype.draw = function(ctx) {
  ctx.save();
  ctx.fillStyle = "blue";
  if (this.hitstun > 0) ctx.fillStyle = "red";
  ctx.translate(this.pos.x + this.w/2, this.pos.y + this.h/2);
  ctx.scale(this.facing, 1);
  ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
  ctx.restore();
};

// -------------------------------
// BOSS ANIMATION STATE
// -------------------------------
Boss.prototype.draw = function(ctx) {
  ctx.save();
  ctx.fillStyle = "purple";
  if (this.state === "staggered") ctx.fillStyle = "orange";
  ctx.fillRect(this.pos.x, this.pos.y, this.w, this.h);
  ctx.restore();
};

// -------------------------------
// HUD & DAMAGE DRAW HOOKS
// -------------------------------
Game.prototype.draw = function(ctx) {
  ctx.clearRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

  // Draw players
  this.players.forEach(p => p.draw(ctx));

  // Draw boss
  if (this.boss) this.boss.draw(ctx);

  // Draw weapon arcs
  this.updateArcs(ctx);

  // Draw particles
  this.updateParticles(ctx);

  // Draw floating damage
  this.updateDamageNumbers(ctx);

  // Draw HUD
  HUD.draw(ctx, this.players);
};

// -------------------------------
// MAIN GAME LOOP (CLIENT-SIDE)
// -------------------------------
function startGameLoop(canvas, game) {
  const ctx = canvas.getContext("2d");
  function loop() {
    game.update();
    game.draw(ctx);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// -------------------------------
// EXPORT VISUALS / ANIMATION MODULE
// -------------------------------
if (typeof module !== 'undefined') {
  module.exports = { WeaponArc };
}
// ================================
// CHUNK 6 — NETWORK SYNC & ROLLBACK
// ================================

// -------------------------------
// PLAYER INPUT COLLECTION
// -------------------------------
class NetworkInput {
  constructor() {
    this.pendingInputs = {}; // frame -> {playerId: input}
    this.lastFrame = 0;
  }

  record(frame, playerId, keys) {
    if (!this.pendingInputs[frame]) this.pendingInputs[frame] = {};
    this.pendingInputs[frame][playerId] = JSON.parse(JSON.stringify(keys));
    if (frame > this.lastFrame) this.lastFrame = frame;
  }

  get(frame, playerId) {
    return this.pendingInputs[frame]?.[playerId] || {};
  }

  cleanup(upToFrame) {
    for (let f in this.pendingInputs) {
      if (f <= upToFrame) delete this.pendingInputs[f];
    }
  }
}

// -------------------------------
// SERVER-AUTHORITATIVE LOOP
// -------------------------------
class PvPServer {
  constructor(io, game) {
    this.io = io;
    this.game = game;
    this.frame = 0;
    this.players = {}; // socketId -> player data
    this.TICK_RATE = 60;

    this.io.on("connection", socket => this.handleConnect(socket));

    setInterval(() => this.tick(), 1000 / this.TICK_RATE);
  }

  handleConnect(socket) {
    console.log(`Player connected: ${socket.id}`);
    this.players[socket.id] = { id: socket.id, inputBuffer: new NetworkInput() };

    // assign player to game if slot free
    const freePlayer = this.game.players.find(p => !p.id);
    if (freePlayer) freePlayer.id = socket.id;

    socket.on("playerInput", data => {
      this.players[socket.id].inputBuffer.record(data.frame, socket.id, data.keys);
    });

    socket.on("disconnect", () => {
      console.log(`Player disconnected: ${socket.id}`);
      delete this.players[socket.id];
      // remove player from game
      const p = this.game.players.find(p=>p.id===socket.id);
      if(p) p.id = null;
    });
  }

  tick() {
    // Apply inputs for this frame
    for (let p of this.game.players) {
      if (!p.id) continue;
      const input = this.players[p.id].inputBuffer.get(this.frame, p.id) || {};
      this.game.inputs.record(p.id, input);
    }

    // Update game
    this.game.update();

    // Broadcast authoritative state
    this.io.emit("stateUpdate", {
      frame: this.frame,
      players: this.game.players.map(p => ({
        id: p.id,
        x: p.pos.x,
        y: p.pos.y,
        hp: p.hp,
        facing: p.facing,
        weapon: p.weapon ? p.weapon.constructor.name : null
      })),
      boss: this.game.boss ? {
        x: this.game.boss.pos.x,
        y: this.game.boss.pos.y,
        hp: this.game.boss.hp,
        state: this.game.boss.state,
        executionWindow: this.game.boss.executionWindow
      } : null,
      hitboxes: this.game.hitboxes.map(hb => ({
        x: hb.x, y: hb.y, w: hb.w, h: hb.h, active: hb.active
      }))
    });

    // Clean old inputs
    for (let id in this.players) {
      this.players[id].inputBuffer.cleanup(this.frame - 60); // keep 1 sec of history
    }

    this.frame++;
  }
}

// -------------------------------
// CLIENT-RENDER LOOP & INPUT SEND
// -------------------------------
class PvPClient {
  constructor(socket, playerId, game) {
    this.socket = socket;
    this.playerId = playerId;
    this.game = game;
    this.frame = 0;
    this.keyState = {};
    this.setupInputListeners();
  }

  setupInputListeners() {
    window.addEventListener("keydown", e => this.keyState[e.code] = true);
    window.addEventListener("keyup", e => this.keyState[e.code] = false);
  }

  sendInput() {
    this.socket.emit("playerInput", {
      frame: this.frame,
      keys: this.keyState
    });
  }

  update() {
    // Send input to server each frame
    this.sendInput();
    this.frame++;
  }

  handleStateUpdate(state) {
    // Authoritative positions from server
    for (const pData of state.players) {
      const p = this.game.players.find(pl => pl.id === pData.id);
      if (!p) continue;
      p.pos.x = pData.x;
      p.pos.y = pData.y;
      p.hp = pData.hp;
      p.facing = pData.facing;
      if (p.weapon && p.weapon.constructor.name !== pData.weapon) {
        // optional: swap weapon
        switch(pData.weapon){
          case "Katana": p.equipWeapon(new Katana()); break;
          case "LongSword": p.equipWeapon(new LongSword()); break;
          case "Scythe": p.equipWeapon(new Scythe()); break;
          case "FistTanto": p.equipWeapon(new FistTanto()); break;
        }
      }
    }

    // Boss update
    if (state.boss && this.game.boss) {
      this.game.boss.pos.x = state.boss.x;
      this.game.boss.pos.y = state.boss.y;
      this.game.boss.hp = state.boss.hp;
      this.game.boss.state = state.boss.state;
      this.game.boss.executionWindow = state.boss.executionWindow;
    }
  }
}

// -------------------------------
// HELPER FUNCTIONS
// -------------------------------
function distance(a,b){ return Math.hypot(a.pos.x-b.pos.x, a.pos.y-b.pos.y); }
function applyCameraShake(intensity){ console.log("Camera shake", intensity); }

// -------------------------------
// EXPORT NETWORK MODULE
// -------------------------------
if (typeof module !== 'undefined') {
  module.exports = { PvPServer, PvPClient };
}
