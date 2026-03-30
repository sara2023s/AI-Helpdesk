// Project registry — maps ticket.project values to GitHub repo info.
// Agents use this to know which repo to commit to.
//
// To add a project:
//   1. Add an entry below
//   2. Ensure GITHUB_TOKEN env var has push access to the repo
//   3. Use the exact same string as the ticket.project field

export interface ProjectInfo {
  /** Display name — must match ticket.project exactly */
  name: string
  /** GitHub owner (user or org) */
  owner: string
  /** GitHub repo name */
  repo: string
  /** Branch to commit to (default: main) */
  branch: string
  /** Tech stack — fed into agent context */
  stack: string
  /** Live URL — fed into agent context */
  liveUrl?: string
  /** Root directory within the repo (if monorepo or nested) */
  rootDir?: string
}

// ─── sara2023s repos ──────────────────────────────────────────────────────────

const SARA_REPOS: ProjectInfo[] = [
  {
    name: 'AI-Helpdesk',
    owner: 'sara2023s',
    repo: 'AI-Helpdesk',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind + Supabase + Vercel Serverless',
    liveUrl: 'https://ai-helpdesk-mu.vercel.app',
  },
  {
    name: 'Jornada de Insights',
    owner: 'sara2023s',
    repo: 'jornada-de-insights',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://jornada-de-insights.vercel.app',
  },
  {
    name: 'Project Alana',
    owner: 'sara2023s',
    repo: 'project-alana',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://project-alana.vercel.app',
  },
  {
    name: 'Momentum',
    owner: 'sara2023s',
    repo: 'momentum',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://momentum.vercel.app',
  },
  {
    name: 'Gym Website',
    owner: 'sara2023s',
    repo: 'gym-website',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://gym-website.vercel.app',
  },
  {
    name: 'Eco Adventure',
    owner: 'sara2023s',
    repo: 'eco-adventure',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://eco-adventure.vercel.app',
  },
  {
    name: 'University Website',
    owner: 'sara2023s',
    repo: 'university-website',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://university-website.vercel.app',
  },
  {
    name: 'Appdoers',
    owner: 'sara2023s',
    repo: 'appdoers',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://appdoers.vercel.app',
  },
  {
    name: 'Portfolio',
    owner: 'sara2023s',
    repo: 'portfolio',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://portfolio.vercel.app',
  },
  {
    name: 'PrepWise',
    owner: 'sara2023s',
    repo: 'prep-wise',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://prep-wise.vercel.app',
  },
  {
    name: 'Tech Website',
    owner: 'sara2023s',
    repo: 'tech-website',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://tech-website.vercel.app',
  },
  {
    name: 'Mind Link',
    owner: 'sara2023s',
    repo: 'mind-link',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://mind-link.vercel.app',
  },
  {
    name: 'E-Commerce',
    owner: 'sara2023s',
    repo: 'e-commerce-website',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://e-commerce-website.vercel.app',
  },
  {
    name: 'Dashboard Template',
    owner: 'sara2023s',
    repo: 'dashboard-template',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
    liveUrl: 'https://dashboard-template.vercel.app',
  },
  {
    name: 'Soul2Soul',
    owner: 'sara2023s',
    repo: 'soul-to-soul-website-template',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind + shadcn/ui',
    liveUrl: 'https://soul-to-soul.vercel.app',
  },
  {
    name: 'ABCWebsite',
    owner: 'sara2023s',
    repo: 'ABCWebsite',
    branch: 'main',
    stack: 'React + Vite + TypeScript + Tailwind',
  },
]

// ─── Appdoers org repos ───────────────────────────────────────────────────────
// Add repos here once the Appdoers GitHub org is authorized.
// Replace 'AppdoersDevTeam' with the actual org name if different.

const APPDOERS_REPOS: ProjectInfo[] = [
  // Example — uncomment and fill in once org is authorized:
  // {
  //   name: 'Client Project Name',
  //   owner: 'AppdoersDevTeam',
  //   repo: 'repo-name',
  //   branch: 'main',
  //   stack: 'React + Vite + TypeScript + Tailwind',
  //   liveUrl: 'https://client-site.com',
  // },
]

// ─── Registry ─────────────────────────────────────────────────────────────────

const ALL_PROJECTS: ProjectInfo[] = [...SARA_REPOS, ...APPDOERS_REPOS]

/** Look up project info by the ticket.project field (case-insensitive) */
export function getProject(projectName: string): ProjectInfo | null {
  const lower = projectName.toLowerCase().trim()
  return (
    ALL_PROJECTS.find(
      (p) =>
        p.name.toLowerCase() === lower ||
        p.repo.toLowerCase() === lower,
    ) ?? null
  )
}

/** All registered projects */
export function listProjects(): ProjectInfo[] {
  return ALL_PROJECTS
}
