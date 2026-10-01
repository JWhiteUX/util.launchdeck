import { z } from 'zod';

/** YYYY-MM-DD calendar date (campaign scheduling is day-granular). */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** UTC ISO-8601 timestamp, e.g. 2026-09-30T22:11:00.000Z. */
export const isoTimestamp = z.iso.datetime();

export const damFolderPath = z
  .string()
  .trim()
  .regex(/^\/content\/dam(\/[^/\s]+)+$/, 'Folder must be under /content/dam/ with no trailing slash');

export const campaignStatus = z.enum(['planned', 'in_progress', 'launched', 'cancelled']);

export const campaignInput = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    owner: z.string().trim().min(1, 'Owner is required').max(120),
    startDate: isoDate,
    launchDate: isoDate,
    status: campaignStatus,
    folders: z
      .array(damFolderPath)
      .min(1, 'Add at least one DAM folder')
      .refine((f) => new Set(f).size === f.length, 'Folders must be unique'),
  })
  .refine((c) => c.startDate <= c.launchDate, {
    message: 'Launch date must be on or after start date',
    path: ['launchDate'],
  });

export const campaign = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  startDate: isoDate,
  launchDate: isoDate,
  status: campaignStatus,
  folders: z.array(damFolderPath),
  reviewedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const changeEventType = z.enum(['ADDED', 'MODIFIED', 'DELETED']);
export const userSource = z.enum(['audit', 'jcr']);

export const changeEvent = z.object({
  id: z.number().int(),
  folderPath: damFolderPath,
  assetPath: z.string(),
  assetName: z.string(),
  type: changeEventType,
  format: z.string().nullable(),
  user: z.string().nullable(),
  userSource,
  occurredAt: isoTimestamp,
  detectedAt: isoTimestamp,
});

export const folderHealth = z.object({
  folderPath: damFolderPath,
  lastPollAt: isoTimestamp.nullable(),
  lastSuccessAt: isoTimestamp.nullable(),
  lastError: z.string().nullable(),
  lastErrorAt: isoTimestamp.nullable(),
  auditReadable: z.boolean().nullable(),
  assetCount: z.number().int().nullable(),
});
