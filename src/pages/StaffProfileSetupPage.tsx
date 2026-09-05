import { IdCard } from "lucide-react";
import { useState } from "react";
import { StaffDetailsForm } from "../components/StaffDetailsForm";
import { formatEmployeeNumber } from "../lib/staffDetails";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";

export function StaffProfileSetupPage() {
  const { profile } = useAuth();
  const { saveStaffProfileDetails } = useAppData();
  const [submitting, setSubmitting] = useState(false);

  if (!profile) return null;
  return <main className="staff-setup-page">
    <section className="staff-setup-card">
      <div className="staff-setup-heading">
        <span className="staff-setup-icon"><IdCard size={30} /></span>
        <div><p>初回登録</p><h1>スタッフ情報を登録</h1><span>社員番号 {formatEmployeeNumber(profile.employeeNumber)}</span></div>
      </div>
      <p className="staff-setup-description">パスワードの設定が完了しました。業務を始める前に、本人情報と免許証を登録してください。</p>
      <StaffDetailsForm
        staff={profile}
        submitting={submitting}
        submitLabel="登録して管理画面へ"
        onSubmit={async (input, front, back) => {
          setSubmitting(true);
          try {
            await saveStaffProfileDetails(input, front, back);
            window.location.hash = "#/dashboard";
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </section>
  </main>;
}
