"use client";

import { localUzDigits, spaceUzLocal } from "@/lib/sms/format";

/**
 * The optional phone for SMS mock results (0071). A fixed "+998" the student
 * cannot edit, then the 9 local digits, spaced as they type. A pasted
 * "+998 90 …" loses its prefix so it isn't doubled.
 *
 * `value` is the bare local digits ("901234567"); "" means no phone, which is
 * always allowed: international students have no +998 number.
 */
export function UzPhoneInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (local: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div
      className={`flex w-full max-w-xs items-center overflow-hidden rounded-lg border bg-background text-sm focus-within:border-primary ${
        invalid ? "border-danger" : "border-border"
      }`}
    >
      <span className="select-none border-r border-border bg-surface-2 px-3 py-2 font-medium tabular-nums text-muted">+998</span>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="90 123 45 67"
        value={spaceUzLocal(value)}
        onChange={(e) => onChange(localUzDigits(e.target.value))}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 tabular-nums outline-none disabled:opacity-60"
      />
    </div>
  );
}

/** "" or exactly 9 digits. Anything in between is a half-typed number. */
export function uzLocalIsValid(local: string): boolean {
  return local === "" || /^[0-9]{9}$/.test(local);
}
