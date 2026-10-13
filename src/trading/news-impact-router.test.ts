import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryTradingWorkerRegistry } from './runtime/worker-registry.ts';
import { InMemoryTaskQueue } from './runtime/task-queue.ts';
import { assessNewsImpact, routeNewsImpact } from './news-impact-router.ts';
import type { NewsArticle } from './data/news-sources.ts';

function article(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    sourceId: 'test.news', title: 'Fed announces emergency rate hike after inflation surprise',
    url: 'https://example.com/story-1', publishedTs: 1000, availableTs: 1000,
    category: 'central-bank', tickers: ['SPY'], summary: 'Markets react to higher rates.', ...overrides,
  };
}

test('news impact router classifies macro severity and councils', () => {
  const assessment = assessNewsImpact(article(), 2000);
  assert.equal(assessment.eventKind, 'central_bank_policy');
  assert.equal(assessment.direction, 'bearish');
  assert.equal(assessment.severity, 'high');
  assert.equal(assessment.urgency, 'immediate');
  assert.ok(assessment.affectedMarkets.includes('rates'));
  assert.ok(assessment.councilIds.includes('macro'));
  assert.ok(assessment.councilIds.includes('risk'));
  assert.ok(assessment.councilIds.includes('technical'));
});

test('future news is rejected before routing', () => {
  assert.throws(() => assessNewsImpact(article({ publishedTs: 3000 }), 2000), /future_news_article_not_allowed/);
});

test('crypto news routes to crypto and review specialists', async () => {
  const workers = new InMemoryTradingWorkerRegistry();
  await workers.ensureSeeded(1000);
  const queue = new InMemoryTaskQueue();
  const result = await routeNewsImpact(article({
    sourceId: 'coindesk-rss', title: 'Bitcoin exchange reports major BTC outflow after ETF approval',
    category: 'crypto', tickers: ['BTC/USD'], summary: 'Large holders moved bitcoin while approval hit the tape.',
  }), workers, queue, 2000);
  assert.ok(result.assessment.affectedMarkets.includes('crypto'));
  assert.ok(result.assessment.councilIds.includes('crypto'));
  assert.ok(result.workerIds.length > 0);
  const tasks = await queue.peek(20, Date.now());
  assert.equal(tasks.length, result.taskIds.length);
  assert.ok(tasks.every((task) => task.type === 'news.impact.review'));
});
