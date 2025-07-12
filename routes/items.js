const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Item = require('../models/Item');
const User = require('../models/User');
const { authenticateToken, optionalAuth, requireOwnership } = require('../middleware/auth');
const { uploadMultiple, handleUploadError, processUploadedFiles } = require('../middleware/upload');

const router = express.Router();

// @route   GET /api/items
// @desc    Get all items with filtering and pagination
// @access  Public
router.get('/', [
  optionalAuth,
  // Middleware to clean empty strings before validation
  (req, res, next) => {
    console.log('Before cleaning - req.query:', req.query);
    // Clean up empty string query parameters
    Object.keys(req.query).forEach(key => {
      if (req.query[key] === '') {
        delete req.query[key];
      }
    });
    console.log('After cleaning - req.query:', req.query);
    next();
  },
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('category').optional().isIn(['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'accessories']).withMessage('Invalid category'),
  query('size').optional().isIn(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size']).withMessage('Invalid size'),
  query('condition').optional().isIn(['new', 'like-new', 'good', 'fair', 'poor']).withMessage('Invalid condition'),
  query('minPoints').optional().isInt({ min: 0 }).withMessage('Min points must be a non-negative integer'),
  query('maxPoints').optional().isInt({ min: 0 }).withMessage('Max points must be a non-negative integer'),
  query('search').optional().trim(),
  query('sortBy').optional().isIn(['createdAt', 'title', 'pointsValue', 'views']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Invalid sort order')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array() 
      });
    }

    const {
      page = 1,
      limit = 12,
      category,
      size,
      condition,
      minPoints,
      maxPoints,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {
      isAvailable: true,
      isApproved: true,
      isRejected: false
    };

    if (category) filter.category = category;
    if (size) filter.size = size;
    if (condition) filter.condition = condition;
    if (minPoints || maxPoints) {
      filter.pointsValue = {};
      if (minPoints) filter.pointsValue.$gte = parseInt(minPoints);
      if (maxPoints) filter.pointsValue.$lte = parseInt(maxPoints);
    }

    // Text search
    if (search) {
      filter.$text = { $search: search };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const items = await Item.find(filter)
      .populate('owner', 'username firstName lastName avatar rating')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Item.countDocuments(filter);
    


    // Add like status for authenticated users
    if (req.user) {
      items.forEach(item => {
        item.isLiked = item.likedBy.includes(req.user._id);
      });
    }

    res.json({
      items,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        hasNext: skip + items.length < total,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ 
      message: 'Error fetching items' 
    });
  }
});

// @route   GET /api/items/featured
// @desc    Get featured items
// @access  Public
router.get('/featured', async (req, res) => {
  try {
    const items = await Item.getFeaturedItems(8);
    res.json({ items });
  } catch (error) {
    console.error('Get featured items error:', error);
    res.status(500).json({ 
      message: 'Error fetching featured items' 
    });
  }
});

// @route   GET /api/items/:id
// @desc    Get item by ID
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('owner', 'username firstName lastName avatar rating bio location createdAt');

    if (!item) {
      return res.status(404).json({ 
        message: 'Item not found' 
      });
    }

    // Increment views
    await item.incrementViews();

    // Add like status for authenticated users
    if (req.user) {
      item.isLiked = item.likedBy.includes(req.user._id);
    }

    res.json({
      item
    });

  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ 
      message: 'Error fetching item' 
    });
  }
});

// @route   POST /api/items/:id/mark-unavailable
// @desc    Owner marks their item as unavailable (removes from database)
// @access  Private (owner only)
router.post('/:id/mark-unavailable', authenticateToken, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ 
        message: 'Item not found' 
      });
    }

    // Check if user is the owner
    if (item.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        message: 'Only the item owner can mark this item as unavailable' 
      });
    }

    // Check if item is available
    if (!item.isAvailable) {
      return res.status(400).json({ 
        message: 'Item is already unavailable' 
      });
    }

    // Delete item from database
    await Item.findByIdAndDelete(req.params.id);

    // Update user's items count
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { itemsCount: -1 }
    });

    res.json({
      message: 'Item marked as unavailable and removed successfully'
    });

  } catch (error) {
    console.error('Mark unavailable error:', error);
    res.status(500).json({ 
      message: 'Error marking item as unavailable' 
    });
  }
});

// @route   POST /api/items
// @desc    Create a new item
// @access  Private
router.post('/', [
  authenticateToken,
  uploadMultiple,
  handleUploadError,
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title is required and must be less than 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description is required and must be less than 1000 characters'),
  body('category')
    .isIn(['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'accessories'])
    .withMessage('Invalid category'),
  body('brand')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Brand must be less than 50 characters'),
  body('size')
    .isIn(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'])
    .withMessage('Invalid size'),
  body('condition')
    .isIn(['new', 'like-new', 'good', 'fair', 'poor'])
    .withMessage('Invalid condition'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Location must be less than 100 characters'),
  body('pointsValue')
    .isInt({ min: 1, max: 10000 })
    .withMessage('Points value must be between 1 and 10000'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Each tag must be less than 20 characters')
], async (req, res) => {
  try {
    console.log('=== ITEM CREATION DEBUG ===');
    console.log('Headers:', req.headers);
    console.log('User object:', req.user);
    console.log('Files:', req.files);
    console.log('Body:', req.body);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array() 
      });
    }

    // Check if user is authenticated
    if (!req.user) {
      console.log('No user found in request');
      return res.status(401).json({ 
        message: 'Authentication required' 
      });
    }

    console.log('User authenticated:', req.user.username);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        message: 'At least one image is required' 
      });
    }

    // Process uploaded images to base64
    const images = processUploadedFiles(req.files);

    // Create item
    const item = new Item({
      ...req.body,
      owner: req.user._id,
      images,
      tags: req.body.tags || []
    });

    await item.save();
    console.log('Item saved successfully:', item._id);

    // Update user's items count
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { itemsCount: 1 }
    });
    console.log('User items count updated for user:', req.user._id);

    // Populate owner info
    await item.populate('owner', 'username firstName lastName avatar');

    res.status(201).json({
      message: 'Item created successfully',
      item
    });

  } catch (error) {
    console.error('Create item error:', error);
    
    res.status(500).json({ 
      message: 'Error creating item' 
    });
  }
});

