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
    },
    likes: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: "user"
      }
    }],
    status: {
      type: String,
      enum: ['published', 'draft'],
      default: 'published'
    },
    readTime: {
      type: Number,
      default: 5
    }
  },
  { timestamps: true }
);

// Calculate read time before saving
blogSchema.pre('save', function(next) {
  if (this.body) {
    const wordsPerMinute = 200;
    const wordCount = this.body.split(' ').length;
    this.readTime = Math.ceil(wordCount / wordsPerMinute);
  }
  next();
});

const Blog = model("blog", blogSchema);
module.exports = Blog;
