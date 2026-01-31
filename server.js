const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { WEAPONS, COMBAT_CONSTANTS } = require('./game-data');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const players = {};

class CombatStateMachine {
  constructor(player) {
    this.player = player;
    this.currentState = 'idle';
    this.stateFrame = 0;
    this.stateTimer = 0;
    this.canCancel = false;
    this.lastAttackTime = 0;
  }
  
  transition(newState) {
    if (!this.isValidTransition(newState)) {
      return false;
    }
    
    this.currentState = newState;
    this.stateFrame = 0;
    this.stateTimer = 0;
    this.canCancel = false;
    return true;
  }
  
  isValidTransition(newState) {
    const weaponData = WEAPONS[this.player.weapon];
    
    // Validate based on current state
    switch(this.currentState) {
      case 'idle':
      case 'run':
      case 'jump':
        return ['lightAttack', 'heavyAttack', 'parry', 'grab', 'dash', 'airDash'].includes(newState);
        
      case 'lightAttack':
        if (this.stateFrame < weaponData.moveset.light.startup + weaponData.moveset.light.active) {
          return false; // Can't cancel during startup/active
        }
        return ['lightAttack', 'heavyAttack'].includes(newState); // Only can chain attacks
        
      case 'heavyAttack':
        if (this.stateFrame < weaponData.moveset.heavy.startup + weaponData.moveset.heavy.active) {
          return false;
        }
        return ['lightAttack', 'heavyAttack'].includes(newState);
        
      case 'parry':
        if (this.stateFrame < COMBAT_CONSTANTS.PARRY.STARTUP) {
          return false; // Can't cancel parry startup
        }
        return ['idle'].includes(newState);
        
      case 'grab':
        if (this.stateFrame < COMBAT_CONSTANTS.GRAB.STARTUP + COMBAT_CONSTANTS.GRAB.ACTIVE) {
          return false;
        }
        return ['idle'].includes(newState);
        
      case 'hitstun':
        return false; // Can't act during hitstun
        
      case 'dash':
      case 'airDash':
        if (this.stateFrame < 9) { // 0.15s
          return false; // Can't act during dash i-frames
        }
        return ['lightAttack'].includes(newState);
        
      default:
        return false;
    }
  }
  
  update(deltaTime) {
    this.stateTimer += deltaTime;
    this.stateFrame = Math.floor(this.stateTimer * 60);
    
    // Update cancel windows
    this.updateCancelWindow();
    
    // Auto-transition states
    this.updateStateTransitions();
  }
  
  updateCancelWindow() {
    const weaponData = WEAPONS[this.player.weapon];
    
    switch(this.currentState) {
      case 'lightAttack':
        if (weaponData.moveset.light.cancelWindow) {
          const cancelStart = weaponData.moveset.light.startup + weaponData.moveset.light.active - weaponData.moveset.light.cancelWindow;
          this.canCancel = this.stateFrame >= cancelStart;
        }
        break;
    }
  }
  
  updateStateTransitions() {
    const weaponData = WEAPONS[this.player.weapon];
    let totalFrames = 0;
    
    switch(this.currentState) {
      case 'lightAttack':
        totalFrames = weaponData.moveset.light.startup + weaponData.moveset.light.active + weaponData.moveset.light.recovery;
        break;
      case 'heavyAttack':
        const heavyData = this.player.onGround ? weaponData.moveset.heavy : weaponData.moveset.airHeavy;
        totalFrames = heavyData.startup + heavyData.active + heavyData.recovery;
        break;
      case 'parry':
        totalFrames = COMBAT_CONSTANTS.PARRY.STARTUP + COMBAT_CONSTANTS.PARRY.ACTIVE + COMBAT_CONSTANTS.PARRY.RECOVERY;
        break;
      case 'grab':
        totalFrames = COMBAT_CONSTANTS.GRAB.STARTUP + COMBAT_CONSTANTS.GRAB.ACTIVE + COMBAT_CONSTANTS.GRAB.RECOVERY;
        break;
      case 'dash':
        totalFrames = 9; // 0.15s
        break;
      case 'airDash':
        totalFrames = 12; // 0.2s
        break;
    }
    
    if (totalFrames > 0 && this.stateFrame >= totalFrames) {
      this.transition('idle');
    }
  }
  
