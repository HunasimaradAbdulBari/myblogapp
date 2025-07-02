const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Blog = require("../models/blog");
const Comment = require("../models/comment");
const { requireAuth } = require("../middlewares/authentication");

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.resolve("./public/uploads/");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const fileName = `${Date.now()}-${file.originalname}`;
    cb(null, fileName);
  },
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

router.get("/add-new", requireAuth, (req, res) => {
  return res.render("addBlog", {
    user: req.user,
  });
});

router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate("createdBy");
    if (!blog) {
      return res.status(404).render("404", { user: req.user });
    }

    const comments = await Comment.find({ blogId: req.params.id })
      .populate("createdBy")
      .sort({ createdAt: -1 });

    // Increment view count
    blog.views += 1;
    await blog.save();

    return res.render("blog", {
      user: req.user,
      blog,
      comments,
    });
  } catch (error) {
    console.error("Error fetching blog:", error);
    return res.status(500).render("error", { user: req.user });
  }
});

router.post("/comment/:blogId", requireAuth, async (req, res) => {
  try {
    await Comment.create({
      content: req.body.content,
      blogId: req.params.blogId,
      createdBy: req.user._id,
    });
    return res.redirect(`/blog/${req.params.blogId}`);
  } catch (error) {
    console.error("Error creating comment:", error);
    return res.redirect(`/blog/${req.params.blogId}`);
  }
});

router.post("/", requireAuth, upload.single("coverImage"), async (req, res) => {
  try {
    const { title, body, tags } = req.body;
    
    const blogData = {
      body,
      title,
      createdBy: req.user._id,
    };

    if (req.file) {
      blogData.coverImageURL = `/uploads/${req.file.filename}`;
    }

    if (tags) {
      blogData.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }

    const blog = await Blog.create(blogData);
    return res.redirect(`/blog/${blog._id}`);
  } catch (error) {
    console.error("Error creating blog:", error);
    return res.render("addBlog", {
      user: req.user,
      error: "Error creating blog post. Please try again."
    });
  }
});

module.exports = router;