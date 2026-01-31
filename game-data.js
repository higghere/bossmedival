const WEAPONS = {
  longsword: {
    name: 'Long Sword',
    type: 'strength',
    properties: {
      mobility: 1.0,
      damageMultiplier: 1.2
    },
    moveset: {
      light: {
        damage: 8,
        startup: 8,
        active: 4,
        recovery: 12,
        hitbox: { offsetX: 30, offsetY: -20, width: 40, height: 30 },
        knockback: { x: 150, y: -100 },
        cancelWindow: 4,
        spriteFrame: 1
      },
      heavy: {
        damage: 15,
        startup: 16,
        active: 6,
        recovery: 20,
        hitbox: { offsetX: 40, offsetY: -10, width: 60, height: 40 },
        knockback: { x: 250, y: -150 },
        wallBounce: true,
        spriteFrame: 2
      },
      airHeavy: {
        damage: 18,
        startup: 12,
        active: 8,
        recovery: 16,
        hitbox: { offsetX: 35, offsetY: -40, width: 50, height: 60 },
        knockback: { x: 200, y: 100 },
        selfVelocity: { x: 150, y: 200 },
        spriteFrame: 3
      }
    }
  },
  scythe: {
    name: 'Scythe',
    type: 'agility',
    properties: {
      mobility: 1.2,
      damageMultiplier: 0.9
    },
    moveset: {
      light: {
        damage: 6,
        startup: 6,
        active: 6,
        recovery: 10,
        hitbox: { offsetX: 25, offsetY: -25, width: 50, height: 35 },
        knockback: { x: 120, y: -80 },
        cancelWindow: 6,
        spriteFrame: 1
      },
      heavy: {
        damage: 12,
        startup: 14,
        active: 8,
        recovery: 18,
        hitbox: { offsetX: 30, offsetY: -30, width: 70, height: 50 },
        knockback: { x: 180, y: -120 },
        launch: true,
        spriteFrame: 2
      },
      airHeavy: {
        damage: 10,
        startup: 10,
        active: 10,
        recovery: 14,
        hitbox: { offsetX: 20, offsetY: -50, width: 80, height: 60 },
        knockback: { x: 100, y: -250 },
        selfVelocity: { x: 0, y: -300 },
        spriteFrame: 3
      }
    }
  },
  katana: {
    name: 'Katana',
    type: 'balanced',
    properties: {
      mobility: 1.1,
      damageMultiplier: 1.0
    },
    moveset: {
      light: {
        damage: 7,
        startup: 7,
        active: 5,
        recovery: 11,
        hitbox: { offsetX: 28, offsetY: -22, width: 45, height: 32 },
        knockback: { x: 135, y: -90 },
        cancelWindow: 5,
        comboHits: 3,
        spriteFrame: 1
      },
      heavy: {
        damage: 14,
        startup: 15,
        active: 7,
        recovery: 19,
        hitbox: { offsetX: 35, offsetY: -15, width: 55, height: 38 },
        knockback: { x: 220, y: -140 },
        multiHit: 3,
        spriteFrame: 2
      },
      airHeavy: {
        damage: 16,
        startup: 11,
        active: 9,
        recovery: 17,
        hitbox: { offsetX: 30, offsetY: -35, width: 60, height: 45 },
        knockback: { x: 210, y: 100 },
        selfVelocity: { x: 120, y: 150 },
        spriteFrame: 3
      }
    }
  },
  fist: {
    name: 'Fist + Tanto',
    type: 'closeQuarters',
    properties: {
      mobility: 1.15,
      damageMultiplier: 0.95
    },
    moveset: {
      light: {
        damage: 5,
        startup: 4,
        active: 4,
        recovery: 8,
        hitbox: { offsetX: 20, offsetY: -18, width: 35, height: 28 },
        knockback: { x: 100, y: -70 },
        cancelWindow: 6,
        comboHits: 3,
        spriteFrame: 1
      },
      heavy: {
        damage: 11,
        startup: 12,
        active: 6,
        recovery: 14,
        hitbox: { offsetX: 25, offsetY: -12, width: 40, height: 35 },
        knockback: { x: 190, y: -110 },
        multiHit: 4,
        spriteFrame: 2
      },
      airHeavy: {
        damage: 13,
        startup: 8,
        active: 8,
        recovery: 12,
        hitbox: { offsetX: 15, offsetY: -30, width: 50, height: 50 },
        knockback: { x: 150, y: 50 },
        selfVelocity: { x: 0, y: -200 },
        aoe: true,
        spriteFrame: 3
      }
    }
  }
};

const COMBAT_CONSTANTS = {
  PARRY: {
    STARTUP: 3,      // 0.05s at 60fps
    ACTIVE: 9,       // 0.15s at 60fps
    RECOVERY: 24,    // 0.4s at 60fps
    COOLDOWN: 36,    // 0.6s at 60fps
    STUN_CANCEL: 12, // 0.2s at 60fps
    HEAVY_CONFIRM: 12
  },
  GRAB: {
    STARTUP: 18,     // 0.3-0.4s at 60fps
    ACTIVE: 6,
    RECOVERY: 30,
    EXECUTION_HP_THRESHOLD: 15,
    DAMAGE: 12,
    KNOCKBACK: { x: 100, y: -200 }
  },
  MOVEMENT: {
    GROUND_SPEED: 300,
    JUMP_POWER: 500,
    AIR_CONTROL_RATIO: 0.65,
    GRAVITY: 800,
    GROUND_FRICTION: 0.85,
    AIR_FRICTION: 0.98,
    GROUND_DASH_DISTANCE: 450,  // 1.5 character widths
    AIR_DASH_DISTANCE: 150,     // 0.5 character widths
    AIR_DASH_IFRAMES: 9,       // 0.15s at 60fps
    AIR_DASH_COOLDOWN: 120,     // 2s at 60fps
    WALL_JUMP_LIMIT: 2,
    WALL_SLIDE_SLOWDOWN: 0.3
  },
  COMBO: {
    HITSTUN_DECAY_START: 5,
    AIR_RECOVERY_START: 8,
    DAMAGE_SCALING_PER_HIT: 0.1,
    MINIMUM_DAMAGE_MULTIPLIER: 0.1,
    COMBO_TIMEOUT: 120,        // 2s at 60fps
    RESET_COOLDOWN: 10          // frames after hit
  }
};

module.exports = { WEAPONS, COMBAT_CONSTANTS };