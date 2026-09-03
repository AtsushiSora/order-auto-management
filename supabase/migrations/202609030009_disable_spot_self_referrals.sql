-- スポットスタッフの役割を、割り当て済み案件の契約手続きと
-- 事業主が登録した紹介料・報酬の確認だけに限定する。
revoke execute on function public.create_spot_referral(public.staff_business_type, text, text)
from authenticated;

revoke execute on function public.update_spot_referral(uuid, text, text)
from authenticated;

