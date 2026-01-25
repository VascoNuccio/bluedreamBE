const express = require('express');
const { PrismaClient, SubscriptionStatus, UserStatus, EventStatus, Role } = require('@prisma/client');
const prisma = new PrismaClient();
const { hashPassword } = require('../utils/password');
const { createSubscriptionWithGroups } = require('../utils/subscription');
const { validateUserPostBody, validateUserPutBody, validateEventBody, validateEventPatchBody } = require('../utils/zodValidate');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Admin
 *     description: Operazioni di amministrazione
 */

/* ================================
   CREATE USER (ADMIN + SUBSCRIPTION)
================================ */
/**
 * @swagger
 * /admin/users:
 *   post:
 *     summary: Crea un nuovo utente con subscription
 *     description: >
 *       Creazione di un nuovo utente da parte di un amministratore.
 *       Viene creata una subscription ACTIVE e l'utente può essere assegnato a gruppi.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - startDate
 *               - endDate
 *               - amount
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@email.com
 *               password:
 *                 type: string
 *                 example: password123
 *               firstName:
 *                 type: string
 *                 example: Mario
 *               lastName:
 *                 type: string
 *                 example: Rossi
 *               role:
 *                 type: string
 *                 enum: [USER, ADMIN]
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: 2025-01-01
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: 2025-12-31
 *               amount:
 *                 type: number
 *                 example: 120
 *               groups:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: Lista ID dei gruppi da assegnare all'utente
 *     responses:
 *       201:
 *         description: Utente creato con subscription ACTIVE
 *       400:
 *         description: Utente già esistente o dati mancanti
 *       403:
 *         description: Accesso negato
 *       500:
 *         description: Errore server
 */
router.post('/users', async (req, res) => {
  try {
    
    const validated = validateUserPostBody(req.body);

    const {
      email,
      password,
      firstName,
      lastName,
      role,
      startDate,
      endDate,
      amount,
      currency,
      groups,
    } = validated;

    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // Se era cancellato, riattiviamo
      if (user.status === UserStatus.CANCELLED) {
        user = await prisma.user.update({
          where: { email },
          data: { status: UserStatus.SUBSCRIBED }
        });
      } else {
        return res.status(400).json({ message: 'Utente già registrato' });
      }
    } else {
      // Hash password
      const hashedPassword = await hashPassword(password);
    
      // Creazione utente nuovo
      user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName: firstName || null,
          lastName: lastName || null,
          role: role || Role.USER,
          status: UserStatus.SUBSCRIBED
        }
      });
    }

    // Creazione subscription e assegnazione gruppi
    const subscription = await createSubscriptionWithGroups({ userId: user.id, ...req.body })

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status
      },
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        amount: subscription.amount
      }
    });

  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({ message: 'Errore nella creazione dell\'utente' });
  }
});

/* ================================
   UPDATE USER (ADMIN + SUBSCRIPTION)
================================ */
/**
 * @swagger
 * /admin/users/{id}:
 *   put:
 *     summary: Aggiorna un utente e la sua subscription
 *     description: >
 *       Aggiornamento dei dati utente da parte di un amministratore.
 *       È possibile aggiornare la subscription e i gruppi associati.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *         description: ID dell'utente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@email.com
 *               password:
 *                 type: string
 *                 example: newPassword123
 *               firstName:
 *                 type: string
 *                 example: Mario
 *               lastName:
 *                 type: string
 *                 example: Rossi
 *               role:
 *                 type: string
 *                 enum: [USER, ADMIN]
 *               status:
 *                 type: string
 *                 enum: [SUBSCRIBED, CANCELLED]
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: 2025-01-01
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: 2025-12-31
 *               amount:
 *                 type: number
 *                 example: 120
 *               groups:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: Lista ID dei gruppi
 *     responses:
 *       200:
 *         description: Utente aggiornato correttamente
 *       400:
 *         description: Dati non validi
 *       404:
 *         description: Utente non trovato
 *       403:
 *         description: Accesso negato
 *       500:
 *         description: Errore server
 */
