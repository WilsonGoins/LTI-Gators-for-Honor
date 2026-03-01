// fetches both classic and new quizzes for a given course

const express = require("express");
const router = express.Router();

// Reuse the same config your app.js already uses for the Canvas URL
const { platform: platformConfig } = require("../config");

const CANVAS_BASE_URL = platformConfig.canvasUrl;     
const CANVAS_API_TOKEN = process.env.CANVAS_API_TOKEN;

// pagination helper to fetch all pages of results from a Canvas API endpoint
async function fetchAllPages(url, token) {
  let results = [];
  let nextUrl = url;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      // 404 means that quiz engine isn't enabled — not an error
      if (res.status === 404) return [];
      throw new Error(`Canvas API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    results = results.concat(data);

    // Parse Link header for next page
    const linkHeader = res.headers.get("link") || "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
  }

  return results;
}

// GET /api/courses/:courseId/quizzes to fetch both classic and new quizzes for a course 
router.get("/api/courses/:courseId/quizzes", async (req, res) => {
  try {
    const { courseId } = req.params;

    // validate config
    if (!CANVAS_BASE_URL) {
      console.error("❌ platformConfig.canvasUrl is not set in config.js");
      return res.status(500).json({ error: "Canvas URL not configured" });
    }
    if (!CANVAS_API_TOKEN) {
      console.error("❌ CANVAS_API_TOKEN is not set in .env");
      return res.status(500).json({
        error: "Canvas API token not configured. Generate one in Canvas → Settings → Approved Integrations, then add CANVAS_API_TOKEN to your .env",
      });
    }

    // Validate the caller has an LTI session 
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization token" });
    }
    // TODO: verify the LTI JWT here (same as /api/context does)

    console.log(`📚 Fetching quizzes for course ${courseId}...`);

    // Fetch both quiz types in parallel 
    const classicUrl = `${CANVAS_BASE_URL}/api/v1/courses/${courseId}/quizzes?per_page=100`;
    const newUrl = `${CANVAS_BASE_URL}/api/quiz/v1/courses/${courseId}/quizzes?per_page=100`;

    const [classicResult, newResult] = await Promise.allSettled([
      fetchAllPages(classicUrl, CANVAS_API_TOKEN),
      fetchAllPages(newUrl, CANVAS_API_TOKEN),
    ]);

    // Handle partial failures gracefully 
    const classic = classicResult.status === "fulfilled" ? classicResult.value : [];
    const newQ = newResult.status === "fulfilled" ? newResult.value : [];

    if (classicResult.status === "rejected") {
      console.warn("⚠️  Classic Quizzes fetch failed:", classicResult.reason?.message);
    }
    if (newResult.status === "rejected") {
      console.warn("⚠️  New Quizzes fetch failed:", newResult.reason?.message);
    }

    console.log(`✅ Found ${classic.length} classic + ${newQ.length} new quizzes`);

    res.json({ classic, new: newQ });
  } catch (err) {
    console.error("❌ Quiz fetch error:", err);
    res.status(500).json({
      error: "Failed to fetch quizzes from Canvas",
      details: err.message,
    });
  }
});

module.exports = router;