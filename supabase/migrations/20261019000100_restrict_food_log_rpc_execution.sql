-- Hosted defaults may grant service_role execution when functions are created.
-- Restrict these user-session RPCs without changing any default privileges.
revoke execute on function public.apply_food_log_mutations(jsonb) from public, anon, service_role;
revoke execute on function public.pull_food_log_changes(bigint, integer, bigint) from public, anon, service_role;

grant execute on function public.apply_food_log_mutations(jsonb) to authenticated;
grant execute on function public.pull_food_log_changes(bigint, integer, bigint) to authenticated;
