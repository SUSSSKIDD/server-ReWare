const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Item = require('../models/Item');
const User = require('../models/User');
const Swap = require('../models/Swap');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { deleteMultipleImages } = require('../middleware/upload');

const router = express.Router();

// Apply admin middleware to all routes
router.use(authenticateToken, requireAdmin);

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Admin only
router.get('/dashboard', async (req, res) => {
  try {
    // Get platform statistics
    const [
      totalUsers,
      totalItems
    ] = await Promise.all([
      User.countDocuments(),
      Item.countDocuments()
    ]);

    // Get recent items
    const recentItems = await Item.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('owner', 'username firstName lastName')
      .select('title isApproved isRejected createdAt');

    const stats = {
      users: {
        total: totalUsers
      },
      items: {
        total: totalItems
      },
      recentActivity: {
        items: recentItems
      }
    };

    res.json({
      stats
    });

  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({ 
      message: 'Error fetching admin dashboard' 
    });
  }
});

// @route   GET /api/admin/items
// @desc    Get items for moderation
// @access  Admin only
router.get('/items', [
  query('status')
    .optional()
    .isIn(['all', 'pending', 'approved', 'rejected'])
    .withMessage('Invalid status'),
  query('search')
    .optional()
    .trim(),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
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

    const { status, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter
    const filter = {};
    
    // Status filter
    if (status === 'pending') {
      filter.isApproved = false;
      filter.isRejected = false;
    } else if (status === 'approved') {
      filter.isApproved = true;
    } else if (status === 'rejected') {
      filter.isRejected = true;
    }

    // Search filter
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { 'owner.firstName': { $regex: search, $options: 'i' } },
        { 'owner.lastName': { $regex: search, $options: 'i' } },
        { 'owner.username': { $regex: search, $options: 'i' } }
      ];
    }

    const items = await Item.find(filter)
      .populate('owner', 'username firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Item.countDocuments(filter);

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
    console.error('Get admin items error:', error);
    res.status(500).json({ 
      message: 'Error fetching items for moderation' 
    });
  }
});

// @route   PUT /api/admin/items/:id/approve
// @desc    Approve an item
// @access  Admin only
router.put('/items/:id/approve', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ 
        message: 'Item not found' 
      });
    }

    if (item.isApproved) {
      return res.status(400).json({ 
        message: 'Item is already approved' 
      });
    }

    item.isApproved = true;
    item.isRejected = false;
    item.rejectionReason = null;
    await item.save();

    res.json({
      message: 'Item approved successfully',
      item
    });

  } catch (error) {
    console.error('Approve item error:', error);
    res.status(500).json({ 
      message: 'Error approving item' 
    });
  }
});

// @route   PUT /api/admin/items/:id/reject
// @desc    Reject an item
// @access  Admin only
router.put('/items/:id/reject', [
  body('reason')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Rejection reason is required and must be less than 500 characters')
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

    const { reason } = req.body;

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ 
        message: 'Item not found' 
      });
    }

    if (item.isRejected) {
      return res.status(400).json({ 
        message: 'Item is already rejected' 
      });
    }

    item.isApproved = false;
    item.isRejected = true;
    item.rejectionReason = reason;
    await item.save();

    res.json({
      message: 'Item rejected successfully',
      item
    });

  } catch (error) {
    console.error('Reject item error:', error);
    res.status(500).json({ 
      message: 'Error rejecting item' 
    });
  }
});

