// Create proper sprite sheets with actual pixel data
// Using HTML5 Canvas to generate sprite sheets programmatically

function createCharacterSpriteSheet() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;  // 4 frames * 32px
  canvas.height = 192; // 4 animations * 48px
  const ctx = canvas.getContext('2d');
  
  // Create different colored rectangles for each weapon type
  const weaponColors = {
    idle: '#4A90E2',
    run: '#5CA0F2', 
    jump: '#6BB0FF',
    attack: '#E24A4A'
  };
  
  // Draw idle frames (top row)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = weaponColors.idle;
    ctx.fillRect(i * 32, 0, 32, 48);
    // Add some detail
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(i * 32 + 14, 20, 4, 4);
  }
  
  // Draw run frames (second row)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = weaponColors.run;
    ctx.fillRect(i * 32, 48, 32, 48);
    // Add running animation details
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(i * 32 + 14, 20, 4, 4);
    // Leg animation
    ctx.fillRect(i * 32 + 10, 35, 4, 8);
    ctx.fillRect(i * 32 + 18, 35, 4, 8);
  }
  
  // Draw jump frames (third row)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = weaponColors.jump;
    ctx.fillRect(i * 32, 96, 32, 48);
    // Add jump details
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(i * 32 + 14, 20, 4, 4);
    // Arms up position
    ctx.fillRect(i * 32 + 8, 10, 4, 8);
    ctx.fillRect(i * 32 + 20, 10, 4, 8);
  }
  
  // Draw attack frames (bottom row)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = weaponColors.attack;
    ctx.fillRect(i * 32, 144, 32, 48);
    // Add attack details
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(i * 32 + 14, 20, 4, 4);
    // Weapon swing
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(i * 32 + 20 + i * 4, 25, 12, 3);
  }
  
  return canvas.toDataURL();
}

function createWeaponSpecificSpriteSheets() {
  const weaponSheets = {};
  
  // Long Sword - Brown tint
  weaponSheets.longsword = createTintedSpriteSheet('#8B4513');
  
  // Scythe - Purple tint  
  weaponSheets.scythe = createTintedSpriteSheet('#4B0082');
  
  // Katana - Silver tint
  weaponSheets.katana = createTintedSpriteSheet('#C0C0C0');
  
  // Fist - Orange tint
  weaponSheets.fist = createTintedSpriteSheet('#FF4500');
  
  return weaponSheets;
}

function createTintedSpriteSheet(baseColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  
  // Create base character with weapon color
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = baseColor;
      ctx.fillRect(col * 32, row * 48, 32, 48);
      
      // Add white details (face/hands)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(col * 32 + 14, row * 48 + 20, 4, 4);
      
      // Add specific details per animation
      if (row === 1) { // Run
        // Animated legs
        ctx.fillStyle = baseColor;
        ctx.fillRect(col * 32 + 10 + (col % 2) * 4, row * 48 + 35, 4, 8);
        ctx.fillRect(col * 32 + 18 - (col % 2) * 4, row * 48 + 35, 4, 8);
      } else if (row === 2) { // Jump
        // Arms up
        ctx.fillRect(col * 32 + 8, row * 48 + 10, 4, 8);
        ctx.fillRect(col * 32 + 20, row * 48 + 10, 4, 8);
      } else if (row === 3) { // Attack
        // Weapon
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(col * 32 + 20 + col * 2, row * 48 + 25, 12 + col * 2, 3);
      }
    }
  }
  
  return canvas.toDataURL();
}

function createEffectSprites() {
  const effects = {};
  
  // Slash effect
  const slashCanvas = document.createElement('canvas');
  slashCanvas.width = 64;
  slashCanvas.height = 64;
  const slashCtx = slashCanvas.getContext('2d');
  
  // Create animated slash
  for (let i = 0; i < 4; i++) {
    slashCtx.save();
    slashCtx.translate(32, 32);
    slashCtx.rotate((i * 45) * Math.PI / 180);
    slashCtx.fillStyle = `rgba(255, 255, 0, ${1 - i * 0.2})`;
    slashCtx.fillRect(-20, -2, 40, 4);
    slashCtx.restore();
  }
  
  effects.slash = slashCanvas.toDataURL();
  
  // Parry effect
  const parryCanvas = document.createElement('canvas');
  parryCanvas.width = 64;
  parryCanvas.height = 64;
  const parryCtx = parryCanvas.getContext('2d');
  
  // Create shield effect
  parryCtx.strokeStyle = '#00FFFF';
  parryCtx.lineWidth = 3;
  parryCtx.beginPath();
  parryCtx.arc(32, 32, 20, 0, Math.PI * 2);
  parryCtx.stroke();
  
  effects.parry = parryCanvas.toDataURL();
  
  return effects;
}

// Export functions for use in game
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createCharacterSpriteSheet,
    createWeaponSpecificSpriteSheets,
    createEffectSprites
  };
}