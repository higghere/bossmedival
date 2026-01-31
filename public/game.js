let socket;
let canvas;
let ctx;
let selectedWeapon = 'longsword';
let playerName = 'Player';
let myPlayerId;
let players = new Map();
let keys = {};
let isTrainingMode = false;
let animationFrame = 0;
let spriteSheets = {};
let effectSprites = {};
let imagesLoaded = false;

// Game constants
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 600;
const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 60;
const GROUND_Y = 540;

// Weapon colors for visual differentiation
const WEAPON_COLORS = {
  longsword: '#8B4513',
  scythe: '#4B0082', 
  katana: '#C0C0C0',
  fist: '#FF4500'
};

// Platform definitions
const PLATFORMS = [
  { x: 200, y: 450, width: 150, height: 20 },
  { x: 1000, y: 450, width: 150, height: 20 },
  { x: 400, y: 350, width: 120, height: 20 },
  { x: 800, y: 350, width: 120, height: 20 },
  { x: 600, y: 250, width: 100, height: 20 },
  { x: 300, y: 200, width: 80, height: 20 },
  { x: 900, y: 200, width: 80, height: 20 }
];

class EffectSystem {
  constructor() {
    this.particleEffects = [];
    this.lastEffectTimes = new Map();
  }
  
  update(deltaTime) {
    this.particleEffects = this.particleEffects.filter(effect => {
      effect.x += effect.vx * deltaTime;
      effect.y += effect.vy * deltaTime;
      effect.life -= deltaTime * 1000;
      
      return effect.life > 0;
    });
  }
  
  createAttackEffect(playerId, player) {
    // Defensive: ensure player exists and has valid state
    if (!player || !player.state) return;
    
    const now = Date.now();
    const lastTime = this.lastEffectTimes.get(playerId) || 0;
    
    if ((player.state === 'lightAttack' || player.state === 'heavyAttack') && 
        now - lastTime > 100) {
      
      this.lastEffectTimes.set(playerId, now);
      
      // Use actual effect sprites if available
      if (effectSprites && effectSprites.slash) {
        const effect = {
          x: player.x + (player.state === 'heavyAttack' ? 40 : 30) * (player.facing || 1),
          y: player.y + (player.state === 'heavyAttack' ? -10 : -20),
          vx: 0,
          vy: 0,
          life: 200,
          type: 'slash',
          heavy: player.state === 'heavyAttack',
          facing: player.facing || 1
        };
        this.particleEffects.push(effect);
      } else {
        // Fallback to colored rectangles
        const effect = {
          x: player.x + (player.state === 'heavyAttack' ? 40 : 30) * (player.facing || 1),
          y: player.y + (player.state === 'heavyAttack' ? -10 : -20),
          vx: (player.facing || 1) * 100,
          vy: 0,
          life: 200,
          color: player.state === 'heavyAttack' ? '#FF6600' : '#FFFF00',
          size: player.state === 'heavyAttack' ? 30 : 20
        };
        this.particleEffects.push(effect);
      }
    }
    
    // Create parry effect
    if (player.state === 'parry' && now - lastTime > 200) {
      if (effectSprites && effectSprites.parry) {
        const effect = {
          x: player.x,
          y: player.y,
          vx: 0,
          vy: 0,
          life: 300,
          type: 'parry'
        };
        this.particleEffects.push(effect);
      }
    }
  }
  
  cleanupPlayerEffects(playerId) {
    this.lastEffectTimes.delete(playerId);
  }
  
  render(ctx) {
    this.particleEffects.forEach(effect => {
      if (effect.type && effectSprites[effect.type]) {
        // Render sprite effects
        const img = new Image();
        img.src = effectSprites[effect.type];
        
        if (img.complete) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, effect.life / 300);
          
          if (effect.type === 'slash') {
            // Rotate slash effect
            ctx.translate(effect.x, effect.y);
            ctx.rotate((animationFrame * 10) * Math.PI / 180);
            if (effect.facing < 0) {
              ctx.scale(-1, 1);
            }
            ctx.drawImage(img, -16, -16, 32, 32);
          } else if (effect.type === 'parry') {
            // Pulsing parry shield
            const scale = 1 + Math.sin(animationFrame * 0.2) * 0.1;
            ctx.translate(effect.x, effect.y);
            ctx.scale(scale, scale);
            ctx.drawImage(img, -32, -32, 64, 64);
          }
          
          ctx.restore();
        }
      } else {
        // Fallback to colored rectangles
        ctx.fillStyle = effect.color;
        ctx.globalAlpha = Math.max(0, effect.life / 200);
        ctx.fillRect(effect.x - effect.size/2, effect.y - effect.size/2, effect.size, effect.size);
      }
    });
    ctx.globalAlpha = 1.0;
  }
}