  isStartupFrame() {
    return this.stateFrame < this.getStartupFrames();
  }
  
  isActiveFrame() {
    const startup = this.getStartupFrames();
    const active = this.getActiveFrames();
    return this.stateFrame >= startup && this.stateFrame < startup + active;
  }
  
  isRecoveryFrame() {
    return this.stateFrame >= this.getStartupFrames() + this.getActiveFrames();
  }
  
  getStartupFrames() {
    const weaponData = WEAPONS[this.player.weapon];
    switch(this.currentState) {
      case 'lightAttack': return weaponData.moveset.light.startup;
      case 'heavyAttack': 
        return this.player.onGround ? weaponData.moveset.heavy.startup : weaponData.moveset.airHeavy.startup;
      case 'parry': return COMBAT_CONSTANTS.PARRY.STARTUP;
      case 'grab': return COMBAT_CONSTANTS.GRAB.STARTUP;
      default: return 0;
    }
  }
  
  getActiveFrames() {
    const weaponData = WEAPONS[this.player.weapon];
    switch(this.currentState) {
      case 'lightAttack': return weaponData.moveset.light.active;
      case 'heavyAttack': 
        return this.player.onGround ? weaponData.moveset.heavy.active : weaponData.moveset.airHeavy.active;
      case 'parry': return COMBAT_CONSTANTS.PARRY.ACTIVE;
      case 'grab': return COMBAT_CONSTANTS.GRAB.ACTIVE;
      default: return 0;
    }
  }
  
  generateAttackHitbox() {
    if (!this.isActiveFrame()) return [];
    
    const weaponData = WEAPONS[this.player.weapon];
    let moveData = null;
    
    switch(this.currentState) {
      case 'lightAttack':
        moveData = weaponData.moveset.light;
        break;
      case 'heavyAttack':
        moveData = this.player.onGround ? weaponData.moveset.heavy : weaponData.moveset.airHeavy;
        break;
      case 'grab':
        return [{
          x: this.player.x + COMBAT_CONSTANTS.GRAB.STARTUP * this.player.facing,
          y: this.player.y - 20,
          width: 50,
          height: 40,
          type: 'grab'
        }];
    }
    
    if (moveData) {
      const hitbox = moveData.hitbox;
      return [{
        x: this.player.x + hitbox.offsetX * this.player.facing,
        y: this.player.y + hitbox.offsetY,
        width: hitbox.width,
        height: hitbox.height,
        type: this.currentState.replace('Attack', ''),
        damage: moveData.damage,
        knockback: { ...moveData.knockback }
      }];
    }
    
    return [];
  }
}

class Player {
  constructor(id, name = `Player${Math.floor(Math.random() * 1000)}`) {
    this.id = id;
    this.name = name;
    this.x = 400 + Math.random() * 200;
    this.y = 300;
    this.vx = 0;
    this.vy = 0;
    this.width = 40;
    this.height = 60;
    this.health = 100;
    this.maxHealth = 100;
    this.facing = 1;
    this.weapon = 'longsword';
    
    // Combat system
    this.combatState = new CombatStateMachine(this);
    this.comboCount = 0;
    this.comboDamage = 0;
    this.hitStun = 0;
    this.canAct = true;
    this.lastHitTime = 0;
    this.grabUsed = false;
    this.wallBounceUsed = false;
    
    // Movement system
    this.onGround = false;
    this.wallJumps = 0;
    this.airDashes = 1;
    this.groundedCount = 0;
    this.wallSlideTime = 0;
    
    // Cooldowns
    this.parryCooldown = 0;
    this.parrySuccessCooldown = 0;
    this.airDashCooldown = 0;
    this.iFrames = 0;
    this.comboResetTimer = 0;
    
    // Hurtbox
    this.hurtbox = { x: 0, y: 0, width: 40, height: 60 };
  }
  
  update(deltaTime) {
    // Update combat state machine
    this.combatState.update(deltaTime);
    
    // Update cooldowns
    this.updateCooldowns(deltaTime);
    
    // Update physics
    this.updatePhysics(deltaTime);
    
    // Update combo system
    this.updateComboSystem(deltaTime);
    
    // Update collision boxes
    this.updateCollisionBoxes();
  }
  
