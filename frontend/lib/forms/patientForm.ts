import { z } from "zod";
import { splitList } from "@/lib/patientFormParse";
import type { MedicalConditionEntry, Patient, PatientContact } from "@/lib/types";

export const CARE_LEVEL_OPTIONS = ["normal", "special", "critical"] as const;
export const MOBILITY_OPTIONS = ["wheelchair", "walker", "independent"] as const;
export const BLOOD_TYPE_OPTIONS = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const GENDER_OPTIONS = ["", "male", "female", "other"] as const;

export const EMPTY_MEDICATION_ROW = {
  name: "",
  dosage: "",
  frequency: "",
  instructions: "",
};

export const EMPTY_SURGERY_ROW = {
  procedure: "",
  facility: "",
  year: "",
};

const medicationSchema = z.object({
  name: z.string(),
  dosage: z.string(),
  frequency: z.string(),
  instructions: z.string(),
});

const surgerySchema = z.object({
  procedure: z.string(),
  facility: z.string(),
  year: z.string(),
});

function isPositiveNumber(value: string) {
  if (value.trim() === "") return true;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0;
}

function emergencyContactRefine(
  values: {
    emergencyContactName: string;
    emergencyContactPhone: string;
  },
  ctx: z.RefinementCtx,
) {
  const hasEmergencyName = values.emergencyContactName.trim().length > 0;
  const hasEmergencyPhone = values.emergencyContactPhone.trim().length > 0;

  if (hasEmergencyName !== hasEmergencyPhone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasEmergencyName ? "emergencyContactPhone" : "emergencyContactName"],
      message: "Emergency contact name and phone must be filled together",
    });
  }
}

const patientCreateObjectSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  nickname: z.string(),
  dateOfBirth: z.string(),
  gender: z.enum(GENDER_OPTIONS),
  careLevel: z.enum(CARE_LEVEL_OPTIONS),
  mobilityType: z.enum(MOBILITY_OPTIONS),
  heightCm: z.string().refine(isPositiveNumber, "Height must be a positive number"),
  weightKg: z.string().refine(isPositiveNumber, "Weight must be a positive number"),
  bloodType: z.enum(BLOOD_TYPE_OPTIONS),
  chronicRaw: z.string(),
  allergiesRaw: z.string(),
  notes: z.string(),
  medications: z.array(medicationSchema),
  surgeries: z.array(surgerySchema),
  emergencyContactName: z.string(),
  emergencyContactRelationship: z.string(),
  emergencyContactPhone: z.string(),
});

export const patientCreateFormSchema = patientCreateObjectSchema.superRefine(emergencyContactRefine);

export type PatientCreateFormValues = z.infer<typeof patientCreateFormSchema>;

export const patientEditorFormSchema = patientCreateObjectSchema
  .extend({
    roomId: z.string(),
    isActive: z.boolean(),
    emergencyContactType: z.string(),
    emergencyContactEmail: z.string(),
    emergencyContactNotes: z.string(),
  })
  .superRefine(emergencyContactRefine);

export type PatientEditorFormValues = z.infer<typeof patientEditorFormSchema>;

export function createPatientFormDefaultValues(): PatientCreateFormValues {
  return {
    firstName: "",
    lastName: "",
    nickname: "",
    dateOfBirth: "",
    gender: "",
    careLevel: "normal",
    mobilityType: "wheelchair",
    heightCm: "",
    weightKg: "",
    bloodType: "",
    chronicRaw: "",
    allergiesRaw: "",
    notes: "",
    medications: [{ ...EMPTY_MEDICATION_ROW }],
    surgeries: [{ ...EMPTY_SURGERY_ROW }],
    emergencyContactName: "",
    emergencyContactRelationship: "",
    emergencyContactPhone: "",
  };
}

function parseOptionalNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function pickOption<T extends readonly string[]>(options: T, value: string | null | undefined, fallback: T[number]) {
  return options.includes((value ?? "") as T[number]) ? (value as T[number]) : fallback;
}

