-- Real additive migration and draft RPC must be loaded before seeding.
INSERT INTO public.tournaments(id,owner_id) VALUES
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010');
INSERT INTO public.categories(id,tournament_id,is_active) VALUES
('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',true);
INSERT INTO public.prizes(id,category_id,is_active) VALUES
('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',true);
INSERT INTO public.players(id,tournament_id,points,club) VALUES
('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001',5,'Club A'),
('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',4,'Club A');
INSERT INTO public.institution_prize_groups
(id,tournament_id,name,group_by,team_size,female_slots,male_slots,scoring_mode,is_active,ranking_rules)
VALUES ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001',
'Synthetic Club Prize','club',2,0,0,'by_top_k_score',true,
'{"organizer_confirmed":true,"published_reference":"fixture-regulation-1","criteria":[{"kind":"total_points"}]}'::jsonb);
INSERT INTO public.institution_prizes
(id,group_id,place,cash_amount,has_trophy,has_medal,is_active)
VALUES ('00000000-0000-4000-8000-000000000007',
'00000000-0000-4000-8000-000000000006',1,100,true,false,true);
INSERT INTO public.publications VALUES('00000000-0000-4000-8000-000000000001',0,false);

CREATE FUNCTION qa.submit_version(
  expected integer, actor uuid DEFAULT '00000000-0000-4000-8000-000000000010',
  points numeric DEFAULT 9, with_ruling boolean DEFAULT true
) RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  WITH ruling AS (
    SELECT jsonb_build_object(
      'schema_version',2, 'group_id','00000000-0000-4000-8000-000000000006',
      'allocation_version',expected+1,'supersedes_allocation_version',expected,
      'actor_id',actor::text,'method','documented_arbiter_ruling',
      'regulation_reference','fixture-regulation-1',
      'arbiter_decision_reference','synthetic-arbiter-1',
      'explanation','Synthetic tie reviewed by test fixture',
      'affected_places',jsonb_build_array(1),
      'award_instructions',jsonb_build_array(jsonb_build_object('place',1,'institution_key','Club A'))
    ) AS entry
  ), award AS (
    SELECT jsonb_build_object(
      'group_id','00000000-0000-4000-8000-000000000006',
      'prize_id','00000000-0000-4000-8000-000000000007','place',1,
      'institution_key','Club A','total_points',points,
      'player_ids',jsonb_build_array('00000000-0000-4000-8000-000000000004',
                                   '00000000-0000-4000-8000-000000000005'),
      'player_snapshot',jsonb_build_array(
         jsonb_build_object('player_id','00000000-0000-4000-8000-000000000004','points',5),
         jsonb_build_object('player_id','00000000-0000-4000-8000-000000000005','points',4)),
      'ranking_snapshot',jsonb_build_object(
         'schema_version',2,'group_id','00000000-0000-4000-8000-000000000006',
         'winner_key','Club A','allocation_version',expected+1,
         'finalized_by',actor::text,
         'declared_rules',g.ranking_rules,
         'group_rule',jsonb_build_object('group_by','club','team_size',2,
                                        'female_slots',0,'male_slots',0,
                                        'scoring_mode','by_top_k_score'),
         'award',jsonb_build_object(
           'id','00000000-0000-4000-8000-000000000007',
           'cash_amount',100,'has_trophy',true,'has_medal',false)
      ) || CASE WHEN with_ruling
        THEN jsonb_build_object('ruling',r.entry)
        ELSE '{}'::jsonb END
    ) AS entry FROM ruling r CROSS JOIN public.institution_prize_groups g
    WHERE g.id='00000000-0000-4000-8000-000000000006'
  )
  SELECT public.commit_team_v2_adjudicated_version(
    '00000000-0000-4000-8000-000000000001', expected, actor,
    '[{"prize_id":"00000000-0000-4000-8000-000000000003",
       "player_id":"00000000-0000-4000-8000-000000000004",
       "reason_codes":["synthetic"],"is_manual":false}]'::jsonb,
    (SELECT jsonb_build_array(entry) FROM award),
    CASE WHEN with_ruling
      THEN (SELECT jsonb_build_array(entry) FROM ruling)
      ELSE '[]'::jsonb END
  );
$$;
GRANT EXECUTE ON FUNCTION qa.submit_version(integer,uuid,numeric,boolean) TO service_role, authenticated;
