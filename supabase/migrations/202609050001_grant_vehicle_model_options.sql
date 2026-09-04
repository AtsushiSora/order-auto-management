-- RLS ポリシーに加えて、authenticated ロールへテーブル権限を付与する。
-- 実際に実行できる操作は既存の RLS（事業主・通常スタッフ等）で制限される。

grant select, insert, update, delete
on table public.vehicle_model_options
to authenticated;
