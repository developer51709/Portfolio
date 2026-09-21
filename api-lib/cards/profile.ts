import type { VercelRequest, VercelResponse } from '@vercel/node';
import about from './about';
import activityGraph from './activity-graph';
import banner from './banner';
import contact from './contact';
import stack from './stack';
import stats from './stats';
import streak from './streak';
import topLangs from './top-langs';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;
type Captured = { body: string; status: number };

function capture(handler: Handler, req: VercelRequest): Promise<Captured> {
  return new Promise((resolve) => {
    let status = 200;
    const response = {
      setHeader: () => response,
      status: (code: number) => {
        status = code;
        return response;
      },
      send: (body: unknown) => {
        resolve({ status, body: String(body) });
        return response;
      },
      json: (body: unknown) => {
        resolve({ status, body: JSON.stringify(body) });
        return response;
      },
      end: () => {
        resolve({ status, body: '' });
        return response;
      },
    } as unknown as VercelResponse;
    void Promise.resolve(handler(req, response)).catch(() => resolve({ status: 500, body: '' }));
  });
}

function dataImage(svg: string, x: number, y: number, width: number, height: number) {
  const encoded = Buffer.from(svg, 'utf8').toString('base64');
  return `<image href="data:image/svg+xml;base64,${encoded}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"/>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();

  const childReq = {
    ...req,
    query: { ...req.query, card: undefined },
  } as unknown as VercelRequest;

  const [hero, aboutCard, statsCard, streakCard, languagesCard, activityCard, stackCard, contactCard] = await Promise.all([
    capture(banner, childReq),
    capture(about, childReq),
    capture(stats, childReq),
    capture(streak, childReq),
    capture(topLangs, childReq),
    capture(activityGraph, childReq),
    capture(stack, childReq),
    capture(contact, childReq),
  ]);

  const W = 1280;
  const H = 1_820;
  const images = [
    dataImage(hero.body, 0, 0, 1280, 560),
    dataImage(aboutCard.body, 200, 584, 880, 236),
    dataImage(statsCard.body, 80, 850, 495, 195),
    dataImage(streakCard.body, 705, 850, 495, 195),
    dataImage(languagesCard.body, 80, 1_065, 495, 195),
    dataImage(activityCard.body, 705, 1_065, 495, 195),
    dataImage(stackCard.body, 200, 1_280, 880, 206),
    dataImage(contactCard.body, 200, 1_510, 880, 206),
  ].join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="24" fill="#040407"/>
  <rect width="${W}" height="${H}" rx="24" fill="url(#glow)"/>
  <defs><radialGradient id="glow" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#4f7cff" stop-opacity=".08"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient></defs>
  ${images}
</svg>`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=1800');
  return res.send(svg);
}
