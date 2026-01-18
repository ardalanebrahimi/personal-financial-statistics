/**
 * Async Wrapper Middleware
 *
 * Wraps async route handlers to properly catch and forward errors.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Type for async request handlers.
 */
type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

/**
 * Wraps an async route handler to catch errors and forward them to Express error handler.
 *
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await userService.getAll();
 *   res.json(users);
 * }));
 */
export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Creates a controller method that handles errors automatically.
 * Use this when you want to define controller methods without try-catch.
 *
 * @example
 * export const getAll = createHandler(async (req, res) => {
 *   const items = await service.getAll();
 *   res.json({ items });
 * });
 */
export function createHandler(fn: AsyncRequestHandler): RequestHandler {
  return asyncHandler(fn);
}