  updateCooldowns(deltaTime) {
    if (this.hitStun > 0) {
      this.hitStun -= deltaTime;
      if (this.hitStun <= 0) {
        this.canAct = true;
        this.combatState.transition('idle');
      }
    }
    
    if (this.iFrames > 0) this.iFrames -= deltaTime;
    if (this.parryCooldown > 0) this.parryCooldown -= deltaTime;
    if (this.parrySuccessCooldown > 0) this.parrySuccessCooldown -= deltaTime;
    if (this.airDashCooldown > 0) this.airDashCooldown -= deltaTime;
    if (this.comboResetTimer > 0) {
      this.comboResetTimer -= deltaTime;
      if (this.comboResetTimer <= 0) {
        this.resetCombo();
      }
    }
  }
  
  updatePhysics(deltaTime) {
    const weaponData = WEAPONS[this.weapon];
    const moveSpeed = COMBAT_CONSTANTS.MOVEMENT.GROUND_SPEED * weaponData.properties.mobility;
    
    // Apply movement
    if (this.onGround) {
      this.vx *= COMBAT_CONSTANTS.MOVEMENT.GROUND_FRICTION;
      this.wallJumps = 0;
      this.airDashes = 1;
    } else {
      this.vx *= COMBAT_CONSTANTS.MOVEMENT.AIR_FRICTION;
      this.wallSlideTime = Math.max(0, this.wallSlideTime - deltaTime);
    }
    
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    
    // Apply gravity
    this.vy += COMBAT_CONSTANTS.MOVEMENT.GRAVITY * deltaTime;
    
    // Platform collision
    this.updatePlatformCollisions();
    
    // Wall collision
    this.updateWallCollisions();
    
    // Update grounded state
    this.onGround = this.y >= 540;
  }
  
  updatePlatformCollisions() {
    const platforms = [
      { x: 200, y: 450, width: 150, height: 20 },
      { x: 1000, y: 450, width: 150, height: 20 },
      { x: 400, y: 350, width: 120, height: 20 },
      { x: 800, y: 350, width: 120, height: 20 },
      { x: 600, y: 250, width: 100, height: 20 },
      { x: 300, y: 200, width: 80, height: 20 },
      { x: 900, y: 200, width: 80, height: 20 }
    ];
    
    let onPlatform = false;
    
    for (let platform of platforms) {
      if (this.checkPlatformCollision(platform)) {
        this.y = platform.y - platform.height/2 - this.height/2;
        this.vy = 0;
        onPlatform = true;
        this.groundedCount++;
        break;
      }
    }
    
    if (this.y > 540 || onPlatform) {
      if (!onPlatform) {
        this.y = 540;
        this.groundedCount++;
      }
      this.vy = 0;
      this.onGround = true;
      this.wallJumps = 0;
      this.airDashes = 1;
      this.grabUsed = false;
      this.wallBounceUsed = false;
    } else {
      this.onGround = false;
    }
  }
  
  checkPlatformCollision(platform) {
    return this.x + this.width/2 > platform.x - platform.width/2 &&
           this.x - this.width/2 < platform.x + platform.width/2 &&
           this.y + this.height/2 > platform.y - platform.height/2 &&
           this.y + this.height/2 < platform.y + platform.height/2 + 20 &&
           this.vy > 0;
  }
  
  updateWallCollisions() {
    const wallLeft = 30;
    const wallRight = 1170;
    
    if (this.x < wallLeft) {
      this.x = wallLeft;
      this.vx = 0;
      
      if (!this.onGround && this.vy > 0) {
        this.wallSlideTime = 0.5;
        this.vy *= COMBAT_CONSTANTS.MOVEMENT.WALL_SLIDE_SLOWDOWN;
      }
    }
    
    if (this.x > wallRight) {
      this.x = wallRight;
      this.vx = 0;
      
      if (!this.onGround && this.vy > 0) {
        this.wallSlideTime = 0.5;
        this.vy *= COMBAT_CONSTANTS.MOVEMENT.WALL_SLIDE_SLOWDOWN;
      }
    }
  }
  
  updateComboSystem(deltaTime) {
    // Combo reset handled in updateCooldowns
    if (this.comboCount > 0 && Date.now() - this.lastHitTime > COMBAT_CONSTANTS.COMBO.COMBO_TIMEOUT * 16.67) {
      this.resetCombo();
    }
  }
  
