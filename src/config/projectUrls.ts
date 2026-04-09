/** Maps ticket.project values to their URLs. Keep in sync with lib/projects.ts */
export interface ProjectUrls {
  live?: string
  localhost?: string
}

export const PROJECT_URLS: Record<string, ProjectUrls> = {
  'AI-Helpdesk':          { live: 'https://ai-helpdesk-mu.vercel.app',          localhost: 'http://localhost:5174' },
  'Jornada de Insights':  { live: 'https://jornada-de-insights.vercel.app',      localhost: 'http://localhost:5173' },
  'Project Alana':        { live: 'https://project-alana.vercel.app',            localhost: 'http://localhost:5173' },
  'Momentum':             { live: 'https://momentum.vercel.app',                 localhost: 'http://localhost:5173' },
  'Gym Website':          { live: 'https://gym-website.vercel.app',              localhost: 'http://localhost:5173' },
  'Eco Adventure':        { live: 'https://eco-adventure.vercel.app',            localhost: 'http://localhost:5173' },
  'University Website':   { live: 'https://university-website.vercel.app',       localhost: 'http://localhost:5173' },
  'Appdoers':             { live: 'https://appdoers.vercel.app',                 localhost: 'http://localhost:5173' },
  'Portfolio':            { live: 'https://portfolio.vercel.app',                localhost: 'http://localhost:5173' },
  'PrepWise':             { live: 'https://prep-wise.vercel.app',                localhost: 'http://localhost:5173' },
  'Tech Website':         { live: 'https://tech-website.vercel.app',             localhost: 'http://localhost:5173' },
  'Mind Link':            { live: 'https://mind-link.vercel.app',                localhost: 'http://localhost:5173' },
  'E-Commerce':           { live: 'https://e-commerce-website.vercel.app',       localhost: 'http://localhost:5173' },
  'Dashboard Template':   { live: 'https://dashboard-template.vercel.app',       localhost: 'http://localhost:5173' },
  'Soul2Soul':            { live: 'https://soul-to-soul.vercel.app',             localhost: 'http://localhost:5173' },
  'ABCWebsite':           { localhost: 'http://localhost:5173' },
  // 'General' has no live server — built files go to ./builds/<ticketId>/ and
  // are served at localhost:4173 after running: npm run preview --prefix builds/<ticketId>
  // The Local button for General tickets is handled dynamically in TicketDetail.
}

export function getProjectUrls(projectName: string): ProjectUrls {
  return PROJECT_URLS[projectName] ?? { localhost: 'http://localhost:5173' }
}
