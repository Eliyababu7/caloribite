-- Phase 5A.2: database contract only. No application synchronization is enabled.
create table public.food_log_sync_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  revision bigint not null default 0
    check (revision between 0 and 9007199254740991)
);

create table public.food_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  food_name text not null check (
    pg_catalog.char_length(food_name) between 1 and 300 and food_name ~ '[^[:space:]]'
  ),
  calories double precision not null check (calories >= 0 and calories < 'Infinity'::double precision),
  protein double precision not null check (protein >= 0 and protein < 'Infinity'::double precision),
  carbs double precision not null check (carbs >= 0 and carbs < 'Infinity'::double precision),
  fat double precision not null check (fat >= 0 and fat < 'Infinity'::double precision),
  meal_type text not null check (meal_type in ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
  client_created_at timestamptz not null check (
    client_created_at >= timestamptz '0100-01-01 00:00:00+00' and
    client_created_at < timestamptz '10000-01-01 00:00:00+00'
  ),
  logged_date date not null check (logged_date between date '0100-01-01' and date '9999-12-31'),
  legacy_local_id text,
  originating_device_id uuid,
  server_revision bigint not null check (server_revision between 1 and 9007199254740991),
  received_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  last_mutation_id uuid not null,
  primary key (user_id, id),
  unique (user_id, server_revision),
  constraint food_logs_server_timestamps_valid check (
    received_at >= timestamptz '0100-01-01 00:00:00+00' and
    received_at < timestamptz '10000-01-01 00:00:00+00' and
    updated_at >= timestamptz '0100-01-01 00:00:00+00' and
    updated_at < timestamptz '10000-01-01 00:00:00+00' and
    (deleted_at is null or (
      deleted_at >= timestamptz '0100-01-01 00:00:00+00' and
      deleted_at < timestamptz '10000-01-01 00:00:00+00'
    ))
  )
);

-- The unique revision index also supports (user_id, server_revision) cursor scans.
create index food_logs_active_diary_date_idx
  on public.food_logs (user_id, logged_date, client_created_at desc, id)
  where deleted_at is null;

alter table public.food_logs enable row level security;
alter table public.food_log_sync_state enable row level security;
revoke all on table public.food_logs, public.food_log_sync_state from public, anon, authenticated;
grant select on table public.food_logs, public.food_log_sync_state to authenticated;

create policy food_logs_owner_read on public.food_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy food_log_sync_state_owner_read on public.food_log_sync_state
  for select to authenticated using ((select auth.uid()) = user_id);
-- No INSERT/UPDATE/DELETE policies: direct writes and hard deletes are denied.
-- Only the functions below may change records or allocate revisions.

