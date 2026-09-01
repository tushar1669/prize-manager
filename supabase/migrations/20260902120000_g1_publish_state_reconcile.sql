-- =============================================================================
-- 20260902120000_g1_publish_state_reconcile.sql
-- Batch G1 — publish-state reconciliation (X1/X2/X3-exposure)
--
-- DEFECT (measured 2 Sep 2026, not deduced):
--   Three booleans describe one state: tournaments.is_published,
--   tournaments.status, publications.is_active.  Four PUBLIC-role RLS policies
--   read the WRONG two of them, so an unpublished tournament stays readable by
--   an unauthenticated caller.  Measured as anon against 34f8cdf1 while
--   is_published = false:  tournaments=1 (title readable), publications=1,
--   allocations=444, prizes=148.  players=0 (already correct — reference shape).
--
-- CAUSE (identified, not assumed):
--   NOT unpublish_tournament(), which is correct: it clears is_active AND sets
--   status='draft'.  The 7 drifted rows all carry status='published' — a value
--   that RPC cannot leave behind.  Cause is AdminTournaments.tsx:159, a raw
--   client `supabase.from("tournaments").update(...)`; its hide / archive /
--   softDelete actions set is_published:false and touch nothing else.  All 7
--   drifted rows are is_archived=true, none soft-deleted; five were archived in
--   a single session on 2026-06-13.
--
-- WHY RE-KEY RATHER THAN DROP (PROJECT_STATE §13 offered "drop in favour of the
--   is_published-gated sibling"):
--   The siblings anon_read_published_* are restricted to role `anon`.  The
--   policies below are role PUBLIC.  A signed-in visitor who is neither owner
--   nor master reads public results ONLY through the PUBLIC policies.  Dropping
--   them would break every signed-in visitor.  Roles are left untouched; only
--   the USING clause changes.
--
-- SAFE BECAUSE (measured): 36 tournaments have is_published=true, 43 have
--   status='published', difference exactly 7, and ZERO rows have
--   is_published=true with status<>'published'.  The sets nest, so re-keying
--   strictly NARROWS and cannot widen.  0 published rows are archived or
--   soft-deleted, so is_published alone currently equals the three-condition
--   gate used by the public view published_tournaments.
--
-- Guardrail 1: this alters an RLS policy ON the allocations table.  It does not
--   touch the allocation engine, rule_config, conflicts or player-to-prize
--   matching.  Explicitly authorised by Tushar, 2 Sep 2026.
--
-- One transaction.  Aborts loudly on any pre-flight or post-check mismatch.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Probes captured BEFORE the backfill, because the negative probe's defining
-- condition (active publication + is_published=false) is destroyed by it.
-- ---------------------------------------------------------------------------
create temp table _g1_probe on commit drop as
select
  (select t.id
     from public.tournaments t
    where not t.is_published
      and exists (select 1 from public.publications p
                   where p.tournament_id = t.id and p.is_active)
    order by t.id limit 1)                                            as bad_id,
  (select t.id
     from public.tournaments t
    where t.is_published
      and exists (select 1 from public.allocations a where a.tournament_id = t.id)
      and exists (select 1 from public.prizes pr
                    join public.categories c on c.id = pr.category_id
                   where c.tournament_id = t.id)
      and exists (select 1 from public.players pl where pl.tournament_id = t.id)
    order by t.id limit 1)                                            as good_id;

-- ---------------------------------------------------------------------------
-- PRE-FLIGHT — assert the audited state.  Abort on any surprise.
-- ---------------------------------------------------------------------------
do $pre$
declare
  n_drift      int;
  n_drift_arch int;
  n_drift_del  int;
  n_pub_true   int;
  n_status_pub int;
  n_nest_break int;
  n_pub_arch   int;
  n_players_pol int;
  v_bad uuid; v_good uuid;
  miss text := '';
  function_ok boolean;
begin
  -- the four policies must exist by name, on the expected tables
  if not exists (select 1 from pg_policy where polname='public_read_published_allocations'
                   and polrelid='public.allocations'::regclass)   then miss := miss||' allocations'; end if;
  if not exists (select 1 from pg_policy where polname='public_read_published_prizes'
                   and polrelid='public.prizes'::regclass)        then miss := miss||' prizes'; end if;
  if not exists (select 1 from pg_policy where polname='public_read_active_publications'
                   and polrelid='public.publications'::regclass)  then miss := miss||' publications'; end if;
  if not exists (select 1 from pg_policy where polname='anyone_read_published_tournaments'
                   and polrelid='public.tournaments'::regclass)   then miss := miss||' tournaments'; end if;
  if miss <> '' then
    raise exception 'G1 PRE-FLIGHT: expected policy missing on:%. Schema has moved since the 2 Sep audit — re-audit before running.', miss;
  end if;

  -- unpublish_tournament must still exist; G2 will route the admin UI into it
  select count(*) = 1 into function_ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='unpublish_tournament';
  if not function_ok then
    raise exception 'G1 PRE-FLIGHT: public.unpublish_tournament is missing or overloaded.';
  end if;

  select count(*) into n_drift
    from public.tournaments t
    join public.publications p on p.tournament_id = t.id and p.is_active
   where not t.is_published;

  select count(*) into n_drift_arch
    from public.tournaments t
    join public.publications p on p.tournament_id = t.id and p.is_active
   where not t.is_published and t.is_archived;

  select count(*) into n_drift_del
    from public.tournaments t
    join public.publications p on p.tournament_id = t.id and p.is_active
   where not t.is_published and t.deleted_at is not null;

  select count(*) into n_pub_true   from public.tournaments where is_published;
  select count(*) into n_status_pub from public.tournaments where status = 'published';
  select count(*) into n_nest_break from public.tournaments
   where is_published and status is distinct from 'published';
  select count(*) into n_pub_arch   from public.tournaments
   where is_published and (is_archived or deleted_at is not null);

  -- players is the reference shape: it must carry NO publications-keyed policy
  select count(*) into n_players_pol
    from pg_policy
   where polrelid='public.players'::regclass
     and pg_get_expr(polqual, polrelid) ilike '%publications%';

  select bad_id, good_id into v_bad, v_good from _g1_probe;

  if n_drift = 0 then
    raise exception 'G1 PRE-FLIGHT: zero drifted rows found. Expected >0 (7 on 2 Sep). Either this already ran, or the audit is stale.';
  end if;
  if n_drift <> n_drift_arch then
    raise exception 'G1 PRE-FLIGHT: % drifted rows but only % are archived. The 2 Sep finding was that archive is the sole cause; a non-archived drifted row means a SECOND cause exists. Stop and investigate.', n_drift, n_drift_arch;
  end if;
  if n_drift_del <> 0 then
    raise exception 'G1 PRE-FLIGHT: % drifted rows are soft-deleted. Not seen on 2 Sep. Stop and investigate.', n_drift_del;
  end if;
  if n_nest_break <> 0 then
    raise exception 'G1 PRE-FLIGHT: % rows have is_published=true with status<>published. Re-keying the tournaments policy onto is_published would REVOKE public read from those rows. Stop.', n_nest_break;
  end if;
  if n_pub_arch <> 0 then
    raise exception 'G1 PRE-FLIGHT: % published rows are archived or soft-deleted. The public view published_tournaments hides them but an is_published-only policy would not. Decide the gate before proceeding.', n_pub_arch;
  end if;
  if n_players_pol <> 0 then
    raise exception 'G1 PRE-FLIGHT: players carries a publications-keyed policy. It is the reference shape and must not.';
  end if;
  if v_bad is null then
    raise exception 'G1 PRE-FLIGHT: no negative probe available.';
  end if;
  if v_good is null then
    raise exception 'G1 PRE-FLIGHT: no positive probe with allocations AND prizes AND players. A matched pair whose positive side cannot produce a positive proves nothing (BB4). Stop.';
  end if;

  raise notice 'G1 pre-flight OK: drift=% (all archived), is_published=%, status=published %, probes bad=% good=%',
    n_drift, n_pub_true, n_status_pub, v_bad, v_good;
end $pre$;

-- ---------------------------------------------------------------------------
-- STEP 1 — re-key the four PUBLIC policies onto tournaments.is_published.
-- Roles are deliberately unchanged.  After this step is_published is the only
-- security-relevant flag, which is what makes the STEP 2 backfill hygiene
-- rather than the fix, and lets the AdminTournaments.tsx repair land in G2.
-- ---------------------------------------------------------------------------

alter policy public_read_published_allocations on public.allocations
  using (
    exists (
      select 1 from public.tournaments t
       where t.id = allocations.tournament_id
         and t.is_published
    )
  );

alter policy public_read_published_prizes on public.prizes
  using (
    exists (
      select 1
        from public.categories c
        join public.tournaments t on t.id = c.tournament_id
       where c.id = prizes.category_id
         and t.is_published
    )
  );

alter policy public_read_active_publications on public.publications
  using (
    is_active
    and exists (
      select 1 from public.tournaments t
       where t.id = publications.tournament_id
         and t.is_published
    )
  );

alter policy anyone_read_published_tournaments on public.tournaments
  using (is_published);

-- ---------------------------------------------------------------------------
-- STEP 2 — reconcile the drifted rows to the state unpublish_tournament()
-- would have written.  Hygiene, not the security fix.
-- ---------------------------------------------------------------------------

update public.publications p
   set is_active = false
  from public.tournaments t
 where t.id = p.tournament_id
   and p.is_active
   and not t.is_published;

update public.tournaments t
   set status = 'draft'
 where not t.is_published
   and t.status = 'published';

-- ---------------------------------------------------------------------------
-- POST-CHECK — matched pair, read as anon inside this transaction, BEFORE
-- commit.  Both sides must be non-zero on the positive or the fixture is
-- broken and the negative result means nothing.
-- ---------------------------------------------------------------------------
do $post$
declare
  v_bad uuid; v_good uuid;
  bt int; bp int; ba int; bz int;
  gt int; gp int; ga int; gz int; gl int;
  n_drift int; n_status int;
  fails text := '';
begin
  select bad_id, good_id into v_bad, v_good from _g1_probe;

  select count(*) into n_drift
    from public.tournaments t
    join public.publications p on p.tournament_id = t.id and p.is_active
   where not t.is_published;
  select count(*) into n_status from public.tournaments
   where not is_published and status = 'published';

  if n_drift  <> 0 then fails := fails || format(E'\n  - %s rows still have is_published=false with an active publication', n_drift); end if;
  if n_status <> 0 then fails := fails || format(E'\n  - %s rows still have is_published=false with status=published', n_status); end if;

  set local role anon;
  select count(*) into bt from public.tournaments  where id = v_bad;
  select count(*) into bp from public.publications where tournament_id = v_bad;
  select count(*) into ba from public.allocations  where tournament_id = v_bad;
  select count(*) into bz from public.prizes pr join public.categories c on c.id = pr.category_id
                          where c.tournament_id = v_bad;

  select count(*) into gt from public.tournaments  where id = v_good;
  select count(*) into gp from public.publications where tournament_id = v_good;
  select count(*) into ga from public.allocations  where tournament_id = v_good;
  select count(*) into gz from public.prizes pr join public.categories c on c.id = pr.category_id
                          where c.tournament_id = v_good;
  select count(*) into gl from public.players      where tournament_id = v_good;
  reset role;

  -- negative side: an unpublished tournament must be invisible
  if bt <> 0 then fails := fails || format(E'\n  - anon still reads the tournament row (%s) for unpublished %s', bt, v_bad); end if;
  if bp <> 0 then fails := fails || format(E'\n  - anon still reads %s publication rows for unpublished %s', bp, v_bad); end if;
  if ba <> 0 then fails := fails || format(E'\n  - anon still reads %s allocation rows for unpublished %s', ba, v_bad); end if;
  if bz <> 0 then fails := fails || format(E'\n  - anon still reads %s prize rows for unpublished %s', bz, v_bad); end if;

  -- positive side: a published tournament must still be fully readable
  if gt = 0 then fails := fails || E'\n  - REGRESSION: anon can no longer read the published tournament row'; end if;
  if gp = 0 then fails := fails || E'\n  - REGRESSION: anon can no longer read the published publication row'; end if;
  if ga = 0 then fails := fails || E'\n  - REGRESSION: anon can no longer read published allocations'; end if;
  if gz = 0 then fails := fails || E'\n  - REGRESSION: anon can no longer read published prizes'; end if;
  if gl = 0 then fails := fails || E'\n  - REGRESSION: anon can no longer read published players (policy untouched — investigate)'; end if;

  if fails <> '' then
    raise exception E'G1 POST-CHECK FAILED — rolling back.%\n\nnegative % : tournaments=% publications=% allocations=% prizes=%\npositive % : tournaments=% publications=% allocations=% prizes=% players=%',
      fails, v_bad, bt, bp, ba, bz, v_good, gt, gp, ga, gz, gl;
  end if;

  raise notice E'G1 POST-CHECK PASSED\n  negative % : tournaments=% publications=% allocations=% prizes=%\n  positive % : tournaments=% publications=% allocations=% prizes=% players=%',
    v_bad, bt, bp, ba, bz, v_good, gt, gp, ga, gz, gl;
end $post$;

commit;