router.put("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({ message: "ID utente non valido" });
    }

    // VALIDAZIONE BODY
    const validated = validateUserPutBody(req.body);

    // Verifica esistenza utente
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    /* =====================
       UPDATE USER
    ===================== */
    const userData = {
      email: validated.email,
      firstName: validated.firstName ?? null,
      lastName: validated.lastName ?? null,
      role: validated.role,
      status: validated.status,
    };

    if (validated.password) {
      userData.password = await hashPassword(validated.password);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: userData,
    });

    /* =====================
       UPDATE SUBSCRIPTION
    ===================== */
    let subscription = null;

    const hasSubscriptionData =
      validated.startDate ||
      validated.endDate ||
      validated.amount ||
      validated.currency;

    if (hasSubscriptionData) {
      const existingSubscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: SubscriptionStatus.ACTIVE,
        },
      });

      if (existingSubscription) {
        subscription = await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: {
            startDate:
              validated.startDate ?? existingSubscription.startDate,
            endDate:
              validated.endDate ?? existingSubscription.endDate,
            amount:
              validated.amount ?? existingSubscription.amount,
            ingressi:
              validated.ingressi ?? existingSubscription.ingressi,
            currency:
              validated.currency ?? existingSubscription.currency,
          },
        });
      }
    }

    /* =====================
       UPDATE GROUPS
    ===================== */
    if (Array.isArray(validated.groups) && validated.groups.length > 0) {
      await prisma.userGroup.deleteMany({
        where: { userId },
      });

      const activeSubscription = await prisma.subscription.findFirst({
        where: { userId, status: SubscriptionStatus.ACTIVE }
      });
    
      if (!activeSubscription) {
        return res
        .status(500)
        .json({ message: "Non esiste una subscription attiva per assegnare i gruppi"});
      }

      await prisma.userGroup.createMany({
        data: validated.groups.map(groupId => ({
          userId,
          groupId,
          subscriptionId: activeSubscription.id,
          validFrom: activeSubscription.startDate,
          validTo: activeSubscription.endDate,
          isActive: true
        }))
      });
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
      subscription,
    });
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({
        error: true,
        message: error.issues.map((e) => e.message).join(", "),
        errors: error.issues,
      });
    }

    console.error("Admin update user error:", error);
    return res
      .status(500)
      .json({ message: "Errore nell'aggiornamento dell'utente" });
  }
});

/* ================================
   GET ALL USERS (ADMIN)
================================ */
/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Recupera tutti gli utenti
 *     description: >
 *       Recupera la lista di tutti gli utenti con le relative subscription
 *       e i gruppi assegnati. Accessibile solo agli amministratori.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista utenti recuperata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: number
 *                   email:
 *                     type: string
 *                   firstName:
 *                     type: string
 *                     nullable: true
 *                   lastName:
 *                     type: string
 *                     nullable: true
 *                   role:
 *                     type: string
 *                     enum: [USER, ADMIN]
 *                   status:
 *                     type: string
 *                   subscriptions:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         status:
 *                           type: string
 *                         startDate:
 *                           type: string
 *                           format: date-time
 *                         endDate:
 *                           type: string
 *                           format: date-time
 *                         amount:
 *                           type: number
 *                   groups:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         groupId:
 *                           type: number
 *                         subscriptionId:
 *                           type: number
 *                         validFrom:
 *                           type: string
 *                           format: date-time
 *                         validTo:
 *                           type: string
 *                           format: date-time
 *       403:
 *         description: Accesso negato
 *       500:
 *         description: Errore server
 */
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        subscriptions: {
          orderBy: { startDate: 'desc' }
        },
        groups: {
          include: {
            group: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      subscriptions: user.subscriptions.map(sub => ({
        id: sub.id,
        status: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
        amount: sub.amount,
        currency: sub.currency
      })),
      groups: user.groups.map(ug => ({
        groupId: ug.groupId,
        groupName: ug.group?.name,
        subscriptionId: ug.subscriptionId,
        validFrom: ug.validFrom,
        validTo: ug.validTo,
        isActive: ug.isActive
      }))
    }));

    res.status(200).json(formattedUsers);

  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ message: 'Errore nel recupero degli utenti' });
  }
});


