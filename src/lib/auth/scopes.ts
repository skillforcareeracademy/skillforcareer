import { PERMISSIONS as P } from "@/config/roles";

/**
 * How much of the leads/payments world a person may touch, worked out from the
 * permissions they hold. One definition, shared by the page guards and the API
 * guards, so the sidebar, the route and the handler never disagree.
 *
 * "manage" is all-access (every lead / every payment). The `:own` perms are
 * scoped to the person: a lead assigned to them, and a payment sitting on such
 * a lead. A revoke still wins — these only read what `permissions` already is.
 */
export interface LeadScope {
  /** leads:manage — sees and edits everyone's. */
  all: boolean;
  /** May change leads (all, or edit own). */
  canEdit: boolean;
  /** May see leads at all (all, edit own, or view own). */
  canView: boolean;
}

export function leadScopeOf(permissions: readonly string[]): LeadScope {
  const all = permissions.includes(P.MANAGE_LEADS);
  const canEdit = all || permissions.includes(P.EDIT_OWN_LEADS);
  const canView = canEdit || permissions.includes(P.VIEW_OWN_LEADS);
  return { all, canEdit, canView };
}

export interface PaymentScope {
  /** payments:manage — the whole academy's payments, refunds and config. */
  all: boolean;
  /** May record/settle a payment (all, or edit own). */
  canEdit: boolean;
  /** May see a payment (all, edit own, or view own). */
  canView: boolean;
}

export function paymentScopeOf(permissions: readonly string[]): PaymentScope {
  const all = permissions.includes(P.MANAGE_PAYMENTS);
  const canEdit = all || permissions.includes(P.EDIT_OWN_PAYMENTS);
  const canView = canEdit || permissions.includes(P.VIEW_OWN_PAYMENTS);
  return { all, canEdit, canView };
}
