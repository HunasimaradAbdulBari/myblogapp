const { Schema, model } = require("mongoose");

const blogSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    body: {
      type: String,
      required: true,
    },
    coverImageURL: {
      type: String,
      required: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true
    },
    tags: [{
      type: String,
      trim: true
    }],
    views: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

const Blog = model("blog", blogSchema);
module.exports = Blog;