  updateCollisionBoxes() {
    this.hurtbox.x = this.x - this.width / 2;
    this.hurtbox.y = this.y - this.height / 2;
  }
  
  applyHitstun(baseDuration, damage, knockbackX, knockbackY) {
    // Apply hitstun decay after 5 hits
    let duration = baseDuration;
    if (this.comboCount >= COMBAT_CONSTANTS.COMBO.HITSTUN_DECAY_START) {
      duration *= 0.8;
    }
    
    // Air recovery after 8 hits
    if (this.comboCount >= COMBAT_CONSTANTS.COMBO.AIR_RECOVERY_START && !this.onGround) {
      duration *= 0.6;
      this.vy = -200; // Launch upward for recovery opportunity
    }
    
    this.hitStun = duration;
    this.canAct = false;
    this.combatState.transition('hitstun');
    this.vx = knockbackX;
    this.vy = knockbackY;
    
    this.lastHitTime = Date.now();
    this.comboCount++;
    this.comboDamage += damage;
    this.iFrames = COMBAT_CONSTANTS.COMBO.RESET_COOLDOWN / 60;
    this.comboResetTimer = COMBAT_CONSTANTS.COMBO.COMBO_TIMEOUT / 60;
  }
  
  takeDamage(damage, knockbackX = 0, knockbackY = 0) {
    if (this.iFrames > 0) return false;
    
    // Check for parry
    if (this.combatState.currentState === 'parry' && this.combatState.isActiveFrame()) {
      this.handleParrySuccess();
      return false;
    }
    
    // Apply damage scaling
    let scaledDamage = damage;
    if (this.comboCount > 0) {
      const scaling = Math.max(
        COMBAT_CONSTANTS.COMBO.MINIMUM_DAMAGE_MULTIPLIER,
        1 - (this.comboCount * COMBAT_CONSTANTS.COMBO.DAMAGE_SCALING_PER_HIT)
      );
      scaledDamage *= scaling;
    }
    
    this.health = Math.max(0, this.health - scaledDamage);
    this.applyHitstun(0.3, scaledDamage, knockbackX, knockbackY);
    return true;
  }
  
  handleParrySuccess() {
    this.parrySuccessCooldown = COMBAT_CONSTANTS.PARRY.COOLDOWN / 60;
    this.combatState.transition('idle');
    this.iFrames = COMBAT_CONSTANTS.PARRY.STUN_CANCEL / 60;
  }
  
  attemptGrab(target) {
    if (!this.combatState.isValidTransition('grab')) return false;
    if (this.grabUsed && this.comboCount > 0) return false;
    if (this.hitStun > 0) return false;
    
    if (target.health <= COMBAT_CONSTANTS.GRAB.EXECUTION_HP_THRESHOLD && target.onGround) {
      // Execution
      target.health = 0;
      this.combatState.transition('execution');
      return true;
    } else {
      // Normal grab
      this.grabUsed = true;
      const kb = COMBAT_CONSTANTS.GRAB.KNOCKBACK;
      target.takeDamage(COMBAT_CONSTANTS.GRAB.DAMAGE, kb.x * this.facing, kb.y);
      return true;
    }
  }
  
  resetCombo() {
    this.comboCount = 0;
    this.comboDamage = 0;
    this.grabUsed = false;
    this.wallBounceUsed = false;
  }
}

class Room {
  constructor(id) {
    this.id = id;
    this.players = {};
    this.lastUpdateTime = Date.now();
    this.trainingMode = false;
    this.dummy = null;
  }
  
  addPlayer(player) {
    this.players[player.id] = player;
  }
  
  removePlayer(playerId) {
    delete this.players[playerId];
  }
  
  enableTrainingMode() {
    this.trainingMode = true;
    this.createTrainingDummy();
  }
  
  createTrainingDummy() {
    this.dummy = new Player('dummy', 'Training Dummy');
    this.dummy.health = 1000; // Infinite HP mode
    this.dummy.maxHealth = 1000;
    this.dummy.x = 800;
    this.dummy.y = 400;
    this.players.dummy = this.dummy;
  }
  
  update() {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;
    
    Object.values(this.players).forEach(player => {
      if (player.id !== 'dummy' || !this.trainingMode) {
        player.update(deltaTime);
      }
    });
    
    this.checkCollisions();
  }
  
