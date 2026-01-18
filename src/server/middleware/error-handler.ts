/**
 * Error Handler Middleware
 *
 * Centralized error handling for the Express application.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Custom application error class with status code support.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string): AppError {
    return new AppError(400, message);
  }

  static unauthorized(message: string): AppError {
    return new AppError(401, message);
  }

  static forbidden(message: string): AppError {
    return new AppError(403, message);
  }

  static notFound(message: string): AppError {
    return new AppError(404, message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, message);
  }

  static internal(message: string): AppError {
    return new AppError(500, message, false);
  }
}

/**
 * Express error handling middleware.
 * Should be registered after all routes.
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(process.env['NODE_ENV'] === 'development' && { stack: err.stack })
    });
    return;
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    res.status(400).json({
      error: 'Validation failed',
      details: err.message
    });
    return;
  }

  if (err.name === 'SyntaxError' && 'body' in err) {
    res.status(400).json({
      error: 'Invalid JSON in request body'
    });
    return;
  }

  // Default to 500 for unknown errors
  console.error('[Error] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env['NODE_ENV'] === 'development' && {
      details: err.message,
      stack: err.stack
    })
  });
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`
  });
}
