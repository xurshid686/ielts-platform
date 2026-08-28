"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const MIN_LENGTH = 8;

/** 0-3. Length carries most of the weight; variety is a tie-breaker. */
function strengthOf(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= MIN_LENGTH) score++;
  if (password.length >= 12) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes >= 3) score++;
  return Math.min(score, 3);
}

const LABELS = ["", "Weak", "Good", "Strong"];
const BARS = ["bg-danger", "bg-danger", "bg-warning", "bg-success"];

/**
 * The password input, shared by every form that takes one: login, register and
 * the reset flow. Carries the three things the plain <input> was missing —
 * a real `autoComplete` so password managers engage, a show/hide toggle, and
 * (where a password is being CHOSEN rather than typed back) guidance on what
 * makes an acceptable one.
 */
export function PasswordField({
  label = "Password",
  value,
  onChange,
  autoComplete,
  newPassword = false,
  labelAccessory,
  name = "password",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  /** Show the minimum-length hint and strength meter (choosing, not recalling). */
  newPassword?: boolean;
  /** Rendered opposite the label — where "Forgot password?" goes. */
  labelAccessory?: React.ReactNode;
  name?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [show, setShow] = useState(false);
  const score = newPassword ? strengthOf(value) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {labelAccessory}
      </div>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          className="auth-input has-affix"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          autoComplete={autoComplete}
          minLength={newPassword ? MIN_LENGTH : undefined}
          aria-describedby={newPassword ? hintId : undefined}
          required
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {newPassword && (
        <div className="space-y-1.5 pt-0.5">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  value && score > i ? BARS[score] : "bg-border"
                }`}
              />
            ))}
          </div>
          <p id={hintId} className="text-xs text-muted">
            {value
              ? `${LABELS[score] || "Too short"} — at least ${MIN_LENGTH} characters. A short phrase works well.`
              : `At least ${MIN_LENGTH} characters. A short phrase works well.`}
          </p>
        </div>
      )}
    </div>
  );
}
