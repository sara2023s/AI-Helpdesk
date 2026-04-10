import { TicketRow } from './supabase.js'

async function sendSlackNotification(
  message: string,
  blocks?: object[],
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return

  const payload = { text: message, ...(blocks && { blocks }) }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Slack is best-effort — never block ticket processing
  }
}

const AGENT_EMOJI: Record<string, string> = {
  manager:    '🧠',
  researcher: '🔭',
  analyst:    '📊',
  brand:      '🎯',
  designer:   '🎨',
  developer:  '💻',
  copywriter: '✍️',
  seo:        '📈',
  devops:     '⚙️',
  tester:     '🧪',
  reviewer:   '🔍',
  sales:      '💼',
}

const AGENT_NAME: Record<string, string> = {
  manager:    'Max',
  researcher: 'Scout',
  analyst:    'Sam',
  brand:      'Blake',
  designer:   'Aria',
  developer:  'Dev',
  copywriter: 'Kai',
  seo:        'Sage',
  devops:     'Rex',
  tester:     'Quinn',
  reviewer:   'Ray',
  sales:      'Nova',
}

const PRIORITY_EMOJI: Record<string, string> = {
  P0: '🔴', P1: '🟠', P2: '🔵', P3: '⚪',
}

export async function notifyTicketCreated(ticket: TicketRow): Promise<void> {
  const pe = PRIORITY_EMOJI[ticket.priority] ?? '⚪'
  await sendSlackNotification(
    `${pe} New ticket: *${ticket.title}*`,
    [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${pe} *New Ticket* | \`${ticket.id}\` | ${ticket.priority}\n*${ticket.title}*\n${ticket.description.substring(0, 150)}${ticket.description.length > 150 ? '...' : ''}`,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Project: *${ticket.project}* | Type: *${ticket.type}* | 🧠 Max will review shortly` },
        ],
      },
    ],
  )
}

export async function notifyAgentUpdate(
  ticket: TicketRow,
  agentId: string,
  agentName: string,
  comment: string,
): Promise<void> {
  const ae = AGENT_EMOJI[agentId] ?? '🤖'
  const name = AGENT_NAME[agentId] ?? agentName
  const pe = PRIORITY_EMOJI[ticket.priority] ?? '⚪'
  const short = comment.length > 1200 ? comment.substring(0, 1200) + '…' : comment

  // Status label mapping
  const statusLabel: Record<string, string> = {
    'new': 'New', 'manager-review': 'Manager Review', 'awaiting_approval': '⏳ Awaiting Approval',
    'in-progress': '🔄 In Progress', 'testing': '🧪 Testing', 'review': '🔍 Review',
    'done': '✅ Done', 'blocked': '🚨 Blocked',
  }

  await sendSlackNotification(
    `${ae} ${name} posted an update on "${ticket.title}"`,
    [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${ae} *${name}* just posted on \`${ticket.id}\`\n*${ticket.title}*`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `_${short}_`,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `${pe} ${ticket.priority}  •  ${statusLabel[ticket.status] ?? ticket.status}  •  ${ticket.project}` },
        ],
      },
      { type: 'divider' },
    ],
  )
}

export async function notifyTicketDone(ticket: TicketRow): Promise<void> {
  const pe = PRIORITY_EMOJI[ticket.priority] ?? '⚪'
  await sendSlackNotification(`✅ Done: ${ticket.title}`, [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *Ticket Complete!*\n\`${ticket.id}\` — *${ticket.title}*`,
      },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${pe} ${ticket.priority}  •  Project: ${ticket.project}  •  All agents signed off` },
      ],
    },
    { type: 'divider' },
  ])
}

export async function notifyTicketBlocked(ticket: TicketRow, reason: string): Promise<void> {
  const pe = PRIORITY_EMOJI[ticket.priority] ?? '⚪'
  await sendSlackNotification(`🚨 Blocked: ${ticket.title}`, [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🚨 *Ticket Blocked — needs your input*\n\`${ticket.id}\` — *${ticket.title}*`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `_${reason}_` },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${pe} ${ticket.priority}  •  Project: ${ticket.project}` },
      ],
    },
    { type: 'divider' },
  ])
}
