import type { ReactElement, SVGProps } from "react";

/**
 * Delter AI icon set.
 *
 * Hand-drawn 16px stroke icons at 1.5 weight. A single consistent set — no
 * emoji, no mixed icon libraries, no filled/outline mix. All take
 * `currentColor` so they inherit the text colour of their context.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- Brand --- */

/**
 * The Delter AI mark: a "D" formed from a vertical stem and an arc, drawn on a
 * 16px grid so it holds up at favicon size and in the sidebar.
 */
export function IconLogo({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false" {...rest}>
      <rect x="0.75" y="0.75" width="14.5" height="14.5" rx="4" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5.25 11.5V4.5h2.1c1.9 0 3.4 1.35 3.4 3.5S9.25 11.5 7.35 11.5H5.25Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------ Navigation --- */

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.75 7.25 8 2.75l5.25 4.5" />
    <path d="M4 8.25v4.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-4.5" />
    <path d="M6.75 13.25v-3.5h2.5v3.5" />
  </Svg>
);

export const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.25 9.5a1.75 1.75 0 0 1-1.75 1.75H6.25L3.5 13.5v-2.25h-.75A1.75 1.75 0 0 1 1 9.5v-5A1.75 1.75 0 0 1 2.75 2.75h8.75A1.75 1.75 0 0 1 13.25 4.5v5Z" />
    <path d="M4.5 6.25h5M4.5 8.75h3" />
  </Svg>
);

export const IconProjects = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.25 4.25A1.5 1.5 0 0 1 3.75 2.75h2.1l1.3 1.5h5.1a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V4.25Z" />
  </Svg>
);

export const IconFiles = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.25 1.75H4.25a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5V5.75L9.25 1.75Z" />
    <path d="M9.25 1.75v4h4.5" />
  </Svg>
);

export const IconCode = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.75 4.25 2.25 8l3.5 3.75" />
    <path d="M10.25 4.25 13.75 8l-3.5 3.75" />
    <path d="M9.25 3 6.75 13" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="2.75" width="12" height="10.5" rx="1.5" />
    <circle cx="5.75" cy="6.25" r="1.1" />
    <path d="M2.5 11.5 6 8.25l2.5 2.25 2-1.75 3 2.75" />
  </Svg>
);

export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12" />
    <path d="M8 2a9.5 9.5 0 0 1 0 12 9.5 9.5 0 0 1 0-12Z" />
  </Svg>
);

export const IconResearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.25 10.25 3 3" />
  </Svg>
);

export const IconPresentation = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.25 3.25h11.5" />
    <rect x="3.25" y="3.25" width="9.5" height="6.5" rx="1" />
    <path d="M8 9.75v2.5M5.75 13.25 8 12.25l2.25 1" />
  </Svg>
);

export const IconSheet = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.5" />
    <path d="M2.25 6.25h11.5M2.25 9.75h11.5M6.25 6.25v7M10.25 6.25v7" />
  </Svg>
);

export const IconAutomation = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.25 1.75 3.75 9h3.5l-.5 5.25L12.25 7H8.75l.5-5.25Z" />
  </Svg>
);

export const IconPlug = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 1.75v3.5M10 1.75v3.5" />
    <path d="M4.25 5.25h7.5v2.5a3.75 3.75 0 0 1-7.5 0v-2.5Z" />
    <path d="M8 11.5v2.75" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2.1" />
    <path d="M13.1 9.9a1.2 1.2 0 0 0 .24 1.32l.04.04a1.45 1.45 0 1 1-2.05 2.05l-.04-.04a1.2 1.2 0 0 0-1.32-.24 1.2 1.2 0 0 0-.73 1.1v.12a1.45 1.45 0 1 1-2.9 0v-.06a1.2 1.2 0 0 0-.78-1.1 1.2 1.2 0 0 0-1.32.24l-.04.04A1.45 1.45 0 1 1 2.19 11.3l.04-.04a1.2 1.2 0 0 0 .24-1.32 1.2 1.2 0 0 0-1.1-.73h-.12a1.45 1.45 0 1 1 0-2.9h.06a1.2 1.2 0 0 0 1.1-.78 1.2 1.2 0 0 0-.24-1.32l-.04-.04A1.45 1.45 0 1 1 4.24 2.2l.04.04a1.2 1.2 0 0 0 1.32.24h.06a1.2 1.2 0 0 0 .73-1.1v-.12a1.45 1.45 0 1 1 2.9 0v.06a1.2 1.2 0 0 0 .73 1.1 1.2 1.2 0 0 0 1.32-.24l.04-.04a1.45 1.45 0 1 1 2.05 2.05l-.04.04a1.2 1.2 0 0 0-.24 1.32v.06a1.2 1.2 0 0 0 1.1.73h.12a1.45 1.45 0 1 1 0 2.9h-.06a1.2 1.2 0 0 0-1.1.73Z" />
  </Svg>
);

