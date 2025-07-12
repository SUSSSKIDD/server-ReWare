const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();



const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const swapRoutes = require('./routes/swaps');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const { getItemImage, getUserAvatar, base64ToBuffer } = require('./utils/imageUtils');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'https://client-reware-sussskidds-projects.vercel.app', // Main deployed frontend
  'http://localhost:5173', // Vite default port
  'http://localhost:3000', // Alternative port
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowedOrigins array
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } 
    // Check if origin is a Vercel URL (handles all branch deployments)
    else if (origin.includes('client-reware') && origin.includes('vercel.app')) {
      callback(null, true);
    }
    else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined'));

// Serve uploaded images (legacy support)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Route to serve base64 images
app.get('/api/images/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const imageIndex = parseInt(req.query.index) || 0;
    
    console.log(`Image request: ${type}/${id}?index=${imageIndex}`);
    
    let imageData = null;
    
    if (type === 'item') {
      // Handle item images
      imageData = await getItemImage(id, imageIndex);
      console.log(`Item image result:`, {
        found: !!imageData,
        hasData: imageData ? !!imageData.data : false,
        dataLength: imageData && imageData.data ? imageData.data.length : 0,
        contentType: imageData ? imageData.contentType : null
      });
    } else if (type === 'avatar') {
      // Handle avatar images
      imageData = await getUserAvatar(id);
      console.log(`Avatar image result:`, {
        found: !!imageData,
        hasData: imageData ? !!imageData.data : false,
        dataLength: imageData && imageData.data ? imageData.data.length : 0,
        contentType: imageData ? imageData.contentType : null
      });
    } else {
      return res.status(400).json({ message: 'Invalid image type' });
    }
    
    if (!imageData || !imageData.data) {
      console.log(`Image not found: ${type}/${id}?index=${imageIndex}`);
      return res.status(404).json({ message: 'Image not found' });
    }
    
    // Convert base64 to buffer
    const imageBuffer = base64ToBuffer(imageData.data);
    if (!imageBuffer) {
      console.log(`Error processing image buffer: ${type}/${id}?index=${imageIndex}`);
      return res.status(500).json({ message: 'Error processing image' });
    }
    
    console.log(`Serving image: ${type}/${id}?index=${imageIndex}, size: ${imageBuffer.length} bytes`);
    
    // Set appropriate headers
    res.set({
      'Content-Type': imageData.contentType || 'image/jpeg',
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      'ETag': `"${id}-${imageIndex}"`
    });
    
    // Send the image
    res.send(imageBuffer);
    
  } catch (error) {
    console.error('Image serving error:', error);
    res.status(500).json({ message: 'Error serving image' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/swaps', swapRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    message: 'ReWear API is running',
    timestamp: new Date().toISOString()
  });
});

// Test image endpoint
app.get('/api/test-image', (req, res) => {
  // Create a simple test image (1x1 pixel red PNG)
  const testImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  
  res.set({
    'Content-Type': 'image/png',
    'Content-Length': testImage.length,
    'Cache-Control': 'public, max-age=31536000'
  });
  
  res.send(testImage);
});

// Debug endpoint to check items with images
app.get('/api/debug/items', async (req, res) => {
  try {
    const Item = require('./models/Item');
    const items = await Item.find({}).select('_id title images').limit(5);
    
    const itemsWithImageInfo = items.map(item => ({
      id: item._id,
      title: item.title,
      imageCount: item.images ? item.images.length : 0,
      hasImages: item.images && item.images.length > 0,
      firstImageData: item.images && item.images[0] ? {
        hasData: !!item.images[0].data,
        dataLength: item.images[0].data ? item.images[0].data.length : 0,
        contentType: item.images[0].contentType
      } : null
    }));
    
    res.json({
      totalItems: items.length,
      items: itemsWithImageInfo
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas');
    app.listen(PORT, () => {
      console.log(`ReWear server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

module.exports = app; 