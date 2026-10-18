begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

-- Synthetic local-only identities; no credentials or application diary data.
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
create function pg_temp.log_id(p_id integer) returns uuid language sql immutable as $$
  select ('10000000-0000-4000-8000-' || lpad(p_id::text, 12, '0'))::uuid
$$;
create function pg_temp.batch(p_id integer, p_kind text default 'create', p_patch jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'id', pg_temp.log_id(p_id), 'mutation_id', gen_random_uuid(), 'kind', p_kind,
    'snapshot', jsonb_build_object('food_name', 'Meal ' || p_id,
      'calories', 0, 'protein', 1.23456789012345, 'carbs', 2.5, 'fat', 0,
      'meal_type', 'Breakfast', 'client_created_at', '2024-01-01T23:30:00.000Z',
      'logged_date', '2023-12-31', 'legacy_local_id', '0000123',
      'originating_device_id', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') || p_patch))
$$;
create function pg_temp.call_batch(p_id integer, p_kind text default 'create', p_patch jsonb default '{}'::jsonb)
returns text language sql as $$
  select format('select * from public.apply_food_log_mutations(%L::jsonb)', pg_temp.batch(p_id, p_kind, p_patch))
$$;

select ok((select relrowsecurity from pg_class where oid = 'public.food_logs'::regclass), 'food_logs RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.food_log_sync_state'::regclass), 'state RLS enabled');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('food_logs', 'food_log_sync_state') and cmd = 'SELECT'), 2, 'both tables have SELECT policies');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('food_logs', 'food_log_sync_state') and cmd <> 'SELECT'), 0, 'no direct write policies');
select ok(not has_function_privilege('anon', 'public.apply_food_log_mutations(jsonb)', 'execute'), 'anon has no apply grant');
select ok(not has_function_privilege('anon', 'public.pull_food_log_changes(bigint,integer,bigint)', 'execute'), 'anon has no pull grant');
select ok(not has_function_privilege('service_role', 'public.apply_food_log_mutations(jsonb)', 'execute'), 'service role is not granted apply execution');
select ok(not has_function_privilege('service_role', 'public.pull_food_log_changes(bigint,integer,bigint)', 'execute'), 'service role is not granted pull execution');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.apply_food_log_mutations(jsonb)'::regprocedure), 'apply definer has empty search path');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.pull_food_log_changes(bigint,integer,bigint)'::regprocedure), 'pull definer has empty search path');

set local role anon;
select throws_ok('select * from public.food_logs', '42501', null, 'anonymous food log reads denied');
select throws_ok('select * from public.food_log_sync_state', '42501', null, 'anonymous state reads denied');
select throws_ok('select public.apply_food_log_mutations(''[]'')', '42501', null, 'anonymous apply denied');
select throws_ok('select public.pull_food_log_changes()', '42501', null, 'anonymous pull denied');
reset role;
set local role authenticated;
select throws_ok('select public.apply_food_log_mutations(''[]'')', '42501', 'authentication_required', 'apply rejects missing auth subject');
select throws_ok('select public.pull_food_log_changes()', '42501', 'authentication_required', 'pull rejects missing auth subject');
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select lives_ok(pg_temp.call_batch(1), 'create succeeds');
select is((select server_revision from public.food_logs where id = pg_temp.log_id(1)), 1::bigint, 'first revision is one');
select is((select calories from public.food_logs where id = pg_temp.log_id(1)), 0::double precision, 'genuine zero preserved');
select is((select protein from public.food_logs where id = pg_temp.log_id(1)), 1.23456789012345::double precision, 'fraction preserved');
select is((select logged_date::text from public.food_logs where id = pg_temp.log_id(1)), '2023-12-31', 'logged date not inferred from timestamp');
select is((select legacy_local_id from public.food_logs where id = pg_temp.log_id(1)), '0000123', 'legacy ID retained exactly');
select is((public.pull_food_log_changes()->>'watermark')::bigint, 1::bigint, 'pull captures head');
select is(jsonb_array_length(public.pull_food_log_changes()->'changes'), 1, 'pull returns created row');
select lives_ok(pg_temp.call_batch(1), 'same content with a fresh operation UUID is idempotent');
select is((select revision from public.food_log_sync_state), 1::bigint, 'repeated create does not inflate revision');
select throws_ok(pg_temp.call_batch(1, 'create', '{"calories":1}'), '40001', 'food_log_id_conflict', 'active ID cannot be reused with changed content');
select is((select calories from public.food_logs where id = pg_temp.log_id(1)), 0::double precision, 'conflict leaves original snapshot');
select throws_ok(format('select public.apply_food_log_mutations(%L::jsonb)',
  jsonb_set(pg_temp.batch(2), '{0,user_id}', '"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"')), '22023', null, 'top-level ownership spoof rejected');
