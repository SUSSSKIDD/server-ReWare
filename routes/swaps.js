const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Swap = require('../models/Swap');
const Item = require('../models/Item');
const User = require('../models/User');
const { authenticateToken, checkPoints } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/swaps
// @desc    Create a swap request
// @access  Private
router.post('/', [
  authenticateToken,
  body('requestedItem')
    .isMongoId()
    .withMessage('Valid requested item ID is required'),
  body('offeredItems')
    .optional()
    .isArray()
    .withMessage('Offered items must be an array'),
  body('swapType')
    .isIn(['direct', 'points'])
    .withMessage('Swap type must be either "direct" or "points"'),
  body('pointsOffered')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Points offered must be at least 1'),
  body('message')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Message must be less than 500 characters')
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

    const { requestedItem, offeredItems, swapType, pointsOffered, message } = req.body;

    // Get requested item
    const requestedItemDoc = await Item.findById(requestedItem);
    if (!requestedItemDoc) {
      return res.status(404).json({ 
        message: 'Requested item not found' 
      });
    }

    // Check if item is available
    if (!requestedItemDoc.isAvailable || !requestedItemDoc.isApproved) {
      return res.status(400).json({ 
        message: 'Item is not available for swap' 
      });
    }

    // Check if user is trying to swap their own item
    if (requestedItemDoc.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ 
        message: 'You cannot swap your own item' 
      });
    }

    let offeredItemsDocs = [];

    if (swapType === 'direct') {
      // Validate offered items for swap
      if (!offeredItems || offeredItems.length === 0) {
        return res.status(400).json({ 
          message: 'At least one offered item is required for direct swap' 
        });
      }

      // Get all offered items
      offeredItemsDocs = await Item.find({ _id: { $in: offeredItems } });
      
      if (offeredItemsDocs.length !== offeredItems.length) {
        return res.status(404).json({ 
          message: 'One or more offered items not found' 
        });
      }

      // Check if all offered items belong to requester
      for (const item of offeredItemsDocs) {
        if (item.owner.toString() !== req.user._id.toString()) {
          return res.status(403).json({ 
            message: 'You can only offer your own items' 
          });
        }

        // Check if offered item is available
        if (!item.isAvailable || !item.isApproved) {
          return res.status(400).json({ 
            message: 'One or more offered items are not available for swap' 
          });
        }
      }
    } else if (swapType === 'points') {
      // Validate points amount for points-based swap
      if (!pointsOffered) {
        return res.status(400).json({ 
          message: 'Points amount is required for points type' 
        });
      }

      // Check if user has enough points
      if (req.user.points < pointsOffered) {
        return res.status(400).json({ 
          message: `Insufficient points. You need ${pointsOffered} points but have ${req.user.points}` 
        });
      }

      // Check if points amount matches item value
      if (pointsOffered !== requestedItemDoc.pointsValue) {
        return res.status(400).json({ 
          message: `Points amount must match item value (${requestedItemDoc.pointsValue} points)` 
        });
      }
    }

    // Check if there's already a pending swap for this item by this user
    const existingSwap = await Swap.findOne({
      requester: req.user._id,
      requestedItem: requestedItem,
      status: 'pending'
    });

    if (existingSwap) {
      return res.status(400).json({ 
        message: 'You already have a pending swap request for this item' 
      });
    }

    // Create swap request
    const swap = new Swap({
      requester: req.user._id,
      requestedItem: requestedItem,
      offeredItems: swapType === 'direct' ? offeredItems : [],
      swapType,
      pointsOffered: swapType === 'points' ? pointsOffered : 0,
      message: message || ''
    });

    await swap.save();

    // Populate swap with item and user details
    await swap.populate([
      { path: 'requester', select: 'username firstName lastName avatar' },
      { path: 'requestedItem', select: 'title images pointsValue owner' },
      { path: 'offeredItems', select: 'title images pointsValue owner' },
      { path: 'requestedItem.owner', select: 'username firstName lastName avatar' }
    ]);

    res.status(201).json({
      message: 'Swap request created successfully',
      swap
    });

  } catch (error) {
    console.error('Create swap error:', error);
    res.status(500).json({ 
      message: 'Error creating swap request' 
    });
  }
});

