"use client";
import { useState } from "react";
import { useOrganization, CreateOrganization, useAuth } from "@clerk/nextjs";
import { useProject } from "@/hooks/useProject";
import { apiPost, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { project, loading: projectLoading } = useProject();
  const { getToken } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!orgLoaded || projectLoading) {
    return (
      <div className="card card-pad muted" style={{ textAlign: "center", margin: 40 }}>
        Loading…
      </div>
    );
  }

  if (project) return <>{children}</>;

  const createProject = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const token = await getToken();
    if (!token) { toast("Not signed in"); return; }
    setSubmitting(true);
    try {
      const project = await apiPost<{ id: string }>("/v1/projects", token, { name: trimmed });
      try {
        const key = await apiPost<{ key: string; keyPrefix: string }>(
          `/v1/projects/${project.id}/api-keys`,
          token,
          { name: "default" },
        );
        sessionStorage.setItem("ag_onboarding_key", key.key);
      } catch (err) {
        console.error("[onboarding] starter key creation failed", err);
      }
      window.location.reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && typeof err.body === "object" && err.body && "error" in err.body && (err.body as { error: string }).error === "no_active_org") {
        toast("Create an organization first");
      } else {
        toast(err instanceof Error ? err.message : "Failed to create project");
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="fade-up" style={{ maxWidth: 540, margin: "60px auto" }}>
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <h1 style={{ marginBottom: 6 }}>Welcome to AgentGraph</h1>
        <div className="muted">
          {organization
            ? "Create your first project to start ingesting traces."
            : "Create an organization to get started. Projects live under organizations."}
        </div>
      </div>

      {!organization ? (
        <CreateOrganization afterCreateOrganizationUrl="/dashboard" />
      ) : (
        <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="col" style={{ gap: 6 }}>
            <span className="mono muted-2" style={{ fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>Project name</span>
            <input
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent-app"
              disabled={submitting}
              onKeyDown={(e) => { if (e.key === "Enter") createProject(); }}
              autoFocus
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={createProject}
            disabled={submitting || !name.trim()}
          >
            {submitting ? "Creating…" : "Create project"}
          </button>
          <div className="muted-2" style={{ fontSize: 11.5 }}>
            You can create more projects later from Settings.
          </div>
        </div>
      )}
    </div>
  );
}