/* --------------------------------------------------------------- Actions --- */

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3.25v9.5M3.25 8h9.5" />
  </Svg>
);

export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.75 2.25 7 9" />
    <path d="M13.75 2.25 9.5 13.75 7 9 2.25 6.5 13.75 2.25Z" />
  </Svg>
);

export const IconStop = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconRetry = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.25 8a5.25 5.25 0 1 1-1.6-3.76" />
    <path d="M13.25 2.25v3.5h-3.5" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.75 4.25h10.5" />
    <path d="M6.25 4.25V3a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 .75.75v1.25" />
    <path d="M4.25 4.25 5 13a.75.75 0 0 0 .75.75h4.5A.75.75 0 0 0 11 13l.75-8.75" />
    <path d="M6.75 6.75v4.5M9.25 6.75v4.5" />
  </Svg>
);

export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11.25 2.25 13.75 4.75 5.5 13H3v-2.5l8.25-8.25Z" />
    <path d="m10 3.5 2.5 2.5" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.4" />
    <path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 10h1.5" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.25v8" />
    <path d="m4.75 7 3.25 3.25L11.25 7" />
    <path d="M2.75 12.75h10.5" />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 10.75v-8" />
    <path d="M4.75 6 8 2.75 11.25 6" />
    <path d="M2.75 13.25h10.5" />
  </Svg>
);

export const IconPaperclip = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12.5 7.25 7.75 12a3.25 3.25 0 0 1-4.6-4.6l5.5-5.5a2.25 2.25 0 0 1 3.18 3.18l-5.5 5.5a1.25 1.25 0 0 1-1.77-1.77l4.95-4.95" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 4.75 6.25 11.5 3 8.25" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3.5 6 4.5 4.5L12.5 6" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7.25" cy="7.25" r="4.5" />
    <path d="m10.75 10.75 2.75 2.75" />
  </Svg>
);

export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.25 4.5A1.5 1.5 0 0 1 3.75 3h2.1l1.3 1.5h5.1a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V4.5Z" />
  </Svg>
);

export const IconFolderOpen = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.25 6.25V4.5A1.5 1.5 0 0 1 3.75 3h2.1l1.3 1.5h5.1a1.5 1.5 0 0 1 1.5 1.5v.25" />
    <path d="M1.75 12.25 3 6.25h11.25l-1.25 6a1 1 0 0 1-1 .75H2.75a1 1 0 0 1-1-1Z" />
  </Svg>
);

export const IconFileCode = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.25 1.75H4.25a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5V5.75L9.25 1.75Z" />
    <path d="M9.25 1.75v4h4.5" />
    <path d="m6.5 8.5-1.25 1.25L6.5 11M9.5 8.5l1.25 1.25L9.5 11" />
  </Svg>
);

/** A plain document — used for Markdown and text files in Code Studio. */
export const IconFileText = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 1.75H4.25A1.25 1.25 0 0 0 3 3v10a1.25 1.25 0 0 0 1.25 1.25h7.5A1.25 1.25 0 0 0 13 13V5.25z" />
    <path d="M9.5 1.75V5.25H13" />
    <path d="M5.5 8.25h5M5.5 10.75h3.5" />
  </Svg>
);

