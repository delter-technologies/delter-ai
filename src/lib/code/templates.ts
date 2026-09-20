import type { LanguageId } from "./languages";

/**
 * Project templates.
 *
 * Creating a project from a template writes real, working files into Code
 * Studio so the editor, preview and AI assistant all have something genuine to
 * operate on from the first second. No empty-shell projects.
 */

export type TemplateFile = {
  path: string;
  content: string;
  language?: LanguageId;
};

export type ProjectTemplate = {
  id: string;
  label: string;
  description: string;
  kind: string;
  /** Project description written to the Project row. */
  projectDescription: string;
  files: TemplateFile[];
};

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "blank",
    label: "Blank project",
    description: "An empty Code Studio workspace. Add files as you go.",
    kind: "general",
    projectDescription: "",
    files: [],
  },
  {
    id: "static-site",
    label: "Static website",
    description: "HTML, CSS and a little JavaScript — previewable immediately.",
    kind: "web",
    projectDescription: "A static website built in Delter AI Code Studio.",
    files: [
      {
        path: "index.html",
        language: "html",
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My website</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="site-header">
      <div class="wrap">
        <span class="brand">Acme</span>
        <nav>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
        </nav>
      </div>
    </header>

    <main>
      <section class="hero wrap">
        <h1>Ship the thing you keep describing</h1>
        <p>
          A starting point for a static site. Edit this file in Code Studio, then
          check the Preview tab — it re-renders from your saved files.
        </p>
        <div class="actions">
          <a class="button primary" href="#features">See features</a>
          <a class="button" href="#contact">Talk to us</a>
        </div>
      </section>

      <section id="features" class="wrap grid">
        <article>
          <h2>Fast</h2>
          <p>No build step, no framework. Plain files served straight from your project.</p>
        </article>
        <article>
          <h2>Editable</h2>
          <p>Ask the Code Studio assistant to change a section and it edits these files.</p>
        </article>
        <article>
          <h2>Portable</h2>
          <p>Everything lives in your project, so you can download it and host it anywhere.</p>
        </article>
      </section>

      <section id="pricing" class="wrap">
        <h2>Pricing</h2>
        <p>Replace this with something real.</p>
      </section>

      <section id="contact" class="wrap">
        <h2>Contact</h2>
        <form onsubmit="return false">
          <label>Email <input type="email" name="email" placeholder="you@example.com" /></label>
          <button class="button primary" type="submit" id="send">Send</button>
        </form>
        <p id="status" role="status"></p>
      </section>
    </main>

    <footer class="wrap">
      <p>Built with Delter AI.</p>
    </footer>

    <script src="app.js"></script>
  </body>
</html>
`,
      },
      {
        path: "styles.css",
        language: "css",
        content: `:root {
  --bg: #0b0d10;
  --surface: #12161b;
  --border: #232a32;
  --text: #e8ecf1;
  --muted: #97a3b0;
  --accent: #4c8dff;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

.wrap { max-width: 960px; margin: 0 auto; padding: 0 24px; }

.site-header {
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
}

.site-header .wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
}

.brand { font-weight: 650; letter-spacing: -0.01em; }

nav { display: flex; gap: 20px; }

nav a { color: var(--muted); text-decoration: none; font-size: 14px; }
nav a:hover { color: var(--text); }

.hero { padding: 88px 24px 64px; }
.hero h1 { font-size: 44px; line-height: 1.1; letter-spacing: -0.03em; margin: 0 0 16px; }
.hero p { color: var(--muted); max-width: 56ch; margin: 0 0 28px; }

.actions { display: flex; gap: 12px; flex-wrap: wrap; }

.button {
  display: inline-block;
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  font-size: 14px;
  cursor: pointer;
}

.button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  padding-bottom: 64px;
}

.grid article {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  background: var(--surface);
}

.grid h2 { margin: 0 0 8px; font-size: 17px; }
.grid p { margin: 0; color: var(--muted); font-size: 14px; }

section h2 { letter-spacing: -0.02em; }

form { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
label { color: var(--muted); font-size: 14px; display: flex; gap: 8px; align-items: center; }

input {
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font: inherit;
}

footer { padding: 32px 24px; border-top: 1px solid var(--border); color: var(--muted); font-size: 14px; }

@media (max-width: 640px) {
  .hero h1 { font-size: 32px; }
  .site-header nav { display: none; }
}
`,
      },
      {
        path: "app.js",
        language: "javascript",
        content: `// Small progressive enhancement. Runs inside the Code Studio preview iframe.
const form = document.querySelector("form");
const status = document.getElementById("status");

if (form && status) {
  form.addEventListener("submit", () => {
    const email = form.elements.email?.value?.trim();
    if (!email) {
      status.textContent = "Enter an email address first.";
      return;
    }
    status.textContent = \`Thanks — we would contact \${email}. (This demo does not send anything.)\`;
  });
}

console.log("Static site template loaded.");
`,
      },
      {
        path: "README.md",
        language: "markdown",
        content: `# My website

A static site generated from the Delter AI Code Studio template.

## Files

- \`index.html\` — page structure
- \`styles.css\` — design tokens and layout
- \`app.js\` — small progressive enhancement

## Working with the AI assistant

Open the assistant panel and ask for concrete changes, for example:

- "Make the header darker."
- "Add a testimonials section between features and pricing."
- "The hero heading is too large on mobile — fix it."

The assistant sees this project's file list and the file you have open, so you
do not need to paste code back and forth.
`,
      },
    ],
  },
  {
    id: "typescript-app",
    label: "TypeScript app",
    description: "A typed starting point with a small module and tests.",
    kind: "app",
    projectDescription: "A TypeScript application scaffold created in Delter AI Code Studio.",
    files: [
      {
        path: "src/index.ts",
        language: "typescript",
        content: `import { formatReport, collectMetrics } from "./metrics";

async function main() {
  const metrics = await collectMetrics();
  console.log(formatReport(metrics));
}

main().catch((error) => {
  console.error("Run failed:", error);
  process.exitCode = 1;
});
`,
      },
      {
        path: "src/metrics.ts",
        language: "typescript",
        content: `export type Metric = {
  name: string;
  value: number;
  unit: string;
};

export type Report = {
  generatedAt: string;
  metrics: Metric[];
};

/** Replace this with a real data source. */
export async function collectMetrics(): Promise<Metric[]> {
  return [
    { name: "requests", value: 1284, unit: "count" },
    { name: "p95 latency", value: 212, unit: "ms" },
    { name: "error rate", value: 0.4, unit: "%" },
  ];
}

export function formatReport(metrics: Metric[]): string {
  const lines = metrics.map((m) => \`  \${m.name.padEnd(16)} \${String(m.value).padStart(8)} \${m.unit}\`);
  return ["Metrics", "-------", ...lines].join("\\n");
}
`,
      },
      {
        path: "src/metrics.test.ts",
        language: "typescript",
        content: `import { formatReport } from "./metrics";

// Plain assertions so this runs without a test framework:
//   npx tsx src/metrics.test.ts
const output = formatReport([{ name: "requests", value: 10, unit: "count" }]);

if (!output.includes("requests")) throw new Error("expected the metric name in the report");
if (!output.includes("10")) throw new Error("expected the metric value in the report");

console.log("metrics.test.ts passed");
`,
      },
      {
        path: "tsconfig.json",
        language: "json",
        content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUnusedLocals": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
`,
      },
      {
        path: "README.md",
        language: "markdown",
        content: `# TypeScript app

A small typed starting point.

\`\`\`
src/index.ts        entry point
src/metrics.ts      domain logic
src/metrics.test.ts plain-assertion test
\`\`\`

Code Studio stores these files in your project and previews web output. It does
not run a Node process, so use your own machine or a sandboxed runner for
\`tsc\`, \`tsx\` and tests. The Terminal tab in Code Studio says this explicitly
rather than pretending to execute commands.
`,
      },
    ],
  },
  {
    id: "python",
    label: "Python script",
    description: "A single-file Python starting point with a CLI entry.",
    kind: "script",
    projectDescription: "A Python project created in Delter AI Code Studio.",
    files: [
      {
        path: "main.py",
        language: "python",
        content: `"""Entry point for the project."""

from __future__ import annotations

import argparse
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    source: str
    limit: int


def parse_args(argv: list[str] | None = None) -> Config:
    parser = argparse.ArgumentParser(description="Process a data source.")
    parser.add_argument("--source", default="sample.csv", help="Path to the input file")
    parser.add_argument("--limit", type=int, default=100, help="Maximum rows to process")
    args = parser.parse_args(argv)
    return Config(source=args.source, limit=args.limit)


def run(config: Config) -> int:
    print(f"Reading {config.source} (limit {config.limit})")
    # Replace with real work.
    return 0


def main() -> None:
    raise SystemExit(run(parse_args()))


if __name__ == "__main__":
    main()
`,
      },
      {
        path: "requirements.txt",
        language: "text",
        content: `# Add dependencies here, one per line, pinned where practical.
`,
      },
      {
        path: "README.md",
        language: "markdown",
        content: `# Python script

Run locally with:

\`\`\`bash
python main.py --source data.csv --limit 50
\`\`\`

Code Studio edits and stores these files; it does not execute Python on the
Delter AI server. Run it in your own environment or a sandbox you control.
`,
      },
    ],
  },
];

export function getTemplate(id: string): ProjectTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