// @route   GET /api/swaps
// @desc    Get user's swaps
// @access  Private
router.get('/', [
  authenticateToken,
  query('status').optional().isIn(['pending', 'accepted', 'rejected', 'completed', 'cancelled']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 20 })
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

    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get swaps where user is either requester or item owner using aggregation
    const swapsPipeline = [
      {
        $lookup: {
          from: 'items',
          localField: 'requestedItem',
          foreignField: '_id',
          as: 'requestedItemData'
        }
      },
      {
        $unwind: '$requestedItemData'
      },
      {
        $match: {
          $or: [
            { requester: req.user._id },
            { 'requestedItemData.owner': req.user._id }
          ],
          ...(status && { status })
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'requester',
          foreignField: '_id',
          as: 'requesterData'
        }
      },
      {
        $unwind: '$requesterData'
      },
      {
        $lookup: {
          from: 'users',
          localField: 'requestedItemData.owner',
          foreignField: '_id',
          as: 'ownerData'
        }
      },
      {
        $unwind: '$ownerData'
      },
      {
        $lookup: {
          from: 'items',
          localField: 'offeredItems',
          foreignField: '_id',
          as: 'offeredItemsData'
        }
      },
      {
        $addFields: {
          requestedItem: {
            _id: '$requestedItemData._id',
            title: '$requestedItemData.title',
            images: '$requestedItemData.images',
            pointsValue: '$requestedItemData.pointsValue',
            owner: {
              _id: '$ownerData._id',
              username: '$ownerData.username',
              firstName: '$ownerData.firstName',
              lastName: '$ownerData.lastName',
              avatar: '$ownerData.avatar'
            }
          },
          requester: {
            _id: '$requesterData._id',
            username: '$requesterData.username',
            firstName: '$requesterData.firstName',
            lastName: '$requesterData.lastName',
            avatar: '$requesterData.avatar'
          },
          offeredItems: {
            $map: {
              input: '$offeredItemsData',
              as: 'item',
              in: {
                _id: '$$item._id',
                title: '$$item.title',
                images: '$$item.images',
                pointsValue: '$$item.pointsValue',
                owner: '$$item.owner'
              }
            }
          }
        }
      },
      {
        $project: {
          requestedItemData: 0,
          requesterData: 0,
          ownerData: 0,
          offeredItemsData: 0
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ];

    // Get total count
    const countPipeline = [
      {
        $lookup: {
          from: 'items',
          localField: 'requestedItem',
          foreignField: '_id',
          as: 'requestedItemData'
        }
      },
      {
        $unwind: '$requestedItemData'
      },
      {
        $match: {
          $or: [
            { requester: req.user._id },
            { 'requestedItemData.owner': req.user._id }
          ],
          ...(status && { status })
        }
      },
      {
        $count: 'total'
      }
    ];

    const [swaps, countResult] = await Promise.all([
      Swap.aggregate([...swapsPipeline, { $skip: skip }, { $limit: parseInt(limit) }]),
      Swap.aggregate(countPipeline)
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;

    res.json({
      swaps,
      user: {
        _id: req.user._id
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        hasNext: skip + swaps.length < total,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get swaps error:', error);
    res.status(500).json({ 
      message: 'Error fetching swaps' 
    });
  }
});

// @route   GET /api/swaps/:id
// @desc    Get swap by ID
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const swap = await Swap.findById(req.params.id)
      .populate('requester', 'username firstName lastName avatar')
      .populate('requestedItem', 'title images pointsValue owner')
      .populate('offeredItems', 'title images pointsValue owner')
      .populate('requestedItem.owner', 'username firstName lastName avatar');

    if (!swap) {
      return res.status(404).json({ 
        message: 'Swap not found' 
      });
    }

    // Check if user is involved in this swap
    const isInvolved = swap.requester.toString() === req.user._id.toString() ||
                      swap.requestedItem.owner.toString() === req.user._id.toString();

    if (!isInvolved) {
      return res.status(403).json({ 
        message: 'Access denied' 
      });
    }

    res.json({
      swap
    });

  } catch (error) {
    console.error('Get swap error:', error);
    res.status(500).json({ 
      message: 'Error fetching swap' 
    });
  }
});

// @route   PUT /api/swaps/:id/respond
// @desc    Accept or reject a swap request
// @access  Private (item owner only)
router.put('/:id/respond', [
  authenticateToken,
  body('action')
    .isIn(['accept', 'reject'])
    .withMessage('Action must be either "accept" or "reject"'),
  body('responseMessage')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Response message must be less than 500 characters')
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

    const { action, responseMessage } = req.body;

    const swap = await Swap.findById(req.params.id)
      .populate('requestedItem')
      .populate('offeredItems');

    if (!swap) {
      return res.status(404).json({ 
        message: 'Swap not found' 
      });
    }

    // Check if user owns the requested item
    const requestedItemOwner = swap.requestedItem.owner?._id || swap.requestedItem.owner;
    if (requestedItemOwner.toString() !== req.user._id.toString()) {
      console.log('Ownership check failed:', {
        requestedItemOwner: requestedItemOwner.toString(),
        userId: req.user._id.toString(),
        swapId: swap._id
      });
      return res.status(403).json({ 
        message: 'You can only respond to swaps for your own items' 
      });
    }

    // Check if swap is still pending
    if (swap.status !== 'pending') {
      return res.status(400).json({ 
        message: 'Swap is no longer pending' 
      });
    }

    if (action === 'accept') {
      // Handle points-based swap
      if (swap.swapType === 'points') {
        // Transfer points from requester to owner
        await User.findByIdAndUpdate(swap.requester, {
          $inc: { points: -swap.pointsOffered }
        });

        await User.findByIdAndUpdate(swap.requestedItem.owner, {
          $inc: { points: swap.pointsOffered }
        });

        // Mark items as unavailable
        await Item.findByIdAndUpdate(swap.requestedItem._id, {
          isAvailable: false
        });

        // Update swap status
        swap.status = 'accepted';
        swap.responseMessage = responseMessage || '';
        swap.pointsTransaction = {
          fromUser: swap.requester,
          toUser: swap.requestedItem.owner,
          amount: swap.pointsOffered,
          transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        await swap.save();

        // Update user stats and give bonus points for successful swap
        await User.findByIdAndUpdate(swap.requester, {
          $inc: { swapsCount: 1, points: 100 }
        });
        await User.findByIdAndUpdate(swap.requestedItem.owner, {
          $inc: { swapsCount: 1, points: 100 }
        });

      } else {
        // Handle item swap
        // Mark both items as unavailable
        await Item.findByIdAndUpdate(swap.requestedItem._id, {
          isAvailable: false
        });
        
        // Mark all offered items as unavailable
        for (const offeredItemId of swap.offeredItems) {
          await Item.findByIdAndUpdate(offeredItemId, {
            isAvailable: false
          });
        }

        // Update swap status
        swap.status = 'accepted';
        swap.responseMessage = responseMessage || '';
        await swap.save();

        // Update user stats
        await User.findByIdAndUpdate(swap.requester, {
          $inc: { swapsCount: 1 }
        });
        await User.findByIdAndUpdate(swap.requestedItem.owner, {
          $inc: { swapsCount: 1 }
        });
        await User.findByIdAndUpdate(swap.requester, {
          $inc: { swapsCount: 1, points: 100 }
        });
        await User.findByIdAndUpdate(swap.requestedItem.owner, {
          $inc: { swapsCount: 1, points: 100 }
        });
      }

    } else {
      // Reject swap
      swap.status = 'rejected';
      swap.responseMessage = responseMessage || '';
      await swap.save();
    }

    // Populate swap with updated data
    await swap.populate([
      { path: 'requester', select: 'username firstName lastName avatar' },
      { path: 'requestedItem', select: 'title images pointsValue owner' },
      { path: 'offeredItems', select: 'title images pointsValue owner' },
      { path: 'requestedItem.owner', select: 'username firstName lastName avatar' }
    ]);

    res.json({
      message: `Swap ${action}ed successfully`,
      swap
    });

  } catch (error) {
    console.error('Respond to swap error:', error);
    res.status(500).json({ 
      message: 'Error responding to swap' 
    });
  }
});

// @route   PUT /api/swaps/:id/complete
// @desc    Complete a swap (for item swaps)
// @access  Private
router.put('/:id/complete', authenticateToken, async (req, res) => {
  try {
    const swap = await Swap.findById(req.params.id)
      .populate('requestedItem', 'owner');

    if (!swap) {
      return res.status(404).json({ 
        message: 'Swap not found' 
      });
    }

    // Check if user is involved in this swap
    const isInvolved = swap.requester.toString() === req.user._id.toString() ||
                      swap.requestedItem.owner.toString() === req.user._id.toString();

    if (!isInvolved) {
      return res.status(403).json({ 
        message: 'Access denied' 
      });
    }

    // Check if swap is accepted
    if (swap.status !== 'accepted') {
      return res.status(400).json({ 
        message: 'Swap must be accepted before completion' 
      });
    }

    // Complete the swap
    await swap.completeSwap();

    // Populate swap with updated data for response
    await swap.populate([
      { path: 'requester', select: 'username firstName lastName avatar' },
      { path: 'requestedItem', select: 'title images pointsValue owner' },
      { path: 'offeredItems', select: 'title images pointsValue owner' },
      { path: 'requestedItem.owner', select: 'username firstName lastName avatar' }
    ]);

    res.json({
      message: 'Swap completed successfully',
      swap
    });

  } catch (error) {
    console.error('Complete swap error:', error);
    res.status(500).json({ 
      message: 'Error completing swap' 
    });
  }
});

// @route   PUT /api/swaps/:id/cancel
// @desc    Cancel a swap
// @access  Private
router.put('/:id/cancel', [
  authenticateToken,
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Reason must be less than 200 characters')
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

    const swap = await Swap.findById(req.params.id)
      .populate('requestedItem', 'owner');

    if (!swap) {
      return res.status(404).json({ 
        message: 'Swap not found' 
      });
    }

    // Check if user is involved in this swap
    const isInvolved = swap.requester.toString() === req.user._id.toString() ||
                      swap.requestedItem.owner.toString() === req.user._id.toString();

    if (!isInvolved) {
      return res.status(403).json({ 
        message: 'Access denied' 
      });
    }

    // Check if swap can be cancelled
    if (swap.status !== 'pending' && swap.status !== 'accepted') {
      return res.status(400).json({ 
        message: 'Swap cannot be cancelled in its current state' 
      });
    }

    // Cancel the swap
    await swap.cancelSwap(req.user._id, reason);

    res.json({
      message: 'Swap cancelled successfully',
      swap
    });

  } catch (error) {
    console.error('Cancel swap error:', error);
    res.status(500).json({ 
      message: 'Error cancelling swap' 
    });
  }
});

// @route   POST /api/swaps/:id/rate
// @desc    Rate a completed swap
// @access  Private
router.post('/:id/rate', [
  authenticateToken,
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Comment must be less than 300 characters')
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

    const { rating, comment } = req.body;

    const swap = await Swap.findById(req.params.id);

    if (!swap) {
      return res.status(404).json({ 
        message: 'Swap not found' 
      });
    }

    // Check if user is involved in this swap
    const isInvolved = swap.requester.toString() === req.user._id.toString() ||
                      swap.requestedItem.owner.toString() === req.user._id.toString();

    if (!isInvolved) {
      return res.status(403).json({ 
        message: 'Access denied' 
      });
    }

    // Check if swap is completed
    if (swap.status !== 'completed') {
      return res.status(400).json({ 
        message: 'Can only rate completed swaps' 
      });
    }

    // Add rating
    await swap.addRating(req.user._id, rating, comment);

    res.json({
      message: 'Rating added successfully',
      swap
    });

  } catch (error) {
    console.error('Rate swap error:', error);
    res.status(500).json({ 
      message: 'Error adding rating' 
    });
  }
});

module.exports = router; 