/* ================================
   DISABLE USER (soft delete)
================================ */
/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     summary: Disabilita un utente
 *     description: Disabilita un utente impostando lo status a CANCELLED
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Utente disabilitato
 *       404:
 *         description: Utente non trovato
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    // Disabilita utente
    await prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.CANCELLED }
    });

    // Rimuove l’utente da TUTTI gli eventi
    await prisma.eventSignup.deleteMany({
      where: { userId }
    });

    res.json({
      message: 'Utente disabilitato e rimosso da tutti i turni'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Errore server' });
  }
});

/* ================================
   DELETE USER (force delete)
================================ */
/**
 * @swagger
 * /admin/users/{id}/force:
 *   delete:
 *     summary: Elimina definitivamente un utente
 *     description: >
 *       Cancella definitivamente un utente dal database
 *       rimuovendo anche iscrizioni eventi, gruppi e subscription.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Utente eliminato definitivamente
 *       404:
 *         description: Utente non trovato
 */
router.delete('/users/:id/force', async (req, res) => {
  try {
    const userId = req.params.id;

    await prisma.$transaction([
      // Rimuove l’utente da TUTTI gli eventi
      prisma.eventSignup.deleteMany({
        where: { userId }
      }),

      // Disattiva/rimuove gruppi associati
      prisma.userGroup.deleteMany({
        where: { userId }
      }),

      // Rimuove subscription
      prisma.subscription.deleteMany({
        where: { userId }
      }),

      // Elimina definitivamente l’utente
      prisma.user.delete({
        where: { id: userId }
      })
    ]);

    res.json({
      message: 'Utente eliminato definitivamente'
    });
  } catch (err) {
    console.error(err);

    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Utente non trovato' });
    }

    res.status(500).json({ message: 'Errore server' });
  }
});

/* ================================
   GET USER STATUSES (ADMIN)
================================ */
/**
 * @swagger
 * /admin/users/statuses:
 *   get:
 *     summary: Recupera gli status disponibili per gli utenti
 *     description: >
 *       Recupera la lista degli status possibili per l'utente
 *       definiti negli enum Prisma.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista status utente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userStatuses:
 *                   type: array
 *                   items:
 *                     type: string
 *       403:
 *         description: Accesso negato
 *       500:
 *         description: Errore server
 */
router.get('/users/statuses', (req, res) => {
  try {
    res.status(200).json({
      userStatuses: Object.values(UserStatus)
    });
  } catch (error) {
    console.error('Admin get user statuses error:', error);
    res.status(500).json({ message: "Errore nel recupero degli status utente" });
  }
});

/* ================================
   GET MONTH EVENTS (USER)
================================ */
/**
 * @swagger
 * /user/events/month:
 *   get:
 *     summary: Recupera gli eventi del mese
 *     description: Restituisce tutti gli eventi schedulati del mese indicato
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *           example: 2025
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *           example: 5
 *     responses:
 *       200:
 *         description: Lista eventi del mese
 *       401:
 *         description: Non autenticato
 */
router.get('/all-events/month', async (req, res) => {
  const { year, month, userEmail } = req.query;

  const events = await prisma.event.findMany({
    where: {
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      }
    },
    include: {
      signups: {
        select: {
          user: { select: { email: true } }
        }
      }
    }
  });

  // Trasforma per il FE
  const formattedEvents = events.map(ev => ({
    ...ev,
    partecipanti: ev.signups.map(s => s.user.email)
  }));

  res.json({ events: formattedEvents });
});

/* ================================
   GET DAY EVENTS (USER)
================================ */
/**
 * @swagger
 * /user/events/day:
 *   get:
 *     summary: Recupera gli eventi di un giorno specifico
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *           example: 2025
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *           example: 5
 *       - in: query
 *         name: day
 *         required: true
 *         schema:
 *           type: integer
 *           example: 12
 *     responses:
 *       200:
 *         description: Lista eventi del giorno
 *       401:
 *         description: Non autenticato
 */
router.get('/all-events/day', async (req, res) => {
  const { year, month, day } = req.query;

  const events = await prisma.event.findMany({
    where: {
      date: {
        gte: new Date(year, month - 1, day),
        lt: new Date(year, month - 1, Number(day) + 1)
      }
    },
    include: {
      signups: {
        select: {
          user: {
            select: {
              email: true
            }
          }
        }
      }
    }
  });

  // Trasforma per il FE
  const formattedEvents = events.map(ev => ({
    ...ev,
    partecipanti: ev.signups.map(s => s.user.email)
  }));

  res.json({ events: formattedEvents });
});

