create table public.nutrition_targets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  calories integer not null,
  protein integer not null,
  carbs integer not null,
  fat integer not null,
  revision bigint not null,
  updated_at timestamptz not null,
  last_mutation_id uuid not null,
  constraint nutrition_targets_calories_range
    check (calories between 500 and 10000),
  constraint nutrition_targets_protein_range
    check (protein between 1 and 1000),
  constraint nutrition_targets_carbs_range
    check (carbs between 1 and 1000),
  constraint nutrition_targets_fat_range
    check (fat between 1 and 1000),
  constraint nutrition_targets_revision_positive
    check (revision > 0)
);

alter table public.nutrition_targets enable row level security;

revoke all on table public.nutrition_targets from public;
revoke all on table public.nutrition_targets from anon;
revoke all on table public.nutrition_targets from authenticated;
grant select on table public.nutrition_targets to authenticated;

create policy "Authenticated users can read their nutrition targets"
on public.nutrition_targets
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.apply_nutrition_targets(
  p_calories integer,
  p_protein integer,
  p_carbs integer,
  p_fat integer,
  p_base_revision bigint,
  p_mutation_id uuid
)
returns public.nutrition_targets
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_current public.nutrition_targets%rowtype;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if
    p_calories is null or p_calories not between 500 and 10000 or
    p_protein is null or p_protein not between 1 and 1000 or
    p_carbs is null or p_carbs not between 1 and 1000 or
    p_fat is null or p_fat not between 1 and 1000 or
    p_base_revision is null or p_base_revision < 0 or
    p_mutation_id is null
  then
    raise exception 'invalid_nutrition_targets' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select *
  into v_current
  from public.nutrition_targets
  where user_id = v_user_id;

  if found then
    if v_current.last_mutation_id = p_mutation_id then
      return v_current;
    end if;

    if v_current.revision <> p_base_revision then
      raise exception 'nutrition_targets_conflict' using errcode = '40001';
    end if;

    update public.nutrition_targets
    set
      calories = p_calories,
      protein = p_protein,
      carbs = p_carbs,
      fat = p_fat,
      revision = v_current.revision + 1,
      updated_at = pg_catalog.clock_timestamp(),
      last_mutation_id = p_mutation_id
    where user_id = v_user_id
    returning * into v_current;

    return v_current;
  end if;

  if p_base_revision <> 0 then
    raise exception 'nutrition_targets_conflict' using errcode = '40001';
  end if;

  insert into public.nutrition_targets (
    user_id,
    calories,
    protein,
    carbs,
    fat,
    revision,
    updated_at,
    last_mutation_id
  )
  values (
    v_user_id,
    p_calories,
    p_protein,
    p_carbs,
    p_fat,
    1,
    pg_catalog.clock_timestamp(),
    p_mutation_id
  )
  returning * into v_current;

  return v_current;
end;
$function$;

revoke all on function public.apply_nutrition_targets(
  integer,
  integer,
  integer,
  integer,
  bigint,
  uuid
) from public;
revoke all on function public.apply_nutrition_targets(
  integer,
  integer,
  integer,
  integer,
  bigint,
  uuid
) from anon;
grant execute on function public.apply_nutrition_targets(
  integer,
  integer,
  integer,
  integer,
  bigint,
  uuid
) to authenticated;
