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

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/blogify', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected successfully"))
.catch(err => console.log("MongoDB connection error:", err));

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(checkForAuthenticationCookie("token"));
app.use(express.static(path.resolve("./public")));

// Routes
app.get('/', async (req, res) => {
  try {
    const allBlogs = await Blog.find({}).populate("createdBy").sort({ createdAt: -1 });
    res.render('home', {
      user: req.user,
      blogs: allBlogs,
    });
  } catch (error) {
    console.error("Error fetching blogs:", error);
    res.render('home', {
      user: req.user,
      blogs: [],
    });
  }
});

app.use('/user', userRoute);
app.use('/blog', blogRoute);

app.listen(PORT, () => console.log(`Server started at PORT: ${PORT}`));