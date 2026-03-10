import mongoose from "mongoose";

const portfolioSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
    headline: { type: String, default: "" },
    summary: { type: String, default: "" },
    skills: { type: [String], default: [] },
    projects: [
      {
        title: { type: String, default: "" },
        description: { type: String, default: "" },
        link: { type: String, default: "" },
        tags: { type: [String], default: [] },
      },
    ],
    socials: {
      website: { type: String, default: "" },
      linkedin: { type: String, default: "" },
      github: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

const Portfolio = mongoose.model("Portfolio", portfolioSchema);
export default Portfolio;
