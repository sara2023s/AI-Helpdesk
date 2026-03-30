import { TicketRow } from './supabase'

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
  manager: '🧠', designer: '🎨', developer: '💻',
  copywriter: '✍️', tester: '🧪', reviewer: '🔍',
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
  const short = comment.length > 200 ? comment.substring(0, 200) + '...' : comment
  await sendSlackNotification(
    `${ae} ${agentName} updated \`${ticket.id}\`: ${ticket.title}`,
    [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${ae} *${agentName}* commented on \`${ticket.id}\`:\n_${short}_`,
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Status: *${ticket.status}* | Project: *${ticket.project}*` }],
      },
    ],
  )
}

export async function notifyTicketDone(ticket: TicketRow): Promise<void> {
  await sendSlackNotification(`✅ Ticket complete: ${ticket.title}`, [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *Ticket Complete!*\n\`${ticket.id}\` — *${ticket.title}*\nProject: *${ticket.project}*`,
      },
    },
  ])
}

export async function notifyTicketBlocked(ticket: TicketRow, reason: string): Promise<void> {
  await sendSlackNotification(`🚨 BLOCKED: ${ticket.title} — needs attention`, [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🚨 *Ticket Blocked!*\n\`${ticket.id}\` — *${ticket.title}*\n_${reason}_`,
      },
    },
  ])
}
