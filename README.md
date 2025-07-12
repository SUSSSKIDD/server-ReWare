# ReWear Server

Backend API for the ReWear Community Clothing Exchange platform.

## Features

- **User Authentication**: JWT-based authentication with email/password
- **Item Management**: CRUD operations for clothing items with image upload
- **Swap System**: Direct item swaps and point-based redemptions
- **Admin Panel**: Item moderation and user management
- **Points System**: Virtual currency for item exchanges
- **Image Upload**: Base64 storage in MongoDB Atlas
- **Search & Filtering**: Advanced search with multiple filters
- **Rating System**: User ratings and reviews

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database (MongoDB Atlas)
- **Mongoose** - ODM for MongoDB
- **JWT** - Authentication
- **Base64 Storage** - Image storage in MongoDB
- **Multer** - File upload handling
- **Express Validator** - Input validation
- **bcryptjs** - Password hashing
- **Helmet** - Security middleware
- **CORS** - Cross-origin resource sharing

## Prerequisites

- Node.js (v16 or higher)
- MongoDB Atlas account
- npm or yarn

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   - Copy `env.example` to `.env`
   - Fill in your configuration values:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb+srv://your_username:your_password@your_cluster.mongodb.net/rewear
   JWT_SECRET=your_jwt_secret_key_here
   CLIENT_URL=http://localhost:3000
   ```

4. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/avatar` - Upload user avatar
- `POST /api/auth/change-password` - Change password

### Items

- `GET /api/items` - Get all items (with filtering)
- `GET /api/items/featured` - Get featured items
- `GET /api/items/:id` - Get item by ID
- `POST /api/items` - Create new item
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item
- `POST /api/items/:id/like` - Toggle like on item
- `GET /api/items/user/:userId` - Get items by user

### Swaps

- `POST /api/swaps` - Create swap request
- `GET /api/swaps` - Get user's swaps
- `GET /api/swaps/:id` - Get swap by ID
- `PUT /api/swaps/:id/respond` - Accept/reject swap
- `PUT /api/swaps/:id/complete` - Complete swap
- `PUT /api/swaps/:id/cancel` - Cancel swap
- `POST /api/swaps/:id/rate` - Rate completed swap

### Users

- `GET /api/users/profile/:username` - Get public user profile
- `GET /api/users/search` - Search users
- `GET /api/users/top` - Get top users
- `GET /api/users/stats` - Get user statistics
- `GET /api/users/activity` - Get user activity feed

### Admin

- `GET /api/admin/dashboard` - Get admin dashboard
- `GET /api/admin/items` - Get items for moderation
- `PUT /api/admin/items/:id/approve` - Approve item
- `PUT /api/admin/items/:id/reject` - Reject item
- `DELETE /api/admin/items/:id` - Delete item (admin)
- `GET /api/admin/users` - Get users for management
- `PUT /api/admin/users/:id/role` - Update user role
- `PUT /api/admin/users/:id/points` - Update user points
- `GET /api/admin/reports` - Get platform reports

## Database Models

### User
- Authentication fields (email, password)
- Profile information (name, username, bio, location)
- Points balance and statistics
- Preferences and settings

### Item
- Item details (title, description, category, size, condition)
- Images and metadata
- Points value and availability
- Owner and approval status

### Swap
- Swap request details
- Item references and status
- Points transactions
- Ratings and reviews

## Security Features

- JWT authentication
- Password hashing with bcrypt
- Input validation and sanitization
- Rate limiting
- CORS protection
- Helmet security headers
- File upload restrictions

## Error Handling

- Centralized error handling middleware
- Validation error responses
- Proper HTTP status codes
- Detailed error messages (development only)

## File Upload

- Base64 storage in MongoDB Atlas
- Multiple image support
- File size and type validation
- Automatic cleanup on errors

## Migration from Cloudinary

If you're migrating from a previous version that used Cloudinary, you can convert existing images to the new base64 format:

```bash
# Migrate all images (items and avatars)
npm run migrate

# Migrate only item images
npm run migrate:items

# Migrate only user avatars
npm run migrate:users
```

The migration script will:
1. Download images from Cloudinary URLs
2. Convert them to base64 format
3. Store them in MongoDB Atlas
4. Preserve original images if conversion fails

## Development

### Scripts
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests (to be implemented)
- `npm run migrate` - Run full image migration (Cloudinary to base64)
- `npm run migrate:items` - Migrate only item images
- `npm run migrate:users` - Migrate only user avatars
- `npm run migrate:all` - Run full migration (same as migrate)

### Code Structure
```
server/
├── config/          # Configuration files
├── controllers/     # Route controllers (to be implemented)
├── middleware/      # Custom middleware
├── models/          # Database models
├── routes/          # API routes
├── utils/           # Utility functions
├── server.js        # Main server file
└── package.json     # Dependencies and scripts
```

## Deployment

1. **Environment Variables**
   - Set `NODE_ENV=production`
   - Configure production MongoDB URI
   - Set secure JWT secret

2. **Database**
   - Ensure MongoDB Atlas is properly configured
   - Set up proper indexes for performance

3. **Security**
   - Use HTTPS in production
   - Configure proper CORS origins
   - Set up rate limiting
   - Monitor logs and errors

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details 