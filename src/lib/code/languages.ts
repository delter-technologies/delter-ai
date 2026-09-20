import path from "node:path";

/**
 * Language registry for Code Studio.
 *
 * `id` is what the editor uses to pick a CodeMirror language support module,
 * and what the AI is told a file contains. Adding a language means adding a row
 * here plus one extension in the editor's `languageFor()` switch.
 */
export type LanguageId =
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

export type Language = {
  id: LanguageId;
  label: string;
  extensions: string[];
  /** Fence tag used when showing this file to a model. */
  fence: string;
  /** Whether Code Studio can render it in the Preview tab. */
  previewable: boolean;
};

export const LANGUAGES: Language[] = [
  { id: "typescript", label: "TypeScript", extensions: [".ts", ".mts", ".cts"], fence: "ts", previewable: false },
  { id: "tsx", label: "TSX", extensions: [".tsx"], fence: "tsx", previewable: false },
  { id: "javascript", label: "JavaScript", extensions: [".js", ".mjs", ".cjs"], fence: "js", previewable: true },
  { id: "jsx", label: "JSX", extensions: [".jsx"], fence: "jsx", previewable: false },
  { id: "html", label: "HTML", extensions: [".html", ".htm"], fence: "html", previewable: true },
  { id: "css", label: "CSS", extensions: [".css"], fence: "css", previewable: true },
  { id: "json", label: "JSON", extensions: [".json", ".webmanifest"], fence: "json", previewable: false },
  { id: "markdown", label: "Markdown", extensions: [".md", ".markdown", ".mdx"], fence: "md", previewable: true },
  { id: "python", label: "Python", extensions: [".py"], fence: "python", previewable: false },
  { id: "text", label: "Plain text", extensions: [".txt", ".log", ".env", ".gitignore", ""], fence: "text", previewable: true },
];

const BY_EXTENSION = new Map<string, Language>();
for (const language of LANGUAGES) {
  for (const ext of language.extensions) BY_EXTENSION.set(ext, language);
}

export function languageFor(filePath: string): Language {
  const name = path.posix.basename(filePath);
  const lower = name.toLowerCase();

  // Dotfiles without a usable extension.
  if (lower === "dockerfile") return LANGUAGES.find((l) => l.id === "text")!;
  if (lower === ".gitignore" || lower === ".env") return LANGUAGES.find((l) => l.id === "text")!;

  const ext = path.posix.extname(lower);
  return BY_EXTENSION.get(ext) ?? LANGUAGES.find((l) => l.id === "text")!;
}

export function languageLabel(filePath: string): string {
  return languageFor(filePath).label;
}

export function isPreviewable(filePath: string): boolean {
  return languageFor(filePath).previewable;
}
