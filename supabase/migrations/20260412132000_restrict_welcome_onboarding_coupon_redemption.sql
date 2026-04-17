-- Phase 3: onboarding coupon can only redeem for tournaments with more than 150 players.
CREATE OR REPLACE FUNCTION public.redeem_coupon_for_tournament(code text, tournament_id uuid, amount_before integer)
RETURNS TABLE(amount_after integer, discount_amount integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_coupon public.coupons%rowtype;
  v_user_id uuid;
  v_discount integer := 0;
  v_after integer := 0;
  v_total integer := 0;
  v_user_total integer := 0;
  v_code text;
  v_owner_id uuid;
  v_redemption_id uuid;
  v_now timestamptz := now();
  v_players_count integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if amount_before is null or amount_before < 0 then raise exception 'invalid_amount_before'; end if;

  select t.owner_id into v_owner_id
  from public.tournaments t
  where t.id = redeem_coupon_for_tournament.tournament_id
  for update;

  if not found then raise exception 'tournament_not_found'; end if;

  if not (v_owner_id = v_user_id or public.has_role(v_user_id,'master'::public.app_role)) then
    raise exception 'not_authorized_for_tournament';
  end if;

  v_code := upper(trim(code));
  if v_code is null or v_code = '' then raise exception 'missing_code'; end if;

  select * into v_coupon
  from public.coupons c
  where c.code = v_code and c.applies_to='tournament_pro'
  for update;

  if not found then raise exception 'coupon_not_found'; end if;
  if not v_coupon.is_active then raise exception 'coupon_inactive'; end if;
  if v_coupon.starts_at is not null and v_now < v_coupon.starts_at then raise exception 'coupon_not_started'; end if;
  if v_coupon.ends_at is not null and v_now > v_coupon.ends_at then raise exception 'coupon_expired'; end if;
  if v_coupon.issued_to_user_id is not null and v_coupon.issued_to_user_id <> v_user_id then
    raise exception 'coupon_not_issued_to_user';
  end if;

  -- Restrict only onboarding welcome coupons to tournaments above 150 players.
  if coalesce(v_coupon.origin, '') = 'welcome_onboarding' then
    select count(*)::integer
    into v_players_count
    from public.players p
    where p.tournament_id = redeem_coupon_for_tournament.tournament_id;

    if v_players_count <= 150 then
      raise exception 'welcome_coupon_requires_more_than_150_players';
    end if;
  end if;

  select count(*) into v_total from public.coupon_redemptions cr where cr.coupon_id = v_coupon.id;
  if v_coupon.max_redemptions is not null and v_total >= v_coupon.max_redemptions then
    raise exception 'max_redemptions_reached';
  end if;

  select count(*) into v_user_total
  from public.coupon_redemptions cr
  where cr.coupon_id = v_coupon.id and cr.redeemed_by_user_id = v_user_id;

  if v_coupon.max_redemptions_per_user is not null and v_user_total >= v_coupon.max_redemptions_per_user then
    raise exception 'max_redemptions_per_user_reached';
  end if;

  if v_coupon.discount_type = 'percent' then
    v_discount := floor((amount_before::numeric * v_coupon.discount_value::numeric)/100.0)::integer;
  elsif v_coupon.discount_type = 'amount' then
    v_discount := least(amount_before, v_coupon.discount_value);
  elsif v_coupon.discount_type = 'fixed_price' then
    v_after := least(amount_before, v_coupon.discount_value);
    v_discount := amount_before - v_after;
  else
    raise exception 'invalid_discount_type';
  end if;

  v_discount := greatest(0, least(v_discount, amount_before));
  v_after := amount_before - v_discount;

  insert into public.coupon_redemptions(
    coupon_id, redeemed_by_user_id, issued_to_user_id, issued_to_email,
    tournament_id, amount_before, discount_amount, amount_after, meta
  )
  values(
    v_coupon.id, v_user_id, v_coupon.issued_to_user_id, v_coupon.issued_to_email,
    redeem_coupon_for_tournament.tournament_id, amount_before, v_discount, v_after,
    jsonb_build_object('code', v_coupon.code, 'applies_to', v_coupon.applies_to, 'source', 'redeem_coupon_for_tournament')
  )
  returning id into v_redemption_id;

  if v_after = 0 then
    insert into public.tournament_entitlements(tournament_id, owner_id, source, source_ref, starts_at, ends_at)
    values (redeem_coupon_for_tournament.tournament_id, v_owner_id, 'coupon', v_redemption_id, v_now, v_now + interval '365 days');

    -- Issue referral rewards when coupon gives free upgrade
    PERFORM public.issue_referral_rewards(v_user_id, redeem_coupon_for_tournament.tournament_id);
  end if;

  return query select v_after, v_discount, 'redeemed';
end;
$$;
