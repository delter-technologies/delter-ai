import { z } from "zod";

/**
 * Input validation.
 *
 * Every route handler parses its body with one of these schemas before touching
 * the database. Nothing user-supplied reaches Prisma, the filesystem or a
 * provider unvalidated.
 */

const EMAIL_MESSAGE = "Enter a valid email address, for example you@company.com.";
const PASSWORD_MESSAGE = "Passwords must be at least 8 characters.";

export const emailSchema = z
  .string()
  .trim()
  .min(3, EMAIL_MESSAGE)
  .max(254, EMAIL_MESSAGE)
  .email(EMAIL_MESSAGE)
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, PASSWORD_MESSAGE)
  .max(200, "That password is too long (max 200 characters).");

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(80, "Names must be 80 characters or fewer.")
  .refine((value) => !/^[\s\p{P}\p{S}]+$/u.test(value), "Enter your name, not punctuation.");

export const optionalNameSchema = z
  .string()
  .trim()
  .max(80, "Names must be 80 characters or fewer.")
  .optional()
  .nullable()
  // `undefined` means "this field was not sent" and must survive parsing, or a
  // partial PATCH would null out values the client never mentioned. An explicit
  // null or empty string means "clear it".
  .transform((value) => (value === undefined ? undefined : value && value.trim() ? value.trim() : null));

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
  remember: z.boolean().optional().default(false),
  /** Where to send the user afterwards; restricted to internal paths. */
  next: z.string().optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "That reset link is incomplete."),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: passwordSchema,
});

export const themeSchema = z.enum(["system", "light", "dark"]);

export const onboardingSchema = z.object({
  displayName: optionalNameSchema,
  mainPurpose: z.string().trim().max(200, "Keep this under 200 characters.").optional().nullable(),
  interests: z
    .array(z.string().trim().min(1).max(60))
    .max(12, "Choose up to 12 interests.")
    .optional()
    .default([]),
});

export const updateProfileSchema = z.object({
  name: optionalNameSchema,
  displayName: optionalNameSchema,
  mainPurpose: z.string().trim().max(200).optional().nullable(),
  interests: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
});

export const updatePreferencesSchema = z.object({
  theme: themeSchema.optional(),
  defaultModel: z.string().trim().max(120).optional().nullable(),
});

/* -------------------------------------------------------------------------- */
/* Projects                                                                    */
/* -------------------------------------------------------------------------- */

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Give the project a name.")
  .max(80, "Project names must be 80 characters or fewer.");

export const projectKindSchema = z.enum(["general", "web", "app", "script", "writing", "data", "research"]);

export const createProjectSchema = z.object({
  name: projectNameSchema,
  description: z.string().trim().max(500).optional().nullable(),
  instructions: z.string().trim().max(4000).optional().nullable(),
  kind: projectKindSchema.optional().default("general"),
  template: z.string().trim().max(40).optional().nullable(),
});

export const updateProjectSchema = z
  .object({
    name: projectNameSchema.optional(),
    description: z.string().trim().max(500).optional().nullable(),
    instructions: z.string().trim().max(4000).optional().nullable(),
    kind: projectKindSchema.optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update.");

/* -------------------------------------------------------------------------- */
/* Conversations + chat                                                        */
/* -------------------------------------------------------------------------- */

export const conversationTitleSchema = z
  .string()
  .trim()
  .min(1, "Enter a title.")
  .max(120, "Titles must be 120 characters or fewer.");

export const createConversationSchema = z.object({
  projectId: z.string().trim().min(1).optional().nullable(),
  kind: z.enum(["chat", "code"]).optional().default("chat"),
  title: conversationTitleSchema.optional(),
});

export const updateConversationSchema = z.object({
  title: conversationTitleSchema.optional(),
  projectId: z.string().trim().min(1).optional().nullable(),
  model: z.string().trim().max(120).optional().nullable(),
});

export const messageContentSchema = z
  .string()
  .min(1, "Type a message first.")
  .max(32_000, "That message is too long (max 32,000 characters). Split it into two.");

export const chatRequestSchema = z.object({
  conversationId: z.string().trim().min(1).optional().nullable(),
  projectId: z.string().trim().min(1).optional().nullable(),
  kind: z.enum(["chat", "code"]).optional().default("chat"),
  content: messageContentSchema,
  model: z.string().trim().max(120).optional().nullable(),
  fileIds: z.array(z.string().trim().min(1)).max(10, "Attach up to 10 files.").optional().default([]),
  /** Retry the last assistant turn instead of sending a new user message. */
  retryMessageId: z.string().trim().min(1).optional().nullable(),
  /** Code Studio context, sent only from that surface. */
  code: z
    .object({
      openFilePath: z.string().trim().max(240).optional().nullable(),
      openFileContent: z.string().max(400_000).optional().nullable(),
      openFileLanguage: z.string().trim().max(40).optional().nullable(),
      selectedCode: z.string().max(60_000).optional().nullable(),
      /** Ask the model to also produce file operations. */
      includeProjectFiles: z.boolean().optional().default(false),
      filePaths: z.array(z.string().trim().max(240)).max(400).optional().default([]),
    })
    .optional(),
});

/* -------------------------------------------------------------------------- */
/* Code Studio                                                                 */
/* -------------------------------------------------------------------------- */

export const codePathSchema = z.string().trim().min(1).max(240);

export const createCodeFileSchema = z.object({
  path: codePathSchema,
  content: z.string().max(600_000, "That file is too large to store (max ~600 KB of text).").optional().default(""),
});

export const updateCodeFileSchema = z.object({
  content: z.string().max(600_000, "That file is too large to store (max ~600 KB of text)."),
});

export const renameCodeFileSchema = z.object({
  path: codePathSchema,
});

export const deleteCodeFileSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(50),
});

/** File operations the AI assistant is allowed to apply to a project. */
export const aiFileOpSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  path: codePathSchema,
  content: z.string().max(600_000).optional(),
});

export const applyAiEditsSchema = z.object({
  projectId: z.string().trim().min(1),
  conversationId: z.string().trim().min(1).optional().nullable(),
  operations: z.array(aiFileOpSchema).min(1).max(25, "Apply up to 25 file changes at a time."),
});

/* -------------------------------------------------------------------------- */
/* Files                                                                       */
/* -------------------------------------------------------------------------- */

export const moveFileSchema = z.object({
  projectId: z.string().trim().min(1).nullable(),
});

export const renameFileSchema = z.object({
  name: z.string().trim().min(1, "Enter a file name.").max(180),
});

/** Only allow internal redirect targets — blocks open-redirect via `?next=`. */
export function safeNextPath(value: string | null | undefined, fallback = "/app"): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  // "//host" and "/\host" are protocol-relative: they would leave this origin.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.length > 400) return fallback;
  if (!/^\/[A-Za-z0-9\-_/?.=&%#]*$/.test(value)) return fallback;
  // Reject traversal in either the raw or the percent-decoded form, so
  // "/app/../../somewhere" cannot be used to steer a post-sign-in redirect.
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (/(^|\/)\.\.($|\/)/.test(value) || /(^|\/)\.\.($|\/)/.test(decoded)) return fallback;
  return value;
}
