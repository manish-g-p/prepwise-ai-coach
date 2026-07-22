const express = require("express")
const authMiddleware = require("../middlewares/auth.middleware")
const mockController = require("../controllers/mock.controller")

const mockRouter = express.Router()

/**
 * @route POST /api/mock/start/:interviewReportId
 * @description start a mock interview session for a given interview report.
 * @access private
 */
mockRouter.post("/start/:interviewReportId", authMiddleware.authUser, mockController.startMockSessionController)

/**
 * @route POST /api/mock/:sessionId/answer
 * @description submit an answer for the current question and get it scored.
 * @access private
 */
mockRouter.post("/:sessionId/answer", authMiddleware.authUser, mockController.submitAnswerController)

/**
 * @route GET /api/mock/:sessionId
 * @description get a mock interview session.
 * @access private
 */
mockRouter.get("/:sessionId", authMiddleware.authUser, mockController.getMockSessionController)

module.exports = mockRouter