select throws_ok(pg_temp.call_batch(2, 'create', '{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}'), '22023', null, 'snapshot ownership spoof rejected');

select throws_ok('insert into public.food_logs(user_id,id) values (auth.uid(),gen_random_uuid())', '42501', null, 'direct food log INSERT denied');
select throws_ok('update public.food_logs set calories=100', '42501', null, 'direct food log UPDATE denied');
select throws_ok('delete from public.food_logs', '42501', null, 'client hard DELETE denied');
select throws_ok('insert into public.food_log_sync_state(user_id) values(auth.uid())', '42501', null, 'direct state INSERT denied');
select throws_ok('update public.food_log_sync_state set revision=0', '42501', null, 'direct state UPDATE denied');
select throws_ok('delete from public.food_log_sync_state', '42501', null, 'direct state DELETE denied');

set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is((select count(*)::integer from public.food_logs), 0, 'B cannot SELECT A logs');
select is((select count(*)::integer from public.food_log_sync_state), 0, 'B cannot SELECT A state');
select is(jsonb_array_length(public.pull_food_log_changes()->'changes'), 0, 'B cannot pull A data');
select lives_ok(pg_temp.call_batch(1, 'create', '{"food_name":"B private meal"}'), 'B may use the same client ID in its own account');
select is((select revision from public.food_log_sync_state), 1::bigint, 'B revision is independent');
select is((select food_name from public.food_logs), 'B private meal', 'B sees only its canonical row');
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is((select food_name from public.food_logs), 'Meal 1', 'A cannot receive B content');

select lives_ok(pg_temp.call_batch(1, 'delete'), 'delete succeeds');
select ok((select deleted_at is not null from public.food_logs where id = pg_temp.log_id(1)), 'tombstone retained');
select is((select food_name from public.food_logs where id = pg_temp.log_id(1)), 'Meal 1', 'deleted snapshot retained');
select is((select server_revision from public.food_logs where id = pg_temp.log_id(1)), 2::bigint, 'delete allocates revision');
select lives_ok(pg_temp.call_batch(1, 'delete'), 'repeated delete succeeds');
select lives_ok(pg_temp.call_batch(1), 'delayed create after delete is safe');
select is((select revision from public.food_log_sync_state), 2::bigint, 'repeated delete and create after tombstone do not inflate revisions');
select ok((public.pull_food_log_changes()->'changes'->0->>'deleted_at') is not null, 'pull includes tombstone');
select lives_ok(pg_temp.call_batch(2, 'delete'), 'delete never-acknowledged creation with original snapshot');
select ok((select deleted_at is not null from public.food_logs where id = pg_temp.log_id(2)), 'delete-before-create inserts terminal marker');
select lives_ok(pg_temp.call_batch(2), 'unacknowledged create replay cannot resurrect');
select is((select count(*)::integer from public.food_logs where deleted_at is null), 0, 'neither deleted entry resurrects');

-- Validation failure and a later immutable-ID conflict both roll back the batch.
select throws_ok(format('select public.apply_food_log_mutations(%L::jsonb)',
  pg_temp.batch(3) || pg_temp.batch(4, 'create', '{"fat":-1}')), '22023', null, 'invalid second mutation rejects whole batch');
select is((select count(*)::integer from public.food_logs where id = pg_temp.log_id(3)), 0, 'validated first mutation was not inserted');
select lives_ok(pg_temp.call_batch(5), 'create conflict fixture');
select throws_ok(format('select public.apply_food_log_mutations(%L::jsonb)',
  pg_temp.batch(3) || pg_temp.batch(5, 'create', '{"food_name":"conflict"}')), '40001', null, 'later conflict rolls back earlier write');
select is((select count(*)::integer from public.food_logs where id = pg_temp.log_id(3)), 0, 'earlier write rolled back');
select is((select revision from public.food_log_sync_state), 4::bigint, 'failed batches allocate no revisions');

