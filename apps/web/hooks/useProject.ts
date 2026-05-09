"use client";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

export interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export function useProject() {
  const { getToken } = useAuth();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const tok = await getToken();
        if (!tok) { setLoading(false); return; }
        if (!cancelled) setToken(tok);

        const data = await apiGet<{ projects: ProjectInfo[] }>("/v1/projects", tok);
        if (!cancelled) {
          setProject(data.projects[0] ?? null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [getToken]);

  return { project, token, loading };
}
