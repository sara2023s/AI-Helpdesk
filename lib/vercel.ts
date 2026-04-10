/**
 * Vercel Deploy Helper
 * --------------------
 * Triggers a Vercel deployment for a project.
 * Requires VERCEL_TOKEN env var.
 *
 * Note: If your repo is connected to Vercel with auto-deploy on push,
 * this is called automatically. For manual triggers, use this directly.
 *
 * Get your token at: https://vercel.com/account/tokens
 */

export interface DeployResult {
  success: boolean
  deploymentUrl?: string
  inspectorUrl?: string
  error?: string
}

async function vercelApi(
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const token = process.env.VERCEL_TOKEN
  if (!token) throw new Error('VERCEL_TOKEN env var not set')

  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vercel API ${method} ${path} → ${res.status}: ${text}`)
  }

  return res.json()
}

/**
 * Trigger a Vercel deployment by project name.
 * Looks up the project in Vercel, then creates a deployment from the latest git commit.
 */
export async function triggerVercelDeploy(
  projectName: string,
  repoOwner: string,
  repoName: string,
  branch: string,
  ticketId: string,
): Promise<DeployResult> {
  const token = process.env.VERCEL_TOKEN
  if (!token) {
    return {
      success: false,
      error: 'VERCEL_TOKEN not set — add it to .env.local to enable Vercel deploys. GitHub push still completed (auto-deploy may trigger if repo is connected to Vercel).',
    }
  }

  try {
    // Find the project in Vercel by repo
    const projects = await vercelApi('/v9/projects', 'GET') as {
      projects: Array<{ id: string; name: string; link?: { repo?: string; org?: string } }>
    }

    const match = projects.projects.find(
      p => p.link?.repo?.toLowerCase() === repoName.toLowerCase() ||
           p.name.toLowerCase() === repoName.toLowerCase() ||
           p.name.toLowerCase() === projectName.toLowerCase().replace(/\s+/g, '-'),
    )

    if (!match) {
      return {
        success: false,
        error: `No Vercel project found matching "${projectName}" / "${repoName}". Connect the repo to Vercel first, or auto-deploy will fire on the GitHub push.`,
      }
    }

    // Create a deployment
    const deployment = await vercelApi('/v13/deployments', 'POST', {
      name: match.name,
      gitSource: {
        type: 'github',
        ref: branch,
        repoId: match.id,
      },
      meta: {
        githubCommitRepo: `${repoOwner}/${repoName}`,
        githubCommitRef: branch,
        deployedFromTicket: ticketId,
      },
    }) as { id: string; url: string; inspectorUrl?: string }

    return {
      success: true,
      deploymentUrl: `https://${deployment.url}`,
      inspectorUrl: deployment.inspectorUrl,
    }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
    }
  }
}
