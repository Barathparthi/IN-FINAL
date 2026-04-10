import type { Request, Response, NextFunction } from 'express'
import * as AdminService        from './admin.service'
import { adminManualAdvance, adminReject } from '../attempt/round-advancement.service'

export async function createRecruiter(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await AdminService.createRecruiter(req.body))
  } catch (err) { next(err) }
}

export async function getAllRecruiters(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await AdminService.getAllRecruiters())
  } catch (err) { next(err) }
}

export async function getRecruiterById(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await AdminService.getRecruiterById(req.params.id))
  } catch (err) { next(err) }
}

export async function updateRecruiter(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await AdminService.updateRecruiter(req.params.id, req.body))
  } catch (err) { next(err) }
}

export async function removeFromCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await AdminService.removeRecruiterFromCampaign(req.params.id, req.params.campaignId))
  } catch (err) { next(err) }
}

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await AdminService.getDashboardStats(req.user!.userId))
  } catch (err) { next(err) }
}

// POST /api/admin/candidates/:id/advance-round
export async function advanceRound(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminManualAdvance(req.params.id, req.user!.userId)
    res.json(result)
  } catch (err) { next(err) }
}

// POST /api/admin/candidates/:id/reject
export async function rejectCandidate(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminReject(req.params.id, req.user!.userId, req.body.reason)
    res.json(result)
  } catch (err) { next(err) }
}

export async function deleteRecruiter(req: Request, res: Response, next: NextFunction) {
  try {
    await AdminService.deleteRecruiter(req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

import { bulkEvaluateRound } from '../attempt/round-review.service'

// POST /api/admin/campaigns/:campaignId/rounds/:roundId/bulk-evaluate
export async function adminBulkEvaluateRound(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId, roundId } = req.params;
    const { passMarkPercent } = req.body;
    
    if (typeof passMarkPercent !== 'number' || passMarkPercent < 0 || passMarkPercent > 100) {
      return res.status(400).json({ error: 'passMarkPercent must be a number between 0 and 100' });
    }

    const result = await bulkEvaluateRound(campaignId, roundId, passMarkPercent, req.user!.userId);
    res.json(result);
  } catch (err) { next(err) }
}