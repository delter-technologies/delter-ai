"use client";

import { useEffect, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, placeholder as cmPlaceholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput, indentUnit, HighlightStyle, syntaxHighlighting, type LanguageSupport } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { tags } from "@lezer/highlight";
import { useTheme } from "@/components/system/ThemeProvider";

/**
 * The code editor.
 *
 * CodeMirror 6 with real editing behaviour: undo history, bracket matching,
 * folding, find/replace, multi-cursor, indentation, and syntax highlighting for
 * the languages Code Studio stores. It is a controlled-from-outside, uncontrolled
 * -internally component: the parent owns the document identity and save state,
 * the editor owns typing.
 */

export type EditorLanguage =
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "html"
  | "css"
  | "json"
  | "markdown"
  | "python"
  | "text";

function languageFor(language: EditorLanguage): LanguageSupport | null {
  switch (language) {
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "html":
      return html();
    case "css":
      return css();
    case "json":
      return json();
    case "markdown":
      return markdown();
    case "python":
      return python();
    default:
      return null;
  }
}

/**
 * One highlight style that reads from the CSS custom properties, so the editor
 * follows the app theme without a second set of colours to maintain.
 */
const highlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "var(--text-faint)", fontStyle: "italic" },
  { tag: [tags.string, tags.special(tags.string)], color: "#8fbf6a" },
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: "#c792ea" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "#e0a458" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#6cb6ff" },
  { tag: [tags.definition(tags.variableName), tags.local(tags.variableName)], color: "var(--text)" },
  { tag: [tags.propertyName, tags.attributeName], color: "#9dc0ff" },
  { tag: [tags.tagName, tags.angleBracket], color: "#f0736a" },
  { tag: [tags.typeName, tags.className], color: "#4ec9b0" },
  { tag: [tags.punctuation, tags.separator, tags.bracket], color: "var(--text-secondary)" },
  { tag: [tags.regexp], color: "#d7a0ff" },
  { tag: [tags.heading, tags.strong], color: "var(--text)", fontWeight: "600" },
  { tag: [tags.emphasis], fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "var(--accent-text)" },
  { tag: [tags.meta], color: "var(--text-muted)" },
  { tag: [tags.invalid], color: "var(--danger)" },
]);

export type CodeEditorHandle = {
  /** Force the editor to adopt new external content (e.g. after a save conflict). */
  setContent: (content: string) => void;
  focus: () => void;
  getSelectedText: () => string;
};

export function CodeEditor({
  value,
  language,
  filePath,
  readOnly,
  onChange,
  onSaveRequest,
  onCursor,
  handleRef,
}: {
  /** Document content. Changing it replaces the buffer only when `filePath` changes. */
  value: string;
  language: EditorLanguage;
  /** Identity of the open file — a change reloads the buffer. */
  filePath: string;
  readOnly?: boolean;
  onChange: (content: string) => void;
  /** Cmd/Ctrl+S: the parent decides what "save" means. */
  onSaveRequest?: () => void;
  /** Reports selection + cursor so the AI assistant knows what "this code" is. */
  onCursor?: (info: { selection: string; line: number; column: number }) => void;
  handleRef?: React.MutableRefObject<CodeEditorHandle | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSaveRequest);
  const onCursorRef = useRef(onCursor);
  const { resolved } = useTheme();

  onChangeRef.current = onChange;
  onSaveRef.current = onSaveRequest;
  onCursorRef.current = onCursor;

  /* ------------------------------------------------- create the editor --- */

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      rectangularSelection(),
      highlightSelectionMatches(),
      indentUnit.of("  "),
      EditorState.tabSize.of(2),
      EditorView.lineWrapping,
      syntaxHighlighting(highlightStyle, { fallback: true }),
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            onSaveRef.current?.();
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        // Tab indents, Shift-Tab outdents, and with several cursors Tab moves
        // focus out of the editor so keyboard users are never trapped.
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
        if (update.selectionSet || update.docChanged) {
          const selection = update.state.sliceDoc(
            update.state.selection.main.from,
            update.state.selection.main.to,
          );
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);
          onCursorRef.current?.({
            selection,
            line: line.number,
            column: head - line.from + 1,
          });
        }
      }),
    ];

    const languageSupport = languageFor(language);
    if (languageSupport) extensions.push(languageSupport);
    if (readOnly) extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
    if (!value) {
      extensions.push(
        cmPlaceholder(`// ${filePath.split("/").pop() ?? filePath} is empty.\n// Start typing, or ask the assistant to write it.`),
      );
    }

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    if (handleRef) {
      handleRef.current = {
        setContent: (content: string) => {
          const current = viewRef.current;
          if (!current) return;
          current.dispatch({
            changes: { from: 0, to: current.state.doc.length, insert: content },
          });
        },
        focus: () => viewRef.current?.focus(),
        getSelectedText: () => {
          const current = viewRef.current;
          if (!current) return "";
          return current.state.sliceDoc(current.state.selection.main.from, current.state.selection.main.to);
        },
      };
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (handleRef) handleRef.current = null;
    };
    // The editor is rebuilt only when the file identity, language or theme
    // changes. Content edits flow through the update listener instead, so
    // rebuilding on every keystroke would destroy undo history and the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, language, resolved, readOnly]);

  /* ------------------------------------- adopt externally replaced content --- */

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    // Only overwrite when the buffer genuinely differs (a revert, an applied AI
    // edit, a conflict resolution) — never while the user is typing.
    if (current !== value && document.activeElement !== view.contentDOM) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full overflow-hidden"
      role="group"
      aria-label={`Code editor for ${filePath}`}
    />
  );
}