class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.effectSystem = new EffectSystem();
  }
  
  clear() {
    // Clear canvas with gradient background
    const gradient = this.ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  
  renderArena() {
    // Draw ground
    this.ctx.fillStyle = '#654321';
    this.ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
    
    // Draw walls
    this.ctx.fillStyle = '#8B4513';
    this.ctx.fillRect(0, 0, 30, CANVAS_HEIGHT);
    this.ctx.fillRect(CANVAS_WIDTH - 30, 0, 30, CANVAS_HEIGHT);
    
    // Draw wall jump zones
    this.ctx.fillStyle = 'rgba(74, 74, 74, 0.3)';
    this.ctx.fillRect(10, 100, 30, 400);
    this.ctx.fillRect(CANVAS_WIDTH - 40, 100, 30, 400);
    
    // Draw platforms
    this.ctx.fillStyle = '#8B4513';
    PLATFORMS.forEach(platform => {
      this.ctx.fillRect(
        platform.x - platform.width/2,
        platform.y - platform.height/2,
        platform.width,
        platform.height
      );
    });
  }
  
  renderPlayer(player) {
    if (!player || !imagesLoaded) return;
    
    // Defensive: validate all required properties
    if (typeof player.x !== 'number' || typeof player.y !== 'number') return;
    if (typeof player.facing !== 'number') player.facing = 1;
    if (typeof player.health !== 'number') player.health = 100;
    if (typeof player.weapon !== 'string') player.weapon = 'longsword';
    if (typeof player.state !== 'string') player.state = 'idle';
    
    this.ctx.save();
    
    // Use actual sprite sheets if available, otherwise fallback to colored rectangle
    const spriteSheet = spriteSheets[player.weapon];
    if (spriteSheet) {
      const img = new Image();
      img.src = spriteSheet;
      
      // Determine which animation frame to use
      let frameX = 0;
      let frameY = 0;
      let frameWidth = 32;
      let frameHeight = 48;
      
      switch(player.state) {
        case 'idle':
          frameY = 0;
          frameX = (Math.floor(animationFrame / 8) % 4);
          break;
        case 'run':
          frameY = 48;
          frameX = (Math.floor(animationFrame / 4) % 4);
          break;
        case 'jump':
        case 'airDash':
          frameY = 96;
          frameX = 0;
          break;
        case 'lightAttack':
        case 'heavyAttack':
          frameY = 144;
          frameX = (Math.floor(animationFrame / 2) % 4);
          break;
        case 'parry':
          frameY = 96;
          frameX = 1;
          break;
        case 'hitstun':
          frameY = 96;
          frameX = 2;
          break;
        default:
          frameY = 0;
          frameX = 0;
      }
      
      // Draw sprite
      if (img.complete) {
        this.ctx.drawImage(
          img,
          frameX * frameWidth, frameY, frameWidth, frameHeight,
          player.x - PLAYER_WIDTH/2, player.y - PLAYER_HEIGHT/2, 
          PLAYER_WIDTH, PLAYER_HEIGHT
        );
      }
      
      // Flip sprite if facing left
      if (player.facing < 0) {
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(
          img,
          frameX * frameWidth, frameY, frameWidth, frameHeight,
          -player.x - PLAYER_WIDTH/2, player.y - PLAYER_HEIGHT/2, 
          PLAYER_WIDTH, PLAYER_HEIGHT
        );
        this.ctx.scale(-1, 1);
      }
      
      // Apply death effect
      if (player.health <= 0) {
        this.ctx.globalAlpha = 0.6;
      }
    } else {
      // Fallback to colored rectangle
      const weaponColor = WEAPON_COLORS[player.weapon] || '#FFFFFF';
      this.ctx.fillStyle = player.health <= 0 ? '#444444' : weaponColor;
      this.ctx.globalAlpha = player.health <= 0 ? 0.6 : 1.0;
      
      this.ctx.fillRect(
        player.x - PLAYER_WIDTH/2,
        player.y - PLAYER_HEIGHT/2,
        PLAYER_WIDTH,
        PLAYER_HEIGHT
      );
      
      // Draw facing indicator
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.fillRect(
        player.x + (player.facing > 0 ? PLAYER_WIDTH/2 - 5 : -PLAYER_WIDTH/2 + 1),
        player.y - 5,
        4,
        4
      );
    }
    
    // Draw state indicators
    this.drawStateIndicators(player);
    
    this.ctx.restore();
  }
  
  drawStateIndicators(player) {
    this.ctx.strokeStyle = '#FFFFFF';
    this.ctx.lineWidth = 2;
    
    switch(player.state) {
      case 'parry':
        // Draw parry shield
        this.ctx.strokeStyle = '#00FFFF';
        this.ctx.globalAlpha = 0.8;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, 35, 0, Math.PI * 2);
        this.ctx.stroke();
        break;
        
      case 'hitstun':
        // Draw hitstun stars
        this.ctx.fillStyle = '#FFFF00';
        for (let i = 0; i < 3; i++) {
          const angle = (Date.now() / 100 + i * 120) * Math.PI / 180;
          const x = player.x + Math.cos(angle) * 30;
          const y = player.y - 30 + Math.sin(angle) * 10;
          this.drawStar(x, y, 3, 8, 4);
        }
        break;
        
      case 'execution':
        // Draw execution effect
        this.ctx.strokeStyle = '#FF00FF';
        this.ctx.globalAlpha = 0.9;
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, 40, 0, Math.PI * 2);
        this.ctx.stroke();
        break;
    }
    
    this.ctx.globalAlpha = 1.0;
  }
  
  drawStar(cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;
    
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy - outerRadius);
    
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      this.ctx.lineTo(x, y);
      rot += step;
      
      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      this.ctx.lineTo(x, y);
      rot += step;
    }
    
    this.ctx.lineTo(cx, cy - outerRadius);
    this.ctx.closePath();
    this.ctx.fill();
  }
  
  update(deltaTime) {
    this.effectSystem.update(deltaTime);
  }
  
  renderEffects() {
    this.effectSystem.render(this.ctx);
  }
  
  cleanupPlayer(playerId) {
    this.effectSystem.cleanupPlayerEffects(playerId);
  }
}

