// this defines express routes related to quizzes and communicates with the database via db/client.js

const { Router } = require('express');
const {
  syncQuizzes,
  getSEBStatusByCourse,
  getSEBSettings,
} = require('../db/client');

const router = Router();

const CANVAS_URL = process.env.CANVAS_URL;


// This follows the "rel=next" chain of result pages until all pages are fetched
function getNextUrl(linkHeader) {
  if (!linkHeader) return null;

  const matches = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return matches ? matches[1] : null;
}


// pagination helper function
async function fetchAllPages(url, headers) {
  const allResults = [];
  let nextUrl = url;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers });

    if (!res.ok) {
      // Return what we have so far + a flag that it failed
      return { data: allResults, ok: allResults.length > 0, status: res.status };
    }

    const page = await res.json();
    allResults.push(...page);

    nextUrl = getNextUrl(res.headers.get('link'));
  }

  return { data: allResults, ok: true, status: 200 };
}


// fetch quizzes from Canvas
async function fetchFromCanvas(courseId, canvasToken) {
  const headers = { Authorization: `Bearer ${canvasToken}` };

  const [classicRes, newRes] = await Promise.all([
    fetchAllPages(`${CANVAS_URL}/api/v1/courses/${courseId}/quizzes?per_page=100`, headers),
    fetchAllPages(`${CANVAS_URL}/api/quiz/v1/courses/${courseId}/quizzes?per_page=100`, headers),
  ]);

  if (!classicRes.ok && !newRes.ok) {   // if there's an error we don't return an empty list (bc that would delete everything from db)
    throw new Error(`Canvas API unavailable (classic: ${classicRes.status}, new: ${newRes.status})`);
  }

  const classic = classicRes.ok ? classicRes.data : [];
  const newQuizzes = newRes.ok ? newRes.data : [];

  return { classic, new: newQuizzes };
}


// get quizzes for some course id from canvas, sync with our DB and return SEB status
router.get('/api/courses/:courseId/quizzes', async (req, res) => {
  try {
    const { courseId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');    // auth token

    if (!token) {   // check auth token
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const canvasToken = process.env.CANVAS_ACCESS_TOKEN;   // canvas access token
    if (!canvasToken) {     // check it
      return res.status(500).json({ error: 'Canvas API token not configured' });
    }

    // 1. Fetch from Canvas using access token
    const canvasData = await fetchFromCanvas(courseId, canvasToken);

    // 2. Build rows for sync
    const syncRows = [
      ...(canvasData.classic ?? []).map((q) => ({
        courseId,
        quizId: String(q.id),
        title: q.title ?? 'Untitled Quiz',
        quizType: 'classic',
      })),
      ...(canvasData.new ?? []).map((q) => ({
        courseId,
        quizId: String(q.id),
        title: q.title ?? 'Untitled Quiz',
        quizType: 'new',
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
    console.error('Quiz fetch/sync error:', err);
    return res.status(500).json({
      error: 'Failed to fetch quizzes',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});


// get seb settings for a single quiz
router.get('/api/courses/:courseId/quizzes/:quizId/seb-settings', async (req, res) => {
  try {
    const { courseId, quizId } = req.params;
    const settings = await getSEBSettings(courseId, quizId);

    if (!settings) {
      return res.status(404).json({ error: 'No SEB settings found for this quiz' });
    }

    return res.json(settings);
  } catch (err) {
    console.error('SEB settings fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch SEB settings' });
  }
});

module.exports = router;