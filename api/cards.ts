import type { VercelRequest, VercelResponse } from '@vercel/node';
import about from '../api-lib/cards/about';
import activityGraph from '../api-lib/cards/activity-graph';
import banner from '../api-lib/cards/banner';
import contact from '../api-lib/cards/contact';
import stack from '../api-lib/cards/stack';
import stats from '../api-lib/cards/stats';
import streak from '../api-lib/cards/streak';
import topLangs from '../api-lib/cards/top-langs';
import profile from '../api-lib/cards/profile';

type CardHandler = (req: VercelRequest, res: VercelResponse) => unknown;

const handlers: Record<string, CardHandler> = {
  about,
  'activity-graph': activityGraph,
  banner,
  contact,
  stack,
  stats,
  streak,
  'top-langs': topLangs,
  profile,
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  const card = String(req.query.card ?? '').trim().toLowerCase();
  const render = handlers[card];
  if (!render) {
    return res.status(404).json({ error: 'Unknown card' });
  }
  return render(req, res);
}