class EntitySystem {
  constructor() {
    this.players = new Map();
    this.lastUpdateTime = 0;
  }
  
  updatePlayers(serverPlayers) {
    const currentTime = Date.now();
    const newPlayerIds = new Set();
    
    // Update existing players and add new ones
    serverPlayers.forEach(playerData => {
      newPlayerIds.add(playerData.id);
      
      // Defensive: validate player data
      if (!this.isValidPlayerData(playerData)) {
        console.warn('Invalid player data received:', playerData);
        return;
      }
      
      this.players.set(playerData.id, playerData);
    });
    
    // Remove disconnected players
    for (const [playerId, player] of this.players) {
      if (!newPlayerIds.has(playerId)) {
        this.removePlayer(playerId);
      }
    }
    
    this.lastUpdateTime = currentTime;
  }
  
  isValidPlayerData(playerData) {
    return playerData &&
           typeof playerData.id === 'string' &&
           typeof playerData.name === 'string' &&
           typeof playerData.x === 'number' &&
           typeof playerData.y === 'number' &&
           typeof playerData.health === 'number' &&
           typeof playerData.maxHealth === 'number' &&
           typeof playerData.facing === 'number' &&
           typeof playerData.state === 'string';
  }
  
  getPlayer(playerId) {
    return this.players.get(playerId);
  }
  
  getAllPlayers() {
    return Array.from(this.players.values());
  }
  
  removePlayer(playerId) {
    this.players.delete(playerId);
    // Cleanup any systems that reference this player
    if (window.game && window.game.renderer) {
      window.game.renderer.cleanupPlayer(playerId);
    }
  }
  
