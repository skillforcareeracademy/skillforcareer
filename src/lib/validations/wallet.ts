import { z } from "zod";

/** A learner asking for their money. */
export const withdrawalSchema = z.object({
  amount: z.coerce.number().int().min(1, "Enter an amount").max(1_000_000),
  /** UPI id or bank details, as they typed them. */
  payoutNote: z.string().trim().max(300).optional().or(z.literal("")),
});

/** An admin paying or refusing one. */
export const settleWithdrawalSchema = z.object({
  status: z.enum(["PAID", "REJECTED"]),
  adminNote: z.string().trim().max(300).optional().or(z.literal("")),
});

/** An admin's hand on a balance. */
export const walletAdjustSchema = z.object({
  mode: z.enum(["CREDIT", "DEBIT", "SET"]),
  amount: z.coerce.number().min(0).max(1_000_000),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
});

export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
export type SettleWithdrawalInput = z.infer<typeof settleWithdrawalSchema>;
export type WalletAdjustInput = z.infer<typeof walletAdjustSchema>;
