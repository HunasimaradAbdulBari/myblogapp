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

// MongoDB connection with better error handling
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blogify', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

connectDB();

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));

// Trust proxy for deployment
app.set('trust proxy', 1);

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(checkForAuthenticationCookie("token"));
app.use(express.static(path.resolve("./public")));

// Enhanced home route with search and filtering
app.get('/', async (req, res) => {
  try {
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

    const totalBlogs = await Blog.countDocuments(query);
    const totalPages = Math.ceil(totalBlogs / limit);
    const skip = (page - 1) * limit;

    const allBlogs = await Blog.find(query)
      .populate("createdBy")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get trending tags
    const trendingTags = await Blog.aggregate([
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get popular blogs (by views)
    const popularBlogs = await Blog.find()
      .populate("createdBy")
      .sort({ views: -1 })
      .limit(5);

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
    console.error("Error fetching blogs:", error);
    res.render('home', {
      user: req.user,
      blogs: [],
      currentPage: 1,
      totalPages: 1,
      totalBlogs: 0,
      search: '',
      tag: '',
      trendingTags: [],
      popularBlogs: []
    });
  }
});

// API endpoint for blog stats
app.get('/api/stats', async (req, res) => {
  try {
    const totalBlogs = await Blog.countDocuments();
    const totalViews = await Blog.aggregate([
      { $group: { _id: null, total: { $sum: "$views" } } }
    ]);
    
    res.json({
      totalBlogs,
      totalViews: totalViews[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.use('/user', userRoute);
app.use('/blog', blogRoute);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { user: req.user });
});

// Error handler
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).render('error', { user: req.user, error: error.message });
});

app.listen(PORT, () => console.log(`Server started at PORT: ${PORT}`));

