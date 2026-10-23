# components/admin/patients/AddPatientModal.tsx

- AddPatientModalProps · interface · L45-L49 — interface AddPatientModalProps
- AddPatientModal · function · L51-L451 — function AddPatientModal({ open, onClose, onCreated, }: AddPatientModalProps)
- closeModal · function · L90-L95 — closeModal = ()
- FormSection · function · L453-L471 — function FormSection({ title, children, }: { title: string; children: React.ReactNode; })
- TextField · function · L473-L491 — function TextField({ label, error, className, children, }: { label: string; error?: string; className?: string; children: React.ReactNode; })
- SelectField · function · L493-L542 — function SelectField({ control, name, label, options, disabled, className, }: { control: ReturnType<typeof useForm<PatientCreateFormValues>>["control"]; name: keyof Pick< PatientCreateFormValues, "gender" | "careLevel" | "mobilityType" | "bloodType" >; label: string; options: Array<{ value: string; label: string }>; disabled: boolean; className?: string; })
