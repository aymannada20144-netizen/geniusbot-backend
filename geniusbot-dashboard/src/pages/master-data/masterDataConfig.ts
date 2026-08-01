export type FieldConfig = {
  name: string
  label: string
  type?: 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'time' | 'datetime-local' | 'select' | 'array'
  required?: boolean
  options?: Array<{ value: string; label: string }>
  source?: string
  sourceLabel?: string
  readOnlyOnEdit?: boolean
  helper?: string
}

export type ResourceConfig = {
  title: string
  description: string
  singular: string
  fields: FieldConfig[]
  columns: string[]
  singleton?: boolean
}

const active: FieldConfig = { name: 'is_active', label: 'Active', type: 'boolean' }
const accepted: FieldConfig = { name: 'is_accepted', label: 'Accepted', type: 'boolean' }
const day: FieldConfig = {
  name: 'day_of_week',
  label: 'Weekday',
  type: 'select',
  required: true,
  options: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    .map((label, value) => ({ label, value: String(value) })),
}
const branch: FieldConfig = { name: 'branch_id', label: 'Branch', type: 'select', required: true, source: 'branches', sourceLabel: 'name' }
const doctor: FieldConfig = { name: 'doctor_id', label: 'Doctor', type: 'select', required: true, source: 'doctors', sourceLabel: 'full_name' }
const specialty: FieldConfig = { name: 'specialty_id', label: 'Specialty', type: 'select', source: 'specialties', sourceLabel: 'name' }
const service: FieldConfig = { name: 'service_id', label: 'Service', type: 'select', required: true, source: 'services', sourceLabel: 'name' }
const room: FieldConfig = { name: 'room_id', label: 'Room', type: 'select', source: 'rooms', sourceLabel: 'room_number' }
export const roomTypeOptions = [
  { value: 'consultation', label: 'كشف / استشارة' },
  { value: 'laser', label: 'ليزر' },
  { value: 'peeling', label: 'تقشير' },
  { value: 'injection', label: 'حقن' },
  { value: 'skin_care', label: 'عناية بالبشرة' },
]

