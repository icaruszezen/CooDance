import React, { useEffect, useRef } from 'react';
import { Compartment, EditorState, RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers as cmLineNumbers,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { cn } from './cn';

export type CodeEditorLanguage = 'json' | 'script' | 'diff' | 'srt' | 'markdown';

export interface CodeEditorProps {
  id?: string;
  value: string;
  onChange?: (next: string) => void;
  onSave?: () => void;
  language: CodeEditorLanguage;
  theme: 'dark' | 'light';
  readOnly?: boolean;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

const scriptLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol()) {
      stream.eatSpace();
      if (stream.match(/^#.*$/) || stream.match(/^\/\/.*$/)) {
        return 'comment';
      }
    }
    if (stream.match(/^\[pause:\s*\d+(?:ms)?\s*\]/i)) {
      return 'keyword';
    }
    if (stream.match(/^[^[\n]+/)) {
      return null;
    }
    stream.next();
    return null;
  },
});

const diffLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol()) {
      if (
        stream.match(/^diff\s.*$/) ||
        stream.match(/^index\s.*$/) ||
        stream.match(/^\+\+\+\s.*$/) ||
        stream.match(/^---\s.*$/)
      ) {
        return 'meta';
      }
      if (stream.match(/^@@.*$/)) {
        return 'heading';
      }
      if (stream.match(/^\+.*$/)) {
        return 'inserted';
      }
      if (stream.match(/^-.*$/)) {
        return 'deleted';
      }
    }
    stream.skipToEnd();
    return null;
  },
});

const srtLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol()) {
      if (stream.match(/^\d+\s*$/)) {
        return 'number';
      }
      if (stream.match(/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}.*$/)) {
        return 'keyword';
      }
    }
    stream.skipToEnd();
    return null;
  },
});

