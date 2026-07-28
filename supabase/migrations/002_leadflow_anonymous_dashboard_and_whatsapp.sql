drop policy if exists "leads_select_anonymous" on public.leads;
create policy "leads_select_anonymous"
on public.leads for select to anon
using (user_id is null);

drop policy if exists "leads_update_anonymous" on public.leads;
create policy "leads_update_anonymous"
on public.leads for update to anon
using (user_id is null)
with check (user_id is null);
