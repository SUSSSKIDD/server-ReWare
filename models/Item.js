const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  category: {
    type: String,
    required: true,
    enum: ['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'accessories']
  },
  size: {
    type: String,
    required: true,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size']
  },
  condition: {
    type: String,
    required: true,
    enum: ['new', 'like-new', 'good', 'fair', 'poor']
  },
  brand: {
    type: String,
    trim: true,
    maxlength: 50,
    default: 'Unknown'
  },
  material: {
    type: String,
    trim: true,
    maxlength: 100
  },
  images: [{
    data: {
      type: String, // Base64 encoded image data
      required: true
    },
    contentType: {
      type: String, // MIME type (e.g., 'image/jpeg', 'image/png')
      required: true
    },
    filename: {
      type: String, // Original filename
      required: true
    }
  }],
  tags: [{
    type: String,
    trim: true,
    maxlength: 20
  }],
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pointsValue: {
    type: Number,
    required: true,
    min: 1,
    max: 10000
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  isApproved: {
    type: Boolean,
    default: true
  },
  isRejected: {
    type: Boolean,
    default: false
  },
  rejectionReason: {
    type: String,
    maxlength: 500
  },
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  swapRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Swap'
  }],
  location: {
    type: String,
    maxlength: 100
  },
  measurements: {
    chest: Number,
    waist: Number,
    hips: Number,
    length: Number,
    shoulders: Number,
    sleeveLength: Number,
    inseam: Number
  },
  careInstructions: {
    type: String,
    maxlength: 200
  },
  originalPrice: {
    type: Number,
    min: 0
  },
  age: {
    type: Number, // in months
    min: 0
  },
  season: {
    type: String,
    enum: ['spring', 'summer', 'fall', 'winter', 'all-season']
  },
  style: {
    type: String,
    enum: ['casual', 'formal', 'business', 'sporty', 'vintage', 'bohemian', 'minimalist', 'streetwear']
  },
  // Redemption fields
  redeemedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  redeemedAt: {
    type: Date
  },
  redemptionType: {
    type: String,
    enum: ['owner_purchase', 'swap_redeem']
  }
}, {
  timestamps: true
});

// Indexes for better query performance
itemSchema.index({ owner: 1 });
itemSchema.index({ category: 1 });
itemSchema.index({ isAvailable: 1, isApproved: 1 });
itemSchema.index({ pointsValue: 1 });
itemSchema.index({ createdAt: -1 });
itemSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Virtual for main image
itemSchema.virtual('mainImage').get(function() {
  return this.images.length > 0 ? this.images[0] : null;
});

// Virtual for owner info (populated)
itemSchema.virtual('ownerInfo', {
  ref: 'User',
  localField: 'owner',
  foreignField: '_id',
  justOne: true
});

// Method to increment views
itemSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Method to toggle like
itemSchema.methods.toggleLike = function(userId) {
  const index = this.likedBy.indexOf(userId);
  if (index > -1) {
    this.likedBy.splice(index, 1);
    this.likes -= 1;
  } else {
    this.likedBy.push(userId);
    this.likes += 1;
  }
  return this.save();
};

// Method to check if user liked the item
itemSchema.methods.isLikedBy = function(userId) {
  return this.likedBy.includes(userId);
};

// Static method to get featured items
itemSchema.statics.getFeaturedItems = function(limit = 10) {
  return this.find({
    isAvailable: true,
    isApproved: true,
    isRejected: false
  })
  .sort({ views: -1, likes: -1, createdAt: -1 })
  .limit(limit)
  .populate('owner', 'username firstName lastName avatar rating');
};

// Ensure virtual fields are serialized
itemSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Item', itemSchema); 