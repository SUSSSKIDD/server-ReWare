const Item = require('../models/Item');
const User = require('../models/User');

/**
 * Get item image by index
 * @param {string} itemId - Item ID
 * @param {number} imageIndex - Image index (0-based)
 * @returns {Object} Image object with data and contentType
 */
const getItemImage = async (itemId, imageIndex = 0) => {
  try {
    const item = await Item.findById(itemId);
    if (!item || !item.images || item.images.length === 0) {
      return null;
    }
    
    if (imageIndex >= item.images.length) {
      return null;
    }
    
    return item.images[imageIndex];
  } catch (error) {
    console.error('Error getting item image:', error);
    return null;
  }
};

/**
 * Get user avatar
 * @param {string} userId - User ID
 * @returns {Object} Avatar object with data and contentType
 */
const getUserAvatar = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.avatar || !user.avatar.data) {
      return null;
    }
    
    return user.avatar;
  } catch (error) {
    console.error('Error getting user avatar:', error);
    return null;
  }
};

/**
 * Convert base64 image to buffer
 * @param {string} base64Data - Base64 encoded image data
 * @returns {Buffer} Image buffer
 */
const base64ToBuffer = (base64Data) => {
  try {
    // Remove data URL prefix if present
    const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    return Buffer.from(base64String, 'base64');
  } catch (error) {
    console.error('Error converting base64 to buffer:', error);
    return null;
  }
};

/**
 * Validate base64 image data
 * @param {string} base64Data - Base64 encoded image data
 * @returns {boolean} True if valid
 */
const isValidBase64Image = (base64Data) => {
  try {
    if (!base64Data || typeof base64Data !== 'string') {
      return false;
    }
    
    // Check if it's a valid base64 string
    const buffer = base64ToBuffer(base64Data);
    return buffer !== null && buffer.length > 0;
  } catch (error) {
    return false;
  }
};

/**
 * Get image size in bytes from base64 data
 * @param {string} base64Data - Base64 encoded image data
 * @returns {number} Size in bytes
 */
const getImageSize = (base64Data) => {
  try {
    const buffer = base64ToBuffer(base64Data);
    return buffer ? buffer.length : 0;
  } catch (error) {
    return 0;
  }
};

module.exports = {
  getItemImage,
  getUserAvatar,
  base64ToBuffer,
  isValidBase64Image,
  getImageSize
}; 