/**
 * Competitive Intelligence Agent
 * A production-style agent that researches competitors, summarizes findings,
 * stores embeddings, and emails a digest to the team.
 *
 * This is the kind of agent a SaaS team would run nightly.
 * It uses AgentGraph for full observability: traces, costs, latency.
 */

import { AgentGraph } from '../packages/sdk/dist/index.js';

const ag = new AgentGraph({
  apiKey: 'ag_live_48d325018f5746debba06ee570b376f1',
  baseUrl: 'http://localhost:3001',
});

// ─── Tool stubs (in production these call real APIs) ─────────────────────────

async function webSearch(query, { latency = 200 } = {}) {
  await sleep(latency);
  const results = {
    'langsmith pricing 2024': [
      { title: 'LangSmith Pricing', url: 'https://smith.langchain.com/pricing', snippet: 'Developer free up to 5k traces/mo. Plus $50/mo for 50k.' },
      { title: 'LangSmith vs LangFuse comparison', url: 'https://blog.example.com', snippet: 'LangSmith focuses on LangChain ecosystem; LangFuse is framework-agnostic.' },
    ],
    'langfuse open source tracing': [
      { title: 'LangFuse GitHub', url: 'https://github.com/langfuse/langfuse', snippet: 'Open-source LLM observability. Self-host or cloud. 12k GitHub stars.' },
      { title: 'LangFuse pricing', url: 'https://langfuse.com/pricing', snippet: 'Cloud: $0 hobby, $59/mo pro. Enterprise custom.' },
    ],
    'helicone llm gateway pricing': [
      { title: 'Helicone pricing', url: 'https://helicone.ai/pricing', snippet: 'Free up to 100k requests. Pro $80/mo for 2M requests.' },
    ],
    'arize ai observability pricing': [
      { title: 'Arize Phoenix open source', url: 'https://phoenix.arize.com', snippet: 'Open-source LLM tracing. Enterprise tier available.' },
      { title: 'Arize vs LangSmith', url: 'https://arize.com/blog', snippet: 'Arize excels in ML monitoring; LangSmith better for prompt iteration.' },
    ],
  };
  return results[query] ?? [{ title: `Results for: ${query}`, url: '#', snippet: 'Sample result' }];
}

async function scrapePage(url, { latency = 300 } = {}) {
  await sleep(latency);
  return {
    url,
    title: `Scraped: ${url.split('/').pop()}`,
    content: `Detailed content from ${url}. Includes pricing tiers, feature comparisons, and customer testimonials. The product offers a competitive free tier and enterprise pricing.`,
    wordCount: 1240,
  };
}

async function llmComplete(prompt, model, { inputTokens, outputTokens, latency = 400 } = {}) {
  await sleep(latency);
  return {
    text: `Analysis: Based on the gathered data, the competitor offers strong tooling in the ${prompt.slice(0, 40)}... area. Key differentiators include pricing model and integration depth.`,
    model,
    usage: { prompt: inputTokens, completion: outputTokens, total: inputTokens + outputTokens },
    costUsd: model.includes('gpt-4o') ? (inputTokens * 0.000005 + outputTokens * 0.000015) :
             model.includes('claude-opus') ? (inputTokens * 0.000015 + outputTokens * 0.000075) :
             (inputTokens * 0.0000001 + outputTokens * 0.0000004),
  };
}

async function embedText(text, { latency = 80 } = {}) {
  await sleep(latency);
  return { dimensions: 1536, vectorId: `vec-${Math.random().toString(36).slice(2, 10)}` };
}

async function pineconeUpsert(vectors, { latency = 120 } = {}) {
  await sleep(latency);
  return { upsertedCount: vectors.length, success: true };
}

async function sendEmail(to, subject, body, { latency = 150 } = {}) {
  await sleep(latency);
  return { messageId: `msg-${Date.now()}`, delivered: true, recipient: to };
}

