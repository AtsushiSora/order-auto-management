-- 利用停止・復活・権限変更を監査履歴へ残す。
drop trigger if exists staff_profiles_audit on public.staff_profiles;
create trigger staff_profiles_audit
after update on public.staff_profiles
for each row execute function private.write_audit_log();
