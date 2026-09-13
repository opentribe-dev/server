import type { Role } from '../users/repository.js';

export type Action =
  | 'agent:create'
  | 'agent:manage'
  | 'conversation:create_group'
  | 'group:manage_members';

const ROLE_RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

const ACTION_MIN_ROLE: Record<Action, Role> = {
  'agent:create': 'member',
  'agent:manage': 'member',
  'conversation:create_group': 'member',
  'group:manage_members': 'admin',
};

export function can(role: Role, action: Action): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[ACTION_MIN_ROLE[action]];
}
