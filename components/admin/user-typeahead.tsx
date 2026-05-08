"use client";
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

export type UserOption = { id: string; email: string; full_name: string | null };

export function UserTypeahead({
  value,
  onChange,
  placeholder = "Search by email or name…",
}: {
  value: UserOption | null;
  onChange: (u: UserOption | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value?.email ?? "");
  const [results, setResults] = useState<UserOption[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || (value && query === value.email)) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const body = await res.json();
      setResults(body.users ?? []);
      setOpen(true);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value]);

  function pick(u: UserOption) {
    onChange(u);
    setQuery(u.email);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange(null);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover shadow">
          {results.map((u) => (
            <li
              key={u.id}
              className="cursor-pointer px-3 py-2 hover:bg-accent"
              onMouseDown={() => pick(u)}
            >
              <div className="text-sm">{u.full_name ?? u.email}</div>
              {u.full_name && <div className="text-xs text-muted-foreground">{u.email}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
