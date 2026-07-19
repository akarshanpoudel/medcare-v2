export const COOKIE_NAME = "mc_session";

export const DOCTORS = [
  { id: "khatiwada", name: "Dr. Anup Khatiwada", department: "General Medicine" },
  { id: "tamang", name: "Dr. Pemba Tamang", department: "Dental" },
  { id: "poudel", name: "Dr. Sarita Poudel", department: "Gynecology" },
  { id: "joshi", name: "Dr. Ramesh Joshi", department: "Cardiology" },
] as const;

export type DoctorId = (typeof DOCTORS)[number]["id"];

export const DOCTOR_IDS = DOCTORS.map((d) => d.id) as [DoctorId, ...DoctorId[]];

// Clinic operating hours used to generate valid slots and to validate
// bookings server-side (not just decorate the UI).
export const CLINIC_OPEN_HOUR = 9; // 9:00 AM
export const CLINIC_CLOSE_HOUR = 17; // last slot starts 4:30 PM, closes 5:00 PM
export const SLOT_MINUTES = 30;

export function generateDaySlots(): string[] {
  const slots: string[] = [];
  for (let h = CLINIC_OPEN_HOUR; h < CLINIC_CLOSE_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

export const CLINIC_PHONE = "+977 61-123456";
export const CLINIC_WHATSAPP_NUMBER = "9779800000000"; // digits only, no + or spaces, for wa.me links
export const CLINIC_EMAIL = "care@medcareclinic.example";
export const CLINIC_ADDRESS = "Lakeside Road, Pokhara-6, Nepal";