-- Batch contract: [{id, mutation_id, kind: 'create'|'delete', snapshot: {
--   food_name, calories, protein, carbs, fat, meal_type, client_created_at,
--   logged_date, legacy_local_id?, originating_device_id?
-- }}]. The original snapshot is required even for offline delete-before-create.
create function public.apply_food_log_mutations(p_mutations jsonb)
returns setof public.food_logs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_item jsonb;
  v_snapshot jsonb;
  v_row public.food_logs%rowtype;
  v_current public.food_logs%rowtype;
  v_rows public.food_logs[] := array[]::public.food_logs[];
  v_kinds text[] := array[]::text[];
  v_mutation_ids uuid[] := array[]::uuid[];
  v_revision bigint;
  v_now timestamptz;
  v_index integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_mutations is null or pg_catalog.jsonb_typeof(p_mutations) <> 'array' then
    raise exception 'invalid_food_log_batch' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_mutations) not between 1 and 100 or
     pg_catalog.octet_length(p_mutations::text) > 1048576 then
    raise exception 'invalid_food_log_batch' using errcode = '22023';
  end if;

  -- Validate and stage the ENTIRE batch before inserting even the state row.
  for v_item in select value from pg_catalog.jsonb_array_elements(p_mutations) loop
    v_snapshot := v_item -> 'snapshot';
    if pg_catalog.jsonb_typeof(v_item) <> 'object' or
       (v_item - array['id', 'mutation_id', 'kind', 'snapshot']) <> '{}'::jsonb or
       not (v_item ?& array['id', 'mutation_id', 'kind', 'snapshot']) or
       pg_catalog.jsonb_typeof(v_item -> 'id') <> 'string' or
       pg_catalog.jsonb_typeof(v_item -> 'mutation_id') <> 'string' or
       (v_item ->> 'kind') is null or (v_item ->> 'kind') not in ('create', 'delete') or
       pg_catalog.jsonb_typeof(v_snapshot) is distinct from 'object' then
      raise exception 'invalid_food_log_mutation' using errcode = '22023';
    end if;
    if (v_snapshot - array['food_name', 'calories', 'protein', 'carbs', 'fat',
          'meal_type', 'client_created_at', 'logged_date', 'legacy_local_id', 'originating_device_id']) <> '{}'::jsonb or
       not (v_snapshot ?& array['food_name', 'calories', 'protein', 'carbs', 'fat',
          'meal_type', 'client_created_at', 'logged_date']) or
       pg_catalog.jsonb_typeof(v_snapshot -> 'food_name') <> 'string' or
       pg_catalog.jsonb_typeof(v_snapshot -> 'meal_type') <> 'string' or
       pg_catalog.jsonb_typeof(v_snapshot -> 'client_created_at') <> 'string' or
       pg_catalog.jsonb_typeof(v_snapshot -> 'logged_date') <> 'string' or
       pg_catalog.jsonb_typeof(v_snapshot -> 'calories') <> 'number' or
       pg_catalog.jsonb_typeof(v_snapshot -> 'protein') <> 'number' or
       pg_catalog.jsonb_typeof(v_snapshot -> 'carbs') <> 'number' or
       pg_catalog.jsonb_typeof(v_snapshot -> 'fat') <> 'number' or
       (v_snapshot ? 'legacy_local_id' and pg_catalog.jsonb_typeof(v_snapshot -> 'legacy_local_id') not in ('string', 'null')) or
       (v_snapshot ? 'originating_device_id' and pg_catalog.jsonb_typeof(v_snapshot -> 'originating_device_id') not in ('string', 'null')) then
      raise exception 'invalid_food_log_snapshot' using errcode = '22023';
    end if;
    -- Reject PostgreSQL's permissive date spellings and timezone-dependent input.
    if (v_snapshot ->> 'logged_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or
       (v_snapshot ->> 'client_created_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'invalid_food_log_dates' using errcode = '22023';
    end if;
    begin
      v_row := pg_catalog.jsonb_populate_record(null::public.food_logs, v_snapshot);
      v_row.user_id := v_user_id;
      v_row.id := (v_item ->> 'id')::uuid;
      v_row.last_mutation_id := (v_item ->> 'mutation_id')::uuid;
    exception when data_exception then
      raise exception 'invalid_food_log_snapshot' using errcode = '22023';
    end;
    if v_row.id is null or v_row.last_mutation_id is null or
       v_row.last_mutation_id = any(v_mutation_ids) or
       pg_catalog.char_length(v_row.food_name) not between 1 and 300 or
       v_row.food_name !~ '[^[:space:]]' or
       not (v_row.calories >= 0 and v_row.calories < 'Infinity'::double precision) or
       not (v_row.protein >= 0 and v_row.protein < 'Infinity'::double precision) or
       not (v_row.carbs >= 0 and v_row.carbs < 'Infinity'::double precision) or
       not (v_row.fat >= 0 and v_row.fat < 'Infinity'::double precision) or
       v_row.meal_type not in ('Breakfast', 'Lunch', 'Dinner', 'Snack') or
       v_row.logged_date not between date '0100-01-01' and date '9999-12-31' or
       not (v_row.client_created_at >= timestamptz '0100-01-01 00:00:00+00' and
            v_row.client_created_at < timestamptz '10000-01-01 00:00:00+00') then
      raise exception 'invalid_food_log_snapshot' using errcode = '22023';
    end if;
    v_rows := pg_catalog.array_append(v_rows, v_row);
    v_kinds := pg_catalog.array_append(v_kinds, v_item ->> 'kind');
    v_mutation_ids := pg_catalog.array_append(v_mutation_ids, v_row.last_mutation_id);
  end loop;

  insert into public.food_log_sync_state (user_id) values (v_user_id) on conflict (user_id) do nothing;
  select revision into v_revision from public.food_log_sync_state
    where user_id = v_user_id for update;

  for v_index in 1..pg_catalog.array_length(v_rows, 1) loop
    v_row := v_rows[v_index];
    select * into v_current from public.food_logs where user_id = v_user_id and id = v_row.id;
    if found then
      if v_current.deleted_at is not null then
        continue; -- Terminal deletion wins even over delayed creations.
      end if;
      if v_kinds[v_index] = 'create' then
        if row(v_current.food_name, v_current.calories, v_current.protein, v_current.carbs, v_current.fat,
               v_current.meal_type, v_current.client_created_at, v_current.logged_date,
               v_current.legacy_local_id, v_current.originating_device_id)
           is distinct from
           row(v_row.food_name, v_row.calories, v_row.protein, v_row.carbs, v_row.fat,
               v_row.meal_type, v_row.client_created_at, v_row.logged_date,
               v_row.legacy_local_id, v_row.originating_device_id) then
          raise exception 'food_log_id_conflict' using errcode = '40001';
        end if;
        continue; -- Identical create: preserve revision and all server metadata.
      end if;
      if v_revision = 9007199254740991 then
        raise exception 'food_log_revision_exhausted' using errcode = '22003';
      end if;
      v_revision := v_revision + 1;
      v_now := pg_catalog.clock_timestamp();
      update public.food_logs set deleted_at = v_now, updated_at = v_now,
        server_revision = v_revision, last_mutation_id = v_row.last_mutation_id
        where user_id = v_user_id and id = v_row.id;
    else
      if v_revision = 9007199254740991 then
        raise exception 'food_log_revision_exhausted' using errcode = '22003';
      end if;
      v_revision := v_revision + 1;
      v_now := pg_catalog.clock_timestamp();
      v_row.server_revision := v_revision;
      v_row.received_at := v_now;
      v_row.updated_at := v_now;
      v_row.deleted_at := case when v_kinds[v_index] = 'delete' then v_now else null end;
      insert into public.food_logs select (v_row).*;
    end if;
  end loop;
  update public.food_log_sync_state set revision = v_revision where user_id = v_user_id;
  -- One final canonical row per input, in input order (including same-batch deletes).
  for v_index in 1..pg_catalog.array_length(v_rows, 1) loop
    v_row := v_rows[v_index];
    return query select * from public.food_logs where user_id = v_user_id and id = v_row.id;
  end loop;
end;
$function$;

-- Keep p_watermark from the first page for subsequent pages. Once has_more is
-- false, persist next_cursor (= watermark) and start the next cycle without it.
-- A row changed beyond the watermark is safely picked up in that next cycle.
create function public.pull_food_log_changes(
  p_after_revision bigint default 0,
  p_page_size integer default 100,
  p_watermark bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_head bigint;
  v_watermark bigint;
  v_changes jsonb;
  v_last bigint;
  v_more boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_after_revision is null or p_after_revision not between 0 and 9007199254740991 or
     p_page_size is null or p_page_size not between 1 and 100 or
     (p_watermark is not null and p_watermark not between p_after_revision and 9007199254740991) then
    raise exception 'invalid_food_log_cursor' using errcode = '22023';
  end if;
  -- The same lock domain as writers makes the head a committed watermark.
  select revision into v_head from public.food_log_sync_state where user_id = v_user_id for share;
  v_head := coalesce(v_head, 0);
  v_watermark := coalesce(p_watermark, v_head);
  if p_after_revision > v_head or v_watermark > v_head then
    raise exception 'invalid_food_log_cursor' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.server_revision, page.id), '[]'::jsonb),
         pg_catalog.max(page.server_revision)
    into v_changes, v_last
    from (select * from public.food_logs where user_id = v_user_id
      and server_revision > p_after_revision and server_revision <= v_watermark
      order by server_revision, id limit p_page_size) as page;
  select exists(select 1 from public.food_logs where user_id = v_user_id
    and server_revision > coalesce(v_last, p_after_revision) and server_revision <= v_watermark) into v_more;
  return pg_catalog.jsonb_build_object('changes', v_changes, 'watermark', v_watermark,
    'has_more', v_more, 'next_cursor', case when v_more then v_last else v_watermark end);
end;
$function$;

revoke all on function public.apply_food_log_mutations(jsonb) from public, anon, authenticated;
revoke all on function public.pull_food_log_changes(bigint, integer, bigint) from public, anon, authenticated;
grant execute on function public.apply_food_log_mutations(jsonb) to authenticated;
grant execute on function public.pull_food_log_changes(bigint, integer, bigint) to authenticated;
