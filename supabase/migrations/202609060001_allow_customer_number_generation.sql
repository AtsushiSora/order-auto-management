-- customers.customer_number の既定値を、認証済み利用者の登録時に実行できるようにする。
-- 実際に顧客を登録できる権限は customers のRLSで事業主・通常スタッフだけに制限される。

grant execute on function private.next_customer_number() to authenticated;