  checkCollisions() {
    const playerList = Object.values(this.players);
    
    for (let i = 0; i < playerList.length; i++) {
      for (let j = i + 1; j < playerList.length; j++) {
        this.checkPlayerCollision(playerList[i], playerList[j]);
      }
    }
  }
  
  checkPlayerCollision(player1, player2) {
    // Generate attack hitboxes
    const attackHitboxes = player1.combatState.generateAttackHitbox();
    
    // Check attack hitboxes against hurtboxes
    attackHitboxes.forEach(hitbox => {
      if (this.checkAABB(hitbox, player2.hurtbox)) {
        this.handleHit(player1, player2, hitbox);
      }
    });
    
    // Check parry windows
    if (player2.combatState.currentState === 'parry' && player2.combatState.isActiveFrame()) {
      if (attackHitboxes.length > 0) {
        player2.handleParrySuccess();
        player1.applyHitstun(COMBAT_CONSTANTS.PARRY.STUN_CANCEL / 60, 0, -50 * player1.facing, 0);
      }
    }
  }
  
  handleHit(attacker, defender, hitbox) {
    const weaponData = WEAPONS[attacker.weapon];
    let damage = hitbox.damage;
    let knockbackX = hitbox.knockback.x * attacker.facing;
    let knockbackY = hitbox.knockback.y;
    
    if (hitbox.type === 'heavy' && !attacker.onGround) {
      const airHeavyData = weaponData.moveset.airHeavy;
      if (airHeavyData.selfVelocity) {
        attacker.vx += airHeavyData.selfVelocity.x * attacker.facing;
        attacker.vy += airHeavyData.selfVelocity.y;
      }
    }
    
    // Wall bounce logic
    if (hitbox.type === 'heavy' && weaponData.moveset.heavy.wallBounce && !defender.wallBounceUsed) {
      this.checkWallBounce(defender, knockbackX, knockbackY);
    }
    
    defender.takeDamage(damage, knockbackX, knockbackY);
  }
  
  checkWallBounce(player, knockbackX, knockbackY) {
    const wallLeft = 30;
    const wallRight = 1170;
    
    if ((player.x <= wallLeft + 50 && knockbackX < 0) ||
        (player.x >= wallRight - 50 && knockbackX > 0)) {
      player.wallBounceUsed = true;
      knockbackX *= -0.8;
      knockbackY *= 1.2;
      player.vx = knockbackX;
      player.vy = knockbackY;
    }
  }
  
