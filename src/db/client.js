// this handles all interactions with the database

const { Pool } = require("pg");

// ─── Helper: detect connection-level errors worth retrying ───────────────────

function isConnectionError(err) {
  if (!err) return false;
  const msg = err.message || "";
  return (
    msg.includes("Connection terminated") ||
    msg.includes("connection timeout") ||
    msg.includes("Client has encountered a connection error") ||
    err.code === "ECONNRESET" ||
    err.code === "EPIPE" ||
    err.code === "ETIMEDOUT"
  );
}

// ─── Pool configuration ─────────────────────────────────────────────────────

// pooled connection which is used for single-statement queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 10000,        // close idle connections after 10s (was 20s)
  connectionTimeoutMillis: 10000,  // fail fast if can't connect in 10s
  max: 10,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000, // send TCP keepalive sooner (was 10s)
});

// unpooled connection which is used for multi-statement transactions
const unpooledPool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 5000,         // close idle connections after 5s (was 20s)
  connectionTimeoutMillis: 10000,  // fail fast if can't connect in 10s
  max: 3,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000, // send TCP keepalive sooner (was 10s)
});

// ─── Pool error handlers ────────────────────────────────────────────────────
// Without these, a surprise disconnect on an idle connection crashes the process.

pool.on("error", (err) => {
  console.error("Unexpected error on idle pooled client:", err.message);
});

unpooledPool.on("error", (err) => {
  console.error("Unexpected error on idle unpooled client:", err.message);
});


// ─── syncQuizzes (with retry) ───────────────────────────────────────────────
// Upserts all quizzes returned from Canvas and deletes any that are no longer there.
async function syncQuizzes(courseId, rows, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const client = await unpooledPool.connect();

    try {
      await client.query("BEGIN");

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

      const canvasQuizIds = rows.map((r) => r.quizId);

      // Before deleting, find file_links for quizzes being removed
      let deletedFileLinks = [];

      if (canvasQuizIds.length === 0) {
        const { rows: deleted } = await client.query(
          `SELECT file_link FROM seb_config_files
           WHERE course_id = $1 AND file_link IS NOT NULL`,
          [courseId]
        );
        deletedFileLinks = deleted.map(r => r.file_link);

        await client.query(`DELETE FROM quizzes WHERE course_id = $1`, [courseId]);
      } else {
        const { rows: deleted } = await client.query(
          `SELECT file_link FROM seb_config_files
           WHERE course_id = $1
             AND quiz_id != ALL($2::text[])
             AND file_link IS NOT NULL`,
          [courseId, canvasQuizIds]
        );
        deletedFileLinks = deleted.map(r => r.file_link);

        await client.query(
          `DELETE FROM quizzes WHERE course_id = $1 AND quiz_id != ALL($2::text[])`,
          [courseId, canvasQuizIds]
        );
      }

      await client.query("COMMIT");
      return deletedFileLinks;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});

      if (isConnectionError(err) && attempt < retries) {
        console.warn(`syncQuizzes connection error (attempt ${attempt + 1}/${retries}), retrying...`);
        continue;
      }
      throw err;
    } finally {
      // pass true to destroy the connection after an error instead of returning it to the pool
      client.release(true);
    }
  }
}


// ─── SEB Status (for dashboard) ──────────────────────────────────────────────
// Returns SEB status + full settings for every quiz in a course.
// The frontend gets everything in one shot on page load.

