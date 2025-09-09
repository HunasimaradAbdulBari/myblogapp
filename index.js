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

// MongoDB connection with proper URL encoding and NO deprecated options
const connectDB = async () => {
  try {
    // Your MongoDB URI with proper encoding
    let mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blogify';
    
    // Fix the URI format - encode the password properly
    if (mongoURI.includes('Abdul@123')) {
      mongoURI = mongoURI.replace('Abdul@123', 'Abdul%40123');
    }
    
    // Add database name if not present
    if (mongoURI.endsWith('.net/')) {
      mongoURI += 'blogify';
    }
    
    console.log('Attempting to connect to MongoDB...');
    
    // Connect with ONLY supported options for newer MongoDB driver
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 15000, // 15 seconds
      socketTimeoutMS: 45000,          // 45 seconds
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
    
    // Connection event handlers
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
    console.error("MongoDB connection failed:", error.message);
    console.log("Server will continue running without database connection");
    
    // Don't exit process - continue without DB
    app.locals.dbError = true;
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

// Database availability checker
const isDBConnected = () => {
  return mongoose.connection.readyState === 1;
};

// Enhanced home route with database checks
app.get('/', async (req, res) => {
  try {
    // Check database connection
    if (!isDBConnected()) {
      console.log('Database not connected, serving static home page');
      return res.render('home', {
        user: req.user,
        blogs: [],
        currentPage: 1,
        totalPages: 1,
        totalBlogs: 0,
        search: req.query.search || '',
        tag: req.query.tag || '',
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

    // Execute queries with timeout protection
    const queryPromises = [
      Blog.countDocuments(query).maxTimeMS(10000),
      Blog.find(query)
        .populate("createdBy")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .maxTimeMS(10000),
      Blog.aggregate([
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).maxTimeMS(5000),
      Blog.find()
        .populate("createdBy")
        .sort({ views: -1 })
        .limit(5)
        .maxTimeMS(5000)
    ];

    const [totalBlogs, allBlogs, trendingTags, popularBlogs] = await Promise.all(queryPromises);
    const totalPages = Math.ceil(totalBlogs / limit);

    res.render('home', {
      user: req.user,
      blogs: allBlogs,
      currentPage: page,
      totalPages,
      totalBlogs,
      search,
      tag,
      trendingTags: trendingTags || [],
      popularBlogs: popularBlogs || []
    });

  } catch (error) {
    console.error("Error loading home page:", error.message);
    
    // Render with empty data but show the page
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
      error: 'Unable to load content. Please try refreshing the page.'
    });
  }
});

// API endpoint for blog stats
app.get('/api/stats', async (req, res) => {
  try {
    if (!isDBConnected()) {
      return res.json({
        totalBlogs: 0,
        totalViews: 0,
        error: 'Database unavailable'
      });
    }
    
    const totalBlogs = await Blog.countDocuments().maxTimeMS(5000);
    const totalViewsResult = await Blog.aggregate([
      { $group: { _id: null, total: { $sum: "$views" } } }
    ]).maxTimeMS(5000);
    
    res.json({
      totalBlogs,
      totalViews: totalViewsResult[0]?.total || 0
    });
  } catch (error) {
    console.error("Stats API error:", error);
    res.json({
      totalBlogs: 0,
      totalViews: 0,
      error: 'Unable to fetch stats'
    });
  }
});

// Routes
app.use('/user', userRoute);
app.use('/blog', blogRoute);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database: isDBConnected() ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { user: req.user });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Application error:', error.stack);
  
  // Handle specific error types
  if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
    return res.status(503).render('error', { 
      user: req.user, 
      error: 'Database temporarily unavailable. Please try again in a few moments.' 
    });
  }
  
  if (error.name === 'ValidationError') {
    return res.status(400).render('error', { 
      user: req.user, 
      error: 'Invalid data provided. Please check your input.' 
    });
  }
  
  // Generic error
  res.status(500).render('error', { 
    user: req.user, 
    error: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong. Please try again.' 
      : error.message 
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully`);
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    }
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

app.listen(PORT, () => {
  console.log(`🚀 Server started at PORT: ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});
