import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import { supabase, getTicket, upsertTicket, updateAgent, type TicketRow } from '../supabase'
import { recordTokenUsage, isCapacityAvailable } from '../usage'
import { notifyAgentUpdate, notifyTicketDone, notifyTicketBlocked } from '../slack'
import { PERSONAS } from './personas'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface AgentResponse {
  comment: string
  newStatus: string
  assignTo: string | null
  needsClarification: boolean
  clarificationQuestion: string | null
  plan: string | null
  actionItems: string[]
}

export async function runAgent(agentId: string, ticketId: string): Promise<void> {
  const persona = PERSONAS[agentId]
  if (!persona) throw new Error(`Unknown agent: ${agentId}`)

  // Check token capacity before running
  if (!(await isCapacityAvailable())) {
    const ticket = await getTicket(ticketId)
    if (ticket) {
      const updated: TicketRow = {
        ...ticket,
        comments: [
          ...ticket.comments,
          {
            id: uuidv4(),
            authorId: agentId,
            authorName: persona.name,
            content: `⚠️ Usage limit reached — I'll pick this up as soon as capacity resets. The ticket stays in queue.`,
            timestamp: new Date().toISOString(),
            type: 'system',
          },
        ],
        updated_at: new Date().toISOString(),
      }
      await upsertTicket(updated)
    }
    return
  }

  // Mark agent busy
  await updateAgent(agentId, { status: 'busy', current_ticket_id: ticketId })

  let ticket = await getTicket(ticketId)
  if (!ticket) {
    await updateAgent(agentId, { status: 'idle', current_ticket_id: null })
    return
  }

  // Add typing indicator comment
  const typingId = uuidv4()
  ticket = await upsertTicket({
    ...ticket,
    comments: [
      ...ticket.comments,
      {
        id: typingId,
        authorId: agentId,
        authorName: persona.name,
        content: `${persona.emoji} thinking...`,
        timestamp: new Date().toISOString(),
        type: 'typing',
      },
    ],
    updated_at: new Date().toISOString(),
  })

  try {
    const systemPrompt = persona.systemPrompt(ticket)

    // Call Claude API with streaming + adaptive thinking
    let fullText = ''
    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Please review and respond to ticket ${ticket.id}: "${ticket.title}". Remember to respond ONLY with a valid JSON object.`,
        },
      ],
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        fullText += event.delta.text
      }
    }

    const finalMsg = await stream.finalMessage()
    const totalTokens =
      (finalMsg.usage?.input_tokens ?? 0) + (finalMsg.usage?.output_tokens ?? 0)
    await recordTokenUsage(totalTokens, agentId)

    // Parse JSON response
    let parsed: AgentResponse
    try {
      const match = fullText.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : fullText.trim())
    } catch {
      parsed = {
        comment: fullText || `I've reviewed this ticket and will follow up shortly.`,
        newStatus: ticket.status,
        assignTo: null,
        needsClarification: false,
        clarificationQuestion: null,
        plan: null,
        actionItems: [],
      }
    }

    // Fetch latest ticket state and apply changes
    ticket = (await getTicket(ticketId)) ?? ticket
    const withoutTyping = ticket.comments.filter(c => c.id !== typingId)

    const updated: TicketRow = {
      ...ticket,
      comments: [
        ...withoutTyping,
        {
          id: uuidv4(),
          authorId: agentId,
          authorName: persona.name,
          content: parsed.comment || 'Task reviewed.',
          timestamp: new Date().toISOString(),
          type: parsed.needsClarification
            ? 'question'
            : agentId === 'manager'
            ? 'plan'
            : 'comment',
        },
      ],
      status: (parsed.newStatus ?? ticket.status) as TicketRow['status'],
      assigned_to: parsed.assignTo ?? ticket.assigned_to,
      plan: (parsed.plan && !ticket.plan) ? parsed.plan : ticket.plan,
      action_items: parsed.actionItems?.length ? parsed.actionItems : ticket.action_items,
      updated_at: new Date().toISOString(),
    }

    await upsertTicket(updated)

    // Slack notifications
    await notifyAgentUpdate(updated, agentId, persona.name, parsed.comment ?? '')
    if (updated.status === 'done') await notifyTicketDone(updated)
    if (parsed.needsClarification) {
      await notifyTicketBlocked(updated, parsed.clarificationQuestion ?? 'Clarification needed')
    }

    // Auto-progress: run next agent in same function execution (Vercel maxDuration: 300)
    const autoProgress = process.env.AUTO_PROGRESS !== 'false'
    if (
      autoProgress &&
      parsed.assignTo &&
      !parsed.needsClarification &&
      parsed.newStatus !== 'done' &&
      PERSONAS[parsed.assignTo] &&
      parsed.assignTo !== agentId
    ) {
      await runAgent(parsed.assignTo, ticketId)
    }
  } catch (err) {
    console.error(`[Agent ${agentId}] Error:`, (err as Error).message)

    ticket = (await getTicket(ticketId)) ?? ticket
    await upsertTicket({
      ...ticket,
      comments: [
        ...ticket.comments.filter(c => c.id !== typingId),
        {
          id: uuidv4(),
          authorId: agentId,
          authorName: persona.name,
          content: `⚠️ I ran into an issue processing this ticket. Please check the configuration and try again.`,
          timestamp: new Date().toISOString(),
          type: 'system',
        },
      ],
      updated_at: new Date().toISOString(),
    })
  } finally {
    await updateAgent(agentId, { status: 'idle', current_ticket_id: null })
  }
}