async function getSEBStatusByCourse(courseId) {
  const sql = `
    SELECT
      q.quiz_id,
      (s.quiz_id IS NOT NULL)       AS seb_configured,
      s.preset_name,
      s.force_fullscreen,
      s.allow_quit,
      s.block_screen_sharing,
      s.block_virtual_machine,
      s.block_clipboard,
      s.block_printing,
      s.disable_spell_check,
      s.enable_url_filter,
      s.allowed_url_patterns,
      s.access_code,
      s.quit_password,
      s.ip_filter_enabled,
      s.allowed_ip_ranges,
      s.created_at                  AS configured_at
    FROM quizzes q
    LEFT JOIN seb_settings s
      ON  s.course_id = q.course_id
      AND s.quiz_id   = q.quiz_id
    WHERE q.course_id = $1
  `;

  const { rows } = await pool.query(sql, [courseId]);

  const map = new Map();
  for (const row of rows) {
    if (row.seb_configured) {
      map.set(row.quiz_id, {
        configured: true,
        configuredDate: row.configured_at ? row.configured_at.toISOString() : null,
        hasAccessCode: Boolean(row.access_code),
        settings: {
          securityLevel: row.preset_name || 'standard',
          allowQuit: row.allow_quit ?? false,
          allowScreenSharing: !(row.block_screen_sharing ?? true),
          allowVirtualMachine: !(row.block_virtual_machine ?? true),
          allowSpellCheck: !(row.disable_spell_check ?? true),
          browserViewMode: row.force_fullscreen ? 1 : 0,
          urlFilterEnabled: row.enable_url_filter ?? false,
          allowedDomains: row.allowed_url_patterns || [],
          accessCode: row.access_code || null,
          quitPassword: row.quit_password || null,
          configuredAt: row.configured_at ? row.configured_at.toISOString() : new Date().toISOString(),
        },
      });
    } else {
      map.set(row.quiz_id, {
        configured: false,
        configuredDate: null,
        hasAccessCode: false,
        settings: null,
      });
    }
  }

  return map;
}


// ─── SEB Settings (single quiz) ──────────────────────────────────────────────

async function getSEBSettings(courseId, quizId) {
  const sql = `SELECT * FROM seb_settings WHERE course_id = $1 AND quiz_id = $2`;
  const { rows } = await pool.query(sql, [courseId, quizId]);
  if (!rows[0]) return null;

  const row = rows[0];
  return {
    securityLevel: row.preset_name || 'standard',
    allowQuit: row.allow_quit ?? false,
    allowScreenSharing: !(row.block_screen_sharing ?? true),
    allowVirtualMachine: !(row.block_virtual_machine ?? true),
    allowSpellCheck: !(row.disable_spell_check ?? true),
    browserViewMode: row.force_fullscreen ? 1 : 0,
    urlFilterEnabled: row.enable_url_filter ?? false,
    allowedDomains: row.allowed_url_patterns || [],
    accessCode: row.access_code || null,
    quitPassword: row.quit_password || null,
    configuredAt: row.created_at ? row.created_at.toISOString() : null,
  };
}


// ─── Save SEB Config (settings + binary file) with retry ─────────────────────
// Called when the instructor clicks "Save & Download .seb" in the config dialog.

