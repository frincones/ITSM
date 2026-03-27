/**
 * Text chunking utilities for RAG pipeline.
 * Splits documents into overlapping chunks suitable for embedding.
 */

/**
 * Rough token count estimation (~4 chars per token for English text).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Splits text into sentences using common sentence boundaries.
 */
function splitSentences(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g);
  if (!sentences) return [text];
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Splits text into paragraphs (double newline separation).
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Splits text into chunks with overlap for context continuity.
 *
 * Strategy:
 * 1. Split by paragraphs first.
 * 2. If a paragraph exceeds maxTokens, split it by sentences.
 * 3. Accumulate content into chunks up to maxTokens.
 * 4. Maintain `overlap` tokens of overlap between consecutive chunks.
 *
 * @param text - The full document text to chunk.
 * @param maxTokens - Maximum estimated tokens per chunk (default 500).
 * @param overlap - Number of estimated tokens to overlap between chunks (default 50).
 * @returns Array of text chunks.
 */
export function splitIntoChunks(
  text: string,
  maxTokens: number = 500,
  overlap: number = 50,
): string[] {
  if (!text || text.trim().length === 0) return [];

  const paragraphs = splitParagraphs(text);

  // Break paragraphs into sentence-level segments if they exceed maxTokens
  const segments: string[] = [];
  for (const paragraph of paragraphs) {
    if (estimateTokens(paragraph) <= maxTokens) {
      segments.push(paragraph);
    } else {
      const sentences = splitSentences(paragraph);
      for (const sentence of sentences) {
        segments.push(sentence);
      }
    }
  }

  const chunks: string[] = [];
  let currentChunk = '';
  let overlapBuffer = '';

  for (const segment of segments) {
    const candidateText = currentChunk
      ? `${currentChunk}\n\n${segment}`
      : segment;

    if (estimateTokens(candidateText) > maxTokens && currentChunk.length > 0) {
      // Finalize the current chunk
      chunks.push(currentChunk.trim());

      // Build overlap from the tail of the current chunk
      overlapBuffer = buildOverlapBuffer(currentChunk, overlap);

      // Start next chunk with overlap + new segment
      currentChunk = overlapBuffer
        ? `${overlapBuffer}\n\n${segment}`
        : segment;
    } else {
      currentChunk = candidateText;
    }
  }

  // Push any remaining content
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Extracts the tail portion of text that approximates `overlapTokens` tokens.
 * Takes complete sentences from the end to maintain readability.
 */
function buildOverlapBuffer(text: string, overlapTokens: number): string {
  if (overlapTokens <= 0) return '';

  const sentences = splitSentences(text);
  const buffer: string[] = [];
  let tokenCount = 0;

  // Walk backwards through sentences to build overlap
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentenceTokens = estimateTokens(sentences[i]);
    if (tokenCount + sentenceTokens > overlapTokens && buffer.length > 0) {
      break;
    }
    buffer.unshift(sentences[i]);
    tokenCount += sentenceTokens;
  }

  return buffer.join(' ');
}
