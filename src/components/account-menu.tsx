"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ClipboardCheck,
  LayoutDashboard,
  Shield,
  LogOut,
  Crown,
  X,
  UserCircle,
  Flame,
  Zap,
  Trophy,
  GraduationCap,
  Compass,
  BellRing,
  BellOff,
  Trash2,
  Smartphone,
  UserPen,
} from "lucide-react";
import { isPremiumActive } from "@/lib/premium";
import { PremiumRing } from "@/components/premium-ring";
import { EditProfileDialog } from "@/components/profile/edit-profile-dialog";
import { LEVELS, isContentLevel } from "@/lib/levels";
import { setEmailReminders } from "@/app/actions/reminders";
import { deleteMyAccount } from "@/app/actions/account";
import { setPhone } from "@/app/actions/profile";
import { formatUzPhone, localUzDigits } from "@/lib/sms/format";
import { UzPhoneInput, uzLocalIsValid } from "@/components/uz-phone-input";
import type { Profile } from "@/types/database";

export function AccountMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  // Delete account: a second dialog that needs the word DELETE typed.
  const [deleting, setDeleting] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();
  const canDelete = profile.role !== "admin" && !profile.is_owner;
  function confirmDelete() {
    setDeleteError(null);
    startDelete(async () => {
      // On success the action redirects, so this only returns on failure.
      const res = await deleteMyAccount(deleteText);
      if (res && !res.ok) setDeleteError(res.error);
    });
  }
  // Optional phone for SMS mock results (0071). profiles is read with
  // select("*"), but phone is not in the generated types yet.
  const [savedPhone, setSavedPhone] = useState<string | null>(
    (profile as Profile & { phone?: string | null }).phone ?? null,
  );
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneLocal, setPhoneLocal] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phonePending, startPhone] = useTransition();
  function savePhone(local: string) {
    if (!uzLocalIsValid(local)) {
      setPhoneError("Enter all 9 digits after +998, or clear the box.");
      return;
    }
    setPhoneError(null);
    startPhone(async () => {
      const res = await setPhone(local ? `998${local}` : "");
      if (!res.ok) {
        setPhoneError(res.error);
        return;
      }
      setSavedPhone(res.phone);
      setPhoneOpen(false);
    });
  }
  const ref = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Reminder emails (0061). Local state, because the profile prop is only
  // refreshed on the next navigation; a failed save puts the switch back.
  const [reminders, setReminders] = useState(profile.email_reminders);
  const [savingReminders, startReminders] = useTransition();
  function toggleReminders() {
    const next = !reminders;
    setReminders(next);
    startReminders(async () => {
      const res = await setEmailReminders(next);
      if (!res.ok) setReminders(!next);
    });
  }

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const initial = (profile.name || profile.email || "U").charAt(0).toUpperCase();
  const premium = isPremiumActive(profile);
  // The beginner-track link. It had its own sidebar group; a top bar has no
  // room for a link only a handful of students can see, so it lives here.
  const level = isContentLevel(profile.level) ? LEVELS[profile.level] : null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <PremiumRing on={premium} crown="sm">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {initial}
            </span>
          )}
        </PremiumRing>
        {/* Hidden while the desktop nav bar is on screen but narrow (lg–2xl): a long
            name pushed the bar into the header icons at 1280px. It is still in
            the dropdown. Below lg there is no bar, so it has the room. */}
        <span className={`hidden max-w-[10rem] truncate text-sm font-medium sm:block lg:hidden 2xl:block ${premium ? "premium-name" : ""}`}>{profile.name}</span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
          {/* Account info */}
          <div className="flex items-center gap-3 border-b border-border p-4">
            <PremiumRing on={premium} crown="md">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
                  {initial}
                </span>
              )}
            </PremiumRing>
            <div className="min-w-0">
              <p className={`truncate text-sm font-semibold ${premium ? "premium-name" : ""}`}>{profile.name || "Student"}</p>
              <p className="truncate text-xs text-muted">{profile.email}</p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {profile.is_owner ? (
              <Badge className="bg-accent/15 text-accent">Owner</Badge>
            ) : profile.role === "admin" ? (
              <Badge className="bg-primary/10 text-primary">Admin</Badge>
            ) : (
              <Badge className="bg-surface-2 text-muted">Student</Badge>
            )}
            {premium ? (
              <Badge className="bg-premium-gradient text-white">
                <Crown className="h-3 w-3" /> Premium
              </Badge>
            ) : (
              <Badge className="bg-surface-2 text-muted">Free plan</Badge>
            )}
          </div>
          {premium && profile.premium_until && (
            <p className="px-4 pt-1.5 text-xs text-muted">
              Premium until {new Date(profile.premium_until).toLocaleDateString()}
            </p>
          )}

          {/* Progress. Was the streak card at the foot of the old sidebar; the
              bar keeps only the flame count, so the rest is preserved here. */}
          <div className="mt-3 flex items-center gap-3 border-t border-border px-4 py-2.5 text-xs text-muted tabular-nums">
            <span className="inline-flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-warning" /> {profile.streak}-day streak
            </span>
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-primary" /> {profile.xp} XP
            </span>
            <span className="inline-flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5 text-warning" /> best {profile.longest_streak}
            </span>
          </div>

          {/* Actions */}
          <div className="border-t border-border p-1.5">
            <MenuItem href="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Dashboard
            </MenuItem>
            <MenuItem href="/writing/reports" icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Writing reports
            </MenuItem>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setEditing(true);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2"
            >
              <UserPen className="h-4 w-4" /> Edit profile
            </button>
            <MenuItem href={`/u/${profile.id}`} icon={<UserCircle className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Public profile
            </MenuItem>
            {level && (
              <MenuItem
                href={level.href}
                icon={
                  level.slug === "pre_ielts" ? (
                    <GraduationCap className="h-4 w-4" />
                  ) : (
                    <Compass className="h-4 w-4" />
                  )
                }
                onClick={() => setOpen(false)}
              >
                {level.label}
              </MenuItem>
            )}
            {profile.role !== "admin" && (
              <MenuItem href="/premium" icon={<Crown className="h-4 w-4" />} onClick={() => setOpen(false)}>
                {premium ? "Your Premium" : "Get Premium"}
              </MenuItem>
            )}
            {profile.role === "admin" && (
              <MenuItem href="/admin" icon={<Shield className="h-4 w-4" />} onClick={() => setOpen(false)}>
                Admin panel
              </MenuItem>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={reminders}
              disabled={savingReminders}
              onClick={toggleReminders}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2 disabled:opacity-60"
            >
              {reminders ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              <span className="flex-1">Reminder emails</span>
              <span className={`text-xs font-medium ${reminders ? "text-success" : "text-muted"}`}>
                {reminders ? "On" : "Off"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPhoneLocal(savedPhone ? localUzDigits(savedPhone) : "");
                setPhoneError(null);
                setPhoneOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2"
            >
              <Smartphone className="h-4 w-4" />
              <span className="flex-1">Phone for SMS results</span>
              <span className="text-xs font-medium text-muted">{savedPhone ? "Set" : "Off"}</span>
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setConfirm(true);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
            {canDelete && (
              <button
                onClick={() => {
                  setOpen(false);
                  setDeleteText("");
                  setDeleteError(null);
                  setDeleting(true);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs text-muted hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" /> Delete account
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hidden real sign-out form (POST) */}
      <form ref={formRef} action="/auth/signout" method="post" className="hidden" />

      {/* Edit profile: name + photo (owner, 2026-11-24) */}
      {editing && (
        <EditProfileDialog
          name={profile.name}
          avatarUrl={profile.avatar_url}
          premium={premium}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Phone for SMS mock results (0071) */}
      {phoneOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-elevated">
            <button
              onClick={() => !phonePending && setPhoneOpen(false)}
              className="absolute right-3 top-3 text-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-center font-semibold">Phone for SMS results</h3>
            <p className="mt-2 text-sm text-muted">
              Optional. When your mock result is released we text your bands and a link to your answers. Uzbek (+998)
              numbers only.
            </p>
            {savedPhone && <p className="mt-2 text-sm">Now: <span className="font-medium tabular-nums">{formatUzPhone(savedPhone)}</span></p>}
            <label htmlFor="menu-sms-phone" className="mt-4 block text-sm font-medium">
              Phone number
            </label>
            <div className="mt-1.5">
              <UzPhoneInput
                id="menu-sms-phone"
                value={phoneLocal}
                onChange={(v) => {
                  setPhoneLocal(v);
                  if (phoneError && uzLocalIsValid(v)) setPhoneError(null);
                }}
                disabled={phonePending}
                invalid={!!phoneError}
              />
            </div>
            {phoneError && <p className="mt-2 text-sm text-danger">{phoneError}</p>}
            <div className="mt-5 flex gap-2">
              {savedPhone && (
                <button
                  onClick={() => savePhone("")}
                  disabled={phonePending}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => savePhone(phoneLocal)}
                disabled={phonePending}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {phonePending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete account */}
      {deleting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-elevated">
            <button
              onClick={() => !deletePending && setDeleting(false)}
              className="absolute right-3 top-3 text-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-center font-semibold">Delete your account?</h3>
            <p className="mt-2 text-sm text-muted">
              This permanently deletes your account, test results, writing and speaking work, streak, XP and
              rating{premium ? ", and any remaining Premium time" : ""}. It cannot be undone.
            </p>
            <label className="mt-4 block text-sm">
              Type <span className="font-semibold">DELETE</span> to confirm
              <input
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                autoFocus
                autoComplete="off"
                disabled={deletePending}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-danger"
              />
            </label>
            {deleteError && <p className="mt-2 text-sm text-danger">{deleteError}</p>}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDeleting(false)}
                disabled={deletePending}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deletePending || deleteText.trim().toUpperCase() !== "DELETE"}
                className="flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {deletePending ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm sign out */}
      {confirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-xs rounded-2xl border border-border bg-surface p-6 text-center shadow-elevated">
            <button
              onClick={() => setConfirm(false)}
              className="absolute right-3 top-3 text-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
              <LogOut className="h-6 w-6" />
            </div>
            <h3 className="mt-3 font-semibold">Sign out?</h3>
            <p className="mt-1 text-sm text-muted">You&apos;ll need to sign in again to continue practising.</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={() => formRef.current?.requestSubmit()}
                className="flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function MenuItem({
  href,
  icon,
  children,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-2"
    >
      {icon}
      {children}
    </Link>
  );
}
