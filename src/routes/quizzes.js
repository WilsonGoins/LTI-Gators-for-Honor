// this defines express routes related to quizzes and communicated with the database via db/client.js

const { Router } = require("express");
const {
  syncQuizzes,
  getSEBStatusByCourse,
  getSEBSettings,
} = require("../db/client");

const router = Router();

const CANVAS_URL = process.env.CANVAS_URL;


// fetch quizzes from Canvas
async function fetchFromCanvas(courseId, canvasToken) {
  const headers = { Authorization: `Bearer ${canvasToken}` };

  const [classicRes, newRes] = await Promise.all([
    fetch(`${CANVAS_URL}/api/v1/courses/${courseId}/quizzes?per_page=100`, { headers }),
    fetch(`${CANVAS_URL}/api/quiz/v1/courses/${courseId}/quizzes?per_page=100`, { headers }),
  ]);

  console.log("Canvas classic response:", classicRes.status);
  console.log("Canvas new quiz response:", newRes.status);

  const classic = classicRes.ok ? await classicRes.json() : [];
  const newQuizzes = newRes.ok ? await newRes.json() : [];

  return { classic, new: newQuizzes };
}


// get quizzes for some course id from canvas, sync with our DB and return SEB status
router.get("/api/courses/:courseId/quizzes", async (req, res) => {
  try {
    const { courseId } = req.params;
    const token = req.headers.authorization?.replace("Bearer ", "");    // auth token

    if (!token) {   // check auth token
      return res.status(401).json({ error: "Missing authorization token" });
    }

    const canvasToken = process.env.CANVAS_API_TOKEN;   // canvas access token
    if (!canvasToken) {     // check it
      return res.status(500).json({ error: "Canvas API token not configured" });
    }

    // 1. Fetch from Canvas using access token
    const canvasData = await fetchFromCanvas(courseId, canvasToken);

    // 2. Build rows for sync
    const syncRows = [
      ...(canvasData.classic ?? []).map((q) => ({
        courseId,
        quizId: String(q.id),
        title: q.title ?? "Untitled Quiz",
        quizType: "classic",
      })),
      ...(canvasData.new ?? []).map((q) => ({
        courseId,
        quizId: String(q.id),
        title: q.title ?? "Untitled Quiz",
        quizType: "new",
      })),
    ];

    // 3. Sync DB: upsert current quizzes + delete stale ones
    await syncQuizzes(courseId, syncRows);

    // 4. Fetch SEB status from our DB
    const sebStatus = await getSEBStatusByCourse(courseId);

    // 5. Return Canvas payloads + SEB status
    return res.json({
      classic: canvasData.classic,
      new: canvasData.new,
      sebStatus: Object.fromEntries(sebStatus),
    });
  } catch (err) {
    console.error("Quiz fetch/sync error:", err);
    return res.status(500).json({
      error: "Failed to fetch quizzes",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});


// get seb settings for a single quiz
router.get("/api/courses/:courseId/quizzes/:quizId/seb-settings", async (req, res) => {
  try {
    const { courseId, quizId } = req.params;
    const settings = await getSEBSettings(courseId, quizId);

    if (!settings) {
      return res.status(404).json({ error: "No SEB settings found for this quiz" });
    }

    return res.json(settings);
  } catch (err) {
    console.error("SEB settings fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch SEB settings" });
  }
});

module.exports = router;