select lives_ok(format('select public.apply_food_log_mutations(%L::jsonb)', pg_temp.batch(6) || pg_temp.batch(7)), 'multi-create batch succeeds');
select is((select array_agg(server_revision order by server_revision) from public.food_logs), array[2,3,4,5,6]::bigint[], 'strict unique revision ordering includes tombstones');
create temporary table pages (id integer primary key, value jsonb);
insert into pages values (1, public.pull_food_log_changes(0, 2));
select is((select value->>'watermark' from pages where id=1), '6', 'first page captures watermark');
select is((select value->>'next_cursor' from pages where id=1), '3', 'cursor is last returned revision');
select is((select value->>'has_more' from pages where id=1), 'true', 'more pages remain');
select is((select value->'changes'->0->>'server_revision' from pages where id=1), '2', 'page ordered ascending');
select lives_ok(pg_temp.call_batch(8), 'new creation between pages');
select lives_ok(pg_temp.call_batch(7, 'delete'), 'unseen row deleted between pages');
insert into pages values (2, public.pull_food_log_changes(3, 100, 6));
select is((select value->>'watermark' from pages where id=2), '6', 'subsequent page keeps original watermark');
select is((select value->>'has_more' from pages where id=2), 'false', 'watermarked pass completes');
select is((select value->>'next_cursor' from pages where id=2), '6', 'completed cursor advances to watermark across revision gaps');
select is((select jsonb_array_length(value->'changes') from pages where id=2), 2, 'rows beyond watermark deferred');
select is(jsonb_array_length(public.pull_food_log_changes(6,100)->'changes'), 2, 'next pass catches both new row and moved tombstone');
select throws_ok('select public.pull_food_log_changes(-1)', '22023', null, 'negative cursor rejected');
select throws_ok('select public.pull_food_log_changes(0,0)', '22023', null, 'zero page size rejected');
select throws_ok('select public.pull_food_log_changes(0,101)', '22023', null, 'oversized page rejected');
select throws_ok('select public.pull_food_log_changes(0,10,900)', '22023', null, 'future watermark rejected');
select throws_ok('select public.pull_food_log_changes(3,10,2)', '22023', null, 'watermark below cursor rejected');
select throws_ok('select public.pull_food_log_changes(null)', '22023', null, 'null cursor rejected');

select throws_ok('select public.apply_food_log_mutations(null)', '22023', null, 'null batch rejected');
select throws_ok('select public.apply_food_log_mutations(''{}'')', '22023', null, 'object batch rejected');
select throws_ok('select public.apply_food_log_mutations(''[]'')', '22023', null, 'empty batch rejected');
select throws_ok(format('select public.apply_food_log_mutations(%L::jsonb)',
  (select jsonb_agg(pg_temp.batch(n)->0) from generate_series(100,200) n)), '22023', null, 'batch over 100 rejected');
select throws_ok(format('select public.apply_food_log_mutations(%L::jsonb)',
  pg_temp.batch(20, 'create', jsonb_build_object('legacy_local_id',repeat('x',1048576)))), '22023', null, 'oversized payload rejected');
select throws_ok(pg_temp.call_batch(20, 'edit'), '22023', null, 'unsupported mutation kind rejected');
select throws_ok(format('select public.apply_food_log_mutations(%L::jsonb)',
  jsonb_set(pg_temp.batch(20),'{0,id}','"invalid"')), '22023', null, 'invalid UUID rejected');

-- Validate each nutrient independently, including JSON strings for NaN/Infinity.
select throws_ok(pg_temp.call_batch(20, 'create', jsonb_build_object(nutrient, value)), '22023', null,
  'reject ' || nutrient || ' = ' || value::text)
