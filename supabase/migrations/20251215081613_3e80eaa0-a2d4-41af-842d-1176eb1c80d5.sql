-- Institution Prize Groups table for team/institution prizes
-- This is a separate Phase-2 module that does NOT touch the main allocator

CREATE TABLE IF NOT EXISTS public.institution_prize_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_by TEXT NOT NULL, -- 'school', 'academy', 'city', 'state', 'club', etc.
  team_size INT NOT NULL CHECK (team_size > 0),
  female_slots INT NOT NULL DEFAULT 0 CHECK (female_slots >= 0),
  male_slots INT NOT NULL DEFAULT 0 CHECK (male_slots >= 0),
  scoring_mode TEXT NOT NULL DEFAULT 'by_top_k_score', -- 'by_top_k_score', 'by_top_k_rank', etc.
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT institution_prize_groups_slots_check CHECK (female_slots + male_slots <= team_size)
);

-- Institution Prizes table for prizes within each group
CREATE TABLE IF NOT EXISTS public.institution_prizes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.institution_prize_groups(id) ON DELETE CASCADE,
  place INT NOT NULL CHECK (place > 0),
  cash_amount INT NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  has_trophy BOOLEAN NOT NULL DEFAULT false,
  has_medal BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.institution_prize_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_prizes ENABLE ROW LEVEL SECURITY;

-- RLS policies for institution_prize_groups (same pattern as categories)
CREATE POLICY "org_institution_prize_groups_access"
ON public.institution_prize_groups
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tournaments t
    WHERE t.id = institution_prize_groups.tournament_id
    AND (t.owner_id = auth.uid() OR has_role(auth.uid(), 'master'::app_role))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tournaments t
    WHERE t.id = institution_prize_groups.tournament_id
    AND (t.owner_id = auth.uid() OR has_role(auth.uid(), 'master'::app_role))
  )
);

CREATE POLICY "anon_read_published_institution_prize_groups"
ON public.institution_prize_groups
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tournaments t
    WHERE t.id = institution_prize_groups.tournament_id
    AND t.is_published = true
  )
);

-- RLS policies for institution_prizes (same pattern as prizes)
CREATE POLICY "org_institution_prizes_access"
ON public.institution_prizes
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM institution_prize_groups g
    JOIN tournaments t ON t.id = g.tournament_id
    WHERE g.id = institution_prizes.group_id
    AND (t.owner_id = auth.uid() OR has_role(auth.uid(), 'master'::app_role))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM institution_prize_groups g
    JOIN tournaments t ON t.id = g.tournament_id
    WHERE g.id = institution_prizes.group_id
    AND (t.owner_id = auth.uid() OR has_role(auth.uid(), 'master'::app_role))
  )
);

CREATE POLICY "anon_read_published_institution_prizes"
ON public.institution_prizes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM institution_prize_groups g
    JOIN tournaments t ON t.id = g.tournament_id
    WHERE g.id = institution_prizes.group_id
    AND t.is_published = true
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_institution_prize_groups_tournament_id 
ON public.institution_prize_groups(tournament_id);

CREATE INDEX IF NOT EXISTS idx_institution_prizes_group_id 
ON public.institution_prizes(group_id);