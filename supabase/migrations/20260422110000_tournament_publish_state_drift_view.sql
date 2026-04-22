-- Read-only observability view for publish-state drift across tournaments/publications.
create or replace view public.tournament_publish_state_drift
with (security_invoker = true)
as
with publication_state as (
  select
    p.tournament_id,
    count(*) filter (where p.is_active) as active_publication_count,
    bool_or(p.is_active) as has_active_publication
  from public.publications p
  group by p.tournament_id
)
select
  t.id as tournament_id,
  t.title as tournament_title,
  t.owner_id,
  t.status,
  t.is_published,
  coalesce(ps.has_active_publication, false) as has_active_publication,
  coalesce(ps.active_publication_count, 0)::integer as active_publication_count,
  (t.is_published is distinct from (t.status = 'published')) as flags_disagree,
  (coalesce(ps.has_active_publication, false) is distinct from t.is_published) as active_publication_disagrees,
  (
    (t.status = 'published' and (not t.is_published or not coalesce(ps.has_active_publication, false)))
    or (t.status <> 'published' and coalesce(ps.has_active_publication, false))
  ) as workflow_inconsistent
from public.tournaments t
left join publication_state ps on ps.tournament_id = t.id
where
  (t.is_published is distinct from (t.status = 'published'))
  or (coalesce(ps.has_active_publication, false) is distinct from t.is_published)
  or (
    (t.status = 'published' and (not t.is_published or not coalesce(ps.has_active_publication, false)))
    or (t.status <> 'published' and coalesce(ps.has_active_publication, false))
  );

grant select on public.tournament_publish_state_drift to authenticated;

comment on view public.tournament_publish_state_drift is
  'Read-only admin observability for publish-state drift between tournaments.is_published, tournaments.status, and publications.is_active.';
