const mongoose = require('mongoose');

const swapSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestedItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  offeredItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item'
  }],
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'completed', 'cancelled'],
    default: 'pending'
  },
  swapType: {
    type: String,
    enum: ['direct', 'points'],
    required: true
  },
  pointsOffered: {
    type: Number,
    min: 0,
    default: 0
  },
  message: {
    type: String,
    maxlength: 500,
    default: ''
  },
  responseMessage: {
    type: String,
    maxlength: 500,
    default: ''
  },
  meetingLocation: {
    type: String,
    maxlength: 200
  },
  meetingDate: {
    type: Date
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancellationReason: {
    type: String,
    maxlength: 200
  },
  rating: {
    requesterRating: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, maxlength: 300 },
      createdAt: { type: Date }
    },
    ownerRating: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, maxlength: 300 },
      createdAt: { type: Date }
    }
  },
  pointsTransaction: {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    amount: {
      type: Number,
      default: 0
    },
    transactionId: {
      type: String
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
swapSchema.index({ requester: 1 });
swapSchema.index({ requestedItem: 1 });
swapSchema.index({ status: 1 });
swapSchema.index({ createdAt: -1 });

// Virtual for swap duration
swapSchema.virtual('duration').get(function() {
  if (this.completedAt && this.createdAt) {
    return Math.floor((this.completedAt - this.createdAt) / (1000 * 60 * 60 * 24)); // days
  }
  return null;
});

// Method to accept swap
swapSchema.methods.acceptSwap = function(responseMessage = '') {
  this.status = 'accepted';
  this.responseMessage = responseMessage;
  return this.save();
};

// Method to reject swap
swapSchema.methods.rejectSwap = function(responseMessage = '') {
  this.status = 'rejected';
  this.responseMessage = responseMessage;
  return this.save();
};

// Method to complete swap
swapSchema.methods.completeSwap = function() {
  this.status = 'completed';
  this.isCompleted = true;
  this.completedAt = new Date();
  return this.save();
};

// Method to cancel swap
swapSchema.methods.cancelSwap = function(userId, reason = '') {
  this.status = 'cancelled';
  this.cancelledBy = userId;
  this.cancellationReason = reason;
  return this.save();
};

// Method to add rating
swapSchema.methods.addRating = function(userId, rating, comment) {
  if (userId.toString() === this.requester.toString()) {
    this.rating.requesterRating = {
      rating,
      comment,
      createdAt: new Date()
    };
  } else {
    this.rating.ownerRating = {
      rating,
      comment,
      createdAt: new Date()
    };
  }
  return this.save();
};

// Static method to get user's swaps
swapSchema.statics.getUserSwaps = function(userId, status = null) {
  const matchStage = {
    $or: [
      { requester: userId },
      { 'requestedItem.owner': userId }
    ]
  };
  
  if (status) {
    matchStage.status = status;
  }
  
  return this.aggregate([
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
          { requester: userId },
          { 'requestedItemData.owner': userId }
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
  ]);
};

// Ensure virtual fields are serialized
swapSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Swap', swapSchema); 