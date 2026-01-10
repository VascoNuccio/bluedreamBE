require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// JWT Secret (in production, use a strong secret from environment)
const JWT_SECRET = process.env.JWT_SECRET || '';
// JWT REFRESH Secret (in production, use a very strong secret from environment)
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "";

/* ================================
   GENERATE TOKENS
================================ */
const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );
};

/* ================================
   MIDDLEWARE: Verify JWT Token
================================ */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token mancante o non valido' });
  }
  const token = authHeader.substring(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token non valido o scaduto' });
  }
};

/* ================================
   MIDDLEWARE: Check if user is admin
================================ */
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Accesso negato: solo amministratori' });
  }
  next();
};

/* ================================
   AUTH: Refresh token
================================ */
app.post("/api/auth/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: "Refresh token mancante" });

    const user = await prisma.user.findFirst({ where: { refreshToken } });
    if (!user) return res.status(403).json({ message: "Refresh token non valido" });

    jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefreshToken } });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      token: newAccessToken,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }
    });

  } catch (error) {
    console.error("Refresh error:", error);
    res.status(401).json({ message: "Refresh token non valido o scaduto" });
  }
});

/* ================================
   AUTH: Register
================================ */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email e password sono obbligatori' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ message: 'Utente già registrato' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, firstName: firstName || null, lastName: lastName || null, role: 'USER' }
    });

    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Errore nella registrazione' });
  }
});

/* ================================
   AUTH: Login
================================ */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email e password sono obbligatori' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Credenziali errate' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Credenziali errate' });

    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ token, user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Errore durante il login' });
  }
});

/* ================================
   AUTH: Logout
================================ */
app.post("/api/auth/logout", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      await prisma.user.updateMany({
        where: { refreshToken },
        data: { refreshToken: null },
      });
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      path: '/',
    });

    res.json({ message: "Logout completato" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Errore durante il logout" });
  }
});

