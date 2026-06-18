# P1-4A Template RLS Policy Cleanup — 2026-06-15

## Status

P1-4A is implemented in the repository by adding one Supabase migration that drops exactly three redundant organizer-only template RLS policies. Broad P1-4 remains open until production deployment and post-deploy validation confirm that organizer and admin template flows still work.

## Scope

Changed policy surface is limited to these three dropped subset policies:

1. `Organizers can manage their event template links` on `public.event_certificate_templates`
2. `Organizers can manage their template versions` on `public.template_versions`
3. `Organizers can manage their own templates` on `public.templates`

No `claim_requests`, `certificates`, `events`, `user_roles`, `admin_bootstrap`, `storage.objects`, `certificate-pdfs`, `certificate-backgrounds`, or `avatars` policies are changed by this slice.

## Redundancy rationale

| Table | Dropped organizer-only subset policy | Retained organizer-or-admin superset policy | Why redundant |
| --- | --- | --- | --- |
| `public.event_certificate_templates` | `Organizers can manage their event template links` | `ect_org_or_admin_all` | The retained policy preserves organizer access and also covers admin access, so the organizer-only policy is a strict subset. |
| `public.template_versions` | `Organizers can manage their template versions` | `template_versions_org_or_admin_all` | The retained policy preserves organizer access and also covers admin access, so the organizer-only policy is a strict subset. |
| `public.templates` | `Organizers can manage their own templates` | `templates_org_or_admin_all` | The retained policy preserves organizer access and also covers admin access, so the organizer-only policy is a strict subset. |

## Post-deploy validation

Run the production policy inventory checks and validate product behavior after deploying the migration:

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('event_certificate_templates', 'template_versions', 'templates')
ORDER BY tablename, policyname;
```

Expected results:

- The three dropped organizer-only policy names are absent.
- `ect_org_or_admin_all` remains present on `public.event_certificate_templates`.
- `template_versions_org_or_admin_all` remains present on `public.template_versions`.
- `templates_org_or_admin_all` remains present on `public.templates`.
- Organizer template/editor flows continue to work.
- Admin `/admin` and admin template access continue to work.

## Rollback SQL

If production validation shows unexpected template access regressions, recreate the three dropped policies with the pre-change live definitions below:

```sql
CREATE POLICY "Organizers can manage their event template links"
ON public.event_certificate_templates
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_certificate_templates.event_id
      AND e.organizer_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_certificate_templates.event_id
      AND e.organizer_id = auth.uid()
  )
);

CREATE POLICY "Organizers can manage their template versions"
ON public.template_versions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.templates t
    WHERE t.id = template_versions.template_id
      AND t.organizer_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.templates t
    WHERE t.id = template_versions.template_id
      AND t.organizer_id = auth.uid()
  )
);

CREATE POLICY "Organizers can manage their own templates"
ON public.templates
FOR ALL
TO authenticated
USING (organizer_id = auth.uid())
WITH CHECK (organizer_id = auth.uid());
```