/* ================================
   CREATE EVENT
================================ */
/**
 * @swagger
 * /admin/events:
 *   post:
 *     summary: Crea un evento
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - date
 *               - startTime
 *               - endTime
 *               - categoryId
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               equipment:
 *                 type: string
 *               note:
 *                 type: string
 *               location:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               startTime:
 *                 type: string
 *               endTime:
 *                 type: string
 *               maxSlots:
 *                 type: number
 *               categoryId:
 *                 type: number
 *     responses:
 *       201:
 *         description: Evento creato
 */
router.post("/events", async (req, res) => {

  try {
    const validatedBody = validateEventBody(req.body);

    const event = await prisma.event.create({
      data: {
        ...validatedBody,
        creatorId: req.user.userId,
      },
    });

    res.status(201).json(event);
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({
        error: true,
        message: error.issues.map((e) => e.message).join(", "),
        errors: error.issues,
      });
    }

    console.error("Admin create event error:", error);
    res.status(500).json({ error: true, message: "Errore interno" });
  }
});

/* ================================
   UPDATE EVENT
================================ */
/**
 * @swagger
 * /admin/events/{id}:
 *   patch:
 *     summary: Modifica un evento
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Evento aggiornato
 */
router.patch("/events/:id", async (req, res) => {
  try {
    const validatedBody = validateEventPatchBody(req.body);

    const event = await prisma.event.update({
      where: { id: Number(req.params.id) },
      data: validatedBody,
    });

    res.json(event);
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({
        error: true,
        message: error.issues.map((e) => e.message).join(", "),
        errors: error.issues,
      });
    }

    res.status(500).json({ error: true, message: "Errore interno" });
  }
});

/* ================================
   CANCEL EVENT (soft delete)
================================ */
/**
 * @swagger
 * /admin/events/{id}:
 *   delete:
 *     summary: Cancella un evento
 *     description: Imposta lo status dell'evento a CANCELLED
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Evento cancellato
 */
router.delete('/events/:id', async (req, res) => {
  try {
    await prisma.event.update({
      where: { id: Number(req.params.id) },
      data: { status: EventStatus.CANCELLED }
    });

    res.json({ message: 'Evento cancellato' });
  } catch (error) {

    res.status(500).json({
      error: true,
      message: "Errore interno"
    });
  }
});

/* ================================
   DELETE EVENT (hard delete)
================================ */
/**
 * @swagger
 * /admin/events/{id}/hard:
 *   delete:
 *     summary: Elimina definitivamente un evento
 *     description: >
 *       Cancella l'evento dal database.
 *       Tutte le prenotazioni (EventSignup) collegate
 *       vengono eliminate automaticamente.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Evento eliminato definitivamente
 *       404:
 *         description: Evento non trovato
 */
router.delete('/events/:id/hard', async (req, res) => {
  try {
    await prisma.event.deleteMany({
      where: { 
        id: Number(req.params.id),
        status: EventStatus.CANCELLED
       }
    });

    res.json({ message: 'Evento eliminato definitivamente' });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({
        error: true,
        message: "Evento non trovato"
      });
    }

    res.status(500).json({
      error: true,
      message: "Errore interno"
    });
  }
});


/* ================================
   RESTORE EVENT
================================ */
/**
 * @swagger
 * /admin/events/{id}/restore:
 *   patch:
 *     summary: Ripristina un evento cancellato
 *     description: >
 *       Riporta un evento dallo stato CANCELLED a SCHEDULED.
 *       Non modifica altri campi dell'evento.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *           example: 10
 *     responses:
 *       200:
 *         description: Evento ripristinato
 *       404:
 *         description: Evento non trovato
 */
router.patch("/events/:id/restore", async (req, res) => {
  try {
    const event = await prisma.event.update({
      where: { id: Number(req.params.id) },
      data: {
        status: EventStatus.SCHEDULED
      }
    });

    res.json(event);
  } catch (error) {

    res.status(500).json({
      error: true,
      message: "Errore interno"
    });
  }
});