async function slackPost(channel, message, { latency = 90 } = {}) {
  await sleep(latency);
  return { ok: true, ts: Date.now().toString(), channel };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Agent runs ──────────────────────────────────────────────────────────────

const competitors = ['langsmith', 'langfuse', 'helicone', 'arize'];
const sessions = [
  { sessionId: 'nightly-2026-06-01', userId: 'scheduler' },
  { sessionId: 'nightly-2026-06-02', userId: 'scheduler' },
  { sessionId: 'nightly-2026-06-03', userId: 'scheduler' },
  { sessionId: 'on-demand-ceo-request', userId: 'user-ceo' },
  { sessionId: 'on-demand-sales-prep', userId: 'user-sales' },
];

async function runCompetitorResearch(session, competitor) {
  const trace = ag.trace({ agentId: 'competitive-intel', ...session });

  try {
    // Step 1: Search for competitor info
    const searchResults = await trace.step('tool_call', 'web_search', async (span) => {
      span.setInput({ query: `${competitor} pricing 2024`, engine: 'google' });
      const results = await webSearch(`${competitor} pricing 2024`, { latency: 150 + Math.random() * 100 });
      span.setOutput({ results, resultCount: results.length });
      const completion = await llmComplete(`Extract pricing from search results`, 'gpt-4o-mini',
        { inputTokens: 340, outputTokens: 80, latency: 0 });
      span.setModel('gpt-4o-mini').setTokenUsage(completion.usage).setCost(completion.costUsd);
      return results;
    });

    // Step 2: Scrape top result for detail
    await trace.step('tool_call', 'web_scraper', async (span) => {
      const url = searchResults[0]?.url ?? 'https://example.com';
      span.setInput({ url, extractFields: ['pricing', 'features', 'integrations'] });
      const page = await scrapePage(url, { latency: 200 + Math.random() * 150 });
      span.setOutput({ wordCount: page.wordCount, fields: ['pricing', 'features'] });
      span.setModel('gpt-4o').setTokenUsage({ prompt: 1800, completion: 420, total: 2220 }).setCost(0.0152);
    });

    // Step 3: Search for open-source angle
    await trace.step('tool_call', 'web_search', async (span) => {
      span.setInput({ query: `${competitor} open source tracing`, engine: 'google' });
      const results = await webSearch(`${competitor} open source tracing`, { latency: 120 + Math.random() * 80 });
      span.setOutput({ results, resultCount: results.length });
      span.setModel('gpt-4o-mini').setTokenUsage({ prompt: 280, completion: 95, total: 375 }).setCost(0.00064);
    });

    // Step 4: Generate competitive analysis with Claude
    const analysis = await trace.step('tool_call', 'llm_completion', async (span) => {
      span.setInput({
        model: 'claude-opus-4-8',
        prompt: `Analyze ${competitor} as a competitor to AgentGraph. Focus on: pricing, target customer, strengths, weaknesses, and positioning.`,
        maxTokens: 600,
      });
      const result = await llmComplete(`Analyze ${competitor}`, 'claude-opus-4-8',
        { inputTokens: 1240, outputTokens: 580, latency: 600 + Math.random() * 200 });
      span.setOutput({ analysis: result.text, wordCount: 148 });
      span.setModel('claude-opus-4-8').setTokenUsage(result.usage).setCost(result.costUsd);
      return result.text;
    });

    // Step 5: Embed and store the analysis
    await trace.step('tool_call', 'pinecone', async (span) => {
      span.setInput({ operation: 'upsert', namespace: 'competitor-intel', competitor });
      const embedding = await embedText(analysis, { latency: 70 });
      const upsert = await pineconeUpsert([{ id: `${competitor}-${session.sessionId}`, vector: embedding }], { latency: 100 });
      span.setOutput({ upsertedCount: upsert.upsertedCount, vectorId: embedding.vectorId });
      span.setModel('text-embedding-3-small').setTokenUsage({ prompt: 148, completion: 0, total: 148 }).setCost(0.0000148);
    });

    await trace.flush();
    return { competitor, success: true };
  } catch (err) {
    await trace.flush();
    return { competitor, success: false, error: err.message };
  }
}

async function runDigestAndNotify(session, analyses) {
  const trace = ag.trace({ agentId: 'competitive-intel-digest', ...session });

  // Step 1: Synthesize all competitor analyses
  const digest = await trace.step('tool_call', 'llm_completion', async (span) => {
    span.setInput({
      model: 'claude-opus-4-8',
      prompt: 'Synthesize a competitive landscape summary for the exec team. Highlight key threats and opportunities.',
      competitors: analyses.map(a => a.competitor),
      maxTokens: 800,
    });
    await sleep(800 + Math.random() * 300);
    const summary = `Weekly Competitive Intelligence Report\n\nKey findings across ${analyses.length} competitors tracked. LangFuse gaining OSS momentum. Helicone expanding to gateway use-case. LangSmith tightly coupled to LangChain ecosystem — opportunity for framework-agnostic positioning.\n\nRecommendations: 1) Accelerate tool-intelligence differentiation. 2) Target LangFuse OSS users with seamless migration path. 3) Enterprise pricing parity needed vs Arize.`;
    span.setOutput({ digest: summary, wordCount: 82 });
    span.setModel('claude-opus-4-8').setTokenUsage({ prompt: 3200, completion: 780, total: 3980 }).setCost(0.1037);
    return summary;
  });

  // Step 2: Post to Slack
  await trace.step('tool_call', 'slack', async (span) => {
    span.setInput({ channel: '#competitive-intel', message: digest.slice(0, 200) + '...', attachReport: true });
    const result = await slackPost('#competitive-intel', digest, { latency: 90 });
    span.setOutput({ ok: result.ok, ts: result.ts });
    span.setModel('gpt-4o-mini').setTokenUsage({ prompt: 180, completion: 45, total: 225 }).setCost(0.00029);
  });

  // Step 3: Email the CEO
  await trace.step('tool_call', 'send_email', async (span) => {
    span.setInput({
      to: 'ceo@agentgraph.dev',
      subject: `Weekly Competitive Intel — ${new Date().toLocaleDateString()}`,
      bodyPreview: digest.slice(0, 120),
    });
    const result = await sendEmail('ceo@agentgraph.dev', 'Weekly Competitive Intel', digest, { latency: 150 });
    span.setOutput({ messageId: result.messageId, delivered: result.delivered });
    span.setModel('gpt-4o-mini').setTokenUsage({ prompt: 220, completion: 55, total: 275 }).setCost(0.00035);
  });

  await trace.flush();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('🤖 Competitive Intelligence Agent starting...\n');

for (const session of sessions) {
  console.log(`\n📋 Session: ${session.sessionId} (${session.userId})`);

  // Research each competitor
  const analyses = [];
  for (const competitor of competitors) {
    process.stdout.write(`  🔍 Researching ${competitor}... `);
    const result = await runCompetitorResearch(session, competitor);
    if (result.success) {
      console.log('✓');
    } else {
      console.log(`✗ ${result.error}`);
    }
    analyses.push(result);
    await sleep(200);
  }

  // Send digest for "nightly" sessions
  if (session.sessionId.startsWith('nightly')) {
    process.stdout.write(`  📬 Sending digest... `);
    await runDigestAndNotify(session, analyses);
    console.log('✓');
  }

  await sleep(300);
}

console.log('\n✅ All agent runs complete. Open http://localhost:3000/dashboard to explore traces.');