from unnest(array['calories','protein','carbs','fat']) nutrient
cross join (values ('-1'::jsonb), ('"NaN"'::jsonb), ('"Infinity"'::jsonb), ('"-Infinity"'::jsonb), ('null'::jsonb), ('1e1000'::jsonb)) bad(value);
select throws_ok(pg_temp.call_batch(20, 'create', patch), '22023', null, description)
from (values
  ('{"food_name":""}'::jsonb, 'empty name'),
  (jsonb_build_object('food_name',E' \t\n'), 'whitespace name'),
  (jsonb_build_object('food_name',repeat('x',301)), 'long name'),
  ('{"meal_type":"Brunch"}'::jsonb, 'invalid meal'),
  ('{"logged_date":"2024-02-30"}'::jsonb, 'invalid calendar date'),
  ('{"logged_date":"2024-2-01"}'::jsonb, 'noncanonical date'),
  ('{"logged_date":"0099-12-31"}'::jsonb, 'date below lower bound'),
  ('{"logged_date":"10000-01-01"}'::jsonb, 'date above upper bound'),
  ('{"logged_date":"infinity"}'::jsonb, 'infinite date'),
  ('{"client_created_at":"infinity"}'::jsonb, 'infinite timestamp'),
  ('{"client_created_at":"2024-01-01T00:00:00"}'::jsonb, 'timestamp missing timezone'),
  ('{"client_created_at":"2024-02-30T00:00:00Z"}'::jsonb, 'invalid timestamp date'),
  ('{"client_created_at":"0099-12-31T00:00:00Z"}'::jsonb, 'timestamp below lower bound'),
  ('{"originating_device_id":"bad"}'::jsonb, 'invalid device UUID')
) cases(patch,description);
select is((select count(*)::integer from public.food_logs where id=pg_temp.log_id(20)), 0, 'all invalid mutations leave no rows');

-- Existing nutrition-target RPC/RLS behaviour remains unchanged.
select lives_ok($$select public.apply_nutrition_targets(2000,100,200,60,0,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$, 'nutrition targets create still works');
select lives_ok($$select public.apply_nutrition_targets(2000,100,200,60,0,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$, 'nutrition target replay remains idempotent');
select is((select revision from public.nutrition_targets), 1::bigint, 'nutrition target revision unchanged by replay');
select throws_ok($$select public.apply_nutrition_targets(2001,100,200,60,0,'ffffffff-ffff-4fff-8fff-ffffffffffff')$$, '40001', null, 'nutrition target CAS conflict still enforced');
select throws_ok($$select public.apply_nutrition_targets(0,100,200,60,1,'ffffffff-ffff-4fff-8fff-ffffffffffff')$$, '22023', null, 'nutrition target validation still enforced');
select throws_ok('update public.nutrition_targets set calories=2001', '42501', null, 'nutrition targets direct write denied');
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is((select count(*)::integer from public.nutrition_targets), 0, 'nutrition target RLS still isolates accounts');
select is((select deleted_at is null from public.food_logs where id=pg_temp.log_id(1)), true, 'A deletions never affect B same-ID row');
reset role;

-- Table checks also defend privileged maintenance mistakes (not just RPC input).
select throws_ok($$update public.food_logs set calories='NaN' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '23514', null, 'table rejects native PostgreSQL NaN');
select throws_ok($$update public.food_logs set fat='Infinity' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '23514', null, 'table rejects native infinity');
select throws_ok($$update public.food_logs set server_revision=0 where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '23514', null, 'table bounds revisions');
select throws_ok($$update public.food_log_sync_state set revision=9007199254740992$$, '23514', null, 'state bounds safe integer revisions');
select throws_ok($$update public.food_logs set server_revision=100 where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '23505', null, 'duplicate per-user revisions forbidden');
select throws_ok($$update public.food_logs set updated_at='infinity' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '23514', null, 'table bounds server timestamps');
select throws_ok($$update public.food_logs set logged_date='infinity' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '23514', null, 'table bounds logged dates');

-- Row revisions stay bounded even when the account exhausts the safe range.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select lives_ok(pg_temp.call_batch(30, 'create', jsonb_build_object('food_name',repeat('x',300),
  'logged_date','0100-01-01','client_created_at','0100-01-01T00:00:00Z')), 'maximum name length and minimum date accepted');
select lives_ok(pg_temp.call_batch(31, 'create', '{"logged_date":"9999-12-31","client_created_at":"9999-12-31T23:59:59Z"}'), 'maximum finite dates accepted');
reset role;
update public.food_log_sync_state set revision=9007199254740991
  where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select lives_ok(pg_temp.call_batch(30, 'create', jsonb_build_object('food_name',repeat('x',300),
  'logged_date','0100-01-01','client_created_at','0100-01-01T00:00:00Z')), 'idempotent replay still works at revision limit');
select throws_ok(pg_temp.call_batch(32), '22003', 'food_log_revision_exhausted', 'creation cannot overflow revision');
select throws_ok(pg_temp.call_batch(30,'delete'), '22003', 'food_log_revision_exhausted', 'deletion cannot overflow revision');
select ok((select deleted_at is null from public.food_logs where id=pg_temp.log_id(30)), 'failed overflowing deletion leaves row active');
reset role;
select * from finish();
rollback;
