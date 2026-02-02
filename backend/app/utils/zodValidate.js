const z = require('zod');
const { Role, UserStatus, EventStatus } = require('@prisma/client');

/* =====================
   Regex
===================== */
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* =====================
   Schema USER CREATE & PATCH
===================== */
const baseUserFields = {
  email: z.string().regex(emailRegex, { message: "Email non valida" }),

  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),

  role: z.enum(Role).optional(),
  status: z.enum(UserStatus).optional(),

  startDate: z
    .string()
    .regex(dateRegex, "Formato data non valido (YYYY-MM-DD)")
    .refine((value) => {
      const [y, m, d] = value.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      return (
        date.getFullYear() === y &&
        date.getMonth() === m - 1 &&
        date.getDate() === d
      );
    }, "Data non valida")
    .transform((value) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d); // <-- ritorna oggetto Date
  }),

  endDate: z
    .string()
    .regex(dateRegex, "Formato data non valido (YYYY-MM-DD)")
    .refine((value) => {
      const [y, m, d] = value.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      return (
        date.getFullYear() === y &&
        date.getMonth() === m - 1 &&
        date.getDate() === d
      );
    }, "Data non valida")
    .transform((value) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d); // <-- ritorna oggetto Date
  }),

  medicalCertificateExpiryDate: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string()
      .regex(dateRegex, "Formato data non valido (YYYY-MM-DD)")
      .refine((value) => {
        const [y, m, d] = value.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return (
          date.getFullYear() === y &&
          date.getMonth() === m - 1 &&
          date.getDate() === d
        );
      }, "Data non valida")
      .refine((value) => {
        const date = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date >= today;
      }, "Il certificato medico è scaduto")
      .transform((value) => {
        const [y, m, d] = value.split("-").map(Number);
        return new Date(y, m - 1, d);
      })
      .optional()
  ),

  amount: z.coerce.number().positive("L'importo deve essere maggiore di 0"),

  ingressi: z.coerce.number().positive("Gli ingressi devono essere maggiori di 0"),

  currency: z.string().length(3).optional(),

  groups: z.array(z.coerce.number().int()).optional(),
};

/* =====================
   POST /users
===================== */
const userPostSchema = z
  .object({
    ...baseUserFields,
    password: z
      .string()
      .min(8, "La password deve avere almeno 8 caratteri"),
  })
  .superRefine((data, ctx) => {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      ctx.addIssue({
        path: ["startDate"],
        message: "La data di inizio non può essere successiva a quella di fine",
      });
    }
  });

const validateUserPostBody = (body) => {
  return userPostSchema.parse(body);
};

/* =====================
   PUT /users/:id
===================== */
const userPutSchema = z
  .object({
    ...baseUserFields,
    password: z
      .string()
      .min(8, "La password deve avere almeno 8 caratteri")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      ctx.addIssue({
        path: ["startDate"],
        message: "La data di inizio non può essere successiva a quella di fine",
      });
    }
  });

const validateUserPutBody = (body) => {
  return userPutSchema.parse(body);
};

/* =====================
   Schema EVENT CREATE & PATCH
===================== */
const baseEventSchema = z.object({
  title: z.string().min(1, "Titolo obbligatorio"),
  description: z.string().min(1, "Descrizione obbligatoria"),
  equipment: z.string().min(1, "Attrezzatura obbligatoria"),
  location: z.string().min(1, "Posto obbligatorio"),
  note: z.string().optional(),
  status: z.enum(EventStatus).optional(),

  date: z
    .string()
    .regex(dateRegex, "Formato data non valido (YYYY-MM-DD)")
    .refine((value) => {
      const [y, m, d] = value.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      return (
        date.getFullYear() === y &&
        date.getMonth() === m - 1 &&
        date.getDate() === d
      );
    }, "Data non valida")
    .transform((value) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d); // <-- ritorna oggetto Date
  }),

  startTime: z.string().regex(timeRegex, "Formato ora non valido (HH:MM)"),
  endTime: z.string().regex(timeRegex, "Formato ora non valido (HH:MM)"),

  maxSlots: z
    .coerce.number({ invalid_type_error: "Deve essere un numero" })
    .int()
    .min(1, "Deve essere un numero maggiore di 0"),

  categoryId: z.coerce.number().int("Categoria non valida"),
});

/* =====================
   POST /events
===================== */
const validateEventBody = (body) => {
  return baseEventSchema
    .superRefine((data, ctx) => {
      const [sh, sm] = data.startTime.split(":").map(Number);
      const [eh, em] = data.endTime.split(":").map(Number);

      if (sh * 60 + sm > eh * 60 + em) {
        ctx.addIssue({
          path: ["startTime"],
          message:
            "L'orario di inizio non può essere successivo a quello di fine",
        });
      }
    })
    .parse(body);
};

/* =====================
   PATCH /events/:id
===================== */
const validateEventPatchBody = (body) => {
  return baseEventSchema
    .partial()
    .superRefine((data, ctx) => {
      if (data.startTime && data.endTime) {
        const [sh, sm] = data.startTime.split(":").map(Number);
        const [eh, em] = data.endTime.split(":").map(Number);

        if (sh * 60 + sm > eh * 60 + em) {
          ctx.addIssue({
            path: ["startTime"],
            message:
              "L'orario di inizio non può essere successivo a quello di fine",
          });
        }
      }
    })
    .parse(body);
};

/* =====================
   EXPORTS
===================== */
module.exports = {
  validateUserPostBody,
  validateUserPutBody,
  validateEventBody,
  validateEventPatchBody
};