/* ================================
   ADMIN - ADD EVENT PARTICIPANTS (BULK)
   - inserisce uno o più utenti a un evento
   - ignora duplicati
================================ */
/**
 * @swagger
 * /admin/events/{eventId}/participants:
 *   post:
 *     summary: Aggiunge uno o più partecipanti a un evento
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIds
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["uuid-1", "uuid-2"]
 *     responses:
 *       201:
 *         description: Partecipanti aggiunti
 */
router.post('/events/:eventId/participants', async (req, res) => {
  const eventId = Number(req.params.eventId);
  const { userIds } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: 'userIds non valido' });
  }

  await prisma.eventSignup.createMany({
    data: userIds.map(userId => ({
      userId,
      eventId
    })),
    skipDuplicates: true // evita errori se già iscritti
  });

  res.status(201).json({ message: 'Partecipanti aggiunti correttamente' });
});

/* ================================
   ADMIN - REMOVE EVENT PARTICIPANTS (BULK)
   - rimuove uno o più utenti da un evento
================================ */
/**
 * @swagger
 * /admin/events/{eventId}/participants:
 *   delete:
 *     summary: Rimuove uno o più partecipanti da un evento
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIds
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["uuid-1", "uuid-2"]
 *     responses:
 *       200:
 *         description: Partecipanti rimossi
 */
router.delete('/events/:eventId/participants', async (req, res) => {
  const eventId = Number(req.params.eventId);
  const { userIds } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: 'userIds non valido' });
  }

  await prisma.eventSignup.deleteMany({
    where: {
      eventId,
      userId: { in: userIds }
    }
  });

  res.json({ message: 'Partecipanti rimossi correttamente' });
});


/* ================================
   GET ALL GROUPS
================================ */
/**
 * @swagger
 * /admin/groups:
 *   get:
 *     summary: Recupera tutti i gruppi
 *     description: >
 *       Recupera la lista di tutti i gruppi disponibili.
 *       Accessibile solo agli amministratori.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista gruppi recuperata con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: number
 *                   name:
 *                     type: string
 *                   level:
 *                     type: string
 *                   description:
 *                     type: string
 *                     nullable: true
 *                   users:
 *                     type: array
 *                     items:
 *       403:
 *         description: Accesso negato
 *       500:
 *         description: Errore server
 */
router.get('/groups', async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      orderBy: {
        name: 'desc'
      }
    });

    res.status(200).json(groups);
  } catch (error) {
    console.error('Admin get groups error:', error);
    res.status(500).json({ message: 'Errore nel recupero dei gruppi' });
  }
});

/* ================================
   CREATE GROUP
================================ */
/**
 * @swagger
 * /admin/groups:
 *   post:
 *     summary: Crea un gruppo
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - level
 *             properties:
 *               name:
 *                 type: string
 *               level:
 *                 type: string
 *                 enum: [ALL, OPEN, ADVANCED, DEPTH]
 *                 example: OPEN
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Gruppo creato
 *       409:
 *         description: Nome gruppo già esistente
 *       500:
 *         description: Errore server
 */
router.post('/groups', async (req, res) => {
  const { name, level, description } = req.body;

  if(!name || name.trim() === '') {
    return res.status(400).json({
      message: 'Il nome del gruppo è obbligatorio',
      field: 'name',
    });
  }

  if(!level || level.trim() === '') {
    return res.status(400).json({
      message: 'Il livello del gruppo è obbligatorio',
      field: 'name',
    });
  }

  try {
    const group = await prisma.group.create({
      data: {
        name,
        level,
        description,
      },
    });

    res.status(201).json(group);
  } catch (error) {

    // UNIQUE constraint (name)
    if (error.code === 'P2002') {
      return res.status(409).json({
        message: `Il gruppo "${name}" esiste già`,
        field: 'name',
      });
    }

    res.status(500).json({
      message: 'Errore durante la creazione del gruppo',
    });
  }
});


/* ================================
   UPDATE GROUP
================================ */
/**
 * @swagger
 * /admin/groups/{id}:
 *   put:
 *     summary: Aggiorna un gruppo
 *     description: >
 *       Aggiorna il nome e/o la descrizione di un gruppo esistente.
 *       Accessibile solo agli amministratori.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del gruppo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               level:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Gruppo aggiornato con successo
 *       404:
 *         description: Gruppo non trovato
 *       500:
 *         description: Errore server
 */
