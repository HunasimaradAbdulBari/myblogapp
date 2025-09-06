const { Schema, model } = require("mongoose");
const bcrypt = require("bcryptjs");
const { createTokenForUser } = require("../services/authentication");

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    profileImageURL: {
      type: String,
      default: "/images/default.png",
    },
    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
    bio: {
      type: String,
      maxlength: 500,
      default: ""
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    followers: [{
      type: Schema.Types.ObjectId,
      ref: "user"
    }],
    following: [{
      type: Schema.Types.ObjectId,
      ref: "user"
    }]
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Static method to authenticate user and generate token
userSchema.static("matchPasswordAndGenerateToken", async function (email, password) {
  const user = await this.findOne({ email });
  if (!user) throw new Error("User not found!");

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) throw new Error("Incorrect Password");

  const token = createTokenForUser(user);
  return token;
});

const User = model("user", userSchema);
module.exports = User;
