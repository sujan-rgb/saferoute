import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireRole('moderator', 'admin'));   // campus security / facilities audience

router.get('/', async (_req, res) => {
  const [byCategory] = await pool.execute(
    "SELECT category, COUNT(*) AS count FROM reports WHERE status <> 'rejected' GROUP BY category ORDER BY count DESC");
  const [actions] = await pool.execute(
    `SELECT rt.id AS routeId, rt.area_name AS areaName, COUNT(*) AS verifiedCount
       FROM reports r JOIN routes rt ON rt.id = r.route_id
      WHERE r.status = 'verified' AND r.resolved_at IS NULL GROUP BY rt.id, rt.area_name ORDER BY verifiedCount DESC`);
  res.json({ byCategory, suggestedActions: actions });
});

export default router;