router.put('/groups/:id', async (req, res) => {
  const groupId = Number(req.params.id);

  if(!req.body.name || req.body.name.trim() === '') {
    return res.status(400).json({
      message: 'Il nome del gruppo è obbligatorio',
      field: 'name',
    });
  }

  if(!req.body.level || req.body.level.trim() === '') {
    return res.status(400).json({
      message: 'Il livello del gruppo è obbligatorio',
      field: 'level',
    });
  }

  try {
    const group = await prisma.group.update({
      where: { id: groupId },
      data: req.body,
    });

    res.status(200).json(group);
  } catch (error) {
    console.error('Admin update group error:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Gruppo non trovato' });
    }

    res.status(500).json({ message: 'Errore durante aggiornamento gruppo' });
  }
});

/* ================================
   DELETE GROUP (CHECK ASSOCIATIONS)
================================ */
/**
 * @swagger
 * /admin/groups/{id}:
 *   delete:
 *     summary: Elimina un gruppo (con controllo utenti associati)
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       204:
 *         description: Gruppo eliminato
 *       409:
 *         description: Gruppo con utenti associati
 *       404:
 *         description: Gruppo non trovato
 */
router.delete('/groups/:id', async (req, res) => {
  const groupId = Number(req.params.id);

  try {
    const assignments = await prisma.userGroup.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (assignments.length > 0) {
      return res.status(409).json({
        message: 'Il gruppo ha utenti associati',
        users: assignments.map(a => a.user),
        total: assignments.length,
      });
    }

    await prisma.group.delete({
      where: { id: groupId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Admin delete group error:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Gruppo non trovato' });
    }

    res.status(500).json({ message: 'Errore eliminazione gruppo' });
  }
});

/* ================================
   FORCE DELETE GROUP
================================ */
/**
 * @swagger
 * /admin/groups/{id}/force:
 *   delete:
 *     summary: Elimina un gruppo e tutte le associazioni utenti
 *     description: >
 *       Elimina il gruppo e rimuove tutte le associazioni
 *       utenti-gruppo collegate.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 */
router.delete('/groups/:id/force', async (req, res) => {
  const groupId = Number(req.params.id);

  try {
    await prisma.$transaction([
      prisma.userGroup.deleteMany({
        where: { groupId },
      }),
      prisma.group.delete({
        where: { id: groupId },
      }),
    ]);

    res.status(204).send();
  } catch (error) {
    console.error('Admin force delete group error:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Gruppo non trovato' });
    }

    res.status(500).json({ message: 'Errore eliminazione forzata gruppo' });
  }
});

/* ================================
   CREATE SUBSCRIPTION (ADMIN)
================================ */
/**
 * @swagger
 * /admin/subscriptions:
 *   post:
 *     summary: Crea una subscription per un utente
 *     description: >
 *       Crea una subscription e assegna l'utente a uno o più gruppi
 *       per un determinato periodo di validità.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - startDate
 *               - endDate
 *               - amount
 *               - groups
 *             properties:
 *               userId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               amount:
 *                 type: number
 *                 example: 120
 *               groups:
 *                 type: array
 *                 items:
 *                   type: number
 *     responses:
 *       201:
 *         description: Subscription creata
 */
router.post('/subscriptions', async (req, res) => {
  const { userId, startDate, endDate, amount, groups } = req.body;

  // Uso dell'utility centralizzata per creare subscription e assegnare gruppi
  const subscription = await createSubscriptionWithGroups({ userId, startDate, endDate, amount, groups });

  res.status(201).json(subscription);
});

/* ================================
   GET ALL EVENT CATEGORIES
================================ */
/**
 * @swagger
 * /admin/event-categories:
 *   get:
 *     summary: Recupera tutte le categorie di eventi
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista delle categorie
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   code:
 *                     type: string
 *                     example: 'COURSE_OPEN'
 *                   label:
 *                     type: string
 *                     example: 'Corso Open'
 *       500:
 *         description: Errore server
 */
router.get('/event-categories', async (req, res) => {
  try {
    const categories = await prisma.eventCategory.findMany({
      orderBy: { id: 'asc' }  // opzionale, ordina per id
    });
    res.json(categories);
  } catch (err) {
    console.error('Errore recupero EventCategory:', err);
    res.status(500).json({ message: 'Errore server' });
  }
});

module.exports = router;