const markdownLanguage = StreamLanguage.define<{ inFence: boolean }>({
  startState() {
    return { inFence: false };
  },
  token(stream, state) {
    if (stream.sol()) {
      if (stream.match(/^```.*$/)) {
        state.inFence = !state.inFence;
        return 'meta';
      }
      if (state.inFence) {
        stream.skipToEnd();
        return 'string';
      }
      if (stream.match(/^#{1,6}\s+.*$/)) {
        return 'heading';
      }
      if (stream.match(/^>\s?.*$/)) {
        return 'comment';
      }
      if (stream.match(/^\s*[-*+]\s+/)) {
        return 'keyword';
      }
      if (stream.match(/^\s*\d+\.\s+/)) {
        return 'number';
      }
    }
    if (stream.match(/^`[^`]+`/)) {
      return 'string';
    }
    if (stream.match(/^\*\*[^*]+\*\*/)) {
      return 'strong';
    }
    if (stream.match(/^[^`*\n]+/)) {
      return null;
    }
    stream.next();
    return null;
  },
});

const addLineDeco = Decoration.line({ class: 'cm-diff-add' });
const delLineDeco = Decoration.line({ class: 'cm-diff-del' });
const hunkLineDeco = Decoration.line({ class: 'cm-diff-hunk' });

function buildDiffDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      if (text.startsWith('@@')) {
        builder.add(line.from, line.from, hunkLineDeco);
      } else if (text.startsWith('+') && !text.startsWith('+++')) {
        builder.add(line.from, line.from, addLineDeco);
      } else if (text.startsWith('-') && !text.startsWith('---')) {
        builder.add(line.from, line.from, delLineDeco);
      }
      if (line.to >= to) break;
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const diffLineHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDiffDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDiffDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

function getLanguageExtension(lang: CodeEditorLanguage): Extension {
  switch (lang) {
    case 'json':
      return json();
    case 'script':
      return scriptLanguage;
    case 'diff':
      return [diffLanguage, diffLineHighlightPlugin];
    case 'srt':
      return srtLanguage;
    case 'markdown':
      return markdownLanguage;
  }
}

function buildStudioTheme(mode: 'dark' | 'light'): Extension {
  const isDark = mode === 'dark';

  const chrome = EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: isDark ? '#ececef' : '#141416',
      },
      '.cm-content': {
        caretColor: isDark ? '#d99b26' : '#b57913',
        padding: '10px 0',
      },
      '.cm-line': {
        padding: '0 12px',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: isDark ? '#d99b26' : '#b57913',
        borderLeftWidth: '1.5px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: isDark ? 'rgba(217, 155, 38, 0.22)' : 'rgba(181, 121, 19, 0.16)',
      },
      '.cm-activeLine': {
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.032)' : 'rgba(0, 0, 0, 0.03)',
      },
      '.cm-selectionMatch': {
        backgroundColor: isDark ? 'rgba(101, 168, 212, 0.18)' : 'rgba(58, 124, 165, 0.14)',
        borderRadius: '2px',
      },
      '.cm-matchingBracket': {
        backgroundColor: isDark ? 'rgba(217, 155, 38, 0.18)' : 'rgba(181, 121, 19, 0.16)',
        outline: `1px solid ${isDark ? 'rgba(217, 155, 38, 0.45)' : 'rgba(181, 121, 19, 0.4)'}`,
      },
      '.cm-placeholder': {
        color: isDark ? '#6e6e77' : '#82828c',
      },
    },
    { dark: isDark },
  );

  const highlight = HighlightStyle.define([
    { tag: tags.propertyName, color: isDark ? '#7fb6dc' : '#2c6a94' },
    { tag: tags.string, color: isDark ? '#6dc49a' : '#267a56' },
    { tag: tags.number, color: isDark ? '#d99b26' : '#b57913' },
    { tag: tags.bool, color: isDark ? '#d99b26' : '#b57913', fontWeight: '600' },
    { tag: tags.null, color: isDark ? '#a1a1aa' : '#71717a', fontStyle: 'italic' },
    { tag: tags.keyword, color: isDark ? '#d99b26' : '#b57913', fontWeight: '600' },
    { tag: tags.comment, color: isDark ? '#787884' : '#7a7a85', fontStyle: 'italic' },
    { tag: tags.meta, color: isDark ? '#8a8a96' : '#6c6c76', fontWeight: '600' },
    { tag: tags.heading, color: isDark ? '#7fb6dc' : '#2c6a94', fontWeight: '700' },
    { tag: tags.strong, color: isDark ? '#f4f4f5' : '#141416', fontWeight: '700' },
    { tag: tags.inserted, color: isDark ? '#6dc49a' : '#216e4d' },
    { tag: tags.deleted, color: isDark ? '#e08282' : '#b53d3d' },
    { tag: tags.punctuation, color: isDark ? '#7a7a86' : '#82828c' },
  ]);

  return [chrome, syntaxHighlighting(highlight)];
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  id,
  value,
  onChange,
  onSave,
  language,
  theme,
  readOnly = false,
  lineNumbers = true,
  wordWrap = false,
  placeholder = '',
  className,
  style,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const langComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const modeComp = useRef(new Compartment());
  const wrapComp = useRef(new Compartment());
  const gutterComp = useRef(new Compartment());

  const buildModeExtensions = (isReadOnly: boolean): Extension => {
    if (isReadOnly) {
      // Disable bracketMatching & active line highlights on read-only static views
      return [EditorState.readOnly.of(true), EditorView.editable.of(false)];
    }
    return [
      EditorState.readOnly.of(false),
      EditorView.editable.of(true),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSelectionMatches(),
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            onSaveRef.current?.();
            return true;
          },
        },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
    ];
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        langComp.current.of(getLanguageExtension(language)),
        themeComp.current.of(buildStudioTheme(theme)),
        modeComp.current.of(buildModeExtensions(readOnly)),
        wrapComp.current.of(wordWrap ? EditorView.lineWrapping : []),
        gutterComp.current.of(lineNumbers ? cmLineNumbers() : []),
        placeholder ? cmPlaceholder(placeholder) : [],
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Sync external document updates without clobbering active edits
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: langComp.current.reconfigure(getLanguageExtension(language)),
    });
  }, [language]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeComp.current.reconfigure(buildStudioTheme(theme)),
    });
  }, [theme]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: modeComp.current.reconfigure(buildModeExtensions(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapComp.current.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: gutterComp.current.reconfigure(lineNumbers ? cmLineNumbers() : []),
    });
  }, [lineNumbers]);

  return (
    <div
      id={id}
      ref={hostRef}
      className={cn('studio-cm-host', className)}
      style={style}
    />
  );
};
