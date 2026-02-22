"use client";

import { useEffect, useMemo, useState } from "react";
import { buttonClassName } from "@/components/ui/Button";
import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";

type InventoryItem = {
  kind: string;
  code: string;
  rarity: string;
  quantity: number;
  metadata_json: any;
  updated_at: string;
};

type InventoryResponse = {
  ok: true;
  shards: number;
  items: InventoryItem[];
};

async function sha256HexBrowser(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const out = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return out;
}

function randomClientSeed(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type CommitResponse = {
  ok: true;
  action_id: string;
  module: string;
  profile: "low" | "medium" | "high";
  server_commit_hash: string;
};

type CalendarCommitResponse = {
  ok: true;
  action_id: string;
  module: string;
  profile: "low" | "medium" | "high";
  claim_date: string;
  server_commit_hash: string;
};

type CalendarStatusResponse = {
  ok: true;
  module: string;
  today: string;
  claimed_today: boolean;
  streak: { count: number; best: number; last_claim_date: string | null };
  pity: { rare: number };
  claimed_7d: string[];
};

type DraftCommitResponse = {
  ok: true;
  action_id: string;
  module: string;
  profile: "low" | "medium" | "high";
  server_commit_hash: string;
};

type DraftRevealResponse = {
  ok: true;
  already_revealed: boolean;
  options: Array<{ kind: string; code: string; rarity: string; label: string; metadata?: any }>;
  picked: any | null;
};

type WheelCommitResponse = {
  ok: true;
  action_id: string;
  module: string;
  profile: "low" | "medium" | "high";
  server_commit_hash: string;
};

type WheelRevealResponse = {
  ok: true;
  action_id: string;
  already_resolved: boolean;
  result: any;
};

type OracleCommitResponse = {
  ok: true;
  action_id: string;
  module: string;
  profile: "low" | "medium" | "high";
  server_commit_hash: string;
};

type OracleRevealResponse = {
  ok: true;
  action_id: string;
  already_resolved: boolean;
  result: any;
};

type StreakCommitResponse = {
  ok: true;
  action_id: string;
  module: string;
  profile: "low" | "medium" | "high";
  week_start: string;
  server_commit_hash: string;
};

type StreakRevealResponse = {
  ok: true;
  action_id: string;
  already_resolved: boolean;
  result: any;
};

type MissionsStatusResponse = {
  ok: true;
  today: string;
  missions: Array<{
    code: string;
    title: string;
    description: string;
    completed: boolean;
    claimable: boolean;
    claimed: boolean;
  }>;
};

type ProgressionResponse = {
  ok: true;
  progression: { xp: number; tier: number; prestige: number; next_tier_xp: number | null };
};

type SafetyResponse = {
  ok: true;
  limits: {
    self_excluded_until: string | null;
    daily_action_limit: number | null;
    daily_shard_spend_limit: number | null;
  };
};

type SeasonResponse = {
  ok: true;
  season: {
    key: string;
    starts_at: string;
    next_shift_at: string;
    rules: string[];
  };
};

type BadgePoolsStatusResponse = {
  ok: true;
  season: { key: string; starts_at: string; next_shift_at: string };
  pool: { key: string; label: string };
  badges: Array<{ kind: string; code: string; rarity: string; label: string }>;
  collected_codes: string[];
  sets: Array<{
    id: string;
    label: string;
    required: number;
    have: number;
    unlocked: boolean;
    unlock_key: { kind: string; code: string; rarity: string; label: string };
  }>;
};

type CommunityStatusResponse = {
  ok: true;
  module: string;
  week_start: string;
  threshold: number;
  progress: number;
  unlocked: boolean;
  claimed: boolean;
};

type SharedPoolStatusResponse = {
  ok: true;
  module: string;
  week_start: string;
  participated: boolean;
  action_id: string | null;
  action_status: string | null;
  outcome: any | null;
};

type RevealResponse = {
  ok: true;
  action_id: string;
  already_resolved: boolean;
  result: {
    module: string;
    profile: string;
    outcome: { kind: string; code: string; rarity: string; label: string };
    audit: {
      client_commit_hash: string;
      server_commit_hash: string;
      server_seed_b64: string;
      random_hash: string;
      roll: number;
      total: number;
    };
  };
};

type Asset = {
  id: string;
  chain: string;
  symbol: string;
  name: string | null;
  decimals: number;
};

type ArcadeActionRow = {
  id: string;
  module: string;
  profile: string;
  status: string;
  requested_at: string;
  resolves_at: string | null;
  resolved_at: string | null;
  input_json: any;
  outcome_json: any;
};

export function ArcadeClient() {
  const [profile, setProfile] = useState<"low" | "medium" | "high">("low");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RevealResponse["result"] | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [vaultAssetId, setVaultAssetId] = useState<string>("");
  const [vaultAmount, setVaultAmount] = useState<string>("");
  const [vaultDurationHours, setVaultDurationHours] = useState<number>(24);
  const [vaultProfile, setVaultProfile] = useState<"low" | "medium" | "high">("low");
  const [vaultActions, setVaultActions] = useState<ArcadeActionRow[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultRevealLoadingId, setVaultRevealLoadingId] = useState<string | null>(null);
  const [vaultRevealError, setVaultRevealError] = useState<string | null>(null);
  const [vaultLastReveal, setVaultLastReveal] = useState<any | null>(null);
  const [vaultHintLoadingId, setVaultHintLoadingId] = useState<string | null>(null);
  const [vaultHintError, setVaultHintError] = useState<string | null>(null);
  const [vaultLastHint, setVaultLastHint] = useState<any | null>(null);

  const [calProfile, setCalProfile] = useState<"low" | "medium" | "high">("low");
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [calStatus, setCalStatus] = useState<CalendarStatusResponse | null>(null);
  const [calLast, setCalLast] = useState<any | null>(null);

  const [draftProfile, setDraftProfile] = useState<"low" | "medium" | "high">("low");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftActionId, setDraftActionId] = useState<string | null>(null);
  const [draftOptions, setDraftOptions] = useState<DraftRevealResponse["options"]>([]);
  const [draftPicked, setDraftPicked] = useState<any | null>(null);
  const [draftPicking, setDraftPicking] = useState<string | null>(null);

  const [wheelProfile, setWheelProfile] = useState<"low" | "medium" | "high">("low");
  const [wheelLoading, setWheelLoading] = useState(false);
  const [wheelError, setWheelError] = useState<string | null>(null);
  const [wheelLast, setWheelLast] = useState<any | null>(null);

  const [createProfile, setCreateProfile] = useState<"low" | "medium" | "high">("low");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createActions, setCreateActions] = useState<ArcadeActionRow[]>([]);
  const [createRevealLoadingId, setCreateRevealLoadingId] = useState<string | null>(null);
  const [createRevealError, setCreateRevealError] = useState<string | null>(null);
  const [createLastReveal, setCreateLastReveal] = useState<any | null>(null);

  const [mutationProfile, setMutationProfile] = useState<"low" | "medium" | "high">("low");
  const [mutationKey, setMutationKey] = useState<string>("");
  const [mutationLoading, setMutationLoading] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationLast, setMutationLast] = useState<any | null>(null);

  const [fusionProfile, setFusionProfile] = useState<"low" | "medium" | "high">("low");
  const [fusionKeyA, setFusionKeyA] = useState<string>("");
  const [fusionKeyB, setFusionKeyB] = useState<string>("");
  const [fusionLoading, setFusionLoading] = useState(false);
  const [fusionError, setFusionError] = useState<string | null>(null);
  const [fusionLast, setFusionLast] = useState<any | null>(null);

  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communityStatus, setCommunityStatus] = useState<CommunityStatusResponse | null>(null);
  const [communityClaiming, setCommunityClaiming] = useState(false);

  const [sharedPoolProfile, setSharedPoolProfile] = useState<"low" | "medium" | "high">("low");
  const [sharedPoolLoading, setSharedPoolLoading] = useState(false);
  const [sharedPoolError, setSharedPoolError] = useState<string | null>(null);
  const [sharedPoolStatus, setSharedPoolStatus] = useState<SharedPoolStatusResponse | null>(null);
  const [sharedPoolLast, setSharedPoolLast] = useState<any | null>(null);

  const [insightProfile, setInsightProfile] = useState<"low" | "medium" | "high">("low");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [insightLast, setInsightLast] = useState<any | null>(null);

  const [streakProfile, setStreakProfile] = useState<"low" | "medium" | "high">("low");
  const [streakLoading, setStreakLoading] = useState(false);
  const [streakError, setStreakError] = useState<string | null>(null);
  const [streakLast, setStreakLast] = useState<any | null>(null);

  const [oracleProfile, setOracleProfile] = useState<"low" | "medium" | "high">("low");
  const [oraclePrompt, setOraclePrompt] = useState<string>("");
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState<string | null>(null);
  const [oracleLast, setOracleLast] = useState<any | null>(null);

  const [missionsProfile, setMissionsProfile] = useState<"low" | "medium" | "high">("low");
  const [missionsLoading, setMissionsLoading] = useState(false);
  const [missionsError, setMissionsError] = useState<string | null>(null);
  const [missionsStatus, setMissionsStatus] = useState<MissionsStatusResponse | null>(null);
  const [missionClaiming, setMissionClaiming] = useState<string | null>(null);
  const [missionLast, setMissionLast] = useState<any | null>(null);

  const [progLoading, setProgLoading] = useState(false);
  const [progError, setProgError] = useState<string | null>(null);
  const [progression, setProgression] = useState<ProgressionResponse["progression"] | null>(null);
  const [prestigeLoading, setPrestigeLoading] = useState(false);

  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [safety, setSafety] = useState<SafetyResponse["limits"] | null>(null);
  const [selfExcludeHours, setSelfExcludeHours] = useState<number>(0);
  const [dailyActionLimit, setDailyActionLimit] = useState<string>("");
  const [dailyShardSpendLimit, setDailyShardSpendLimit] = useState<string>("");

  const [invLoading, setInvLoading] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [invItems, setInvItems] = useState<InventoryItem[]>([]);
  const [invShards, setInvShards] = useState<number>(0);

  const [season, setSeason] = useState<SeasonResponse["season"] | null>(null);

  const [badgePoolsProfile, setBadgePoolsProfile] = useState<"low" | "medium" | "high">("low");
  const [badgePoolsLoading, setBadgePoolsLoading] = useState(false);
  const [badgePoolsError, setBadgePoolsError] = useState<string | null>(null);
  const [badgePoolsStatus, setBadgePoolsStatus] = useState<BadgePoolsStatusResponse | null>(null);
  const [badgePoolsLast, setBadgePoolsLast] = useState<any | null>(null);

  const [salvageKey, setSalvageKey] = useState<string>("");
  const [salvageQty, setSalvageQty] = useState<number>(1);
  const [salvageLoading, setSalvageLoading] = useState(false);
  const [craftLoading, setCraftLoading] = useState<string | null>(null);

  const volatilityHelp = useMemo(() => {
    return profile === "high"
      ? "High variance: rarer outcomes are more likely, but still not guaranteed."
      : profile === "medium"
        ? "Medium variance: balanced distribution."
        : "Low variance: mostly common outcomes with a long tail.";
  }, [profile]);

  const streakProtectorQty = useMemo(() => {
    const row = invItems.find((i) => i.kind === "perk" && String(i.code ?? "") === "streak_protector");
    return Number(row?.quantity ?? 0) || 0;
  }, [invItems]);

  const gateKeyQty = useMemo(() => {
    const row = invItems.find((i) => i.kind === "key" && String(i.code ?? "") === "gate_key");
    return Number(row?.quantity ?? 0) || 0;
  }, [invItems]);

  const cosmeticItems = useMemo(() => {
    return invItems.filter((i) => i.kind === "cosmetic");
  }, [invItems]);

  useEffect(() => {
    if (!mutationKey && cosmeticItems.length > 0) {
      const first = cosmeticItems[0]!;
      setMutationKey(`${first.kind}::${first.code}::${first.rarity}`);
    }
    if (!fusionKeyA && cosmeticItems.length > 0) {
      const first = cosmeticItems[0]!;
      setFusionKeyA(`${first.kind}::${first.code}::${first.rarity}`);
    }
    if (!fusionKeyB && cosmeticItems.length > 1) {
      const second = cosmeticItems[1]!;
      setFusionKeyB(`${second.kind}::${second.code}::${second.rarity}`);
    }
  }, [cosmeticItems, mutationKey, fusionKeyA, fusionKeyB]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJsonOrThrow<{ assets?: Asset[] }>("/api/exchange/assets", { cache: "no-store" });
        if (cancelled) return;
        const list = (data.assets ?? []).slice();
        setAssets(list);
        if (!vaultAssetId && list.length > 0) {
          const usdt = list.find((a) => a.symbol === "USDT") ?? list[0];
          if (usdt) setVaultAssetId(usdt.id);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshVaultActions() {
    try {
      const res = await fetchJsonOrThrow<{ ok: true; actions: ArcadeActionRow[] }>("/api/arcade/actions?module=time_vault&limit=20", {
        cache: "no-store",
      });
      setVaultActions(res.actions ?? []);
    } catch {
      // ignore
    }
  }

  async function refreshCreationActions() {
    try {
      const res = await fetchJsonOrThrow<{ ok: true; actions: ArcadeActionRow[] }>(
        "/api/arcade/actions?module=blind_creation&limit=20",
        {
          cache: "no-store",
        },
      );
      setCreateActions(res.actions ?? []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshVaultActions();
  }, []);

  useEffect(() => {
    void refreshCreationActions();
  }, []);

  async function refreshCalendarStatus() {
    try {
      const s = await fetchJsonOrThrow<CalendarStatusResponse>("/api/arcade/calendar/status", { cache: "no-store" });
      setCalStatus(s);
    } catch {
      // ignore
    }
  }

  async function refreshMissions() {
    setMissionsError(null);
    setMissionsLoading(true);
    try {
      const s = await fetchJsonOrThrow<MissionsStatusResponse>("/api/arcade/missions/status", { cache: "no-store" });
      setMissionsStatus(s);
    } catch (e) {
      if (e instanceof ApiError) setMissionsError(e.code);
      else setMissionsError("Network error");
    } finally {
      setMissionsLoading(false);
    }
  }

  async function refreshProgression() {
    setProgError(null);
    setProgLoading(true);
    try {
      const res = await fetchJsonOrThrow<ProgressionResponse>("/api/arcade/progression", { cache: "no-store" });
      setProgression(res.progression);
    } catch (e) {
      if (e instanceof ApiError) setProgError(e.code);
      else setProgError("Network error");
    } finally {
      setProgLoading(false);
    }
  }

  async function refreshSafety() {
    setSafetyError(null);
    setSafetyLoading(true);
    try {
      const res = await fetchJsonOrThrow<SafetyResponse>("/api/arcade/safety", { cache: "no-store" });
      setSafety(res.limits);
      setDailyActionLimit(
        typeof res.limits.daily_action_limit === "number" ? String(res.limits.daily_action_limit) : "",
      );
      setDailyShardSpendLimit(
        typeof res.limits.daily_shard_spend_limit === "number" ? String(res.limits.daily_shard_spend_limit) : "",
      );
    } catch (e) {
      if (e instanceof ApiError) setSafetyError(e.code);
      else setSafetyError("Network error");
    } finally {
      setSafetyLoading(false);
    }
  }

  async function refreshCommunity() {
    setCommunityError(null);
    setCommunityLoading(true);
    try {
      const res = await fetchJsonOrThrow<CommunityStatusResponse>("/api/arcade/community/status", { cache: "no-store" });
      setCommunityStatus(res);
    } catch (e) {
      if (e instanceof ApiError) setCommunityError(e.code);
      else setCommunityError("Network error");
    } finally {
      setCommunityLoading(false);
    }
  }

  async function claimCommunity() {
    setCommunityError(null);
    setCommunityClaiming(true);
    try {
      await fetchJsonOrThrow<{ ok: true }>("/api/arcade/community/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      await Promise.all([refreshCommunity(), refreshInventory()]);
    } catch (e) {
      if (e instanceof ApiError) setCommunityError(e.code);
      else setCommunityError("Network error");
    } finally {
      setCommunityClaiming(false);
    }
  }

  async function openInsightPack() {
    setInsightError(null);
    setInsightLast(null);
    setInsightLoading(true);
    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<CommitResponse>("/api/arcade/insight/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: insightProfile, client_commit_hash: clientCommit }),
      });

      try {
        localStorage.setItem(`arcade_seed:${commit.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      const reveal = await fetchJsonOrThrow<{ ok: true; result: any }>("/api/arcade/insight/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setInsightLast(reveal.result);
      await refreshInventory();
    } catch (e) {
      if (e instanceof ApiError) setInsightError(e.code);
      else setInsightError("Network error");
    } finally {
      setInsightLoading(false);
    }
  }

  async function saveSafety() {
    setSafetyError(null);
    setSafetyLoading(true);
    try {
      const nAction = dailyActionLimit.trim() ? Number(dailyActionLimit.trim()) : null;
      const nShard = dailyShardSpendLimit.trim() ? Number(dailyShardSpendLimit.trim()) : null;

      const res = await fetchJsonOrThrow<SafetyResponse>("/api/arcade/safety", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          self_exclude_hours: Number(selfExcludeHours || 0),
          daily_action_limit: Number.isFinite(nAction as any) ? nAction : null,
          daily_shard_spend_limit: Number.isFinite(nShard as any) ? nShard : null,
        }),
      });

      setSafety(res.limits);
      setSelfExcludeHours(0);
    } catch (e) {
      if (e instanceof ApiError) setSafetyError(e.code);
      else setSafetyError("Network error");
    } finally {
      setSafetyLoading(false);
    }
  }

  async function doPrestigeReset() {
    setProgError(null);
    setPrestigeLoading(true);
    try {
      await fetchJsonOrThrow<{ ok: true }>("/api/arcade/progression/prestige-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      await Promise.all([refreshProgression(), refreshInventory()]);
    } catch (e) {
      if (e instanceof ApiError) setProgError(e.code);
      else setProgError("Network error");
    } finally {
      setPrestigeLoading(false);
    }
  }

  useEffect(() => {
    void refreshCalendarStatus();
  }, []);

  useEffect(() => {
    void refreshMissions();
  }, []);

  useEffect(() => {
    void refreshProgression();
  }, []);

  useEffect(() => {
    void refreshSafety();
  }, []);

  useEffect(() => {
    void refreshCommunity();
  }, []);

  async function refreshSharedPool() {
    setSharedPoolError(null);
    setSharedPoolLoading(true);
    try {
      const res = await fetchJsonOrThrow<SharedPoolStatusResponse>("/api/arcade/shared-pool/status", { cache: "no-store" });
      setSharedPoolStatus(res);
      setSharedPoolLast(res.outcome ?? null);
    } catch (e) {
      if (e instanceof ApiError) setSharedPoolError(e.code);
      else setSharedPoolError("Network error");
      setSharedPoolStatus(null);
    } finally {
      setSharedPoolLoading(false);
    }
  }

  useEffect(() => {
    void refreshSharedPool();
  }, []);

  async function revealSharedPoolPending(actionId: string) {
    setSharedPoolError(null);
    setSharedPoolLoading(true);
    try {
      let seed: string | null = null;
      try {
        seed = localStorage.getItem(`arcade_seed:${actionId}`);
      } catch {
        seed = null;
      }
      if (!seed) {
        setSharedPoolError("missing_client_seed");
        return;
      }

      const reveal = await fetchJsonOrThrow<{ ok: true; result: any }>("/api/arcade/shared-pool/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: actionId, client_seed: seed }),
      });

      setSharedPoolLast(reveal.result);
      await Promise.all([refreshSharedPool(), refreshInventory()]);
    } catch (e) {
      if (e instanceof ApiError) setSharedPoolError(e.code);
      else setSharedPoolError("Network error");
    } finally {
      setSharedPoolLoading(false);
    }
  }

  async function joinSharedPool() {
    setSharedPoolError(null);
    setSharedPoolLast(null);
    setSharedPoolLoading(true);

    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<{ ok: true; action_id: string }>("/api/arcade/shared-pool/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: sharedPoolProfile, client_commit_hash: clientCommit }),
      });

      try {
        localStorage.setItem(`arcade_seed:${commit.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      const reveal = await fetchJsonOrThrow<{ ok: true; result: any }>("/api/arcade/shared-pool/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setSharedPoolLast(reveal.result);
      await Promise.all([refreshSharedPool(), refreshInventory()]);
    } catch (e) {
      if (e instanceof ApiError) setSharedPoolError(e.code);
      else setSharedPoolError("Network error");
    } finally {
      setSharedPoolLoading(false);
    }
  }

  async function refreshInventory() {
    setInvError(null);
    setInvLoading(true);
    try {
      const res = await fetchJsonOrThrow<InventoryResponse>("/api/arcade/inventory", { cache: "no-store" });
      setInvItems(res.items ?? []);
      setInvShards(Number(res.shards ?? 0));
      if (!salvageKey) {
        const first = (res.items ?? []).find((i) => i.kind !== "shard");
        if (first) setSalvageKey(`${first.kind}::${first.code}::${first.rarity}`);
      }
    } catch (e) {
      if (e instanceof ApiError) setInvError(e.code);
      else setInvError("Network error");
    } finally {
      setInvLoading(false);
    }
  }

  useEffect(() => {
    void refreshInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshBadgePoolsStatus(seasonKey?: string) {
    setBadgePoolsError(null);
    try {
      const qs = seasonKey ? `?season_key=${encodeURIComponent(seasonKey)}` : "";
      const res = await fetchJsonOrThrow<BadgePoolsStatusResponse>(`/api/arcade/badge-pools/status${qs}`, { cache: "no-store" });
      setBadgePoolsStatus(res);
    } catch (e) {
      if (e instanceof ApiError) setBadgePoolsError(e.code);
      else setBadgePoolsError("Network error");
      setBadgePoolsStatus(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchJsonOrThrow<SeasonResponse>("/api/arcade/season", { cache: "no-store" });
        if (!cancelled) setSeason(res.season ?? null);
      } catch {
        if (!cancelled) setSeason(null);
      }
    })();
    const t = setInterval(() => void (async () => {
      try {
        const res = await fetchJsonOrThrow<SeasonResponse>("/api/arcade/season", { cache: "no-store" });
        if (!cancelled) setSeason(res.season ?? null);
      } catch {
        // ignore
      }
    })(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    void refreshBadgePoolsStatus();
  }, []);

  async function claimBadgePool() {
    setBadgePoolsError(null);
    setBadgePoolsLast(null);
    setBadgePoolsLoading(true);
    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<CommitResponse>("/api/arcade/daily/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ module: "seasonal_badges", profile: badgePoolsProfile, client_commit_hash: clientCommit }),
      });

      const reveal = await fetchJsonOrThrow<RevealResponse>("/api/arcade/daily/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setBadgePoolsLast(reveal.result);
      await Promise.all([refreshBadgePoolsStatus(), refreshInventory()]);
    } catch (e) {
      if (e instanceof ApiError) setBadgePoolsError(e.code);
      else setBadgePoolsError("Network error");
    } finally {
      setBadgePoolsLoading(false);
    }
  }

  async function claimCalendarDaily() {
    setCalError(null);
    setCalLast(null);
    setCalLoading(true);
    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<CalendarCommitResponse>("/api/arcade/calendar/daily/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: calProfile, client_commit_hash: clientCommit }),
      });

      try {
        localStorage.setItem(`arcade_seed:${commit.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      const reveal = await fetchJsonOrThrow<{ ok: true; result: any }>("/api/arcade/calendar/daily/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setCalLast(reveal.result);
      await refreshCalendarStatus();
    } catch (e) {
      if (e instanceof ApiError) setCalError(e.code);
      else setCalError("Network error");
    } finally {
      setCalLoading(false);
    }
  }

  async function startDraft() {
    setDraftError(null);
    setDraftPicked(null);
    setDraftOptions([]);
    setDraftActionId(null);
    setDraftLoading(true);
    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<DraftCommitResponse>("/api/arcade/draft/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: draftProfile, client_commit_hash: clientCommit }),
      });

      setDraftActionId(commit.action_id);
      try {
        localStorage.setItem(`arcade_seed:${commit.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      const reveal = await fetchJsonOrThrow<DraftRevealResponse>("/api/arcade/draft/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setDraftOptions(reveal.options ?? []);
    } catch (e) {
      if (e instanceof ApiError) setDraftError(e.code);
      else setDraftError("Network error");
    } finally {
      setDraftLoading(false);
    }
  }

  async function pickDraft(optionCode: string) {
    if (!draftActionId) return;
    setDraftError(null);
    setDraftPicking(optionCode);
    try {
      const res = await fetchJsonOrThrow<{ ok: true; result: any }>("/api/arcade/draft/pick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: draftActionId, option_code: optionCode }),
      });
      setDraftPicked(res.result?.picked ?? res.result);
    } catch (e) {
      if (e instanceof ApiError) setDraftError(e.code);
      else setDraftError("Network error");
    } finally {
      setDraftPicking(null);
    }
  }

  async function salvageSelected() {
    if (!salvageKey) return;
    const [kind, code, rarity] = salvageKey.split("::");
    if (!kind || !code || !rarity) return;
    setInvError(null);
    setSalvageLoading(true);
    try {
      await fetchJsonOrThrow<{ ok: true }>("/api/arcade/crafting/salvage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, code, rarity, quantity: Number(salvageQty) }),
      });
      await refreshInventory();
    } catch (e) {
      if (e instanceof ApiError) setInvError(e.code);
      else setInvError("Network error");
    } finally {
      setSalvageLoading(false);
    }
  }

  async function craft(recipeCode: string) {
    setInvError(null);
    setCraftLoading(recipeCode);
    try {
      await fetchJsonOrThrow<{ ok: true }>("/api/arcade/crafting/craft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipe_code: recipeCode }),
      });
      await refreshInventory();
    } catch (e) {
      if (e instanceof ApiError) setInvError(e.code);
      else setInvError("Network error");
    } finally {
      setCraftLoading(null);
    }
  }

  async function createVault() {
    setVaultError(null);
    setVaultLastReveal(null);
    setVaultLoading(true);
    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const created = await fetchJsonOrThrow<
        {
          ok: true;
          action_id: string;
          hold_id: string;
          module: string;
          profile: string;
          resolves_at: string;
          server_commit_hash: string;
        }
      >("/api/arcade/vaults/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          asset_id: vaultAssetId,
          amount: vaultAmount,
          duration_hours: vaultDurationHours,
          profile: vaultProfile,
          client_commit_hash: clientCommit,
        }),
      });

      try {
        localStorage.setItem(`arcade_seed:${created.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      await refreshVaultActions();
    } catch (e) {
      if (e instanceof ApiError) setVaultError(e.code);
      else setVaultError("Network error");
    } finally {
      setVaultLoading(false);
    }
  }

  async function revealVault(actionId: string) {
    setVaultRevealError(null);
    setVaultLastReveal(null);
    setVaultRevealLoadingId(actionId);
    try {
      let seed: string | null = null;
      try {
        seed = localStorage.getItem(`arcade_seed:${actionId}`);
      } catch {
        seed = null;
      }
      if (!seed) {
        setVaultRevealError("missing_client_seed");
        return;
      }

      const reveal = await fetchJsonOrThrow<{ ok: true; result: any }>("/api/arcade/vaults/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: actionId, client_seed: seed }),
      });

      setVaultLastReveal(reveal.result);
      await refreshVaultActions();
    } catch (e) {
      if (e instanceof ApiError) setVaultRevealError(e.code);
      else setVaultRevealError("Network error");
    } finally {
      setVaultRevealLoadingId(null);
    }
  }

  async function hintVault(actionId: string) {
    setVaultHintError(null);
    setVaultLastHint(null);
    setVaultHintLoadingId(actionId);
    try {
      let seed: string | null = null;
      try {
        seed = localStorage.getItem(`arcade_seed:${actionId}`);
      } catch {
        seed = null;
      }
      if (!seed) {
        setVaultHintError("missing_client_seed");
        return;
      }

      const hint = await fetchJsonOrThrow<{ ok: true; hint: any }>("/api/arcade/vaults/hint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: actionId, client_seed: seed }),
      });

      setVaultLastHint(hint.hint);
      await refreshVaultActions();
    } catch (e) {
      if (e instanceof ApiError) setVaultHintError(e.code);
      else setVaultHintError("Network error");
    } finally {
      setVaultHintLoadingId(null);
    }
  }

  async function claimDaily() {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<CommitResponse>("/api/arcade/daily/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ module: "daily_drop", profile, client_commit_hash: clientCommit }),
      });

      const reveal = await fetchJsonOrThrow<RevealResponse>("/api/arcade/daily/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setResult(reveal.result);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.code);
      } else {
        setError("Network error");
      }
    } finally {
      setLoading(false);
    }
  }

  async function spinWheel() {
    setWheelError(null);
    setWheelLast(null);
    setWheelLoading(true);

    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<WheelCommitResponse>("/api/arcade/wheel/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: wheelProfile, client_commit_hash: clientCommit }),
      });

      try {
        localStorage.setItem(`arcade_seed:${commit.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      const reveal = await fetchJsonOrThrow<WheelRevealResponse>("/api/arcade/wheel/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setWheelLast(reveal.result);
      await refreshInventory();
    } catch (e) {
      if (e instanceof ApiError) setWheelError(e.code);
      else setWheelError("Network error");
    } finally {
      setWheelLoading(false);
    }
  }

  async function askOracle() {
    setOracleError(null);
    setOracleLast(null);
    setOracleLoading(true);

    try {
      const prompt = String(oraclePrompt ?? "").trim();
      if (prompt.length < 10) {
        setOracleError("invalid_input");
        return;
      }

      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<OracleCommitResponse>("/api/arcade/ai/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: oracleProfile, client_commit_hash: clientCommit, prompt }),
      });

      try {
        localStorage.setItem(`arcade_seed:${commit.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      const reveal = await fetchJsonOrThrow<OracleRevealResponse>("/api/arcade/ai/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed, prompt }),
      });

      setOracleLast(reveal.result);
      await refreshInventory();
    } catch (e) {
      if (e instanceof ApiError) setOracleError(e.code);
      else setOracleError("Network error");
    } finally {
      setOracleLoading(false);
    }
  }

  async function createBlindCreation() {
    setCreateError(null);
    setCreateLastReveal(null);
    setCreateLoading(true);

    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const created = await fetchJsonOrThrow<{
        ok: true;
        action_id: string;
        module: string;
        profile: "low" | "medium" | "high";
        resolves_at: string;
        server_commit_hash: string;
      }>("/api/arcade/creation/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: createProfile, client_commit_hash: clientCommit }),
      });

      try {
        localStorage.setItem(`arcade_seed:${created.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      await Promise.all([refreshCreationActions(), refreshInventory()]);
    } catch (e) {
      if (e instanceof ApiError) setCreateError(e.code);
      else setCreateError("Network error");
    } finally {
      setCreateLoading(false);
    }
  }

  async function revealBlindCreation(actionId: string) {
    setCreateRevealError(null);
    setCreateLastReveal(null);
    setCreateRevealLoadingId(actionId);

    try {
      let seed: string | null = null;
      try {
        seed = localStorage.getItem(`arcade_seed:${actionId}`);
      } catch {
        seed = null;
      }
      if (!seed) {
        setCreateRevealError("missing_client_seed");
        return;
      }

      const reveal = await fetchJsonOrThrow<{ ok: true; result: any }>("/api/arcade/creation/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: actionId, client_seed: seed }),
      });

      setCreateLastReveal(reveal.result);
      await Promise.all([refreshCreationActions(), refreshInventory()]);
    } catch (e) {
      if (e instanceof ApiError) setCreateRevealError(e.code);
      else setCreateRevealError("Network error");
    } finally {
      setCreateRevealLoadingId(null);
    }
  }

  async function runMutation() {
    if (!mutationKey) return;
    const [kind, code, rarity] = mutationKey.split("::");
    if (!kind || !code || !rarity) return;

    setMutationError(null);
    setMutationLast(null);
    setMutationLoading(true);

    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<CommitResponse>("/api/arcade/mutation/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: mutationProfile, client_commit_hash: clientCommit, item: { kind, code, rarity } }),
      });

      try {
        localStorage.setItem(`arcade_seed:${commit.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      const reveal = await fetchJsonOrThrow<{ ok: true; result: any }>("/api/arcade/mutation/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setMutationLast(reveal.result);
      await refreshInventory();
    } catch (e) {
      if (e instanceof ApiError) setMutationError(e.code);
      else setMutationError("Network error");
    } finally {
      setMutationLoading(false);
    }
  }

  async function runFusion() {
    if (!fusionKeyA || !fusionKeyB) return;
    const [ka, ca, ra] = fusionKeyA.split("::");
    const [kb, cb, rb] = fusionKeyB.split("::");
    if (!ka || !ca || !ra || !kb || !cb || !rb) return;
    if (fusionKeyA === fusionKeyB) {
      setFusionError("must_choose_two_distinct_items");
      return;
    }

    setFusionError(null);
    setFusionLast(null);
    setFusionLoading(true);

    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<CommitResponse>("/api/arcade/fusion/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: fusionProfile,
          client_commit_hash: clientCommit,
          item_a: { kind: ka, code: ca, rarity: ra },
          item_b: { kind: kb, code: cb, rarity: rb },
        }),
      });

      try {
        localStorage.setItem(`arcade_seed:${commit.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      const reveal = await fetchJsonOrThrow<{ ok: true; result: any }>("/api/arcade/fusion/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setFusionLast(reveal.result);
      await refreshInventory();
    } catch (e) {
      if (e instanceof ApiError) setFusionError(e.code);
      else setFusionError("Network error");
    } finally {
      setFusionLoading(false);
    }
  }

  async function claimStreakProtector() {
    setStreakError(null);
    setStreakLast(null);
    setStreakLoading(true);

    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<StreakCommitResponse>("/api/arcade/streak/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: streakProfile, client_commit_hash: clientCommit }),
      });

      try {
        localStorage.setItem(`arcade_seed:${commit.action_id}`, clientSeed);
      } catch {
        // ignore
      }

      const reveal = await fetchJsonOrThrow<StreakRevealResponse>("/api/arcade/streak/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setStreakLast(reveal.result);
      await refreshInventory();
    } catch (e) {
      if (e instanceof ApiError) setStreakError(e.code);
      else setStreakError("Network error");
    } finally {
      setStreakLoading(false);
    }
  }

  async function claimMission(missionCode: string) {
    setMissionLast(null);
    setMissionsError(null);
    setMissionClaiming(missionCode);
    try {
      const clientSeed = randomClientSeed();
      const clientCommit = await sha256HexBrowser(clientSeed);

      const commit = await fetchJsonOrThrow<{ ok: true; action_id: string }>("/api/arcade/missions/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mission_code: missionCode, profile: missionsProfile, client_commit_hash: clientCommit }),
      });

      const reveal = await fetchJsonOrThrow<{ ok: true; result: any }>("/api/arcade/missions/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_id: commit.action_id, client_seed: clientSeed }),
      });

      setMissionLast(reveal.result);
      await Promise.all([refreshMissions(), refreshInventory()]);
    } catch (e) {
      if (e instanceof ApiError) setMissionsError(e.code);
      else setMissionsError("Network error");
    } finally {
      setMissionClaiming(null);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 28%, var(--ring) 0, transparent 55%), radial-gradient(circle at 82% 72%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Progression</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
            <button
              className={buttonClassName({ variant: "ghost", size: "xs" })}
              onClick={refreshProgression}
              disabled={progLoading}
            >
              {progLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">XP</div>
              <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                {progression ? progression.xp : "—"}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Next tier at <span className="font-mono text-[var(--foreground)]">{progression?.next_tier_xp ?? "—"}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Tier</div>
              <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                {progression ? progression.tier : "—"}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">Tier-ups can grant a small bounded bonus XP.</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Prestige</div>
                <button
                  className={buttonClassName({ variant: "secondary", size: "xs" })}
                  onClick={doPrestigeReset}
                  disabled={prestigeLoading || (progression ? progression.tier < 3 : true)}
                  title={progression && progression.tier < 3 ? "Reach Tier 3 to prestige" : ""}
                >
                  {prestigeLoading ? "Resetting…" : "Prestige"}
                </button>
              </div>
              <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                {progression ? progression.prestige : "—"}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">Optional reset for long-term cosmetics.</div>
            </div>
          </div>

          {progError ? (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{progError}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 16% 26%, var(--ring) 0, transparent 55%), radial-gradient(circle at 86% 76%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">AI Oracle</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Tiered answers</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Same prompt → different tiers · rare tiers become collectible templates</div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                Cost: <span className="font-mono text-[var(--foreground)]">5</span> shards · Not financial advice
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={oracleProfile}
                  onChange={(e) => setOracleProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Oracle volatility profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Shards</span>
                <span className="font-mono text-xs font-semibold text-[var(--foreground)]">{invLoading ? "…" : invShards}</span>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={askOracle}
                disabled={oracleLoading || invLoading || invShards < 5 || String(oraclePrompt ?? "").trim().length < 10}
              >
                {oracleLoading ? "Asking…" : "Ask"}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Prompt</div>
            <textarea
              value={oraclePrompt}
              onChange={(e) => setOraclePrompt(e.target.value)}
              rows={4}
              placeholder="Ask a question (e.g. 'How do I verify a token contract and avoid scams?')"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            <div className="mt-2 text-xs text-[var(--muted)]">Tip: be specific; avoid sharing private keys or sensitive data.</div>
          </div>

          {oracleError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{oracleError}</span>
            </div>
          )}

          {oracleLast?.response_text ? (
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Oracle response</div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">{String(oracleLast?.tier ?? "common")}</div>
                </div>
                <pre className="mt-3 whitespace-pre-wrap text-xs text-[var(--foreground)]">{String(oracleLast.response_text)}</pre>

                {oracleLast?.collectible?.code ? (
                  <div className="mt-3 text-xs text-[var(--muted)]">
                    Collected template: <span className="font-mono text-[var(--foreground)]">{oracleLast.collectible.code}</span>
                  </div>
                ) : null}
              </div>

              {oracleLast?.audit ? (
                <details className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                  <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                    Fairness proof
                  </summary>
                  <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
                    <div>
                      client_commit_hash: <span className="font-mono text-[var(--foreground)]">{oracleLast.audit.client_commit_hash}</span>
                    </div>
                    <div>
                      server_commit_hash: <span className="font-mono text-[var(--foreground)]">{oracleLast.audit.server_commit_hash}</span>
                    </div>
                    <div>
                      server_seed_b64: <span className="font-mono text-[var(--foreground)]">{oracleLast.audit.server_seed_b64}</span>
                    </div>
                    <div>
                      random_hash: <span className="font-mono text-[var(--foreground)]">{oracleLast.audit.random_hash}</span>
                    </div>
                    <div>
                      roll: <span className="font-semibold text-[var(--foreground)]">{oracleLast.audit.roll}</span> / {oracleLast.audit.total}
                    </div>
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 22%, var(--ring) 0, transparent 55%), radial-gradient(circle at 84% 70%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Shared pool</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
            <button className={buttonClassName({ variant: "ghost", size: "xs" })} onClick={refreshSharedPool} disabled={sharedPoolLoading}>
              {sharedPoolLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Weekly pool claim</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Everyone gets a baseline badge. Some get a boosted cosmetic or a key.</div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                Week start: <span className="font-mono">{sharedPoolStatus?.week_start ?? "…"}</span>
                <span className="mx-2 text-[var(--border)]">•</span>
                Cost: <span className="font-mono text-[var(--foreground)]">10</span> shards
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={sharedPoolProfile}
                  onChange={(e) => setSharedPoolProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Shared pool volatility profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {sharedPoolStatus?.participated && sharedPoolStatus?.action_status === "committed" && sharedPoolStatus?.action_id ? (
                <button
                  className={buttonClassName({ variant: "primary", size: "sm" })}
                  onClick={() => revealSharedPoolPending(sharedPoolStatus.action_id!)}
                  disabled={sharedPoolLoading}
                >
                  {sharedPoolLoading ? "Revealing…" : "Reveal"}
                </button>
              ) : (
                <button
                  className={buttonClassName({ variant: "primary", size: "sm" })}
                  onClick={joinSharedPool}
                  disabled={sharedPoolLoading || Boolean(sharedPoolStatus?.participated)}
                >
                  {sharedPoolStatus?.participated ? "Joined" : sharedPoolLoading ? "Joining…" : "Join"}
                </button>
              )}
            </div>
          </div>

          {sharedPoolError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{sharedPoolError}</span>
            </div>
          )}

          {sharedPoolLast?.outcome ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Baseline</div>
                <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">{sharedPoolLast.outcome.baseline?.label ?? "—"}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">Rarity: {sharedPoolLast.outcome.baseline?.rarity ?? "—"}</div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Boost</div>
                <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">
                  {sharedPoolLast.outcome.boost?.label ?? "No boost"}
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">Rarity: {sharedPoolLast.outcome.boost?.rarity ?? "—"}</div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 14% 22%, var(--ring) 0, transparent 55%), radial-gradient(circle at 88% 70%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Badge pools</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Seasonal badge drops</div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                One claim per day · seasonal pool rotates weekly · complete sets to unlock keys
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                Pool: <span className="font-semibold text-[var(--foreground)]">{badgePoolsStatus?.pool?.label ?? "—"}</span>
                {badgePoolsStatus?.season?.key ? (
                  <>
                    <span className="mx-2 text-[var(--border)]">•</span>
                    Season: <span className="font-mono text-[var(--foreground)]">{badgePoolsStatus.season.key}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={badgePoolsProfile}
                  onChange={(e) => setBadgePoolsProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Volatility profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <button className={buttonClassName({ variant: "primary", size: "sm" })} onClick={claimBadgePool} disabled={badgePoolsLoading}>
                {badgePoolsLoading ? "Claiming…" : "Claim"}
              </button>

              <button
                onClick={() => refreshBadgePoolsStatus()}
                className={buttonClassName({ variant: "ghost", size: "xs" })}
                disabled={badgePoolsLoading}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-[var(--muted)]">{badgePoolsProfile === "high" ? "High variance: rarer seasonal badges are more likely." : badgePoolsProfile === "medium" ? "Medium variance: balanced seasonal drops." : "Low variance: mostly common seasonal badges."}</div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(badgePoolsStatus?.sets ?? []).map((s) => {
              const done = (s.have ?? 0) >= (s.required ?? 0) && (s.required ?? 0) > 0;
              return (
                <div key={s.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">{s.label}</div>
                    <div
                      className={
                        "text-[11px] font-bold uppercase tracking-widest " +
                        (s.unlocked ? "text-[var(--up)]" : done ? "text-[var(--warn)]" : "text-[var(--muted)]")
                      }
                    >
                      {s.unlocked ? "Unlocked" : done ? "Ready" : "In progress"}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    Progress: <span className="font-semibold text-[var(--foreground)]">{s.have}</span> / {s.required}
                  </div>
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    Unlock key: <span className="font-mono text-[var(--foreground)]">{s.unlock_key?.code ?? "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {badgePoolsError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{badgePoolsError}</span>
            </div>
          )}

          {badgePoolsLast && (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Last drop</div>
              <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">
                {badgePoolsLast?.outcome?.label ?? "—"}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">Rarity: {badgePoolsLast?.outcome?.rarity ?? "—"}</div>
              {Array.isArray(badgePoolsLast?.unlocks?.keys) && badgePoolsLast.unlocks.keys.length ? (
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Unlocks: <span className="font-semibold text-[var(--foreground)]">{badgePoolsLast.unlocks.keys.length}</span> key(s)
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 16% 26%, var(--ring) 0, transparent 55%), radial-gradient(circle at 86% 76%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Community event</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
            <button className={buttonClassName({ variant: "ghost", size: "xs" })} onClick={refreshCommunity} disabled={communityLoading}>
              {communityLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Weekly unlock</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Global arcade actions unlock a one-time claim for everyone.</div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                Week start: <span className="font-mono">{communityStatus?.week_start ?? "…"}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Progress</span>
                <span className="font-mono text-xs font-semibold text-[var(--foreground)]">
                  {typeof communityStatus?.progress === "number" ? communityStatus.progress : "…"}
                </span>
                <span className="text-xs text-[var(--muted)]">/</span>
                <span className="font-mono text-xs font-semibold text-[var(--foreground)]">
                  {typeof communityStatus?.threshold === "number" ? communityStatus.threshold : "…"}
                </span>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={claimCommunity}
                disabled={communityClaiming || communityLoading || !communityStatus?.unlocked || Boolean(communityStatus?.claimed)}
              >
                {communityStatus?.claimed ? "Claimed" : communityClaiming ? "Claiming…" : communityStatus?.unlocked ? "Claim (40 shards)" : "Locked"}
              </button>
            </div>
          </div>

          {communityError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{communityError}</span>
            </div>
          )}

          {communityStatus?.unlocked ? (
            <div className="mt-4 text-xs text-[var(--muted)]">Unlocked: yes · Claim is per-user (tracked in your arcade state).</div>
          ) : (
            <div className="mt-4 text-xs text-[var(--muted)]">Unlocked: no · Keep playing any arcade module to advance progress.</div>
          )}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 22%, var(--ring) 0, transparent 55%), radial-gradient(circle at 84% 70%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Insight packs</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Open an informational card</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Costs 20 shards · commit→reveal fairness proof · not financial advice</div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={insightProfile}
                  onChange={(e) => setInsightProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Insight pack volatility profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high" disabled={gateKeyQty <= 0}>
                    High{gateKeyQty <= 0 ? " (Key)" : ""}
                  </option>
                </select>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Shards</span>
                <span className="font-mono text-xs font-semibold text-[var(--foreground)]">{invLoading ? "…" : invShards}</span>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={openInsightPack}
                disabled={insightLoading || invLoading || invShards < 20}
              >
                {insightLoading ? "Opening…" : "Open (20)"}
              </button>
            </div>
          </div>

          {insightError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{insightError}</span>
            </div>
          )}

          {insightLast?.outcome ? (
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">{insightLast.outcome.label}</div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">{insightLast.outcome.rarity}</div>
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">{insightLast.outcome.metadata?.text ?? ""}</div>
              <div className="mt-3 text-[11px] text-[var(--muted)]">{insightLast.outcome.metadata?.disclaimer ?? ""}</div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Keys & Gates</div>
              <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">Gate Key</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                In inventory: <span className="font-mono text-[var(--foreground)]">{invLoading ? "…" : gateKeyQty}</span>
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                High volatility Insight Packs require a Gate Key.
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Season</div>
              <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">{season?.key ?? "—"}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Next shift: {season?.next_shift_at ? new Date(season.next_shift_at).toUTCString() : "—"}
              </div>
              {Array.isArray(season?.rules) && season!.rules.length ? (
                <div className="mt-2 text-xs text-[var(--muted)]">{season!.rules[0]}</div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 25%, var(--ring) 0, transparent 55%), radial-gradient(circle at 85% 70%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Blind creation</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Forge now · reveal later</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Costs 25 shards now · reveals ~30 minutes later · commit→reveal proof</div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={createProfile}
                  onChange={(e) => setCreateProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Blind creation volatility profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Shards</span>
                <span className="font-mono text-xs font-semibold text-[var(--foreground)]">{invLoading ? "…" : invShards}</span>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={createBlindCreation}
                disabled={createLoading || invLoading || invShards < 25}
              >
                {createLoading ? "Forging…" : "Forge"}
              </button>
            </div>
          </div>

          {createError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{createError}</span>
            </div>
          )}

          {createRevealError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Reveal error: <span className="font-semibold">{createRevealError}</span>
            </div>
          )}

          {createActions.length > 0 ? (
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Recent forges</div>
                <div className="mt-3 grid gap-2">
                  {createActions.slice(0, 8).map((a) => {
                    const canReveal = a.status === "ready";
                    const outcomeLabel = a.outcome_json?.outcome?.label ?? null;
                    return (
                      <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--foreground)]">{a.id.slice(0, 8)}…</span>
                            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">{a.status}</span>
                          </div>
                          {a.resolves_at ? (
                            <div className="mt-1 text-xs text-[var(--muted)]">Resolves at: <span className="font-mono">{String(a.resolves_at)}</span></div>
                          ) : null}
                          {outcomeLabel ? (
                            <div className="mt-1 text-xs text-[var(--muted)]">Outcome: <span className="font-semibold text-[var(--foreground)]">{outcomeLabel}</span></div>
                          ) : null}
                        </div>

                        <div className="shrink-0">
                          {a.status === "resolved" ? (
                            <span className="text-xs font-semibold text-[var(--muted)]">Revealed</span>
                          ) : (
                            <button
                              className={buttonClassName({ variant: "secondary", size: "sm" })}
                              onClick={() => revealBlindCreation(a.id)}
                              disabled={!canReveal || createRevealLoadingId === a.id}
                            >
                              {createRevealLoadingId === a.id ? "Revealing…" : canReveal ? "Reveal" : "Not ready"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {createLastReveal?.outcome ? (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Latest reveal</div>
                  <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">{createLastReveal.outcome.label}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">Rarity: {createLastReveal.outcome.rarity}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 14% 22%, var(--ring) 0, transparent 55%), radial-gradient(circle at 90% 72%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Mutation</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Transform one cosmetic</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Costs 15 shards · commit→reveal proof · bounded upgrade chance</div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Item</span>
                <select
                  value={mutationKey}
                  onChange={(e) => setMutationKey(e.target.value)}
                  className="max-w-[260px] rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Mutation item"
                >
                  {cosmeticItems.length === 0 ? <option value="">No cosmetics</option> : null}
                  {cosmeticItems.map((i) => (
                    <option key={`${i.kind}::${i.code}::${i.rarity}`} value={`${i.kind}::${i.code}::${i.rarity}`}>
                      {(i.metadata_json?.label ?? i.code) + ` (${i.rarity}) x${i.quantity}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={mutationProfile}
                  onChange={(e) => setMutationProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Mutation volatility profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={runMutation}
                disabled={mutationLoading || invLoading || invShards < 15 || cosmeticItems.length === 0 || !mutationKey}
              >
                {mutationLoading ? "Mutating…" : "Mutate"}
              </button>
            </div>
          </div>

          {mutationError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{mutationError}</span>
            </div>
          )}

          {mutationLast?.outcome ? (
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Result</div>
              <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">{mutationLast.outcome.label}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Rarity: {mutationLast.outcome.rarity}</div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 28%, var(--ring) 0, transparent 55%), radial-gradient(circle at 86% 78%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Fusion</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Combine two cosmetics</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Costs 25 shards · commit→reveal proof · bounded upgrade chance</div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">A</span>
                <select
                  value={fusionKeyA}
                  onChange={(e) => setFusionKeyA(e.target.value)}
                  className="max-w-[220px] rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Fusion item A"
                >
                  {cosmeticItems.length === 0 ? <option value="">No cosmetics</option> : null}
                  {cosmeticItems.map((i) => (
                    <option key={`a:${i.kind}::${i.code}::${i.rarity}`} value={`${i.kind}::${i.code}::${i.rarity}`}>
                      {(i.metadata_json?.label ?? i.code) + ` (${i.rarity})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">B</span>
                <select
                  value={fusionKeyB}
                  onChange={(e) => setFusionKeyB(e.target.value)}
                  className="max-w-[220px] rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Fusion item B"
                >
                  {cosmeticItems.length === 0 ? <option value="">No cosmetics</option> : null}
                  {cosmeticItems.map((i) => (
                    <option key={`b:${i.kind}::${i.code}::${i.rarity}`} value={`${i.kind}::${i.code}::${i.rarity}`}>
                      {(i.metadata_json?.label ?? i.code) + ` (${i.rarity})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={fusionProfile}
                  onChange={(e) => setFusionProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Fusion volatility profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={runFusion}
                disabled={fusionLoading || invLoading || invShards < 25 || cosmeticItems.length < 2 || !fusionKeyA || !fusionKeyB}
              >
                {fusionLoading ? "Fusing…" : "Fuse"}
              </button>
            </div>
          </div>

          {fusionError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{fusionError}</span>
            </div>
          )}

          {fusionLast?.outcome ? (
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Result</div>
              <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">{fusionLast.outcome.label}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Rarity: {fusionLast.outcome.rarity}</div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, var(--ring) 0, transparent 55%), radial-gradient(circle at 80% 78%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Crafting</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
            <button className={buttonClassName({ variant: "ghost", size: "xs" })} onClick={refreshInventory} disabled={invLoading}>
              {invLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Shards</div>
              <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">{invShards}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Deterministic currency earned by salvaging inventory.</div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 md:col-span-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Craft</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  className={buttonClassName({ variant: "secondary", size: "sm" })}
                  onClick={() => craft("craft_fee_5bps_24h")}
                  disabled={craftLoading !== null || invShards < 60}
                >
                  {craftLoading === "craft_fee_5bps_24h" ? "Crafting…" : "Fee -5bps (60)"}
                </button>
                <button
                  className={buttonClassName({ variant: "secondary", size: "sm" })}
                  onClick={() => craft("craft_p2p_highlight_1")}
                  disabled={craftLoading !== null || invShards < 75}
                >
                  {craftLoading === "craft_p2p_highlight_1" ? "Crafting…" : "P2P Highlight (75)"}
                </button>
                <button
                  className={buttonClassName({ variant: "secondary", size: "sm" })}
                  onClick={() => craft("craft_fee_10bps_48h")}
                  disabled={craftLoading !== null || invShards < 180}
                >
                  {craftLoading === "craft_fee_10bps_48h" ? "Crafting…" : "Fee -10bps (180)"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Salvage</div>
                <div className="mt-1 text-sm text-[var(--muted)]">Convert badges/boosts into shards (fixed rate by rarity).</div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={salvageKey}
                  onChange={(e) => setSalvageKey(e.target.value)}
                  className="min-w-[240px] rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Select item to salvage"
                >
                  <option value="" disabled>
                    Select item…
                  </option>
                  {invItems
                    .filter((i) => i.kind !== "shard")
                    .map((i) => {
                      const label = String(i.metadata_json?.label ?? i.code);
                      return (
                        <option key={`${i.kind}:${i.code}:${i.rarity}`} value={`${i.kind}::${i.code}::${i.rarity}`}>
                          {label} · {i.rarity} · x{i.quantity}
                        </option>
                      );
                    })}
                </select>
                <input
                  type="number"
                  min={1}
                  value={salvageQty}
                  onChange={(e) => setSalvageQty(Math.max(1, Number(e.target.value || 1)))}
                  className="w-24 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                />
                <button
                  className={buttonClassName({ variant: "primary", size: "sm" })}
                  onClick={salvageSelected}
                  disabled={salvageLoading || !salvageKey}
                >
                  {salvageLoading ? "Salvaging…" : "Salvage"}
                </button>
              </div>
            </div>

            {invError && (
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
                Error: <span className="font-semibold">{invError}</span>
              </div>
            )}

            <div className="mt-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Inventory</div>
              <div className="mt-2 grid gap-2">
                {invItems.filter((i) => i.kind !== "shard").length === 0 ? (
                  <div className="text-xs text-[var(--muted)]">No items yet. Claim Arcade drops to get started.</div>
                ) : (
                  invItems
                    .filter((i) => i.kind !== "shard")
                    .slice(0, 12)
                    .map((i) => (
                      <div key={`${i.kind}:${i.code}:${i.rarity}`} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-[var(--foreground)]">
                            {String(i.metadata_json?.label ?? i.code)}
                          </div>
                          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-[var(--muted)]">
                            {i.kind} · {i.rarity}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs font-bold text-[var(--foreground)]">
                          ×{i.quantity}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 22%, var(--ring) 0, transparent 55%), radial-gradient(circle at 85% 70%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Flash missions</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
            <button
              className={buttonClassName({ variant: "ghost", size: "xs" })}
              onClick={refreshMissions}
              disabled={missionsLoading}
            >
              {missionsLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Do healthy actions · claim rewards</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Daily mission rotation · commit→reveal rewards · small, bounded utility.</div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={missionsProfile}
                  onChange={(e) => setMissionsProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Missions profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Today</span>
                <span className="font-mono text-xs font-semibold text-[var(--foreground)]">{missionsStatus?.today ?? "—"}</span>
              </div>
            </div>
          </div>

          {missionsError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{missionsError}</span>
            </div>
          )}

          {Array.isArray(missionsStatus?.missions) && missionsStatus!.missions.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {missionsStatus!.missions.map((m) => {
                const canClaim = Boolean(m.claimable) && missionClaiming === null;
                const busy = missionClaiming === m.code;
                return (
                  <div key={m.code} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">{m.title}</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">{m.description}</div>
                      </div>
                      <div className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {m.claimed ? "Claimed" : m.completed ? "Complete" : "Pending"}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-[var(--muted)]">
                        {m.completed ? "Eligible" : "Complete the action to unlock claim."}
                      </div>
                      <button
                        className={buttonClassName({ variant: canClaim ? "primary" : "secondary", size: "xs" })}
                        disabled={!m.claimable || busy}
                        onClick={() => claimMission(m.code)}
                      >
                        {busy ? "Claiming…" : m.claimed ? "Claimed" : "Claim"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              {missionsLoading ? "Loading missions…" : "No missions available."}
            </div>
          )}

          {missionLast?.reward ? (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Last reward</div>
              <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">
                {missionLast.reward.label ?? "—"}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 25%, var(--ring) 0, transparent 55%), radial-gradient(circle at 80% 70%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Streak protector</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Weekly protector roll</div>
              <div className="mt-1 text-sm text-[var(--muted)]">If you miss exactly one day on Calendar Daily, a protector is auto-consumed to preserve your streak.</div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={streakProfile}
                  onChange={(e) => setStreakProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Streak protector profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">In inventory</span>
                <span className="font-mono text-xs font-semibold text-[var(--foreground)]">{invLoading ? "…" : streakProtectorQty}</span>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={claimStreakProtector}
                disabled={streakLoading}
              >
                {streakLoading ? "Claiming…" : "Claim weekly"}
              </button>
            </div>
          </div>

          {streakError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{streakError}</span>
            </div>
          )}

          {streakLast?.outcome ? (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Result</div>
              <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">
                {streakLast?.outcome?.label ?? "—"}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">Quantity: {streakLast?.outcome?.quantity ?? 1}</div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 18%, var(--ring) 0, transparent 55%), radial-gradient(circle at 82% 72%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Rarity wheel</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Spin for cosmetics</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Costs 10 shards · commit→reveal fairness proof</div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={wheelProfile}
                  onChange={(e) => setWheelProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Wheel volatility profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Shards</span>
                <span className="font-mono text-xs font-semibold text-[var(--foreground)]">{invLoading ? "…" : invShards}</span>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={spinWheel}
                disabled={wheelLoading || invLoading || invShards < 10}
              >
                {wheelLoading ? "Spinning…" : "Spin"}
              </button>
            </div>
          </div>

          <div className="mt-2 text-xs text-[var(--muted)]">Pity: after 10 non-rare spins, the wheel guarantees at least a Rare cosmetic.</div>

          {wheelError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{wheelError}</span>
            </div>
          )}

          {wheelLast?.outcome ? (
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">{wheelLast.outcome.label}</div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">{wheelLast.outcome.rarity}</div>
                </div>
                <div className="mt-2 text-xs text-[var(--muted)]">Code: <span className="font-mono">{wheelLast.outcome.code}</span></div>
              </div>

              {wheelLast?.audit ? (
                <details className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                  <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-[var(--muted)]">Fairness proof</summary>
                  <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
                    {wheelLast.audit.client_commit_hash ? (
                      <div>
                        client_commit_hash: <span className="font-mono text-[var(--foreground)]">{wheelLast.audit.client_commit_hash}</span>
                      </div>
                    ) : null}
                    {wheelLast.audit.server_commit_hash ? (
                      <div>
                        server_commit_hash: <span className="font-mono text-[var(--foreground)]">{wheelLast.audit.server_commit_hash}</span>
                      </div>
                    ) : null}
                    {wheelLast.audit.server_seed_b64 ? (
                      <div>
                        server_seed_b64: <span className="font-mono text-[var(--foreground)]">{wheelLast.audit.server_seed_b64}</span>
                      </div>
                    ) : null}
                    {wheelLast.audit.random_hash ? (
                      <div>
                        random_hash: <span className="font-mono text-[var(--foreground)]">{wheelLast.audit.random_hash}</span>
                      </div>
                    ) : null}
                    {typeof wheelLast.audit.rarity_roll === "number" && typeof wheelLast.audit.rarity_total === "number" ? (
                      <div>
                        rarity_roll: <span className="font-semibold text-[var(--foreground)]">{wheelLast.audit.rarity_roll}</span> / {wheelLast.audit.rarity_total}
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 30%, var(--ring) 0, transparent 55%), radial-gradient(circle at 88% 70%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Boost draft</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Reveal 3 · pick 1</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Agency-first: you choose the boost you want.</div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={draftProfile}
                  onChange={(e) => setDraftProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={startDraft}
                disabled={draftLoading}
              >
                {draftLoading ? "Revealing…" : "Reveal"}
              </button>
            </div>
          </div>

          {draftError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{draftError}</span>
            </div>
          )}

          {draftPicked && (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Selected</div>
              <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">{draftPicked.label ?? "Boost"}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Rarity: {draftPicked.rarity ?? "—"}</div>
            </div>
          )}

          {draftOptions.length > 0 && !draftPicked && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {draftOptions.map((o) => (
                <button
                  key={o.code}
                  onClick={() => pickDraft(o.code)}
                  disabled={draftPicking !== null}
                  className="text-left rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm transition hover:bg-[var(--card-2)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">{o.label}</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{o.rarity}</div>
                  </div>
                  <div className="mt-2 text-xs text-[var(--muted)]">{o.code}</div>
                  <div className="mt-3">
                    <span className={buttonClassName({ variant: "secondary", size: "xs" })}>
                      {draftPicking === o.code ? "Picking…" : "Pick"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 20%, var(--ring) 0, transparent 55%), radial-gradient(circle at 86% 72%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--up)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--up-bg)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Calendar</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Daily claim</div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                Streaks + pity (rare) · one claim per day
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={calProfile}
                  onChange={(e) => setCalProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={claimCalendarDaily}
                disabled={calLoading || Boolean(calStatus?.claimed_today)}
              >
                {calLoading ? "Claiming…" : calStatus?.claimed_today ? "Claimed" : "Claim"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Streak</div>
              <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">{calStatus?.streak.count ?? 0}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Best: {calStatus?.streak.best ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Pity (rare)</div>
              <div className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">{calStatus?.pity.rare ?? 0}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Resets on rare+</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Today</div>
              <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">{calStatus?.today ?? "—"}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">UTC day boundary</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Last 7 days</div>
              <button onClick={refreshCalendarStatus} className={buttonClassName({ variant: "ghost", size: "xs" })}>
                Refresh
              </button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, idx) => {
                const d = new Date();
                d.setUTCDate(d.getUTCDate() - (6 - idx));
                const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
                const claimed = (calStatus?.claimed_7d ?? []).includes(iso);
                return (
                  <div
                    key={iso}
                    className={
                      "rounded-xl border border-[var(--border)] px-2 py-2 text-center text-[11px] font-bold " +
                      (claimed ? "bg-[var(--up-bg)] text-[var(--up)]" : "bg-[var(--bg)] text-[var(--muted)]")
                    }
                    title={iso}
                  >
                    {iso.slice(8, 10)}
                  </div>
                );
              })}
            </div>
          </div>

          {calError && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{calError}</span>
            </div>
          )}

          {calLast && (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Result</div>
              <div className="mt-2 text-sm font-extrabold tracking-tight text-[var(--foreground)]">
                {calLast?.outcome?.label ?? "—"}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">Rarity: {calLast?.outcome?.rarity ?? "—"}</div>
            </div>
          )}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 30%, var(--ring) 0, transparent 55%), radial-gradient(circle at 88% 70%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Daily drop</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Claim a badge</div>
              <div className="mt-1 text-sm text-[var(--muted)]">One claim per day · commit→reveal fairness proof</div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Volatility</span>
                <select
                  value={profile}
                  onChange={(e) => setProfile(e.target.value as any)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  aria-label="Volatility profile"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={claimDaily}
                disabled={loading}
              >
                {loading ? "Claiming…" : "Claim"}
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-[var(--muted)]">{volatilityHelp}</div>

          {error && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
              Error: <span className="font-semibold">{error}</span>
            </div>
          )}

          {result && (
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">
                    {result.outcome.label}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">{result.outcome.rarity}</div>
                </div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Code: <span className="font-mono">{result.outcome.code}</span>
                </div>
              </div>

              <details className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                  Fairness proof
                </summary>
                <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
                  <div>
                    client_commit_hash: <span className="font-mono text-[var(--foreground)]">{result.audit.client_commit_hash}</span>
                  </div>
                  <div>
                    server_commit_hash: <span className="font-mono text-[var(--foreground)]">{result.audit.server_commit_hash}</span>
                  </div>
                  <div>
                    server_seed_b64: <span className="font-mono text-[var(--foreground)]">{result.audit.server_seed_b64}</span>
                  </div>
                  <div>
                    random_hash: <span className="font-mono text-[var(--foreground)]">{result.audit.random_hash}</span>
                  </div>
                  <div>
                    roll: <span className="font-semibold text-[var(--foreground)]">{result.audit.roll}</span> / {result.audit.total}
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 14% 22%, var(--ring) 0, transparent 55%), radial-gradient(circle at 88% 70%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Time vault</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <div>
              <div className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">Lock funds · unlock a bonus</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Funds are held until unlock. Bonus is a bounded utility boost.</div>
            </div>

            <div className="grid gap-3 md:grid-cols-12">
              <div className="md:col-span-4">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Asset</div>
                <select
                  value={vaultAssetId}
                  onChange={(e) => setVaultAssetId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.symbol} · {a.chain.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Amount</div>
                <input
                  value={vaultAmount}
                  onChange={(e) => setVaultAmount(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]"
                />
              </div>

              <div className="md:col-span-3">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Duration</div>
                <select
                  value={vaultDurationHours}
                  onChange={(e) => setVaultDurationHours(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]"
                >
                  <option value={24}>24h</option>
                  <option value={72}>3d</option>
                  <option value={168}>7d</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Volatility</div>
                <select
                  value={vaultProfile}
                  onChange={(e) => setVaultProfile(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-[var(--muted)]">
                A client seed is saved locally to reveal later. Don’t clear storage before unlock.
              </div>

              <button
                className={buttonClassName({ variant: "primary", size: "sm" })}
                onClick={createVault}
                disabled={vaultLoading || !vaultAssetId || !vaultAmount.trim()}
              >
                {vaultLoading ? "Locking…" : "Lock"}
              </button>
            </div>

            {vaultError && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
                Error: <span className="font-semibold">{vaultError}</span>
              </div>
            )}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">My vaults</div>
              <button
                onClick={refreshVaultActions}
                className={buttonClassName({ variant: "secondary", size: "xs" })}
              >
                Refresh
              </button>
            </div>

            {vaultRevealError && (
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
                Reveal error: <span className="font-semibold">{vaultRevealError}</span>
              </div>
            )}

            {vaultHintError && (
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
                Hint error: <span className="font-semibold">{vaultHintError}</span>
              </div>
            )}

            {vaultLastHint && (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Hint</div>
                <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                  {vaultLastHint?.hint?.tier ? String(vaultLastHint.hint.tier).toUpperCase() : "—"}
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">{vaultLastHint?.hint?.message ?? ""}</div>
              </div>
            )}

            {vaultLastReveal && (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
                <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Unlocked</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  Bonus: <span className="font-semibold text-[var(--foreground)]">{vaultLastReveal?.outcome?.label ?? "—"}</span>
                </div>
              </div>
            )}

            {vaultActions.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                No vaults yet.
              </div>
            ) : (
              <div className="mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)]">
                {vaultActions.map((a) => {
                  const isReady = a.status === "ready";
                  const isHintReady = a.status === "hint_ready";
                  const isDue = a.status === "scheduled" && a.resolves_at ? new Date(a.resolves_at).getTime() <= Date.now() : false;
                  const canReveal = isReady || isDue;
                  const asset = assets.find((x) => x.id === String(a.input_json?.asset_id ?? ""))?.symbol ?? "Asset";
                  const amount = String(a.input_json?.amount ?? "");
                  const dur = Number(a.input_json?.duration_hours ?? 0);

                  return (
                    <div key={a.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--foreground)]">
                          {asset} · {amount || "—"} · {dur ? `${dur}h` : "—"}
                        </div>
                        <div className="mt-1 text-xs text-[var(--muted)]">
                          Status: <span className="font-semibold text-[var(--foreground)]">{a.status}</span>
                          {a.resolves_at ? <span> · unlocks {new Date(a.resolves_at).toLocaleString()}</span> : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          className={buttonClassName({ variant: isHintReady ? "secondary" : "ghost", size: "xs" })}
                          onClick={() => hintVault(a.id)}
                          disabled={!isHintReady || vaultHintLoadingId === a.id}
                        >
                          {vaultHintLoadingId === a.id ? "Hint…" : "Hint"}
                        </button>
                        <button
                          className={buttonClassName({ variant: canReveal ? "primary" : "secondary", size: "xs" })}
                          onClick={() => revealVault(a.id)}
                          disabled={!canReveal || vaultRevealLoadingId === a.id || a.status === "resolved"}
                        >
                          {vaultRevealLoadingId === a.id ? "Revealing…" : a.status === "resolved" ? "Resolved" : "Reveal"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Next</div>
        <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">More modules will plug into the same engine</div>
        <div className="mt-1 text-xs text-[var(--muted)]">
          Time vaults, multi-stage reveals, crafting, progression tiers, community events, and AI packs will reuse the same
          action log, fairness proof, and inventory system.
        </div>
        <div className="mt-4">
          <a href="/arcade/transparency" className="text-xs font-semibold text-[var(--accent)] hover:underline">
            View transparency dashboard →
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Safety & export</div>
            <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">Control your arcade usage</div>
            <div className="mt-1 text-xs text-[var(--muted)]">Self-exclusion and daily limits are enforced server-side.</div>
          </div>
          <a
            className={buttonClassName({ variant: "secondary", size: "xs" })}
            href="/api/arcade/export"
            target="_blank"
            rel="noreferrer"
          >
            Download export
          </a>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Self-exclusion</div>
            <div className="mt-2 text-xs text-[var(--muted)]">
              Current: <span className="font-mono text-[var(--foreground)]">{safety?.self_excluded_until ?? "off"}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--foreground)]"
                type="number"
                min={0}
                max={24 * 365}
                value={selfExcludeHours}
                onChange={(e) => setSelfExcludeHours(Math.max(0, Math.floor(Number(e.target.value || 0))))}
              />
              <span className="text-xs text-[var(--muted)]">hours</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Daily actions</div>
            <div className="mt-2 text-xs text-[var(--muted)]">0 or blank disables.</div>
            <input
              className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--foreground)]"
              inputMode="numeric"
              value={dailyActionLimit}
              onChange={(e) => setDailyActionLimit(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 50"
            />
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Daily shard spend</div>
            <div className="mt-2 text-xs text-[var(--muted)]">0 or blank disables.</div>
            <input
              className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--foreground)]"
              inputMode="numeric"
              value={dailyShardSpendLimit}
              onChange={(e) => setDailyShardSpendLimit(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 500"
            />
          </div>
        </div>

        {safetyError ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] px-4 py-3 text-xs text-[var(--foreground)]">
            Error: <span className="font-semibold">{safetyError}</span>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className={buttonClassName({ variant: "ghost", size: "xs" })}
            onClick={refreshSafety}
            disabled={safetyLoading}
          >
            {safetyLoading ? "…" : "Reload"}
          </button>
          <button
            className={buttonClassName({ variant: "primary", size: "xs" })}
            onClick={saveSafety}
            disabled={safetyLoading}
          >
            {safetyLoading ? "Saving…" : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}
