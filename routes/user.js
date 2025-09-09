const { Router } = require("express");
const mongoose = require("mongoose");
const User = require("../models/user");

const router = Router();

// Middleware to check database connection
const checkDB = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.render(req.route.path.includes('signin') ? 'signin' : 'signup', {
      error: 'Database connection unavailable. Please try again in a few moments.'
    });
  }
  next();
};

router.get("/signin", (req, res) => {
  return res.render("signin", { error: null });
});

router.get("/signup", (req, res) => {
  return res.render("signup", { error: null });
});

router.post("/signin", checkDB, async (req, res) => {
  const { email, password } = req.body;
  
  // Input validation
  if (!email || !password) {
    return res.render("signin", {
      error: "Please provide both email and password."
    });
  }
  
  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.render("signin", {
      error: "Please provide a valid email address."
    });
  }
  
  try {
    const token = await User.matchPasswordAndGenerateToken(email, password);
    
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };
    
    return res
      .cookie("token", token, cookieOptions)
      .redirect("/");
      
  } catch (error) {
    console.error("Signin error:", error);
    
    let errorMessage = "An error occurred during sign in.";
    
    if (error.message === "User not found!") {
      errorMessage = "No account found with this email address.";
    } else if (error.message === "Incorrect Password") {
      errorMessage = "Invalid email or password.";
    } else if (error.name === 'MongoNetworkError') {
      errorMessage = "Database connection issue. Please try again.";
    }
    
    return res.render("signin", {
      error: errorMessage
    });
  }
});

router.post("/signup", checkDB, async (req, res) => {
  const { fullName, email, password } = req.body;
  
  // Input validation
  if (!fullName || !email || !password) {
    return res.render("signup", {
      error: "Please fill in all required fields."
    });
  }
  
  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.render("signup", {
      error: "Please provide a valid email address."
    });
  }
  
  // Password validation
  if (password.length < 6) {
    return res.render("signup", {
      error: "Password must be at least 6 characters long."
    });
  }
  
  // Name validation
  if (fullName.trim().length < 2) {
    return res.render("signup", {
      error: "Please provide a valid full name."
    });
  }
  
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ 
      email: email.toLowerCase().trim() 
    });
    
    if (existingUser) {
      return res.render("signup", {
        error: "An account with this email already exists. Please sign in instead."
      });
    }

    // Create new user
    await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: password,
    });
    
    console.log("User created successfully:", email);
    return res.redirect("/user/signin");
    
  } catch (error) {
    console.error("Signup error:", error);
    
    let errorMessage = "Error creating account. Please try again.";
    
    if (error.name === 'ValidationError') {
      // Handle mongoose validation errors
      const validationErrors = Object.values(error.errors).map(err => err.message);
      errorMessage = validationErrors[0] || "Please check your input data.";
    } else if (error.code === 11000) {
      // Handle duplicate key error
      errorMessage = "An account with this email already exists.";
    } else if (error.name === 'MongoNetworkError') {
      errorMessage = "Database connection issue. Please try again.";
    } else if (error.name === 'MongoTimeoutError') {
      errorMessage = "Request timed out. Please try again.";
    }
    
    return res.render("signup", {
      error: errorMessage
    });
  }
});

router.get("/logout", (req, res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  };
  
  res.clearCookie("token", cookieOptions).redirect("/");
});

module.exports = router;
