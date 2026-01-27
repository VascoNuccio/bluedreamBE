const z = require('zod');
const { Role, UserStatus, EventStatus, GroupLevel } = require('@prisma/client');

/* =====================
   Regex
===================== */
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* =====================
   Schema USER excel
===================== */
const baseUpsertExcelUserFields = {
  email: z.string().regex(emailRegex, { message: "Email non valida" }),

  password: z
    .string()
    .min(8, "La password deve avere almeno 8 caratteri").optional(),

  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),

  role: z.enum(Role).optional(),
  status: z.enum(UserStatus).optional(),
};

const validateUpsertUserExcelBody = (body) => {
  return baseUpsertExcelUserFields.parse(body);
};

const baseExcelUserFields = {
  email: z.string().regex(emailRegex, { message: "Email non valida" }),

  password: z
    .string()
    .min(8, "La password deve avere almeno 8 caratteri"),

  firstName: z.string().min(1),
  lastName: z.string().min(1),

  role: z.enum(Role),
  status: z.enum(UserStatus),
};

const validateUserExcelBody = (body) => {
  return baseExcelUserFields.parse(body);
};

/* ==========================
   Schema SUBSCRIPTION excel
=========================== */

const baseExcelSubscriptionFields = {

  userId: z.string({
    required_error: 'userId is required',
  }).min(1, 'userId cannot be empty'),

  // inserire date in questo formato 2024-01-31 2024/01/31
  startDate: z.coerce.date({
    required_error: 'startDate is required',
    invalid_type_error: 'startDate must be a valid date or date string',
  }),

  // inserire date in questo formato 2024-01-31 2024/01/31
  endDate: z.coerce.date({
    required_error: 'endDate is required',
    invalid_type_error: 'endDate must be a valid date or date string',
  }),

  amount: z.coerce.number({
    required_error: 'amount is required',
    invalid_type_error: 'amount must be a number or numeric string',
  }),

  ingressi: z.coerce.number({
    required_error: 'ingressi is required',
    invalid_type_error: 'ingressi must be a number or numeric string',
  }),

  currency: z.string({
    required_error: 'currency is required',
  }).min(1, 'currency cannot be empty'),

  status: z.string({
    required_error: 'status is required',
  }).min(1, 'status cannot be empty'),
};

const baseUpsertExcelSubscriptionFields = {

  id: z.coerce.number({
    required_error: 'id is required',
    invalid_type_error: 'id must be a number or numeric string',
  }),

  userId: z.string({
    required_error: 'userId is required',
  }).min(1, 'userId cannot be empty'),

  // inserire date in questo formato 2024-01-31 2024/01/31
  startDate: z.coerce.date({
    required_error: 'startDate is required',
    invalid_type_error: 'startDate must be a valid date or date string',
  }).optional(),

  // inserire date in questo formato 2024-01-31 2024/01/31
  endDate: z.coerce.date({
    required_error: 'endDate is required',
    invalid_type_error: 'endDate must be a valid date or date string',
  }).optional(),

  amount: z.coerce.number({
    required_error: 'amount is required',
    invalid_type_error: 'amount must be a number or numeric string',
  }).optional(),

  ingressi: z.coerce.number({
    required_error: 'ingressi is required',
    invalid_type_error: 'ingressi must be a number or numeric string',
  }).optional(),

  currency: z.string({
    required_error: 'currency is required',
  }).min(1, 'currency cannot be empty').optional(),

  status: z.string({
    required_error: 'status is required',
  }).min(1, 'status cannot be empty').optional(),
};

const validateUpsertSubscriptionExcelBody = (body) => {
    return baseUpsertExcelSubscriptionFields.parse(body);
};
const validateSubscriptionExcelBody = (body) => {
    return baseExcelSubscriptionFields.parse(body);
};

/*=======================
   Schema GROUP
=========================*/
const GroupExcelSchema = z.object({
  name: z.preprocess(
    (v) => (v ? String(v).trim() : ''),
    z.string().min(1, 'name is required')
  ),

  description: z.preprocess(
    (v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    },
    z.string().nullable()
  ),

  level: z.preprocess(
    (v) => {
      if (!v || String(v).trim() === '') return 'ALL';
      return String(v).trim().toUpperCase();
    },
    GroupLevel
  ),
});

/*=======================
   Schema USER GROUP
=========================*/

const excelDate = z.preprocess((value) => {
  if (value instanceof Date) return value;

  if (typeof value === 'number') {
    return new Date((value - 25569) * 86400 * 1000);
  }

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;

    const iso = new Date(s);
    if (!isNaN(iso.getTime())) return iso;

    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      const [, d, mth, y] = m;
      return new Date(+y, +mth - 1, +d);
    }
  }

  return value;
}, z.date());

export const UserGroupExcelSchema = z.object({
  userId: z.preprocess(
    (v) => (v ? String(v).trim() : ''),
    z.string().min(1, 'userId is required')
  ),

  groupName: z.preprocess(
    (v) => (v ? String(v).trim() : ''),
    z.string().min(1, 'groupName is required')
  ),

  subscriptionId: z.preprocess(
    (v) => Number(v),
    z.number().int().positive()
  ),

  validFrom: excelDate,
  validTo: excelDate,

  isActive: z.preprocess(
    (v) => {
      if (v === undefined || v === null || v === '') return true;
      if (typeof v === 'boolean') return v;
      return ['true', '1', 'yes', 'y'].includes(String(v).toLowerCase());
    },
    z.boolean()
  ),
});

/*=======================
   Schema CREATE EVENT
=========================*/

const EventExcelSchema = z.object({
  title: z.string().min(1, 'title è obbligatorio'),
  description: z.string().optional().nullable(),
  equipment: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  startTime: z.string().min(1, 'startTime è obbligatorio'),
  endTime: z.string().min(1, 'endTime è obbligatorio'),
  maxSlots: z.preprocess((v) => Number(v), z.number().int().positive().default(10)),
  status: z.enum(EventStatus).default('SCHEDULED'),
  categoryCode: z.string().min(1, 'categoryCode è obbligatorio').default('TRAINING_ALL'),
  creatorEmail: z.string().regex(emailRegex, { message: "Email non valida" }),
  monthCount: z.preprocess((v) => Number(v), z.number().int().min(1, 'monthCount minimo 1')).default(1),
  dayOfWeek: z.preprocess((v) => Number(v), z.number().int().min(0).max(6)).default(1),
});

/* =====================
   EXPORTS
===================== */
module.exports = {
  validateUserExcelBody,
  validateUpsertUserExcelBody,
  validateUpsertSubscriptionExcelBody, 
  validateSubscriptionExcelBody,
  GroupExcelSchema,
  EventExcelSchema
};