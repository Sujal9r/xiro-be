import Portfolio from "../models/Portfolio.js";

export const getMyPortfolio = async (req, res) => {
  try {
    const user = req.user;
    let portfolio = await Portfolio.findOne({ user: user._id });

    if (!portfolio) {
      return res.json({
        id: null,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        headline: "",
        summary: user.bio || "",
        skills: [],
        projects: [],
        socials: {
          website: "",
          linkedin: "",
          github: "",
        },
      });
    }

    res.json({
      id: portfolio._id.toString(),
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      headline: portfolio.headline || "",
      summary: portfolio.summary || user.bio || "",
      skills: portfolio.skills || [],
      projects: portfolio.projects || [],
      socials: portfolio.socials || {
        website: "",
        linkedin: "",
        github: "",
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch portfolio" });
  }
};
