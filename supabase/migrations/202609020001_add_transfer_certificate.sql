-- 車両書類に譲渡証明書を追加する。
alter table public.vehicle_documents
  drop constraint if exists vehicle_documents_document_type_check;

alter table public.vehicle_documents
  add constraint vehicle_documents_document_type_check check (document_type in (
    'vehicle_inspection_certificate',
    'transfer_certificate',
    'seal_registration_certificate',
    'residence_certificate',
    'application_request_form',
    'compulsory_automobile_liability_insurance',
    'other'
  ));
