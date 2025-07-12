#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const { runFullMigration, migrateItemImages, migrateUserAvatars } = require('../utils/migration');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB Atlas');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];
  
  await connectDB();
  
  try {
    switch (command) {
      case 'items':
        const itemId = args[1];
        await migrateItemImages(itemId);
        break;
        
      case 'users':
        const userId = args[1];
        await migrateUserAvatars(userId);
        break;
        
      case 'all':
      default:
        await runFullMigration();
        break;
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

// Handle script execution
if (require.main === module) {
  main();
} 