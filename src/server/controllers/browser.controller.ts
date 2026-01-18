/**
 * Browser Controller
 *
 * Handles HTTP requests for browser automation.
 */

import { Request, Response } from 'express';
import { getBrowserService } from '../browser';

/**
 * GET /browser/status
 * Get browser status.
 */
export async function getStatus(req: Request, res: Response): Promise<void> {
  const browserService = getBrowserService();
  res.json({
    running: browserService.isRunning()
  });
}

/**
 * POST /browser/launch
 * Launch browser with Chrome profile.
 */
export async function launch(req: Request, res: Response): Promise<void> {
  const browserService = getBrowserService({
    headless: req.body.headless ?? false,
    slowMo: req.body.slowMo ?? 50
  });

  const useDefaultProfile = req.body.useDefaultProfile ?? true;
  await browserService.launch(useDefaultProfile);

  res.json({
    success: true,
    message: 'Browser launched successfully'
  });
}

/**
 * POST /browser/close
 * Close the browser.
 */
export async function close(req: Request, res: Response): Promise<void> {
  const browserService = getBrowserService();
  await browserService.close();

  res.json({
    success: true,
    message: 'Browser closed'
  });
}
