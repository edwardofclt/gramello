"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ProfileMenu({ displayName, email }: { displayName: string; email: string | null }) {
  return <DropdownMenu>
    <DropdownMenuTrigger className="profile-trigger" title={email ?? displayName}>
      <span className="account-name">{displayName}</span><ChevronDown aria-hidden="true"/>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} className="profile-menu">
      <DropdownMenuItem asChild>
        <a href="/auth/logout"><LogOut aria-hidden="true"/>Sign out</a>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