// @route   DELETE /api/admin/items/:id
// @desc    Delete an item (admin override)
// @access  Admin only
router.delete('/items/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ 
        message: 'Item not found' 
      });
    }

    // Delete images from Cloudinary
    if (item.images && item.images.length > 0) {
      const publicIds = item.images.map(img => img.publicId);
      await deleteMultipleImages(publicIds);
    }

    // Delete item
    await Item.findByIdAndDelete(req.params.id);

    // Update user's items count
    await User.findByIdAndUpdate(item.owner, {
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

// @route   GET /api/admin/users
// @desc    Get users for admin management
// @access  Admin only
router.get('/users', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('search')
    .optional()
    .trim()
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

    const { page = 1, limit = 20, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter
    const filter = {};
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

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
    console.error('Get admin users error:', error);
    res.status(500).json({ 
      message: 'Error fetching users' 
    });
  }
});

// @route   PUT /api/admin/users/:id/role
// @desc    Update user role
// @access  Admin only
router.put('/users/:id/role', [
  body('role')
    .isIn(['user', 'admin'])
    .withMessage('Role must be either "user" or "admin"')
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

    const { role } = req.body;

    // Prevent admin from removing their own admin role
    if (req.params.id === req.user._id.toString() && role === 'user') {
      return res.status(400).json({ 
        message: 'You cannot remove your own admin role' 
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ 
        message: 'User not found' 
      });
    }

    res.json({
      message: 'User role updated successfully',
      user
    });

  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ 
      message: 'Error updating user role' 
    });
  }
});

// @route   PUT /api/admin/users/:id/points
// @desc    Update user points
// @access  Admin only
router.put('/users/:id/points', [
  body('points')
    .isInt({ min: 0 })
    .withMessage('Points must be a non-negative integer')
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

    const { points } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { points },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ 
        message: 'User not found' 
      });
    }

    res.json({
      message: 'User points updated successfully',
      user
    });

  } catch (error) {
    console.error('Update user points error:', error);
    res.status(500).json({ 
      message: 'Error updating user points' 
    });
  }
});

// @route   GET /api/admin/reports
// @desc    Get platform reports
// @access  Admin only
router.get('/reports', [
  query('type')
    .optional()
    .isIn(['items', 'users', 'swaps'])
    .withMessage('Invalid report type'),
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('Invalid period')
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

    const { type = 'items', period = 'month' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    let report;

    switch (type) {
      case 'items':
        const [totalItems, approvedItems, rejectedItems, pendingItems] = await Promise.all([
          Item.countDocuments({ createdAt: { $gte: startDate } }),
          Item.countDocuments({ 
            createdAt: { $gte: startDate },
            isApproved: true 
          }),
          Item.countDocuments({ 
            createdAt: { $gte: startDate },
            isRejected: true 
          }),
          Item.countDocuments({ 
            createdAt: { $gte: startDate },
            isApproved: false,
            isRejected: false 
          })
        ]);

        report = {
          total: totalItems,
          approved: approvedItems,
          rejected: rejectedItems,
          pending: pendingItems
        };
        break;

      case 'users':
        const [totalUsers, newUsers, activeUsers] = await Promise.all([
          User.countDocuments({ createdAt: { $gte: startDate } }),
          User.countDocuments({ createdAt: { $gte: startDate } }),
          User.countDocuments({ 
            $or: [
              { itemsCount: { $gt: 0 } },
              { swapsCount: { $gt: 0 } }
            ]
          })
        ]);

        report = {
          total: totalUsers,
          new: newUsers,
          active: activeUsers
        };
        break;

      case 'swaps':
        const [totalSwaps, completedSwaps, pendingSwaps, cancelledSwaps] = await Promise.all([
          Swap.countDocuments({ createdAt: { $gte: startDate } }),
          Swap.countDocuments({ 
            createdAt: { $gte: startDate },
            status: 'completed' 
          }),
          Swap.countDocuments({ 
            createdAt: { $gte: startDate },
            status: 'pending' 
          }),
          Swap.countDocuments({ 
            createdAt: { $gte: startDate },
            status: 'cancelled' 
          })
        ]);

        report = {
          total: totalSwaps,
          completed: completedSwaps,
          pending: pendingSwaps,
          cancelled: cancelledSwaps
        };
        break;
    }

    res.json({
      report,
      period,
      type
    });

  } catch (error) {
    console.error('Get admin reports error:', error);
    res.status(500).json({ 
      message: 'Error fetching reports' 
    });
  }
});

module.exports = router; 