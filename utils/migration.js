const axios = require('axios');
const Item = require('../models/Item');
const User = require('../models/User');

/**
 * Download image from URL and convert to base64
 * @param {string} url - Image URL
 * @returns {Object} Base64 image object
 */
const downloadAndConvertToBase64 = async (url) => {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    
    const buffer = Buffer.from(response.data);
    const base64Data = buffer.toString('base64');
    const contentType = response.headers['content-type'] || 'image/jpeg';
    
    return {
      data: base64Data,
      contentType,
      filename: `migrated-${Date.now()}.jpg`
    };
  } catch (error) {
    console.error('Error downloading image:', url, error.message);
    return null;
  }
};

/**
 * Migrate item images from Cloudinary URLs to base64
 * @param {string} itemId - Item ID to migrate (optional, if not provided migrates all)
 */
const migrateItemImages = async (itemId = null) => {
  try {
    const query = itemId ? { _id: itemId } : {};
    const items = await Item.find(query);
    
    console.log(`Found ${items.length} items to migrate`);
    
    for (const item of items) {
      console.log(`Migrating item: ${item.title} (${item._id})`);
      
      const migratedImages = [];
      
      for (let i = 0; i < item.images.length; i++) {
        const image = item.images[i];
        
        // Skip if already in new format
        if (image.data && image.contentType) {
          migratedImages.push(image);
          continue;
        }
        
        // Convert old format to new format
        if (image.url) {
          console.log(`  Converting image ${i + 1}: ${image.url}`);
          const base64Image = await downloadAndConvertToBase64(image.url);
          
          if (base64Image) {
            migratedImages.push({
              data: base64Image.data,
              contentType: base64Image.contentType,
              filename: image.publicId || `migrated-${Date.now()}-${i}.jpg`
            });
            console.log(`  ✓ Successfully converted image ${i + 1}`);
          } else {
            console.log(`  ✗ Failed to convert image ${i + 1}`);
            // Keep original image if conversion fails
            migratedImages.push(image);
          }
        } else {
          // Keep image if it doesn't have URL (shouldn't happen)
          migratedImages.push(image);
        }
      }
      
      // Update item with migrated images
      item.images = migratedImages;
      await item.save();
      
      console.log(`✓ Completed migration for item: ${item.title}`);
    }
    
    console.log('Item migration completed successfully');
  } catch (error) {
    console.error('Error during item migration:', error);
  }
};

/**
 * Migrate user avatars from Cloudinary URLs to base64
 * @param {string} userId - User ID to migrate (optional, if not provided migrates all)
 */
const migrateUserAvatars = async (userId = null) => {
  try {
    const query = userId ? { _id: userId } : {};
    const users = await User.find(query);
    
    console.log(`Found ${users.length} users to migrate`);
    
    for (const user of users) {
      console.log(`Migrating user: ${user.username} (${user._id})`);
      
      // Skip if already in new format
      if (user.avatar && user.avatar.data && user.avatar.contentType) {
        console.log(`  ✓ User ${user.username} already has new format avatar`);
        continue;
      }
      
      // Convert old format to new format
      if (user.avatar && typeof user.avatar === 'string') {
        console.log(`  Converting avatar: ${user.avatar}`);
        const base64Avatar = await downloadAndConvertToBase64(user.avatar);
        
        if (base64Avatar) {
          user.avatar = {
            data: base64Avatar.data,
            contentType: base64Avatar.contentType
          };
          await user.save();
          console.log(`  ✓ Successfully converted avatar for ${user.username}`);
        } else {
          console.log(`  ✗ Failed to convert avatar for ${user.username}`);
        }
      } else {
        console.log(`  - No avatar to migrate for ${user.username}`);
      }
    }
    
    console.log('User avatar migration completed successfully');
  } catch (error) {
    console.error('Error during user avatar migration:', error);
  }
};

/**
 * Run full migration (items and users)
 */
const runFullMigration = async () => {
  console.log('Starting full migration...');
  console.log('This will convert all Cloudinary URLs to base64 format');
  console.log('This process may take a while depending on the number of images');
  
  await migrateItemImages();
  await migrateUserAvatars();
  
  console.log('Full migration completed!');
};

module.exports = {
  migrateItemImages,
  migrateUserAvatars,
  runFullMigration
}; 