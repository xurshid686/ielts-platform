"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LayoutDashboard, Shield, LogOut, Crown, X, UserCircle, Gift } from "lucide-react";
import { isPremiumActive } from "@/lib/premium";
import type { Profile } from "@/types/database";

export function AccountMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {initial}
          </span>
        )}
        <span className="hidden text-sm font-medium sm:block">{profile.name}</span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
          {/* Account info */}
          <div className="flex items-center gap-3 border-b border-border p-4">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
                {initial}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile.name || "Student"}</p>
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
              <Badge className="bg-gradient-to-r from-amber-400 to-yellow-500 text-white">
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

          {/* Actions */}
          <div className="mt-3 border-t border-border p-1.5">
            <MenuItem href="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Dashboard
            </MenuItem>
            <MenuItem href={`/u/${profile.id}`} icon={<UserCircle className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Public profile
            </MenuItem>
            <MenuItem href="/refer" icon={<Gift className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Invite friends
            </MenuItem>
            {profile.role === "admin" && (
              <MenuItem href="/admin" icon={<Shield className="h-4 w-4" />} onClick={() => setOpen(false)}>
                Admin panel
              </MenuItem>
            )}
            <button
              onClick={() => {
                setOpen(false);
                setConfirm(true);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}

      {/* Hidden real sign-out form (POST) */}
      <form ref={formRef} action="/auth/signout" method="post" className="hidden" />

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
