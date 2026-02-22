// =============================================================================
// Canvas REST API Client
// =============================================================================
// Wraps Canvas API calls for quiz management. This is used alongside the
// LTI integration — LTI handles auth/launch, but we still need the REST API
// to create and configure quizzes.
//
// Reference: https://canvas.instructure.com/doc/api/
// =============================================================================

const axios = require('axios');
const config = require('../config');

class CanvasAPI {
  /**
   * @param {string} baseURL - Canvas API base URL (e.g., http://canvas:3000/api/v1)
   * @param {string} token   - Canvas API access token
   */
  constructor(baseURL = config.canvas.apiUrl, token = config.canvas.apiToken) {
    this.client = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  // -------------------------------------------------------------------------
  // Courses
  // -------------------------------------------------------------------------

  /**
   * List courses where the authenticated user is an instructor.
   * @returns {Promise<Array>} List of course objects
   */
  async listCourses() {
    const { data } = await this.client.get('/courses', {
      params: {
        enrollment_type: 'teacher',
        state: ['available'],
        per_page: 100,
      },
    });
    return data;
  }

  /**
   * Get a single course by ID.
   * @param {string|number} courseId
   * @returns {Promise<Object>} Course object
   */
  async getCourse(courseId) {
    const { data } = await this.client.get(`/courses/${courseId}`);
    return data;
  }

  // -------------------------------------------------------------------------
  // Quizzes (New Quizzes API)
  // -------------------------------------------------------------------------

  /**
   * List quizzes in a course.
   * Note: New Quizzes uses a different API path than Classic Quizzes.
   * @param {string|number} courseId
   * @returns {Promise<Array>} List of quiz objects
   */
  async listQuizzes(courseId) {
    const { data } = await this.client.get(
      `/courses/${courseId}/quizzes`,
      { params: { per_page: 100 } }
    );
    return data;
  }

  /**
   * Create a new quiz (New Quizzes format).
   *
   * @param {string|number} courseId
   * @param {Object} quizParams
   * @param {string} quizParams.title
   * @param {string} [quizParams.instructions]
   * @param {number} [quizParams.pointsPossible]
   * @param {string} [quizParams.dueAt]           - ISO 8601 timestamp
   * @param {string} [quizParams.unlockAt]        - ISO 8601 timestamp
   * @param {string} [quizParams.lockAt]          - ISO 8601 timestamp
   * @param {number} [quizParams.assignmentGroupId]
   * @param {Object} [quizParams.quizSettings]    - SEB-related quiz settings
   * @returns {Promise<Object>} Created quiz object
   */
  async createQuiz(courseId, quizParams) {
    const payload = {
      quiz: {
        title: quizParams.title,
        instructions: quizParams.instructions || '',
        points_possible: quizParams.pointsPossible || 0,
        due_at: quizParams.dueAt || null,
        unlock_at: quizParams.unlockAt || null,
        lock_at: quizParams.lockAt || null,
        assignment_group_id: quizParams.assignmentGroupId || null,
        quiz_settings: {
          // Question display
          one_at_a_time_type: quizParams.quizSettings?.oneAtATime ? 'question' : 'none',
          allow_backtracking: quizParams.quizSettings?.allowBacktracking ?? true,
          shuffle_questions: quizParams.quizSettings?.shuffleQuestions ?? false,
          shuffle_answers: quizParams.quizSettings?.shuffleAnswers ?? false,

          // Time limit
          has_time_limit: quizParams.quizSettings?.hasTimeLimit ?? false,
          session_time_limit_in_seconds: quizParams.quizSettings?.timeLimitMinutes
            ? quizParams.quizSettings.timeLimitMinutes * 60
            : null,

          // Access control
          require_student_access_code: quizParams.quizSettings?.requireAccessCode ?? false,
          student_access_code: quizParams.quizSettings?.accessCode || null,

          // IP filtering
          filter_ip_address: quizParams.quizSettings?.filterIp ?? false,
          filters: quizParams.quizSettings?.ipRanges
            ? { ips: quizParams.quizSettings.ipRanges }
            : undefined,
        },
      },
    };

    const { data } = await this.client.post(
      `/courses/${courseId}/quizzes`,
      payload
    );
    return data;
  }

  /**
   * Update an existing quiz's settings.
   * @param {string|number} courseId
   * @param {string|number} quizId
   * @param {Object} updates - Same shape as createQuiz quizParams
   * @returns {Promise<Object>} Updated quiz object
   */
  async updateQuiz(courseId, quizId, updates) {
    const { data } = await this.client.patch(
      `/courses/${courseId}/quizzes/${quizId}`,
      { quiz: updates }
    );
    return data;
  }

  // -------------------------------------------------------------------------
  // Assignment Groups (needed for quiz creation form)
  // -------------------------------------------------------------------------

  /**
   * List assignment groups in a course.
   * @param {string|number} courseId
   * @returns {Promise<Array>} List of assignment group objects
   */
  async listAssignmentGroups(courseId) {
    const { data } = await this.client.get(
      `/courses/${courseId}/assignment_groups`,
      { params: { per_page: 100 } }
    );
    return data;
  }
}

module.exports = CanvasAPI;
