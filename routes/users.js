const express = require('express');
const { query, validationResult } = require('express-validator');
const User = require('../models/User');
const Item = require('../models/Item');
const Swap = require('../models/Swap');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/profile/:username
// @desc    Get public user profile
// @access  Public
router.get('/profile/:username', optionalAuth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password -email -role -isVerified');

    if (!user) {
      return res.status(404).json({ 
        message: 'User not found' 
      });
    }

    // Get user's items count
    const itemsCount = await Item.countDocuments({
      owner: user._id,
      isAvailable: true,
      isApproved: true,
      isRejected: false
    });

    // Get user's completed swaps count
    const swapsCount = await Swap.countDocuments({
      $or: [
        { requester: user._id, status: 'completed' },
        { 'requestedItem.owner': user._id, status: 'completed' }
      ]
    });

    const profile = {
      ...user.toObject(),
      itemsCount,
      swapsCount
    };

    res.json({
      profile
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ 
      message: 'Error fetching user profile' 
    });
  }
});

// @route   GET /api/users/search
// @desc    Search users
// @access  Public
router.get('/search', [
  query('q')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Search query is required'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20')
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

    const { q, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Search users by username, firstName, or lastName
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } }
      ]
    })
    .select('-password -email -role -isVerified')
    .sort({ username: 1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await User.countDocuments({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } }
      ]
    });

    res.json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        hasNext: skip + users.length < total,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ 
      message: 'Error searching users' 
    });
  }
});

// @route   GET /api/users/top
// @desc    Get top users by rating
// @access  Public
router.get('/top', [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
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

    const { limit = 10 } = req.query;

    const users = await User.find({
      rating: { $gt: 0 },
      reviewsCount: { $gt: 0 }
    })
    .select('-password -email -role -isVerified')
    .sort({ rating: -1, reviewsCount: -1 })
    .limit(parseInt(limit));

    res.json({
      users
    });

  } catch (error) {
    console.error('Get top users error:', error);
    res.status(500).json({ 
      message: 'Error fetching top users' 
    });
  }
});

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    console.log('Getting stats for user:', userId);

    // Get user's items
    const itemsCount = await Item.countDocuments({ owner: userId });
    const availableItemsCount = await Item.countDocuments({
      owner: userId,
      isAvailable: true,
      isApproved: true,
      isRejected: false
    });
    
    console.log('Items count:', itemsCount, 'Available items:', availableItemsCount);

    // Get user's swaps
    const totalSwaps = await Swap.countDocuments({
      $or: [
        { requester: userId },
        { 'requestedItem.owner': userId }
      ]
    });

    const completedSwaps = await Swap.countDocuments({
      $or: [
        { requester: userId, status: 'completed' },
        { 'requestedItem.owner': userId, status: 'completed' }
      ]
    });

    const pendingSwaps = await Swap.countDocuments({
      $or: [
        { requester: userId, status: 'pending' },
        { 'requestedItem.owner': userId, status: 'pending' }
      ]
    });

    const stats = {
      items: {
        total: itemsCount,
        available: availableItemsCount
      },
      swaps: {
        total: totalSwaps,
        completed: completedSwaps,
        pending: pendingSwaps
      },
      points: req.user.points || 0,
      rating: req.user.rating || 0,
      reviewsCount: req.user.reviewsCount || 0
    };

    res.json({
      stats
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      message: 'Error fetching user statistics' 
    });
  }
});

// @route   GET /api/users/activity
// @desc    Get user activity feed
// @access  Private
router.get('/activity', [
  authenticateToken,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20')
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

    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const userId = req.user._id;

    // Get user's items and swaps
    const [items, swaps] = await Promise.all([
      Item.find({ owner: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('title images createdAt isAvailable isApproved'),
      Swap.find({
        $or: [
          { requester: userId },
          { 'requestedItem.owner': userId }
        ]
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('requestedItem', 'title images')
      .populate('offeredItems', 'title images')
      .select('status swapType createdAt')
    ]);

    // Combine and sort activities
    const activities = [
      ...items.map(item => ({
        type: 'item',
        data: item,
        date: item.createdAt
      })),
      ...swaps.map(swap => ({
        type: 'swap',
        data: swap,
        date: swap.createdAt
      }))
    ].sort((a, b) => b.date - a.date);

    const total = await Promise.all([
      Item.countDocuments({ owner: userId }),
      Swap.countDocuments({
        $or: [
          { requester: userId },
          { 'requestedItem.owner': userId }
        ]
      })
    ]);

    const totalActivities = total[0] + total[1];

    res.json({
      activities,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalActivities / parseInt(limit)),
        totalItems: totalActivities,
        hasNext: skip + activities.length < totalActivities,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({ 
      message: 'Error fetching user activity' 
    });
  }
});

module.exports = router; 