async function saveSEBConfig(courseId, quizId, { settings, fileData, fileName, configKey, accessCode, canvasQuizURL }, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const client = await unpooledPool.connect();

    try {
      await client.query("BEGIN");

      // Upsert seb_settings — map our frontend names to column names
      await client.query(`
        INSERT INTO seb_settings (
          course_id, quiz_id, preset_name,
          force_fullscreen, allow_quit, quit_password,
          block_screen_sharing, block_virtual_machine,
          block_clipboard, block_printing, disable_spell_check,
          enable_url_filter, allowed_url_patterns,
          access_code, ip_filter_enabled, allowed_ip_ranges,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6,
          $7, $8,
          $9, $10, $11,
          $12, $13,
          $14, $15, $16,
          now(), now()
        )
        ON CONFLICT (course_id, quiz_id)
        DO UPDATE SET
          preset_name          = EXCLUDED.preset_name,
          force_fullscreen     = EXCLUDED.force_fullscreen,
          allow_quit           = EXCLUDED.allow_quit,
          quit_password   = EXCLUDED.quit_password,
          block_screen_sharing = EXCLUDED.block_screen_sharing,
          block_virtual_machine = EXCLUDED.block_virtual_machine,
          block_clipboard      = EXCLUDED.block_clipboard,
          block_printing       = EXCLUDED.block_printing,
          disable_spell_check  = EXCLUDED.disable_spell_check,
          enable_url_filter    = EXCLUDED.enable_url_filter,
          allowed_url_patterns = EXCLUDED.allowed_url_patterns,
          access_code          = EXCLUDED.access_code,
          ip_filter_enabled    = EXCLUDED.ip_filter_enabled,
          allowed_ip_ranges    = EXCLUDED.allowed_ip_ranges,
          updated_at           = now()
      `, [
        courseId, quizId, settings.securityLevel,
        settings.browserViewMode === 1,                   // force_fullscreen
        settings.allowQuit,                                // allow_quit
        settings.quitPassword || null,                     // quit_password
        !settings.allowScreenSharing,                      // block_screen_sharing (inverted)
        !settings.allowVirtualMachine,                     // block_virtual_machine (inverted)
        true,                                              // block_clipboard (default secure)
        true,                                              // block_printing (default secure)
        !settings.allowSpellCheck,                         // disable_spell_check (inverted)
        settings.urlFilterEnabled,                         // enable_url_filter
        JSON.stringify(settings.allowedDomains || []),      // allowed_url_patterns as JSONB
        accessCode || null,                                // access_code
        false,                                             // ip_filter_enabled (not yet implemented)
        JSON.stringify([]),                                 // allowed_ip_ranges (not yet implemented)
      ]);

      // Upsert seb_config_files
      await client.query(`
        INSERT INTO seb_config_files (course_id, quiz_id, file_name, file_data, config_key, canvas_quiz_url, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, now(), now())
        ON CONFLICT (course_id, quiz_id)
        DO UPDATE SET
          file_name       = EXCLUDED.file_name,
          file_data       = EXCLUDED.file_data,
          config_key      = EXCLUDED.config_key,
          canvas_quiz_url = EXCLUDED.canvas_quiz_url,
          updated_at      = now()
      `, [courseId, quizId, fileName, fileData, configKey, canvasQuizURL || null]);

      await client.query("COMMIT");
      return; // success — exit the retry loop
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});

      if (isConnectionError(err) && attempt < retries) {
        console.warn(`saveSEBConfig connection error (attempt ${attempt + 1}/${retries}), retrying...`);
        continue;
      }
      throw err;
    } finally {
      // pass true to destroy the connection instead of returning it to the pool
      client.release(true);
    }
  }
}


// ─── Download stored .seb file ───────────────────────────────────────────────

async function getSEBFile(courseId, quizId) {
  const sql = `
    SELECT
      f.file_data,
      f.file_name,
      f.config_key,
      f.file_link,
      f.canvas_quiz_url,
      s.access_code
    FROM seb_config_files f
    LEFT JOIN seb_settings s
      ON s.course_id = f.course_id AND s.quiz_id = f.quiz_id
    WHERE f.course_id = $1 AND f.quiz_id = $2
  `;
  const { rows } = await pool.query(sql, [courseId, quizId]);
  return rows[0] ?? null;
}


// ─── Clear access code ──────────────────────────────────────────────────────

async function clearAccessCode(courseId, quizId) {
  await pool.query(
    `UPDATE seb_settings SET access_code = NULL, updated_at = now() WHERE course_id = $1 AND quiz_id = $2`,
    [courseId, quizId]
  );
}

// update the seb_config_files record with the Canvas file link after upload
async function updateSEBFileLink(courseId, quizId, fileLink) {
  await pool.query(
    `UPDATE seb_config_files SET file_link = $1 WHERE course_id = $2 AND quiz_id = $3`,
    [fileLink, courseId, quizId]
  );
}

module.exports = {
  pool,
  unpooledPool,
  syncQuizzes,
  getSEBStatusByCourse,
  getSEBSettings,
  saveSEBConfig,
  getSEBFile,
  clearAccessCode,
  updateSEBFileLink,
};