export function buildPatientCreatePayload(values: PatientCreateFormValues) {
  return {
    first_name: values.firstName.trim(),
    last_name: values.lastName.trim(),
    nickname: values.nickname.trim(),
    date_of_birth: values.dateOfBirth.trim() || null,
    gender: values.gender.trim(),
    care_level: values.careLevel,
    mobility_type: values.mobilityType,
    height_cm: parseOptionalNumber(values.heightCm),
    weight_kg: parseOptionalNumber(values.weightKg),
    blood_type: values.bloodType,
    medical_conditions: splitList(values.chronicRaw),
    allergies: splitList(values.allergiesRaw),
    medications: values.medications
      .filter((row) => row.name.trim() !== "")
      .map((row) => ({
        name: row.name.trim(),
        dosage: row.dosage.trim(),
        frequency: row.frequency.trim(),
        instructions: row.instructions.trim(),
      })),
    past_surgeries: values.surgeries
      .filter((row) => row.procedure.trim() !== "")
      .map((row) => ({
        procedure: row.procedure.trim(),
        facility: row.facility.trim(),
        year: row.year.trim() === "" ? null : Number(row.year) || row.year.trim(),
      })),
    notes: values.notes.trim(),
  };
}

function medicalConditionsToInput(conditions: MedicalConditionEntry[] | undefined) {
  return (conditions ?? [])
    .map((condition) => {
      if (typeof condition === "string") return condition;
      if (typeof condition.label === "string") return condition.label;
      if (typeof condition.name === "string") return condition.name;
      if (typeof condition.condition === "string") return condition.condition;
      return typeof condition.type === "string" ? condition.type : "";
    })
    .filter(Boolean)
    .join(", ");
}

export function createPatientEditorFormValues(
  patient: Patient,
  primaryContact: PatientContact | null,
): PatientEditorFormValues {
  return {
    firstName: patient.first_name ?? "",
    lastName: patient.last_name ?? "",
    nickname: patient.nickname ?? "",
    dateOfBirth: patient.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : "",
    gender: pickOption(GENDER_OPTIONS, patient.gender, ""),
    careLevel: pickOption(CARE_LEVEL_OPTIONS, patient.care_level, "normal"),
    mobilityType: pickOption(MOBILITY_OPTIONS, patient.mobility_type, "wheelchair"),
    heightCm: patient.height_cm != null ? String(patient.height_cm) : "",
    weightKg: patient.weight_kg != null ? String(patient.weight_kg) : "",
    bloodType: pickOption(BLOOD_TYPE_OPTIONS, patient.blood_type, ""),
    chronicRaw: medicalConditionsToInput(patient.medical_conditions),
    allergiesRaw: (patient.allergies ?? []).join(", "),
    notes: patient.notes ?? "",
    medications: patient.medications?.length
      ? patient.medications.map((row) => ({
          name: row.name ?? "",
          dosage: row.dosage ?? "",
          frequency: row.frequency ?? "",
          instructions: row.instructions ?? "",
        }))
      : [{ ...EMPTY_MEDICATION_ROW }],
    surgeries: patient.past_surgeries?.length
      ? patient.past_surgeries.map((row) => ({
          procedure: row.procedure ?? "",
          facility: row.facility ?? "",
          year: row.year == null ? "" : String(row.year),
        }))
      : [{ ...EMPTY_SURGERY_ROW }],
    roomId: patient.room_id != null ? String(patient.room_id) : "",
    isActive: patient.is_active !== false,
    emergencyContactType: primaryContact?.contact_type ?? "emergency",
    emergencyContactName: primaryContact?.name ?? "",
    emergencyContactRelationship: primaryContact?.relationship ?? "",
    emergencyContactPhone: primaryContact?.phone ?? "",
    emergencyContactEmail: primaryContact?.email ?? "",
    emergencyContactNotes: primaryContact?.notes ?? "",
  };
}

export function buildPatientUpdatePayload(values: PatientEditorFormValues) {
  return {
    ...buildPatientCreatePayload(values),
    room_id: values.roomId.trim() === "" ? null : Number(values.roomId),
    is_active: values.isActive,
  };
}

export function buildEmergencyContactPayload(values: PatientCreateFormValues) {
  if (!values.emergencyContactName.trim() || !values.emergencyContactPhone.trim()) {
    return null;
  }

  return {
    contact_type: "emergency",
    name: values.emergencyContactName.trim(),
    relationship: values.emergencyContactRelationship.trim(),
    phone: values.emergencyContactPhone.trim(),
    is_primary: true,
  };
}

export function buildPatientEditorEmergencyContactPayload(values: PatientEditorFormValues) {
  if (!values.emergencyContactName.trim() || !values.emergencyContactPhone.trim()) {
    return null;
  }

  return {
    contact_type: values.emergencyContactType.trim() || "emergency",
    name: values.emergencyContactName.trim(),
    relationship: values.emergencyContactRelationship.trim(),
    phone: values.emergencyContactPhone.trim(),
    email: values.emergencyContactEmail.trim(),
    notes: values.emergencyContactNotes.trim(),
    is_primary: true,
  };
}
