import { z } from 'zod';

export const RequestApprovalSchema = z.object({
  workspaceId: z.string().uuid(),
  resourceType: z.enum(['PUBLICATION', 'MISSION', 'CAMPAIGN']),
  resourceId: z.string().uuid(),
  resourceVersion: z.number().int().default(1),
  requestedByUserId: z.string().uuid().optional(),
  requiredAt: z.coerce.date().optional(),
});
export type RequestApprovalDTO = z.infer<typeof RequestApprovalSchema>;

export const DecideApprovalSchema = z.object({
  approvalId: z.string().uuid(),
  status: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  decidedByUserId: z.string().uuid().optional(),
  decisionNote: z.string().optional(),
});
export type DecideApprovalDTO = z.infer<typeof DecideApprovalSchema>;
