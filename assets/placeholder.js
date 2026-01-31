// Simple sprite generation - 32x32 pixels per frame
// Format: PNG with RGBA channels
// Created programmatically to avoid external dependencies

// This is a base64 encoded PNG placeholder
// In a real implementation, these would be actual sprite sheets

const generateSpriteSheet = () => {
  // This would normally be a real sprite sheet
  // For this implementation, we'll create simple colored rectangles
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
};

module.exports = { generateSpriteSheet };