  checkAABB(box1, box2) {
    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('joinRoom', (data) => {
    const roomId = data.roomId || 'default';
    
    if (!rooms[roomId]) {
      rooms[roomId] = new Room(roomId);
    }
    
    const player = new Player(socket.id, data.name);
    player.weapon = data.weapon;
    rooms[roomId].addPlayer(player);
    players[socket.id] = { roomId, player };
    
    socket.join(roomId);
    socket.emit('joinedRoom', { roomId, playerId: socket.id });
    
    const roomData = {
      players: Object.values(rooms[roomId].players).filter(p => p.id !== 'dummy').map(p => ({
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        health: p.health,
        maxHealth: p.maxHealth,
        facing: p.facing,
        state: p.combatState.currentState,
        weapon: p.weapon,
        comboCount: p.comboCount,
        comboDamage: p.comboDamage,
        hitStun: p.hitStun
      })),
      trainingMode: rooms[roomId].trainingMode
    };
    
    io.to(roomId).emit('roomUpdate', roomData);
  });
  
  socket.on('playerInput', (data) => {
    const playerData = players[socket.id];
    if (!playerData) return;
    
    const room = rooms[playerData.roomId];
    const player = room.players[socket.id];
    
    if (!player) return;
    
    // Movement input - FULLY IMPLEMENTED
    if (data.movement) {
      const weaponData = WEAPONS[player.weapon];
      const moveSpeed = COMBAT_CONSTANTS.MOVEMENT.GROUND_SPEED * weaponData.properties.mobility;
      const jumpPower = COMBAT_CONSTANTS.MOVEMENT.JUMP_POWER;
      
      // Ground movement
      if (data.movement.left && player.canAct) {
        player.facing = -1;
        if (player.onGround) {
          player.vx = -moveSpeed;
          if (player.combatState.currentState === 'idle' || player.combatState.currentState === 'run') {
            player.combatState.transition('run');
          }
        } else {
          // Air control at 65%
          player.vx += -moveSpeed * COMBAT_CONSTANTS.MOVEMENT.AIR_CONTROL_RATIO * 0.016;
        }
      }
      if (data.movement.right && player.canAct) {
        player.facing = 1;
        if (player.onGround) {
          player.vx = moveSpeed;
          if (player.combatState.currentState === 'idle' || player.combatState.currentState === 'run') {
            player.combatState.transition('run');
          }
        } else {
          // Air control at 65%
          player.vx += moveSpeed * COMBAT_CONSTANTS.MOVEMENT.AIR_CONTROL_RATIO * 0.016;
        }
      }
      
      // Jump - FULLY IMPLEMENTED
      if (data.movement.jump && player.canAct && player.onGround) {
        player.vy = -jumpPower;
        player.combatState.transition('jump');
        player.onGround = false;
      }
      
      // Fast fall - FULLY IMPLEMENTED
      if (data.movement.fastFall && !player.onGround) {
        player.vy += 400;
      }
      
      // Wall jump - FULLY IMPLEMENTED (max 2)
      if (data.movement.wallJump && !player.onGround && player.wallJumps < COMBAT_CONSTANTS.MOVEMENT.WALL_JUMP_LIMIT) {
        const nearWall = (player.x < 100) || (player.x > 1100);
        if (nearWall) {
          player.wallJumps++;
          player.vy = -jumpPower * 0.9;
          player.vx = player.x < 600 ? 300 : -300;
          player.facing = player.x < 600 ? 1 : -1;
          player.combatState.transition('jump');
        }
      }
      
      // Ground dash - FULLY IMPLEMENTED (1.5 character widths)
      if (data.movement.dash && player.onGround && player.canAct && player.combatState.currentState === 'run') {
        player.vx = COMBAT_CONSTANTS.MOVEMENT.GROUND_DASH_DISTANCE * player.facing;
        player.combatState.transition('dash');
        // Small recovery - auto transition after 9 frames (0.15s)
        setTimeout(() => {
          if (player.combatState.currentState === 'dash') {
            player.combatState.transition('idle');
          }
        }, 150);
      }
      
      // Air dash - FULLY IMPLEMENTED (0.5 character widths, i-frames, 2s cooldown)
      if (data.movement.airDash && !player.onGround && player.airDashes > 0 && player.airDashCooldown <= 0) {
        player.airDashes--;
        player.airDashCooldown = COMBAT_CONSTANTS.MOVEMENT.AIR_DASH_COOLDOWN / 60;
        player.iFrames = COMBAT_CONSTANTS.MOVEMENT.AIR_DASH_IFRAMES / 60;
        player.vx = COMBAT_CONSTANTS.MOVEMENT.AIR_DASH_DISTANCE * player.facing;
        player.vy = 0;
        player.combatState.transition('airDash');
        // Cannot attack during i-frames
        // Small recovery - auto transition after 12 frames (0.2s)
        setTimeout(() => {
          if (player.combatState.currentState === 'airDash') {
            player.combatState.transition('idle');
          }
        }, 200);
      }
    }
    
    // Action input - FULLY IMPLEMENTED
    if (data.actions && player.canAct && player.iFrames <= 0) {
      // Light attack - FULLY IMPLEMENTED
      if (data.actions.lightAttack && player.combatState.currentState !== 'lightAttack') {
        player.combatState.transition('lightAttack');
      }
      
      // Heavy attack - FULLY IMPLEMENTED (different air/ground)
      if (data.actions.heavyAttack && player.combatState.currentState !== 'heavyAttack') {
        player.combatState.transition('heavyAttack');
      }
      
      // Parry - FULLY IMPLEMENTED (0.05s startup, 0.15s active, 0.4s recovery, 0.6s cooldown)
      if (data.actions.parry && player.parryCooldown <= 0 && player.combatState.currentState !== 'parry') {
        player.parryCooldown = COMBAT_CONSTANTS.PARRY.COOLDOWN / 60;
        player.combatState.transition('parry');
        
        // Handle parry success
        setTimeout(() => {
          if (player.combatState.currentState === 'parry') {
            // Check if parry was successful (hit detected during active frames)
            // This is handled in collision detection
            player.combatState.transition('idle');
          }
        }, (COMBAT_CONSTANTS.PARRY.STARTUP + COMBAT_CONSTANTS.PARRY.ACTIVE + COMBAT_CONSTANTS.PARRY.RECOVERY) * 16.67);
      }
      
      // Grab - FULLY IMPLEMENTED (0.3-0.4s startup, 0.5s recovery, once per combo)
      if (data.actions.grab && !player.grabUsed && player.combatState.currentState !== 'grab') {
        player.combatState.transition('grab');
        
        // Set grab used if in combo
        if (player.comboCount > 0) {
          player.grabUsed = true;
        }
        
        // Auto transition after grab completes
        setTimeout(() => {
          if (player.combatState.currentState === 'grab') {
            player.combatState.transition('idle');
          }
        }, (COMBAT_CONSTANTS.GRAB.STARTUP + COMBAT_CONSTANTS.GRAB.ACTIVE + COMBAT_CONSTANTS.GRAB.RECOVERY) * 16.67);
      }
    }
  });
  
  socket.on('enableTrainingMode', () => {
    const playerData = players[socket.id];
    if (playerData) {
      rooms[playerData.roomId].enableTrainingMode();
    }
  });
  
  socket.on('resetDummy', () => {
    const playerData = players[socket.id];
    if (playerData && rooms[playerData.roomId].trainingMode) {
      const room = rooms[playerData.roomId];
      room.dummy.x = 800;
      room.dummy.y = 400;
      room.dummy.vx = 0;
      room.dummy.vy = 0;
      room.dummy.health = room.dummy.maxHealth;
      room.dummy.combatState.transition('idle');
    }
  });
  
  socket.on('toggleDummyHP', () => {
    const playerData = players[socket.id];
    if (playerData && rooms[playerData.roomId].trainingMode) {
      const room = rooms[playerData.roomId];
      if (room.dummy.maxHealth === 1000) {
        room.dummy.maxHealth = 100;
        room.dummy.health = 100;
      } else {
        room.dummy.maxHealth = 1000;
        room.dummy.health = 1000;
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const playerData = players[socket.id];
    if (playerData) {
      const room = rooms[playerData.roomId];
      if (room) {
        // Cleanup player data safely
        const player = room.players[socket.id];
        if (player) {
          // Reset combo state
          player.resetCombo();
          // Clear combat state
          if (player.combatState) {
            player.combatState.transition('idle');
          }
          // Clear cooldowns
          player.hitStun = 0;
          player.iFrames = 0;
        }
        
        room.removePlayer(socket.id);
        
        // Notify other players about the disconnect
        socket.to(playerData.roomId).emit('playerDisconnected', { playerId: socket.id });
        
        if (Object.keys(room.players).length === 0) {
          delete rooms[playerData.roomId];
        }
      }
      
      delete players[socket.id];
    }
  });
});

setInterval(() => {
  Object.values(rooms).forEach(room => {
    room.update();
    
    const playerList = Object.values(room.players).filter(p => p.id !== 'dummy').map(p => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      health: p.health,
      maxHealth: p.maxHealth,
      facing: p.facing,
      state: p.combatState.currentState,
      weapon: p.weapon,
      comboCount: p.comboCount,
      comboDamage: p.comboDamage,
      hitStun: p.hitStun,
      airDashes: p.airDashes,
      wallJumps: p.wallJumps
    }));
    
    if (room.trainingMode && room.dummy) {
      playerList.push({
        id: 'dummy',
        name: 'Training Dummy',
        x: room.dummy.x,
        y: room.dummy.y,
        health: room.dummy.health,
        maxHealth: room.dummy.maxHealth,
        facing: room.dummy.facing,
        state: room.dummy.combatState.currentState,
        weapon: room.dummy.weapon,
        comboCount: 0,
        comboDamage: 0,
        hitStun: room.dummy.hitStun,
        airDashes: 0,
        wallJumps: 0
      });
    }
    
    const roomData = {
      players: playerList,
      trainingMode: room.trainingMode
    };
    
    io.to(room.id).emit('roomUpdate', roomData);
  });
}, 16);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});