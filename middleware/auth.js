const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    console.log('Auth middleware - authHeader:', authHeader);
    console.log('Auth middleware - token:', token ? 'present' : 'missing');
    console.log('Auth middleware - JWT_SECRET:', process.env.JWT_SECRET ? 'set' : 'missing');

    if (!token) {
      return res.status(401).json({ 
        message: 'Access token required' 
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ 
        message: 'Server configuration error' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Auth middleware - decoded userId:', decoded.userId);
    
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid token - user not found' 
      });
    }

    console.log('Auth middleware - user found:', user.username);
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token' 
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired' 
      });
    }
    
    res.status(500).json({ 
      message: 'Authentication error' 
    });
  }
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      message: 'Authentication required' 
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      message: 'Admin access required' 
    });
  }

  next();
};

// Middleware to check if user owns the resource
const requireOwnership = (resourceModel) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return res.status(404).json({ 
          message: 'Resource not found' 
        });
      }

      if (resource.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ 
          message: 'Access denied - you do not own this resource' 
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({ 
        message: 'Error checking resource ownership' 
      });
    }
  };
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      if (user) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

// Middleware to check if user has enough points
const checkPoints = (requiredPoints) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required' 
      });
    }

    if (req.user.points < requiredPoints) {
      return res.status(400).json({ 
        message: `Insufficient points. You need ${requiredPoints} points but have ${req.user.points}` 
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireOwnership,
  optionalAuth,
  checkPoints
}; 