const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function createAdminUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin user already exists:', existingAdmin.email);
      return;
    }

    // Create admin user
    const adminUser = new User({
      email: 'admin@rewear.com',
      password: 'admin123456',
      firstName: 'Admin',
      lastName: 'User',
      username: 'admin',
      role: 'admin',
      points: 1000
    });

    await adminUser.save();
    console.log('Admin user created successfully:', adminUser.email);
    console.log('Login credentials:');
    console.log('Email: admin@rewear.com');
    console.log('Password: admin123456');

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

async function updateUserToAdmin(email) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found with email:', email);
      return;
    }

    // Update user role to admin
    user.role = 'admin';
    await user.save();
    console.log('User updated to admin successfully:', user.email);

  } catch (error) {
    console.error('Error updating user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (command === 'create') {
  createAdminUser();
} else if (command === 'update' && args[1]) {
  updateUserToAdmin(args[1]);
} else {
  console.log('Usage:');
  console.log('  node create-admin.js create                    - Create a new admin user');
  console.log('  node create-admin.js update user@email.com     - Update existing user to admin');
} 