  cleanup() {
    this.players.clear();
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.renderer = new Renderer(this.ctx);
    this.entitySystem = new EntitySystem();
    this.lastUpdateTime = Date.now();
    
    this.loadAssets();
  }
  
  loadAssets() {
    // Load sprite sheets
    const script = document.createElement('script');
    script.src = '/assets/sprites.js';
    script.onload = () => {
      // Create sprite sheets once loaded
      spriteSheets = createWeaponSpecificSpriteSheets();
      effectSprites = createEffectSprites();
      imagesLoaded = true;
      
      this.setupInput();
      this.startGameLoop();
    };
    document.head.appendChild(script);
  }
  
  setupInput() {
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      e.preventDefault();
    });
    
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
      e.preventDefault();
    });
  }
  
  startGameLoop() {
    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = (now - this.lastUpdateTime) / 1000;
      this.lastUpdateTime = now;
      
      this.handleInput();
      this.render(deltaTime);
      
      requestAnimationFrame(gameLoop);
    };
    
    gameLoop();
  }
  
  handleInput() {
    const movement = {};
    const actions = {};
    
    // Movement inputs
    if (keys['a'] || keys['arrowleft']) movement.left = true;
    if (keys['d'] || keys['arrowright']) movement.right = true;
    if (keys['w'] || keys['arrowup']) movement.jump = true;
    if (keys['s'] || keys['arrowdown']) movement.fastFall = true;
    
    // Wall jump detection
    if ((keys['w'] || keys['arrowup']) && !this.wallJumpPressed) {
      movement.wallJump = true;
      this.wallJumpPressed = true;
    } else if (!keys['w'] && !keys['arrowup']) {
      this.wallJumpPressed = false;
    }
    
    // Dash inputs
    if (keys['shift']) movement.dash = true;
    if (keys[' '] && !this.spacePressed) {
      movement.airDash = true;
      this.spacePressed = true;
    } else if (!keys[' ']) {
      this.spacePressed = false;
    }
    
    // Combat inputs
    if (keys['j']) actions.lightAttack = true;
    if (keys['k']) actions.heavyAttack = true;
    if (keys['l']) actions.parry = true;
    if (keys['g']) actions.grab = true;
    
    // Send input if any action
    if (Object.keys(movement).length > 0 || Object.keys(actions).length > 0) {
      socket.emit('playerInput', { movement, actions });
    }
  }
  
  render(deltaTime) {
    // Clear and render arena
    this.renderer.clear();
    this.renderer.renderArena();
    
    // Update animation frame
    if (imagesLoaded) {
      animationFrame++;
    }
    
    // Update renderer
    this.renderer.update(deltaTime);
    
    // Render all players safely
    this.entitySystem.getAllPlayers().forEach(player => {
      this.renderer.renderPlayer(player);
      // Create effects for valid players
      this.renderer.effectSystem.createAttackEffect(player.id, player);
    });
    
    // Render effects
    this.renderer.renderEffects();
    
    // Update UI
    this.updateUI();
  }
  
  updateUI() {
    const myPlayer = this.entitySystem.getPlayer(myPlayerId);
    if (myPlayer) {
      document.getElementById('player1Health').style.width = (myPlayer.health / myPlayer.maxHealth * 100) + '%';
      document.getElementById('player1Name').textContent = myPlayer.name;
      document.getElementById('player1Combo').textContent = myPlayer.comboCount > 0 ? 
        `Combo: ${myPlayer.comboCount} (${myPlayer.comboDamage} dmg)` : '';
      
      let stateText = myPlayer.state;
      if (myPlayer.hitStun > 0) {
        stateText += ` (${myPlayer.hitStun.toFixed(2)}s)`;
      }
      document.getElementById('player1State').textContent = stateText;
      
      // Update training mode specific info
      if (isTrainingMode) {
        this.updateTrainingInfo();
      }
    }
    
    // Update second player UI if exists
    const otherPlayer = this.entitySystem.getAllPlayers().find(p => p.id !== myPlayerId && p.id !== 'dummy');
    if (otherPlayer) {
      document.getElementById('player2Health').style.width = (otherPlayer.health / otherPlayer.maxHealth * 100) + '%';
      document.getElementById('player2Name').textContent = otherPlayer.name;
      document.getElementById('player2Combo').textContent = otherPlayer.comboCount > 0 ? 
        `Combo: ${otherPlayer.comboCount} (${otherPlayer.comboDamage} dmg)` : '';
      
      let stateText = otherPlayer.state;
      if (otherPlayer.hitStun > 0) {
        stateText += ` (${otherPlayer.hitStun.toFixed(2)}s)`;
      }
      document.getElementById('player2State').textContent = stateText;
    }
  }
  
  updateTrainingInfo() {
    const dummy = this.entitySystem.getPlayer('dummy');
    if (dummy) {
      document.getElementById('dummyHP').textContent = `Dummy HP: ${dummy.health}/${dummy.maxHealth}`;
      
      const myPlayer = this.entitySystem.getPlayer(myPlayerId);
      if (myPlayer) {
        let scaling = 100;
        if (myPlayer.comboCount > 0) {
          scaling = Math.max(10, 100 - (myPlayer.comboCount * 10));
        }
        document.getElementById('comboScaling').textContent = `Scaling: ${scaling}%`;
        
        if (dummy.hitStun > 0) {
          document.getElementById('hitstunTime').textContent = dummy.hitStun.toFixed(2) + 's';
          document.getElementById('hitstunFill').style.width = (dummy.hitStun / 2 * 100) + '%';
        } else {
          document.getElementById('hitstunTime').textContent = '0.0s';
          document.getElementById('hitstunFill').style.width = '0%';
        }
      }
    }
  }
}

