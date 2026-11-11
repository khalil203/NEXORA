-- Closed registration: new accounts can only be created by the owner
-- (SQL with set_config('nexora.allow_signup','on',true) in the same transaction).
-- The NEXORA account itself (username "Nexora" = nexora@nexora.invalid) was created
-- once by the applied migration; its password is not stored in this repository.
create or replace function public.block_signups() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('nexora.allow_signup', true), '') <> 'on' then
    raise exception 'Sign-ups are closed for NEXORA' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.block_signups() from anon, authenticated, public;
drop trigger if exists nexora_block_signups on auth.users;
create trigger nexora_block_signups before insert on auth.users for each row execute function public.block_signups();
