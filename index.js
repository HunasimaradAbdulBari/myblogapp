const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const { checkForAuthenticationCookie } = require("./middlewares/authentication");

// Import routes
const userRoute = require('./routes/user');
const blogRoute = require('./routes/blog');

// Import models
const Blog = require("./models/blog");

const app = express();
const PORT = process.env.PORT || 8000;

// MongoDB connection with proper error handling and fixed URI
const connectDB = async () => {
  try {
    // Fix MongoDB URI encoding issue
    let mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blogify';
    
    // If using the problematic URI, encode the password properly
    if (mongoURI.includes('Abdul@123')) {
      mongoURI = mongoURI.replace('Abdul@123', encodeURIComponent('Abdul@123'));
    }
    
    console.log('Attempting to connect to MongoDB...');
    
    const conn = await mongoose.connect(mongoURI, {
      // Remove deprecated options
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      socketTimeoutMS: 45000, // 45 seconds socket timeout
      bufferCommands: false,
      bufferMaxEntries: 0
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });
    
  } catch (error) {
    console.error("MongoDB connection error:", error);
    
    // Don't exit the process, continue with limited functionality
    console.log("Running without database connection. Some features may not work.");
    
    // Set a flag to indicate DB is not available
    app.locals.dbAvailable = false;
  }
};

// Initialize database connection
connectDB();

// Set view engine and trust proxy for deployment
app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));
app.set('trust proxy', 1);

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(checkForAuthenticationCookie("token"));
app.use(express.static(path.resolve("./public")));

// Database availability middleware
const checkDBConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).render('error', { 
      user: req.user, 
      error: 'Database temporarily unavailable. Please try again later.' 
    });
  }
  next();
};

// Enhanced home route with better error handling
app.get('/', async (req, res) => {
  try {
    // Check if database is available
    if (mongoose.connection.readyState !== 1) {
      return res.render('home', {
        user: req.user,
        blogs: [],
        currentPage: 1,
        totalPages: 1,
        totalBlogs: 0,
        search: '',
        tag: '',
        trendingTags: [],
        popularBlogs: [],
        dbError: true
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const search = req.query.search || '';
    const tag = req.query.tag || '';

    let query = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { body: { $regex: search, $options: 'i' } }
      ];
    }
    if (tag) {
      query.tags = { $in: [tag] };
    }

    // Use Promise.allSettled to handle individual query failures
    const [blogsResult, tagsResult, popularResult] = await Promise.allSettled([
      (async () => {
        const totalBlogs = await Blog.countDocuments(query);
        const totalPages = Math.ceil(totalBlogs / limit);
        const skip = (page - 1) * limit;
        
        const allBlogs = await Blog.find(query)
          .populate("createdBy")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit);
        
        return { totalBlogs, totalPages, allBlogs };
      })(),
      
      Blog.aggregate([
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      
      Blog.find()
        .populate("createdBy")
        .sort({ views: -1 })
        .limit(5)
    ]);

    // Extract results or use defaults
    const { totalBlogs = 0, totalPages = 1, allBlogs = [] } = blogsResult.status === 'fulfilled' ? blogsResult.value : {};
    const trendingTags = tagsResult.status === 'fulfilled' ? tagsResult.value : [];
    const popularBlogs = popularResult.status === 'fulfilled' ? popularResult.value : [];

    res.render('home', {
      user: req.user,
      blogs: allBlogs,
      currentPage: page,
      totalPages,
      totalBlogs,
      search,
      tag,
      trendingTags,
      popularBlogs
    });
  } catch (error) {
    console.error("Error fetching home page data:", error);
    res.render('home', {
      user: req.user,
      blogs: [],
      currentPage: 1,
      totalPages: 1,
      totalBlogs: 0,
      search: req.query.search || '',
      tag: req.query.tag || '',
      trendingTags: [],
      popularBlogs: [],
      error: 'Unable to load content. Please refresh the page.'
    });
  }
});

// API endpoint for blog stats with better error handling
app.get('/api/stats', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        totalBlogs: 0,
        totalViews: 0,
        error: 'Database unavailable'
      });
    }
    
    const [totalBlogs, totalViewsResult] = await Promise.allSettled([
      Blog.countDocuments(),
      Blog.aggregate([
        { $group: { _id: null, total: { $sum: "$views" } } }
      ])
    ]);
    
    const blogsCount = totalBlogs.status === 'fulfilled' ? totalBlogs.value : 0;
    const viewsData = totalViewsResult.status === 'fulfilled' ? totalViewsResult.value : [];
    
    res.json({
      totalBlogs: blogsCount,
      totalViews: viewsData[0]?.total || 0
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ 
      totalBlogs: 0,
      totalViews: 0,
      error: 'Failed to fetch stats' 
    });
  }
});

// Apply DB check middleware to routes that need database
app.use('/user', userRoute);
app.use('/blog', checkDBConnection, blogRoute);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { user: req.user });
});

// Enhanced error handler
app.use((error, req, res, next) => {
  console.error('Application error:', error.stack);
  
  // Handle specific MongoDB errors
  if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
    return res.status(503).render('error', { 
      user: req.user, 
      error: 'Database connection issue. Please try again later.' 
    });
  }
  
  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).render('error', { 
      user: req.user, 
      error: 'Invalid data provided. Please check your input.' 
    });
  }
  
  // Generic error response
  res.status(500).render('error', { 
    user: req.user, 
    error: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong. Please try again.' 
      : error.message 
  });
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server started at PORT: ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
