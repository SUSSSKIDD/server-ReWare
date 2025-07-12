const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist (for temporary processing)
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer for file upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Middleware for single image upload
const uploadSingle = upload.single('image');

// Middleware for multiple images upload
const uploadMultiple = upload.array('images', 5);

// Error handling middleware for upload errors
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'File too large. Maximum size is 5MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        message: 'Too many files. Maximum is 5 files'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: 'Unexpected file field'
      });
    }
  }
  
  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({
      message: error.message
    });
  }
  
  console.error('Upload error:', error);
  res.status(500).json({
    message: 'Error uploading file'
  });
};

// Utility function to convert file to base64
const convertFileToBase64 = (filePath) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64String = fileBuffer.toString('base64');
    return base64String;
  } catch (error) {
    console.error('Error converting file to base64:', error);
    throw error;
  }
};

// Utility function to get MIME type from file extension
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/jpeg';
};

// Utility function to process uploaded files and convert to base64
const processUploadedFiles = (files) => {
  const processedImages = [];
  
  for (const file of files) {
    try {
      const base64Data = convertFileToBase64(file.path);
      const mimeType = getMimeType(file.originalname);
      
      processedImages.push({
        data: base64Data,
        contentType: mimeType,
        filename: file.originalname
      });
      
      // Clean up temporary file
      fs.unlinkSync(file.path);
    } catch (error) {
      console.error('Error processing file:', file.originalname, error);
      // Clean up temporary file even if processing fails
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw error;
    }
  }
  
  return processedImages;
};

// Utility function to process single uploaded file
const processSingleFile = (file) => {
  try {
    const base64Data = convertFileToBase64(file.path);
    const mimeType = getMimeType(file.originalname);
    
    const processedImage = {
      data: base64Data,
      contentType: mimeType,
      filename: file.originalname
    };
    
    // Clean up temporary file
    fs.unlinkSync(file.path);
    
    return processedImage;
  } catch (error) {
    console.error('Error processing file:', file.originalname, error);
    // Clean up temporary file even if processing fails
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    throw error;
  }
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  handleUploadError,
  processUploadedFiles,
  processSingleFile
}; 