// GitHub REST API helper — commits files to repos without requiring git CLI.
// Works in Vercel serverless functions (stateless, no filesystem writes needed).
//
// Required env var: GITHUB_TOKEN
// The token must have `contents: write` permission on all target repos.
// Create at: https://github.com/settings/tokens/new
// Scopes needed: repo (full) — or a fine-grained token with Contents: read+write

export interface FileChange {
  /** Path within the repo, e.g. "src/components/Hero.tsx" */
  path: string
  /** Full file content (the entire file, not a diff) */
  content: string
  /** Short description of what changed — used in commit message */
  description?: string
}

export interface CommitResult {
  success: boolean
  commitSha?: string
  commitUrl?: string
  files: string[]
  error?: string
}

async function githubApi(
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN env var not set')

  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text}`)
  }

  return res.json()
}

/**
 * Get the current SHA of a file (needed to update it via the API).
 * Returns null if the file doesn't exist yet (create mode).
 */
async function getFileSha(
  owner: string,
  repo: string,
  filePath: string,
  branch: string,
): Promise<string | null> {
  try {
    const data = await githubApi(
      `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      'GET',
    ) as { sha: string }
    return data.sha
  } catch {
    // 404 = file doesn't exist yet
    return null
  }
}

/**
 * Commit multiple file changes to a GitHub repo in a single tree commit.
 * Uses the Git Data API to batch all files into one commit.
 */
export async function commitFiles(
  owner: string,
  repo: string,
  branch: string,
  files: FileChange[],
  ticketId: string,
  agentName: string,
): Promise<CommitResult> {
  if (!files.length) return { success: true, files: [] }

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return { success: false, files: [], error: 'GITHUB_TOKEN not set — changes saved to ticket comments only' }
  }

  try {
    // 1. Get the current branch HEAD commit SHA
    const refData = await githubApi(
      `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
      'GET',
    ) as { object: { sha: string } }
    const headSha = refData.object.sha

    // 2. Get the tree SHA at HEAD
    const commitData = await githubApi(
      `/repos/${owner}/${repo}/git/commits/${headSha}`,
      'GET',
    ) as { tree: { sha: string } }
    const baseTreeSha = commitData.tree.sha

    // 3. Create blobs for each file
    const treeItems = await Promise.all(
      files.map(async (file) => {
        const blobData = await githubApi(
          `/repos/${owner}/${repo}/git/blobs`,
          'POST',
          {
            content: file.content,
            encoding: 'utf-8',
          },
        ) as { sha: string }

        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        }
      }),
    )

    // 4. Create a new tree
    const newTree = await githubApi(
      `/repos/${owner}/${repo}/git/trees`,
      'POST',
      {
        base_tree: baseTreeSha,
        tree: treeItems,
      },
    ) as { sha: string }

    // 5. Create the commit
    const fileList = files.map((f) => f.path).join(', ')
    const commitMessage = `[${ticketId}] ${agentName}: ${files.length === 1 ? files[0].description ?? `Update ${files[0].path}` : `Update ${files.length} files`}\n\nFiles changed:\n${files.map((f) => `- ${f.path}${f.description ? ': ' + f.description : ''}`).join('\n')}\n\nCo-Authored-By: ${agentName} <noreply@appdoers.ai>`

    const newCommit = await githubApi(
      `/repos/${owner}/${repo}/git/commits`,
      'POST',
      {
        message: commitMessage,
        tree: newTree.sha,
        parents: [headSha],
      },
    ) as { sha: string, html_url: string }

    // 6. Update the branch ref
    await githubApi(
      `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      'PATCH',
      {
        sha: newCommit.sha,
        force: false,
      },
    )

    return {
      success: true,
      commitSha: newCommit.sha.substring(0, 7),
      commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`,
      files: files.map((f) => f.path),
    }
  } catch (err) {
    return {
      success: false,
      files: files.map((f) => f.path),
      error: (err as Error).message,
    }
  }
}

/**
 * Read a file from a GitHub repo (for agent context).
 */
export async function readFile(
  owner: string,
  repo: string,
  filePath: string,
  branch = 'main',
): Promise<string | null> {
  try {
    const data = await githubApi(
      `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      'GET',
    ) as { content: string, encoding: string }

    if (data.encoding === 'base64') {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    }
    return data.content
  } catch {
    return null
  }
}

/**
 * List files in a directory of a GitHub repo.
 */
export async function listDir(
  owner: string,
  repo: string,
  dirPath: string,
  branch = 'main',
): Promise<string[]> {
  try {
    const data = await githubApi(
      `/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`,
      'GET',
    ) as Array<{ name: string, type: string, path: string }>

    return data.map((f) => f.path)
  } catch {
    return []
  }
}
