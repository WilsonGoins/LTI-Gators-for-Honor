// this handles all interactions with the database

const { Pool } = require("pg");

// pooled connection which is used for single-statement queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// unpooled connection which is used for multi-statement transactions
const unpooledPool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
  ssl: { rejectUnauthorized: false },
  max: 3,
});


// this upserts all quizzes returned from canvas, and deletes any quizzes that are no longer in canvas
async function syncQuizzes(courseId, rows) {
  const client = await unpooledPool.connect();

  try {
    await client.query("BEGIN");

    // upsert quizzes
    if (rows.length > 0) {
      const values = [];
      const placeholders = rows.map((row, i) => {
        const offset = i * 4;
        values.push(row.courseId, row.quizId, row.title, row.quizType);
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
      });

      const upsertSql = `
        INSERT INTO quizzes (course_id, quiz_id, title, quiz_type)
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (course_id, quiz_id)
        DO UPDATE SET
          title      = EXCLUDED.title,
          quiz_type  = EXCLUDED.quiz_type,
          updated_at = now()
      `;

      await client.query(upsertSql, values);
    }

    // now delete, other two tables are cleaned up via DELETE CASCADE
    const canvasQuizIds = rows.map((r) => r.quizId);

    if (canvasQuizIds.length === 0) {
      await client.query(
        `DELETE FROM quizzes WHERE course_id = $1`,
        [courseId]
      );
    } else {
      await client.query(
        `DELETE FROM quizzes
         WHERE course_id = $1
           AND quiz_id != ALL($2::text[])`,
        [courseId, canvasQuizIds]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}


// return whether each quiz in the course has SEB configured, along with the date it was configured (if applicable)
async function getSEBStatusByCourse(courseId) {
  const sql = `
    SELECT
      q.quiz_id,
      (cf.quiz_id IS NOT NULL)  AS seb_configured,
      cf.updated_at             AS seb_configured_date
    FROM quizzes q
    LEFT JOIN seb_config_files cf
      ON  cf.course_id = q.course_id
      AND cf.quiz_id   = q.quiz_id
    WHERE q.course_id = $1
  `;

  const { rows } = await pool.query(sql, [courseId]);

  const map = new Map();
  for (const row of rows) {
    map.set(row.quiz_id, {
      configured: row.seb_configured,
      configuredDate: row.seb_configured_date
        ? row.seb_configured_date.toISOString()
        : null,
    });
  }

  return map;
}


// this gets the seb settings for a single quiz, which is used to populate the SEB settings dialog when you click "View Settings" on a quiz card
async function getSEBSettings(courseId, quizId) {
  const sql = `
    SELECT *
    FROM seb_settings
    WHERE course_id = $1 AND quiz_id = $2
  `;

  const { rows } = await pool.query(sql, [courseId, quizId]);
  return rows[0] ?? null;
}


module.exports = {
  pool,
  unpooledPool,
  syncQuizzes,
  getSEBStatusByCourse,
  getSEBSettings,
};