// @route   PUT /api/items/:id
// @desc    Update an item
// @access  Private (owner only)
router.put('/:id', [
  authenticateToken,
  requireOwnership(Item),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be less than 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('category')
    .optional()
    .isIn(['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'accessories'])
    .withMessage('Invalid category'),

  body('size')
    .optional()
    .isIn(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'])
    .withMessage('Invalid size'),
  body('condition')
    .optional()
    .isIn(['new', 'like-new', 'good', 'fair', 'poor'])
    .withMessage('Invalid condition'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Location must be less than 100 characters'),
  body('pointsValue')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Points value must be between 1 and 10000'),
  body('brand')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Brand must be less than 50 characters'),
  body('material')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Material must be less than 100 characters'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Each tag must be less than 20 characters')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array() 
      });
    }

    const updateData = { ...req.body };
    delete updateData.owner; // Prevent changing owner

    const updatedItem = await Item.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('owner', 'username firstName lastName avatar');

    res.json({
      message: 'Item updated successfully',
      item: updatedItem
    });

  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ 
      message: 'Error updating item' 
    });
  }
});

// @route   DELETE /api/items/:id
// @desc    Delete an item
// @access  Private (owner only)
router.delete('/:id', [authenticateToken, requireOwnership(Item)], async (req, res) => {
  try {
    const item = req.resource;

    // Delete images from Cloudinary
    if (item.images && item.images.length > 0) {
      const publicIds = item.images.map(img => img.publicId);
      await deleteMultipleImages(publicIds);
    }

    // Delete item
    await Item.findByIdAndDelete(req.params.id);

    // Update user's items count
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { itemsCount: -1 }
    });

    res.json({
      message: 'Item deleted successfully'
    });

  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ 
      message: 'Error deleting item' 
    });
  }
});

// @route   POST /api/items/:id/like
// @desc    Toggle like on an item
// @access  Private
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ 
        message: 'Item not found' 
      });
    }

    await item.toggleLike(req.user._id);

    res.json({
      message: 'Like toggled successfully',
      likes: item.likes,
      isLiked: item.isLikedBy(req.user._id)
    });

  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({ 
      message: 'Error toggling like' 
    });
  }
});

// @route   POST /api/items/:id/redeem-owner
// @desc    Owner redeems their own item with points
// @access  Private (owner only)
router.post('/:id/redeem-owner', authenticateToken, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ 
        message: 'Item not found' 
      });
    }

    // Check if user is the owner
    if (item.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        message: 'Only the item owner can redeem this item' 
      });
    }

    // Check if item is available
    if (!item.isAvailable) {
      return res.status(400).json({ 
        message: 'Item is not available for redemption' 
      });
    }

    // Check if user has enough points
    if (req.user.points < item.pointsValue) {
      return res.status(400).json({ 
        message: 'Insufficient points balance' 
      });
    }

    // Deduct points from user
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { points: -item.pointsValue }
    });

    // Mark item as unavailable and add redemption info
    await Item.findByIdAndUpdate(req.params.id, {
      isAvailable: false,
      redeemedBy: req.user._id,
      redeemedAt: new Date(),
      redemptionType: 'owner_purchase'
    });

    // Update user's items count
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { itemsCount: -1 }
    });

    res.json({
      message: 'Item redeemed successfully',
      pointsDeducted: item.pointsValue,
      newBalance: req.user.points - item.pointsValue
    });

  } catch (error) {
    console.error('Owner redemption error:', error);
    res.status(500).json({ 
      message: 'Error redeeming item' 
    });
  }
});

// @route   GET /api/items/user/:userId
// @desc    Get items by user
// @access  Public
router.get('/user/:userId', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const items = await Item.find({
      owner: req.params.userId,
      isAvailable: true,
      isApproved: true,
      isRejected: false
    })
    .populate('owner', 'username firstName lastName avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await Item.countDocuments({
      owner: req.params.userId,
      isAvailable: true,
      isApproved: true,
      isRejected: false
    });

    // Add like status for authenticated users
    if (req.user) {
      items.forEach(item => {
        item.isLiked = item.likedBy.includes(req.user._id);
      });
    }

    res.json({
      items,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        hasNext: skip + items.length < total,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get user items error:', error);
    res.status(500).json({ 
      message: 'Error fetching user items' 
    });
  }
});

module.exports = router; 