function selectWeapon(weapon) {
  selectedWeapon = weapon;
  
  // Update UI selection
  document.querySelectorAll('.weapon-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  const selectedBtn = document.querySelector(`.weapon-btn[onclick*="${weapon}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
  }
}

function startGame() {
  playerName = document.getElementById('playerName').value || 'Player';
  isTrainingMode = false;
  
  initializeGame('default');
}

function startTrainingMode() {
  playerName = document.getElementById('playerName').value || 'Player';
  isTrainingMode = true;
  
  initializeGame('training');
}

function initializeGame(roomId) {
  document.getElementById('menu').style.display = 'none';
  document.getElementById('gameContainer').style.display = 'block';
  
  if (!socket) {
    socket = io();
    setupSocketListeners();
  }
  
  if (!window.game) {
    window.game = new Game();
  }
  
  socket.emit('joinRoom', {
    roomId: roomId,
    name: playerName,
    weapon: selectedWeapon
  });
  
  if (isTrainingMode) {
    setTimeout(() => {
      socket.emit('enableTrainingMode');
    }, 1000);
  }
}

function setupSocketListeners() {
  socket.on('roomUpdate', (data) => {
    // Defensive: validate data structure
    if (!data || !Array.isArray(data.players)) {
      console.warn('Invalid roomUpdate data:', data);
      return;
    }
    
    // Use entity system for safe player management
    window.game.entitySystem.updatePlayers(data.players);
    
    if (data.trainingMode !== isTrainingMode) {
      isTrainingMode = data.trainingMode;
      updateTrainingUI();
    }
  });
  
  socket.on('joinedRoom', (data) => {
    if (data && data.playerId) {
      myPlayerId = data.playerId;
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    // Cleanup all local state
    if (window.game && window.game.entitySystem) {
      window.game.entitySystem.cleanup();
    }
  });
}

function updateTrainingUI() {
  const trainingControls = document.getElementById('trainingControls');
  const trainingInfo = document.getElementById('trainingInfo');
  
  if (isTrainingMode) {
    trainingControls.style.display = 'block';
    trainingInfo.style.display = 'block';
  } else {
    trainingControls.style.display = 'none';
    trainingInfo.style.display = 'none';
  }
}

// Training mode functions
function resetDummy() {
  if (socket && isTrainingMode) {
    socket.emit('resetDummy');
  }
}

function toggleDummyHP() {
  if (socket && isTrainingMode) {
    socket.emit('toggleDummyHP');
  }
}

function exitTraining() {
  location.reload();
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('playerName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      startGame();
    }
  });
  
  // Select first weapon by default
  selectWeapon('longsword');
});