/*========================= API USER ===================================*/

  /* ================================
   CALENDAR: eventi per mese
   GET /api/calendar-events?email=X&year=YYYY&month=MM
   Used by: user, admin
   Method: getCalendarEvents
  ================================ */
  app.get('/api/calendar-events', verifyToken, async (req, res) => {
    try {
      const { email, year, month } = req.query;

      if (!year || !month) {
        return res.status(400).json({ message: 'Year e month sono obbligatori' });
      }

      // Calcolo intervallo del mese
      const startDate = new Date(`${year}-${month}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1); // primo giorno del mese successivo

      let user = null;

      // Se è fornita email → prendi user
      if (email) {
        user = await prisma.user.findUnique({
          where: { email },
        });
      }

      const events = await prisma.event.findMany({
        where: {
          date: {
            gte: startDate,
            lt: endDate
          }
        },
        include: {
          category: true,
          creator: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          },
          signups: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        },
        orderBy: [
          { date: 'asc' },
          { startTime: 'asc' }
        ]
      });

      // Se richiesta con email → indica se l’utente è iscritto
      const enrichedEvents = events.map(ev => {
        const userIsSignedUp =
          user && ev.signups.some(s => s.userId === user.id);

        const availableSlots = ev.maxSlots - ev.signups.length;

        return {
          ...ev,
          userIsSignedUp,
          availableSlots
        };
      });

      res.json({ events: enrichedEvents });
    } catch (error) {
      console.error('Calendar events error:', error);
      res.status(500).json({ message: 'Errore nel recupero degli eventi del calendario' });
    }
  });

  /* ================================
     TURNI: eventi per giorno
     GET /api/calendar/day?email=X&year=YYYY&month=MM&day=DD
     Used by: user, admin
     Method: getTurni
  =============================== */
  app.get('/api/calendar/day', verifyToken, async (req, res) => {
    try {
      const { email, year, month, day } = req.query;
      if (!year || !month || !day) return res.status(400).json({ message: 'Parametri mancanti' });

      const date = new Date(`${year}-${month}-${day}`);

      let user = null;
      if (email) user = await prisma.user.findUnique({ where: { email } });

      const events = await prisma.event.findMany({
        where: { date },
        include: {
          category: true,
          creator: { select: { id: true, email: true, firstName: true, lastName: true } },
          signups: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } }
        },
        orderBy: [{ startTime: 'asc' }]
      });

      const enriched = events.map(ev => ({
        ...ev,
        userIsSignedUp: user ? ev.signups.some(s => s.userId === user.id) : false,
        availableSlots: ev.maxSlots - ev.signups.length
      }));

      res.json({ turni: enriched });
    } catch (error) {
      console.error('Get turni error:', error);
      res.status(500).json({ message: 'Errore nel recupero dei turni' });
    }
  });

  /* ================================
     TURNI: prenota turno
     POST /api/calendar/prenota
     Used by: user
     Method: prenotaTurno
  =============================== */
  app.post('/api/calendar/prenota', verifyToken, async (req, res) => {
    try {
      const { email, dateKey, index } = req.body;
      const eventId = parseInt(index);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(404).json({ message: 'Utente non trovato' });

      const event = await prisma.event.findUnique({ where: { id: eventId }, include: { signups: true } });
      if (!event) return res.status(404).json({ message: 'Evento non trovato' });
      if (event.signups.length >= event.maxSlots) return res.status(400).json({ message: 'Evento al completo' });

      const existing = await prisma.eventSignup.findUnique({ where: { userId_eventId: { userId: user.id, eventId } } });
      if (existing) return res.status(400).json({ message: 'Già iscritto' });

      const signup = await prisma.eventSignup.create({ data: { userId: user.id, eventId } });
      res.status(201).json({ message: 'Prenotazione avvenuta', signup });
    } catch (error) {
      console.error('Prenota turno error:', error);
      res.status(500).json({ message: 'Errore nella prenotazione' });
    }
  });

  /* ================================
     TURNI: disdici turno
     POST /api/calendar/disdici
     Used by: user
     Method: disdiciTurno
  =============================== */
  app.post('/api/calendar/disdici', verifyToken, async (req, res) => {
    try {
      const { email, dateKey, index } = req.body;
      const eventId = parseInt(index);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(404).json({ message: 'Utente non trovato' });

      const signup = await prisma.eventSignup.findUnique({ where: { userId_eventId: { userId: user.id, eventId } } });
      if (!signup) return res.status(404).json({ message: 'Iscrizione non trovata' });

      await prisma.eventSignup.delete({ where: { id: signup.id } });
      res.json({ message: 'Iscrizione cancellata' });
    } catch (error) {
      console.error('Disdici turno error:', error);
      res.status(500).json({ message: 'Errore nella cancellazione' });
    }
  });

  /* ================================
     TURNI: aggiungi nuovo turno
     POST /api/admin/aggiungi-turno
     Used by: admin
     Method: saveNuovoTurno
  =============================== */
  app.post('/api/admin/aggiungi-turno', verifyToken, isAdmin, async (req, res) => {
    try {
      const { title, date, startTime, endTime, maxSlots, categoryId, location, description, equipment } = req.body;

      const event = await prisma.event.create({
        data: {
          title,
          date: new Date(date),
          startTime,
          endTime,
          maxSlots: maxSlots || 10,
          categoryId,
          location: location || null,
          description: description || null,
          equipment: equipment || null,
          creatorId: req.user.userId
        }
      });

      res.status(201).json({ message: 'Turno creato', event });
    } catch (error) {
      console.error('Aggiungi turno error:', error);
      res.status(500).json({ message: 'Errore nella creazione del turno' });
    }
  });

  /* ================================
     TURNI: elimina turno
     POST /api/admin/elimina-turno
     Used by: admin
     Method: deleteTurno
  =============================== */
  app.post('/api/admin/elimina-turno', verifyToken, isAdmin, async (req, res) => {
    try {
      const { index } = req.body;
      const eventId = parseInt(index);

      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) return res.status(404).json({ message: 'Turno non trovato' });

      await prisma.event.delete({ where: { id: eventId } });
      res.json({ message: 'Turno eliminato' });
    } catch (error) {
      console.error('Elimina turno error:', error);
      res.status(500).json({ message: 'Errore nell\'eliminazione del turno' });
    }
  });

  /* ================================
     TURNI: modifica turno
     POST /api/admin/modifica-turno
     Used by: admin
     Method: modificaTurno
  =============================== */
  app.post('/api/admin/modifica-turno', verifyToken, isAdmin, async (req, res) => {
    try {
      const { index, nameNewField, valueNewField } = req.body;
      const eventId = parseInt(index);

      const allowedFields = ['title','description','equipment','location','startTime','endTime','maxSlots','status','categoryId'];
      if (!allowedFields.includes(nameNewField)) return res.status(400).json({ message: 'Campo non modificabile' });

      const updateData = { [nameNewField]: valueNewField };
      const event = await prisma.event.update({ where: { id: eventId }, data: updateData });

      res.json({ message: 'Turno modificato', event });
    } catch (error) {
      console.error('Modifica turno error:', error);
      res.status(500).json({ message: 'Errore nella modifica del turno' });
    }
  });

  /* ================================
     TURNI: aggiungi partecipante a turno
     POST /api/admin/aggiungi-partecipante
     Used by: admin
     Method: savePartecipanteOnTurno
  =============================== */
  app.post('/api/admin/aggiungi-partecipante', verifyToken, isAdmin, async (req, res) => {
    try {
      const { email, turno } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(404).json({ message: 'Utente non trovato' });

      const eventId = parseInt(turno);
      const existing = await prisma.eventSignup.findUnique({ where: { userId_eventId: { userId: user.id, eventId } } });
      if (existing) return res.status(400).json({ message: 'Utente già iscritto' });

      const signup = await prisma.eventSignup.create({ data: { userId: user.id, eventId } });
      res.json({ message: 'Partecipante aggiunto', signup });
    } catch (error) {
      console.error('Aggiungi partecipante error:', error);
      res.status(500).json({ message: 'Errore nell\'aggiunta del partecipante' });
    }
  });

  /* ================================
     TURNI: rimuovi partecipante da turno
     POST /api/admin/rimuovi-partecipante
     Used by: admin
     Method: deletePartecipanteOnTurno
  =============================== */
  app.post('/api/admin/rimuovi-partecipante', verifyToken, isAdmin, async (req, res) => {
    try {
      const { email, turno } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(404).json({ message: 'Utente non trovato' });

      const eventId = parseInt(turno);
      const signup = await prisma.eventSignup.findUnique({ where: { userId_eventId: { userId: user.id, eventId } } });
      if (!signup) return res.status(404).json({ message: 'Iscrizione non trovata' });

      await prisma.eventSignup.delete({ where: { id: signup.id } });
      res.json({ message: 'Partecipante rimosso' });
    } catch (error) {
      console.error('Rimuovi partecipante error:', error);
      res.status(500).json({ message: 'Errore nella rimozione del partecipante' });
    }
  });

  /* ================================
   ALLENAMENTO: crea nuovo tipo
   POST /api/admin/allenamenti
   Used by: admin
   Method: saveNuovoAllenamento
  =============================== */
  app.post('/api/admin/allenamenti', verifyToken, isAdmin, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: 'Nome allenamento obbligatorio' });
    
      // Controllo se già esiste
      const existing = await prisma.eventCategory.findUnique({ where: { name } });
      if (existing) return res.status(400).json({ message: 'Allenamento già esistente' });
    
      const category = await prisma.eventCategory.create({ data: { name } });
    
      res.status(201).json({ message: 'Nuovo tipo di allenamento creato', category });
    } catch (error) {
      console.error('Crea allenamento error:', error);
      res.status(500).json({ message: 'Errore nella creazione del tipo di allenamento' });
    }
  });



  /* =========================== LAVORO MAURO ============================= */

/* ================================
   EVENTS: Get events (Calendar)
   GET /api/events?start=YYYY-MM-DD&end=YYYY-MM-DD
================================ */
app.get('/api/events', verifyToken, async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ message: 'Parametri start e end obbligatori' });
    }

    const events = await prisma.event.findMany({
      where: {
        date: {
          gte: new Date(start),
          lte: new Date(end)
        }
      },
      include: {
        category: true,
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        signups: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      },
      orderBy: [
        { date: 'asc' },
        { startTime: 'asc' }
      ]
    });

    res.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ message: 'Errore nel recupero degli eventi' });
  }
});

/* ================================
   EVENTS: Create single event (Admin only)
   POST /api/events
================================ */
app.post('/api/events', verifyToken, isAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      equipment,
      location,
      categoryId,
      date,
      startTime,
      endTime,
      maxSlots
    } = req.body;

    if (!title || !categoryId || !date || !startTime || !endTime) {
      return res.status(400).json({ message: 'Parametri mancanti' });
    }

    const event = await prisma.event.create({
      data: {
        title,
        description: description || null,
        equipment: equipment || null,
        location: location || null,
        date: new Date(date),
        startTime,
        endTime,
        maxSlots: maxSlots || 10,
        status: 'SCHEDULED',
        categoryId: parseInt(categoryId),
        creatorId: req.user.userId
      },
      include: {
        category: true,
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'Evento creato con successo',
      event
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ message: 'Errore nella creazione dell\'evento' });
  }
});

/* ================================
   EVENTS: Create multiple events (Admin only)
   POST /api/events/bulk
================================ */
app.post('/api/events/bulk', verifyToken, isAdmin, async (req, res) => {
  try {
    const { events } = req.body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ message: 'Array di eventi richiesto' });
    }

    // Validate all events have required fields
    for (const event of events) {
      if (!event.title || !event.categoryId || !event.date || !event.startTime || !event.endTime) {
        return res.status(400).json({ message: 'Ogni evento deve avere title, categoryId, date, startTime, endTime' });
      }
    }

    // Prepare events for bulk creation
    const eventsToCreate = events.map(event => ({
      title: event.title,
      description: event.description || null,
      equipment: event.equipment || null,
      location: event.location || null,
      date: new Date(event.date),
      startTime: event.startTime,
      endTime: event.endTime,
      maxSlots: event.maxSlots || 10,
      status: 'SCHEDULED',
      categoryId: parseInt(event.categoryId),
      creatorId: req.user.userId
    }));

    // Create all events
    const result = await prisma.event.createMany({
      data: eventsToCreate
    });

    res.status(201).json({
      message: 'Eventi creati con successo',
      count: result.count
    });
  } catch (error) {
    console.error('Create bulk events error:', error);
    res.status(500).json({ message: 'Errore nella creazione degli eventi' });
  }
});

/* ================================
   EVENTS: Update single event (Admin only)
   PUT /api/events/:id
================================ */
app.put('/api/events/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = ['title', 'description', 'equipment', 'location', 'startTime', 'endTime', 'maxSlots', 'status'];
    const updateData = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    const event = await prisma.event.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        category: true,
        signups: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    res.json({ event });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ message: 'Errore nell\'aggiornamento dell\'evento' });
  }
});

/* ================================
   EVENTS: Delete event (Admin only)
   DELETE /api/events/:id
================================ */
app.delete('/api/events/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: parseInt(id) },
      include: {
        signups: true
      }
    });

    if (!event) {
      return res.status(404).json({ message: 'Evento non trovato' });
    }

    // Delete the event (signups will be cascade deleted)
    await prisma.event.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      message: 'Evento eliminato con successo',
      deletedEvent: {
        id: event.id,
        title: event.title,
        date: event.date,
        signupsCount: event.signups.length
      }
    });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ message: 'Errore nell\'eliminazione dell\'evento' });
  }
});

/* ================================
   EVENTS: Sign up for event
   POST /api/events/:id/signup
================================ */
app.post('/api/events/:id/signup', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check if event exists and has available slots
    const event = await prisma.event.findUnique({
      where: { id: parseInt(id) },
      include: {
        signups: true
      }
    });

    if (!event) {
      return res.status(404).json({ message: 'Evento non trovato' });
    }

    if (event.status !== 'SCHEDULED') {
      return res.status(400).json({ message: 'Evento non disponibile per prenotazioni' });
    }

    // Check if already signed up
    const existingSignup = await prisma.eventSignup.findUnique({
      where: {
        userId_eventId: {
          userId,
          eventId: parseInt(id)
        }
      }
    });

    if (existingSignup) {
      return res.status(400).json({ message: 'Già iscritto a questo evento' });
    }

    // Check if event is full
    if (event.signups.length >= event.maxSlots) {
      return res.status(400).json({ message: 'Evento al completo' });
    }

    // Create signup
    const signup = await prisma.eventSignup.create({
      data: {
        userId,
        eventId: parseInt(id)
      },
      include: {
        event: {
          include: {
            category: true,
            signups: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      message: 'Iscrizione effettuata con successo',
      signup,
      event: signup.event
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Errore nell\'iscrizione all\'evento' });
  }
});

/* ================================
   EVENTS: Cancel signup
   DELETE /api/events/:id/signup
================================ */
app.delete('/api/events/:id/signup', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check if signup exists
    const signup = await prisma.eventSignup.findUnique({
      where: {
        userId_eventId: {
          userId,
          eventId: parseInt(id)
        }
      }
    });

    if (!signup) {
      return res.status(404).json({ message: 'Iscrizione non trovata' });
    }

    // Delete signup
    await prisma.eventSignup.delete({
      where: {
        userId_eventId: {
          userId,
          eventId: parseInt(id)
        }
      }
    });

    res.json({ message: 'Iscrizione cancellata con successo' });
  } catch (error) {
    console.error('Cancel signup error:', error);
    res.status(500).json({ message: 'Errore nella cancellazione dell\'iscrizione' });
  }
});

/* ================================
   ADMIN: Get all users
================================ */
app.get('/api/admin/users', verifyToken, isAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Errore nel recupero degli utenti' });
  }
});

/* ================================
   ADMIN: Get event categories
================================ */
app.get('/api/admin/categories', verifyToken, isAdmin, async (req, res) => {
  try {
    const categories = await prisma.eventCategory.findMany({
      orderBy: {
        name: 'asc'
      }
    });

    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Errore nel recupero delle categorie' });
  }
});

/* ================================
   Server startup
================================ */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Backend in ascolto su http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