export const masterDataConfigs: Record<string, ResourceConfig> = {
  clinics: {
    title: 'Clinics', singular: 'Clinic', singleton: true,
    description: 'Manage the active clinic profile and availability.',
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'whatsapp_number', label: 'WhatsApp number' },
      { name: 'phone', label: 'Phone' },
      { name: 'timezone', label: 'Timezone', required: true },
      { name: 'default_language', label: 'Default language', type: 'select', required: true, options: [{ value: 'ar', label: 'Arabic' }, { value: 'en', label: 'English' }] },
      active,
    ],
    columns: ['name', 'phone', 'timezone', 'default_language', 'is_active'],
  },
  branches: {
    title: 'Branches', singular: 'Branch', description: 'Manage clinic locations and their operating status.',
    fields: [{ name: 'name', label: 'Branch Name', required: true, helper: 'Enter the branch name only, for example “Al Rawdah Branch”.' }, { name: 'city', label: 'City', required: true, helper: 'Choose or enter the city, for example “Jeddah”.' }, { name: 'address', label: 'Address', type: 'textarea' }, { name: 'google_maps_url', label: 'Google Maps URL' }, { name: 'timezone', label: 'Timezone', required: true }, active],
    columns: ['name', 'city', 'address', 'timezone', 'is_active'],
  },
  'branch-working-hours': {
    title: 'Branch Working Hours', singular: 'Working hour', description: 'Configure the weekly schedule for each branch.',
    fields: [branch, day, { name: 'opens_at', label: 'Opens at', type: 'time' }, { name: 'closes_at', label: 'Closes at', type: 'time' }, { name: 'is_closed', label: 'Closed', type: 'boolean' }],
    columns: ['branch_id', 'day_of_week', 'opens_at', 'closes_at', 'is_closed'],
  },
  'clinic-holidays': {
    title: 'Clinic Holidays', singular: 'Holiday', description: 'Manage clinic and branch closures or adjusted hours.',
    fields: [{ ...branch, required: false }, { name: 'holiday_date', label: 'Date', type: 'date', required: true }, { name: 'name', label: 'Name' }, { name: 'is_closed', label: 'Closed', type: 'boolean' }, { name: 'opens_at', label: 'Opens at', type: 'time' }, { name: 'closes_at', label: 'Closes at', type: 'time' }],
    columns: ['holiday_date', 'name', 'branch_id', 'is_closed'],
  },
  specialties: {
    title: 'Specialties', singular: 'Specialty', description: 'Maintain the clinic specialty catalog.',
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description', type: 'textarea' }, active],
    columns: ['name', 'description', 'is_active'],
  },
  doctors: {
    title: 'Doctors', singular: 'Doctor', description: 'Manage doctors and their clinical status.',
    fields: [{ name: 'full_name', label: 'Full name', required: true }, { name: 'title', label: 'Title' }, { name: 'gender', label: 'Gender' }, { name: 'bio', label: 'Biography', type: 'textarea' }, active],
    columns: ['full_name', 'title', 'gender', 'is_active'],
  },
  'doctor-specialties': {
    title: 'Doctor Specialties', singular: 'Doctor specialty', description: 'Assign normalized specialties to doctors.',
    fields: [doctor, { ...specialty, required: true }],
    columns: ['doctor_id', 'specialty_id'],
  },
  'doctor-working-hours': {
    title: 'Doctor Working Hours', singular: 'Doctor schedule', description: 'Configure weekly doctor availability by branch.',
    fields: [doctor, branch, day, { name: 'start_time', label: 'Start time', type: 'time', required: true }, { name: 'end_time', label: 'End time', type: 'time', required: true }, active],
    columns: ['doctor_id', 'branch_id', 'day_of_week', 'start_time', 'end_time', 'is_active'],
  },
  'doctor-time-off': {
    title: 'Doctor Time Off', singular: 'Doctor time off', description: 'Record doctor leave and unavailability.',
    fields: [doctor, { name: 'start_datetime', label: 'Starts', type: 'datetime-local', required: true }, { name: 'end_datetime', label: 'Ends', type: 'datetime-local', required: true }, { name: 'reason', label: 'Reason', type: 'textarea' }],
    columns: ['doctor_id', 'start_datetime', 'end_datetime', 'reason'],
  },
  rooms: {
    title: 'Rooms', singular: 'Room', description: 'Manage rooms within active-clinic branches.',
    fields: [{ ...branch, readOnlyOnEdit: true }, { name: 'room_number', label: 'Room number', required: true }, { name: 'room_name', label: 'Room name', required: true }, { name: 'room_type', label: 'Room type', type: 'select', required: true, options: roomTypeOptions }, active],
    columns: ['room_number', 'room_name', 'branch_id', 'room_type', 'is_active', 'updated_at'],
  },
  'room-time-off': {
    title: 'Room Time Off', singular: 'Room time off', description: 'Record room maintenance and unavailability.',
    fields: [{ ...room, required: true }, { name: 'start_datetime', label: 'Starts', type: 'datetime-local', required: true }, { name: 'end_datetime', label: 'Ends', type: 'datetime-local', required: true }, { name: 'reason', label: 'Reason', type: 'textarea' }],
    columns: ['room_id', 'start_datetime', 'end_datetime', 'reason'],
  },
  services: {
    title: 'Services', singular: 'Service', description: 'Manage bookable clinic services and requirements.',
    fields: [{ ...specialty, required: false }, { name: 'name', label: 'Name', required: true }, { name: 'aliases', label: 'Aliases', type: 'array' }, { name: 'description', label: 'Description', type: 'textarea' }, { name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', required: true }, { name: 'requires_doctor', label: 'Requires doctor', type: 'boolean' }, { name: 'requires_room', label: 'Requires room', type: 'boolean' }, { name: 'is_booking_enabled', label: 'Booking enabled', type: 'boolean' }, active, { name: 'display_order', label: 'Display order', type: 'number' }],
    columns: ['name', 'duration_minutes', 'requires_doctor', 'requires_room', 'is_booking_enabled', 'is_active'],
  },
  'service-pre-questions': {
    title: 'Service Pre Questions', singular: 'Pre question', description: 'Manage ordered questions shown before booking.',
    fields: [service, { name: 'question_text', label: 'Question', type: 'textarea', required: true }, { name: 'answer_type', label: 'Answer type', required: true }, { name: 'blocking_answer', label: 'Blocking answer' }, active, { name: 'display_order', label: 'Display order', type: 'number' }],
    columns: ['service_id', 'question_text', 'answer_type', 'display_order', 'is_active'],
  },
  'payment-methods': {
    title: 'Payment Methods', singular: 'Payment method', description: 'Manage accepted clinic payment methods.',
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code', required: true }, active],
    columns: ['name', 'code', 'is_active'],
  },
  'insurance-companies': {
    title: 'Insurance Companies', singular: 'Insurance company', description: 'Manage insurance providers accepted by the clinic.',
    fields: [{ name: 'name', label: 'Name', required: true }, active],
    columns: ['name', 'is_active'],
  },
  'insurance-classes': {
    title: 'Insurance Classes', singular: 'Insurance class', description: 'Manage accepted classes for each insurance company.',
    fields: [{ name: 'insurance_company_id', label: 'Insurance company', type: 'select', required: true, source: 'insurance-companies', sourceLabel: 'name' }, { name: 'class_name', label: 'Class name', required: true }, accepted],
    columns: ['insurance_company_id', 'class_name', 'is_accepted'],
  },
}
