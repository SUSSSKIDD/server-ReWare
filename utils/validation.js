const { body } = require('express-validator');

// Common validation patterns
const commonValidations = {
  // Email validation
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),

  // Password validation
  password: body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  // Name validation
  firstName: body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name can only contain letters and spaces'),

  lastName: body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),

  // Username validation
  username: body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3-30 characters long')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),

  // Item validation
  itemTitle: body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title is required and must be less than 100 characters'),

  itemDescription: body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description is required and must be less than 1000 characters'),

  itemCategory: body('category')
    .isIn(['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'accessories'])
    .withMessage('Invalid category'),

  itemSize: body('size')
    .isIn(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'])
    .withMessage('Invalid size'),

  itemCondition: body('condition')
    .isIn(['new', 'like-new', 'good', 'fair', 'poor'])
    .withMessage('Invalid condition'),

  itemColor: body('color')
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Color is required and must be less than 30 characters'),

  itemPointsValue: body('pointsValue')
    .isInt({ min: 10, max: 1000 })
    .withMessage('Points value must be between 10 and 1000'),

  // Message validation
  message: body('message')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Message must be less than 500 characters'),

  // Bio validation
  bio: body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio must be less than 500 characters'),

  // Location validation
  location: body('location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Location must be less than 100 characters')
};

// Validation middleware for registration
const registerValidation = [
  commonValidations.email,
  commonValidations.password,
  commonValidations.firstName,
  commonValidations.lastName,
  commonValidations.username
];

// Validation middleware for login
const loginValidation = [
  commonValidations.email,
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Validation middleware for item creation
const createItemValidation = [
  commonValidations.itemTitle,
  commonValidations.itemDescription,
  commonValidations.itemCategory,
  body('type')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Type is required and must be less than 50 characters'),
  commonValidations.itemSize,
  commonValidations.itemCondition,
  commonValidations.itemColor,
  commonValidations.itemPointsValue,
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
];

// Validation middleware for swap creation
const createSwapValidation = [
  body('requestedItemId')
    .isMongoId()
    .withMessage('Valid requested item ID is required'),
  body('offeredItemId')
    .optional()
    .isMongoId()
    .withMessage('Valid offered item ID is required'),
  body('type')
    .isIn(['swap', 'points'])
    .withMessage('Type must be either "swap" or "points"'),
  body('pointsAmount')
    .optional()
    .isInt({ min: 10 })
    .withMessage('Points amount must be at least 10'),
  commonValidations.message
];

// Validation middleware for profile update
const updateProfileValidation = [
  commonValidations.firstName.optional(),
  commonValidations.lastName.optional(),
  commonValidations.bio,
  commonValidations.location
];

// Validation middleware for password change
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  commonValidations.password
];

// Validation middleware for admin actions
const adminValidation = {
  approveItem: [],
  rejectItem: [
    body('reason')
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Rejection reason is required and must be less than 500 characters')
  ],
  updateUserRole: [
    body('role')
      .isIn(['user', 'admin'])
      .withMessage('Role must be either "user" or "admin"')
  ],
  updateUserPoints: [
    body('points')
      .isInt({ min: 0 })
      .withMessage('Points must be a non-negative integer')
  ]
};

module.exports = {
  commonValidations,
  registerValidation,
  loginValidation,
  createItemValidation,
  createSwapValidation,
  updateProfileValidation,
  changePasswordValidation,
  adminValidation
}; 