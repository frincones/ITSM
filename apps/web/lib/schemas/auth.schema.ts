import { z } from 'zod';

import { emailSchema, requiredString } from './common.schema';

// ---------------------------------------------------------------------------
// Password rules (shared)
// ---------------------------------------------------------------------------
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or fewer')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Sign Up
// ---------------------------------------------------------------------------
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: requiredString.max(100, 'Name must be 100 characters or fewer'),
});

export type SignupInput = z.infer<typeof signupSchema>;

// ---------------------------------------------------------------------------
// Reset Password
// ---------------------------------------------------------------------------
export const resetPasswordSchema = z.object({
  email: emailSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
