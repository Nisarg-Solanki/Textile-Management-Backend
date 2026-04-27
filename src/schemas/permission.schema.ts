import { z } from 'zod';

const permissionEntrySchema = z.object({
  module: z.enum([
    'machines',
    'beams',
    'production',
    'takas',
    'mill_outverts',
    'mill_inverts',
    'machine_info',
    'mill_summary',
    'firms',
    'mills',
  ]),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

export const setPermissionsSchema = z.array(permissionEntrySchema).min(1);

export type PermissionEntry = z.infer<typeof permissionEntrySchema>;
export type SetPermissionsInput = z.infer<typeof setPermissionsSchema>;
