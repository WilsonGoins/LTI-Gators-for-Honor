// this validates that all quizIDs and courseIDs are positive integers for security reasons

const validateCanvasIDs = (req, res, next) => {
  for (const param of ['courseId', 'quizId', 'itemId']) {
    if (req.params[param]) {
      const parsed = Number(req.params[param]);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return res.status(400).json({ error: `Invalid ${param}` });
      }
      req.params[param] = String(parsed);
    }
  }
  next();
};

module.exports = validateCanvasIDs;