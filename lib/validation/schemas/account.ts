import { z } from "zod";

export const updateAccountSchema = z.object({
  role: z.enum(["professor", "director", "dean"]).optional(),
  is_active: z.boolean().optional(),
});

export const accountProgramSchema = z.object({
  program_id: z.string().uuid(),
});