export const IconTerminal = (p: IconProps) => (
  <Svg {...p}>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
    <path d="m4.75 6.25 2 1.75-2 1.75" />
    <path d="M8.5 10h2.75" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 8S3.75 3.75 8 3.75 14.5 8 14.5 8 12.25 12.25 8 12.25 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="1.9" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.25 9.15 5.6 12.5 6.75 9.15 7.9 8 11.25 6.85 7.9 3.5 6.75 6.85 5.6 8 2.25Z" />
    <path d="M12.25 11.25 12.8 12.8l1.55.55-1.55.55-.55 1.55-.55-1.55L10.15 13.9l1.55-.55.55-1.55Z" />
  </Svg>
);

export const IconSave = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.25 2.75h7.5L13.25 5.25v8a.75.75 0 0 1-.75.75H3.25a.75.75 0 0 1-.75-.75V3.5a.75.75 0 0 1 .75-.75Z" />
    <path d="M5.5 2.75v3.5h4.5v-3.5" />
    <path d="M5.25 14v-4h5.5v4" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="5.5" r="2.75" />
    <path d="M2.75 13.75a5.25 5.25 0 0 1 10.5 0" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 13.25H3.75a1.5 1.5 0 0 1-1.5-1.5V4.25a1.5 1.5 0 0 1 1.5-1.5H6.5" />
    <path d="M10.5 11 13.5 8l-3-3" />
    <path d="M13.5 8h-7" />
  </Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.25v1.5M8 13.25v1.5M1.25 8h1.5M13.25 8h1.5M3.2 3.2l1.05 1.05M11.75 11.75l1.05 1.05M12.8 3.2l-1.05 1.05M4.25 11.75 3.2 12.8" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.25 9.75A5.75 5.75 0 0 1 6.25 2.75a5.75 5.75 0 1 0 7 7Z" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.25 14.5 13.5h-13L8 2.25Z" />
    <path d="M8 6.75v2.75M8 11.5h.01" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.5v3.75M8 4.9h.01" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.25 1.5" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.25" y="7" width="9.5" height="6.75" rx="1.4" />
    <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.75 13 3.5v4c0 3.25-2.1 5.6-5 6.75-2.9-1.15-5-3.5-5-6.75v-4L8 1.75Z" />
    <path d="m6 8.25 1.5 1.5L10.25 7" />
  </Svg>
);

export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.25 13.75h11.5" />
    <path d="M4.5 13.75V8.5M7.5 13.75V4.25M10.5 13.75v-3.5" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.75 8h10.5" />
    <path d="m9.5 4.25 3.75 3.75-3.75 3.75" />
  </Svg>
);

export const IconPanelLeft = (p: IconProps) => (
  <Svg {...p}>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
    <path d="M6.25 2.75v10.5" />
  </Svg>
);

export const IconPanelRight = (p: IconProps) => (
  <Svg {...p}>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
    <path d="M9.75 2.75v10.5" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.25 8a5.25 5.25 0 1 1-1.6-3.76" />
    <path d="M13.25 2.25v3.5h-3.5" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.25H3.25A1.5 1.5 0 0 0 1.75 4.75v8A1.5 1.5 0 0 0 3.25 14.25h8a1.5 1.5 0 0 0 1.5-1.5V9.5" />
    <path d="M9.75 2.25h4v4" />
    <path d="M13.75 2.25 7.5 8.5" />
  </Svg>
);

export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.75 1.75h-3.5l-.75 4-2 1.75v1.25h9V7.5l-2-1.75-.75-4Z" />
    <path d="M8 8.75v5.5" />
  </Svg>
);

export const IconDot = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
  </Svg>
);

/** Maps tool ids from `lib/tools` to their icon, so the sidebar has one source. */
export const TOOL_ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  chat: IconChat,
  projects: IconProjects,
  files: IconFiles,
  code: IconCode,
  images: IconImage,
  websites: IconGlobe,
  research: IconResearch,
  presentations: IconPresentation,
  spreadsheets: IconSheet,
  automations: IconAutomation,
  integrations: IconPlug,
};
