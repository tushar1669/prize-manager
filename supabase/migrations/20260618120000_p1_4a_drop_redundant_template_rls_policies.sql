-- P1-4A: Remove redundant organizer-only template RLS subset policies.
-- Scope is limited to the three legacy organizer-only template policies below.
-- Organizer and admin access is retained by the newer superset policies:
--   public.event_certificate_templates: ect_org_or_admin_all
--   public.template_versions: template_versions_org_or_admin_all
--   public.templates: templates_org_or_admin_all

DROP POLICY IF EXISTS "Organizers can manage their event template links"
ON public.event_certificate_templates;

DROP POLICY IF EXISTS "Organizers can manage their template versions"
ON public.template_versions;

DROP POLICY IF EXISTS "Organizers can manage their own templates"
ON public.templates;
