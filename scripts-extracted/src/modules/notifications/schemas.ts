import { z } from "zod";

const uuidField = z.string().uuid();

export const notificationActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("navigate"),
    path: z.string().min(1).max(2048),
  }),
  z.object({
    kind: z.literal("entity"),
    entity: z.string().min(1).max(128),
    organizationId: uuidField.optional(),
    companyId: uuidField.optional(),
    certificateId: uuidField.optional(),
  }),
]);

export const notificationIdParamSchema = z.object({
  notificationId: z.string().uuid(),
});

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const createUserNotificationInputSchema = z.object({
  userId: uuidField,
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  action: notificationActionSchema.optional(),
  category: z.string().min(1).max(64).optional(),
});
