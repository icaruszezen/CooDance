import { ScriptLineItem } from './types.js';

export interface ParseScriptOptions {
  sentencePauseMs?: number;
  paragraphPauseMs?: number;
}

/**
 * Parses `script.txt` according to the Code-as-Video spec:
 * - Comment lines starting with `#` or `//` attach as storyboard notes to the next spoken line.
 * - Blank lines between spoken lines mark a paragraph break (`paragraphPauseMs`).
 * - Inline `[pause:600]` tags override the pause after a line.
 */
export function parseScriptText(
  rawText: string,
  options: ParseScriptOptions = {},
): ScriptLineItem[] {
  const sentencePauseMs = options.sentencePauseMs ?? 220;
  const paragraphPauseMs = options.paragraphPauseMs ?? 560;

  const rawLines = rawText.replace(/\r\n/g, '\n').split('\n');
  const items: ScriptLineItem[] = [];
  const pendingNotes: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i].trim();
    if (!raw) {
      if (items.length > 0) {
        items[items.length - 1].pauseAfterMs = Math.max(
          items[items.length - 1].pauseAfterMs,
          paragraphPauseMs,
        );
      }
      continue;
    }

    if (raw.startsWith('#') || raw.startsWith('//')) {
      const noteText = raw.replace(/^(#+|\/\/+)\s*/, '').trim();
      if (noteText) {
        pendingNotes.push(noteText);
      }
      continue;
    }

    let customPause: number | null = null;
    const pauseMatch = raw.match(/\[pause:(\d+)\]\s*$/i);
    let spokenText = raw;
    if (pauseMatch) {
      customPause = Number(pauseMatch[1]);
      spokenText = raw.slice(0, pauseMatch.index).trim();
    }
    if (!spokenText) continue;

    items.push({
      index: items.length,
      lineNumber: i + 1,
      text: spokenText,
      note: pendingNotes.length > 0 ? pendingNotes.join(' | ') : undefined,
      pauseAfterMs: customPause ?? sentencePauseMs,
    });
    pendingNotes.length = 0;
  }

  if (items.length > 0) {
    items[items.length - 1].pauseAfterMs = Math.min(items[items.length - 1].pauseAfterMs, 300);
  }

  return items;
}

/**
 * Splits a long spoken sentence into clean subtitle cues based on Chinese/English punctuation
 * and maximum display width, preserving proportional character timing.
 */
export function splitSentenceForSubtitles(
  text: string,
  maxCharsPerCue = 22,
): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxCharsPerCue) return [cleaned];

  // Split by strong/weak punctuation first
  const rawChunks = cleaned
    .split(/(?<=[。！？；，、,.!?;])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const merged: string[] = [];
  let buffer = '';

  const flushBuffer = () => {
    if (buffer.trim()) {
      merged.push(buffer.trim());
      buffer = '';
    }
  };

  for (const chunk of rawChunks) {
    if (!buffer) {
      if (chunk.length <= maxCharsPerCue) {
        buffer = chunk;
      } else {
        // Hard-wrap very long punctuation-free segment
        for (let offset = 0; offset < chunk.length; offset += maxCharsPerCue) {
          merged.push(chunk.slice(offset, offset + maxCharsPerCue));
        }
      }
    } else if (buffer.length + chunk.length <= maxCharsPerCue) {
      buffer += chunk;
    } else {
      flushBuffer();
      if (chunk.length <= maxCharsPerCue) {
        buffer = chunk;
      } else {
        for (let offset = 0; offset < chunk.length; offset += maxCharsPerCue) {
          merged.push(chunk.slice(offset, offset + maxCharsPerCue));
        }
      }
    }
  }
  flushBuffer();

  return merged.length > 0 ? merged : [cleaned];
}

export function formatSrtTime(sec: number): string {
  const safe = Math.max(0, sec);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(Math.min(999, Math.max(0, n))).padStart(3, '0');
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(ms)}`;
}
