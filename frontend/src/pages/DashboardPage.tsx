import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ComposeDialog } from "../components/emails/ComposeDialog";
import { EmailTable } from "../components/emails/EmailTable";
import { Header } from "../components/layout/Header";
import { Sidebar } from "../components/layout/Sidebar";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState } from "../components/ui/EmptyState";
import { TableSkeleton } from "../components/ui/Spinner";
import { useToast } from "../components/ui/ToastProvider";
import { api, ApiError, slackConnectUrl } from "../lib/api";
import type { EmailListFilter } from "../lib/types";

type Tab = "scheduled" | "sent";

export function DashboardPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("scheduled");
  const [composeOpen, setComposeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [tab, debounced]);

  useEffect(() => {
    if (params.get("slack") === "connected") {
      toast("success", "Slack connected.");
      queryClient.invalidateQueries({ queryKey: ["slack"] });
      params.delete("slack");
      setParams(params, { replace: true });
    }
  }, [params, queryClient, setParams, toast]);

  const slack = useQuery({
    queryKey: ["slack"],
    queryFn: api.slackStatus,
  });

  const status: EmailListFilter = tab;
  const searching = debounced.length > 0;

  const emails = useQuery({
    queryKey: ["emails", tab, page, debounced],
    queryFn: () =>
      searching
        ? api.searchEmails({ q: debounced, status, page, limit: 50 })
        : api.listEmails({ status, page, limit: 50 }),
    refetchInterval: tab === "scheduled" && !searching ? 5000 : false,
  });

  const scheduledMeta = useQuery({
    queryKey: ["emails", "scheduled", "count"],
    queryFn: () => api.listEmails({ status: "scheduled", page: 1, limit: 1 }),
    refetchInterval: 5000,
  });
  const sentMeta = useQuery({
    queryKey: ["emails", "sent", "count"],
    queryFn: () => api.listEmails({ status: "sent", page: 1, limit: 1 }),
    refetchInterval: 5000,
  });

  const connectSlack = () => {
    if (slack.data?.configured === false) {
      toast("error", "Slack OAuth is not configured on the server.");
      return;
    }
    window.location.assign(slackConnectUrl());
  };

  const disconnect = useMutation({
    mutationFn: api.disconnectSlack,
    onSuccess: () => {
      toast("info", "Slack disconnected.");
      queryClient.invalidateQueries({ queryKey: ["slack"] });
    },
    onError: (err) => toast("error", err instanceof ApiError ? err.message : "Could not disconnect Slack."),
  });

  const listError =
    emails.error instanceof ApiError
      ? emails.error.status === 401
        ? "Your session expired. Sign in again."
        : emails.error.message
      : emails.isError
        ? "Could not load emails."
        : null;

  const total = emails.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const items = emails.data?.items ?? [];

  const empty = useMemo(() => {
    if (tab === "scheduled") {
      return {
        title: "No scheduled emails",
        body: "Compose a campaign and it will show up here.",
      };
    }
    return {
      title: "No sent emails",
      body: "Delivered messages appear here with status and Ethereal preview.",
    };
  }, [tab]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar
        user={user}
        tab={tab}
        scheduledCount={scheduledMeta.data?.total ?? 0}
        sentCount={sentMeta.data?.total ?? 0}
        onTab={setTab}
        onCompose={() => setComposeOpen(true)}
        onLogout={() => void logout()}
        slackConnected={Boolean(slack.data?.connected)}
        onSlack={connectSlack}
        onDisconnectSlack={() => disconnect.mutate()}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          query={query}
          onQuery={setQuery}
          onRefresh={() => {
            void emails.refetch();
            void scheduledMeta.refetch();
            void sentMeta.refetch();
          }}
        />
        {searching && emails.data?.source ? (
          <p className="px-8 pt-2 text-xs text-muted">Search source: {emails.data.source}</p>
        ) : null}
        {emails.isPending ? (
          <div className="px-8">
            <TableSkeleton />
          </div>
        ) : null}
        {listError ? <ErrorState message={listError} onRetry={() => void emails.refetch()} /> : null}
        {!emails.isPending && !listError && items.length === 0 ? (
          <EmptyState
            title={empty.title}
            body={empty.body}
            action={
              tab === "scheduled" ? (
                <Button variant="outline" pill onClick={() => setComposeOpen(true)}>
                  Compose
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {!emails.isPending && !listError && items.length > 0 ? (
          <>
            <EmailTable items={items} mode={tab} />
            {pages > 1 ? (
              <div className="mt-4 flex items-center justify-end gap-2 px-8 pb-8 text-sm">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-muted">
                  Page {page} of {pages}
                </span>
                <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={(message) => {
          toast("success", message);
          setTab("scheduled");
          void queryClient.invalidateQueries({ queryKey: ["emails"] });
        }}
      />
    </div>
  );
}
