/**
 * assistantController.js — the admin's AI assistant (English).
 *
 * The admin asks a question; Claude answers it by calling the read-only tools in
 * lib/assistantTools.js, so every number comes from the school's own data.
 * Admin only. Each question's tokens and estimated cost are recorded, and a
 * monthly spending limit stops new questions once it is reached.
 *
 * Settings (Render → Environment):
 *   ANTHROPIC_API_KEY              required — from console.anthropic.com
 *   ASSISTANT_MODEL                default claude-opus-5-5
 *   ASSISTANT_MONTHLY_BUDGET_USD   default 5 (US dollars per calendar month)
 */

const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const { TOOLS, runTool } = require('../lib/assistantTools');

const prisma = new PrismaClient();

const SCHOOL_NAME = 'Matha English Medium School, Kaikalur';

const MODEL = () => process.env.ASSISTANT_MODEL || 'claude-opus-5-5';
const BUDGET_USD = () => Number(process.env.ASSISTANT_MONTHLY_BUDGET_USD) || 5;
const MAX_TOOL_ROUNDS = 8;
const MAX_QUESTION_CHARS = 1000;
const MAX_HISTORY = 12; // earlier messages sent along for follow-up questions

// US$ per million tokens: [input, output, cache read, cache write]
const PRICES = {
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
};
// Models with server-side fallback for declined requests (Claude API).
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];

let client = null;
const getClient = () => {
  if (!client) client = new Anthropic({ timeout: 120 * 1000, maxRetries: 2 });
  return client;
};

const SYSTEM = `You are the assistant for the administrator of ${SCHOOL_NAME}, a school in Andhra Pradesh, India. You help them understand exam results: class performance, subjects, toppers, students who need help, and each student's progress.

How to answer:
- Get every fact from the tools. Never guess or invent a mark, percentage, rank or name. If the tools don't have the information (for example attendance or fees, which this app does not record yet), say so plainly.
- Find ids first: class ids from school_overview, exam ids from list_exams, student ids from find_students. If a name matches several students or classes, ask which one is meant, or show the options.
- Grades go by percentage using the school's grading scale; the lowest grade is a fail and the pass mark comes from the tools.
- Answer in clear, simple English for a busy school administrator. Lead with the answer. Use short bullet lists, and a small table (Markdown pipe table) when comparing several students or subjects. Don't explain how you looked things up.
- You can help draft a short notice or message for parents or teachers when asked, but you cannot send anything or change any data; the admin does that in the app.
- Students' marks are private: only discuss them with this administrator.`;

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

async function spentThisMonth() {
  const agg = await prisma.assistantUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: monthStart() } } });
  return agg._sum.costUsd || 0;
}

function costOf(model, u) {
  const [inp, out, read, write] = PRICES[model] || PRICES['claude-opus-5-5'];
  return (u.input * inp + u.output * out + u.cacheRead * read + u.cacheWrite * write) / 1e6;
}

/** Earlier turns from the page, as plain text, oldest first. */
function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  const msgs = history
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift(); // must start with the admin's message
  return msgs;
}

// ── GET /api/admin/assistant/status ──
exports.status = async (req, res) => {
  try {
    res.json({
      configured: !!process.env.ANTHROPIC_API_KEY,
      model: MODEL(),
      budgetUsd: BUDGET_USD(),
      spentUsd: Math.round((await spentThisMonth()) * 100) / 100,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/admin/assistant  { question, history: [{ role, content }] } ──
exports.ask = async (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'Type a question.' });
  if (question.length > MAX_QUESTION_CHARS) return res.status(400).json({ error: `Keep the question under ${MAX_QUESTION_CHARS} characters.` });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'The AI assistant is not set up yet. Add ANTHROPIC_API_KEY in Render → Environment.' });
  }

  const model = MODEL();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const record = () => prisma.assistantUsage.create({
    data: {
      userId: req.user?.userId ?? null,
      question: question.slice(0, 300),
      model,
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheWriteTokens: usage.cacheWrite,
      costUsd: costOf(model, usage),
    },
  }).catch((e) => console.error('[assistant] could not record usage', e));

  try {
    const spent = await spentThisMonth();
    if (spent >= BUDGET_USD()) {
      return res.status(429).json({
        error: `This month's AI assistant limit ($${BUDGET_USD()}) has been reached. It resets on the 1st, or raise ASSISTANT_MONTHLY_BUDGET_USD in Render.`,
      });
    }

    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const messages = [...cleanHistory(req.body?.history), { role: 'user', content: `${question}\n\n(Today is ${today}.)` }];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await getClient().beta.messages.create({
        model,
        max_tokens: 16000,
        system: SYSTEM,
        tools: TOOLS,
        messages,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' }, // tools + instructions are the same every time
        ...(FALLBACK_MODELS.includes(model)
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
          : {}),
      });

      usage.input += response.usage?.input_tokens || 0;
      usage.output += response.usage?.output_tokens || 0;
      usage.cacheRead += response.usage?.cache_read_input_tokens || 0;
      usage.cacheWrite += response.usage?.cache_creation_input_tokens || 0;

      if (response.stop_reason === 'refusal') {
        await record();
        return res.json({ answer: "Sorry, I can't help with that question. Try asking it a different way." });
      }

      // Keep the assistant turn exactly as returned (thinking and tool blocks included).
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'pause_turn') continue;

      const toolCalls = response.content.filter((b) => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || !toolCalls.length) {
        const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        await record();
        const cut = response.stop_reason === 'max_tokens' ? '\n\n(The answer was cut short. Ask for a smaller part.)' : '';
        return res.json({ answer: (text || 'I could not find an answer to that.') + cut });
      }

      // Run every tool call, then send all results back in one message.
      const results = await Promise.all(toolCalls.map(async (call) => {
        const { content, isError } = await runTool(prisma, call.name, call.input);
        return { type: 'tool_result', tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) };
      }));
      messages.push({ role: 'user', content: results });
    }

    await record();
    return res.json({ answer: 'That question needed too many lookups. Please ask about one class, exam or student at a time.' });
  } catch (err) {
    await record();
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: 'The AI key (ANTHROPIC_API_KEY) is not valid. Check it in Render → Environment.' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'The AI service is busy. Please try again in a minute.' });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return res.status(503).json({ error: "Couldn't reach the AI service. Please try again." });
    }
    if (err instanceof Anthropic.APIError) {
      console.error('[assistant] API error', err.status, err.message);
      return res.status(502).json({ error: `The AI service returned an error (${err.status}). Please try again.` });
    }
    console.error('[assistant]', err);
    return res.status(500).json({ error: 'Something went wrong while answering. Please try again.' });
  }
};
