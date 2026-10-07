import { Router } from 'express';
import { z } from 'zod';
import { getMeta, getRouteOptions } from '../services/routeService.js';
import { HttpError } from '../middleware/errors.js';

export const meta = Router().get('/', async (_req, res) => res.json(await getMeta()));

const router = Router();

// GET /api/routes?from=library&to=hostel-c&mode=walking&slot=auto
router.get('/', async (req, res) => {
  const q = z.object({
    from: z.string().min(1).max(40), to: z.string().min(1).max(40),
    mode: z.string().max(20).default('walking'), slot: z.string().max(20).default('auto'),
  }).parse(req.query);
  const result = await getRouteOptions({ from: q.from, to: q.to, modeCode: q.mode, slotCode: q.slot });
  if (!result) throw new HttpError(404, 'unknown_place_mode_or_slot');
  res.json(result);
});

export default router;
