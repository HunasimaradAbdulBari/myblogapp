const { Router } = require("express");
const User = require("../models/user");

const router = Router();

router.get("/signin", (req, res) => {
  return res.render("signin", { error: null });
});

router.get("/signup", (req, res) => {
  return res.render("signup", { error: null });
});

router.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const token = await User.matchPasswordAndGenerateToken(email, password);
    return res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }).redirect("/");
  } catch (error) {
    return res.render("signin", {
      error: error.message,
    });
  }
});

router.post("/signup", async (req, res) => {
  const { fullName, email, password } = req.body;
  
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render("signup", {
        error: "User with this email already exists"
      });
    }

    await User.create({
      fullName,
      email,
      password,
    });
    
    return res.redirect("/user/signin");
  } catch (error) {
    return res.render("signup", {
      error: "Error creating account. Please try again."
    });
  }
});

router.get("/logout", (req, res) => {
  res.clearCookie("token").redirect("/");
});

module.exports = router;