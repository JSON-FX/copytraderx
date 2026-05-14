"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { RoleBadge } from "@/components/shared/role-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppUser } from "@/lib/types";

interface Props {
  users: AppUser[];
}

export function UserTable({ users }: Props) {
  if (users.length === 0) {
    return (
      <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        No users yet. Click "New user" to invite the first one.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-mono text-xs">{u.email}</TableCell>
              <TableCell>{u.full_name ?? "—"}</TableCell>
              <TableCell>
                <RoleBadge role={u.role} />
              </TableCell>
              <TableCell>
                {u.must_change_password ? (
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    Pending password change
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Active</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {format(parseISO(u.created_at), "yyyy-MM-dd")}
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/admin/users/${u.id}`}
                  className="text-xs text-foreground underline-offset-2 hover:underline"
                >
                  Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
