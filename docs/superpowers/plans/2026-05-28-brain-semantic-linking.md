# Brain — Phase 1: meaningful keyword/topic linking

**Status:** deferred (not in v2.4.10)
**Owner:** Peter
**Goal:** Brain tab should reveal *meaningful* relationships (who cares about what topic, which docs cover which products), not trivial "user X is in group Y" noise.

## Problem

Current Brain graph is dominated by `membership` edges (customer ↔ group). That information is already in the Zalo Friends list and adds zero insight. The one weak semantic collector (`collectKnowledgeSemanticEdges` in `electron/lib/brain-graph.js:488`) only matches doc *filename* tokens against customer memory — misses doc body, misses cross-doc links, misses Vietnamese tokenization.

## Phase 1 scope (keyword/TF-IDF, no embeddings)

1. **Enhance `collectKnowledgeSemanticEdges`** ([electron/lib/brain-graph.js:488](../../../electron/lib/brain-graph.js#L488))
   - Read each doc's BODY (not just filename) from `knowledge/<cat>/files/`.
   - Tokenize Vietnamese-aware: lowercase, strip dấu for indexing only, split on `\s+` and punctuation, drop stopwords (`là, của, có, và, hoặc, để, cho, trong, với, không, một, các, này, đó`).
   - Compute TF-IDF across the doc corpus → keep top-12 terms per doc.
   - Match against customer memory files using **token-set intersection** (not substring) → edge weight = number of overlapping top-terms.

2. **Add cross-link collectors** (new functions in `brain-graph.js`)
   - `collectDocDocSemanticEdges` — doc ↔ doc via shared TF-IDF top terms (≥3 overlap).
   - `collectGroupDocEdges` — group ↔ doc via group memory file term overlap.
   - `collectLearningDocEdges` — product learning ↔ doc via term match (links bot-learned facts back to source docs).

3. **Demote membership edges in default view** ([electron/ui/brain.js](../../../electron/ui/brain.js))
   - Add filter checkbox "Hiện liên kết nhóm" — unchecked by default.
   - When unchecked, hide edges with `type === 'membership'` AND hide customer nodes whose only edges are membership.
   - Default view: docs + learnings + customers-with-real-topic-edges, clustered by topic.

4. **Persist top-terms cache**
   - Write `~/.openclaw/workspace/brain/doc-keywords.json` so rebuilds don't recompute TF-IDF every time.
   - Invalidate entry when doc file mtime changes.

## Out of scope (Phase 2, separate plan later)

- RAG embedding similarity (the ~600MB model is already shipped lazy for Knowledge).
- Topic clustering UI (force-directed layout with topic-colored groups).
- Time-decay weighting on customer memory.

## Files to touch

- `electron/lib/brain-graph.js` — replace weak semantic, add 3 cross-link collectors, add TF-IDF cache.
- `electron/ui/brain.js` — filter checkbox + default-hide membership-only nodes.
- `electron/ui/brain.html` — checkbox markup in toolbar.

## Verify

- Reload Brain tab → default view shows docs + customers connected to docs/learnings, NOT a wall of customer↔group lines.
- Tick "Hiện liên kết nhóm" → membership edges reappear.
- Click a doc node → see other docs sharing keywords + customers whose memory mentions those keywords.
- `brain/doc-keywords.json` exists with `{ docId: ["term1","term2",...] }` entries.

## Effort

~1 day. TF-IDF is ~80 LOC, Vietnamese tokenizer ~30 LOC, cross-link collectors ~150 LOC, UI filter ~40 LOC.
