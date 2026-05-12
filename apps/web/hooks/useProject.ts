"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiGet } from "@/lib/api";

type Project = { id: string; name: string; slug: string; createdAt: string };

export function useProject() {
  const { getToken } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        if (!t || cancelled) return;
        const data = await apiGet<{ projects: Project[] }>("/v1/projects", t);
        if (!cancelled) {
          setToken(t);
          setProject(data.projects[0] ?? null);
        }
      } catch (err) {
        if (!cancelled) console.error("[useProject] failed to load project", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  return { project, token, loading };
}
