const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { initDatabase, userDB, eventDB, leaderDB, projectDB, feedbackDB, eventRegistrationDB } = require('./database');

const app = express();
const PORT = 3000;

// Uploads setup
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ext || '.jpg';
    const userId = req.session.user ? req.session.user.id : 'user';
    cb(null, `avatar-${userId}-${Date.now()}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      req.fileValidationError = 'Можно загружать только изображения (JPG, PNG, GIF, WEBP).';
      return cb(null, false);
    }
    cb(null, true);
  }
});

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: 'digital-navigator-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // установить true при использовании HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
  }
}));

// Middleware для передачи данных пользователя в шаблоны
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.isAuthenticated = !!req.session.user;
  next();
});

// Middleware для проверки аутентификации
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
};

// Middleware для проверки роли
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('pages/error', {
        page: 'error',
        title: 'Доступ запрещен',
        message: 'У вас нет прав для доступа к этой странице.'
      });
    }
    next();
  };
};

// Public routes
app.get('/', (req, res) => {
  res.render('pages/home', { page: 'home', title: 'Главная' });
});

app.get('/faq', (req, res) => {
  res.render('pages/faq', { page: 'faq', title: 'FAQ' });
});

app.get('/opportunities', (req, res) => {
  res.render('pages/opportunities', { page: 'opportunities', title: 'Возможности' });
});

app.get('/participation', async (req, res) => {
  const events = await eventDB.getAll();
  const leaders = await leaderDB.getAll();
  const projects = await projectDB.getAll();
  
  // Получаем информацию о регистрациях для текущего пользователя
  let userRegistrations = {};
  if (req.session.user) {
    const registrations = await eventRegistrationDB.getUserRegistrations(req.session.user.id);
    registrations.forEach(reg => {
      userRegistrations[reg.event_id] = true;
    });
  }
  
  // Получаем количество регистраций для каждого мероприятия
  const eventsWithRegistrations = await Promise.all(
    (events || []).map(async (event) => {
      const count = await eventRegistrationDB.getRegistrationCount(event.id);
      return {
        ...event,
        registrationCount: count,
        isRegistered: userRegistrations[event.id] || false
      };
    })
  );
  
  res.render('pages/participation', { 
    page: 'participation', 
    title: 'Участие',
    events: eventsWithRegistrations || [],
    leaders: leaders || [],
    projects: projects || [],
    user: req.session.user || null
  });
});

app.get('/contacts', (req, res) => {
  res.render('pages/contacts', { page: 'contacts', title: 'Контакты', query: req.query });
});

app.get('/about-developers', (req, res) => {
  res.render('pages/about-developers', { 
    page: 'about-developers', 
    title: 'О разработчиках',
    isAuthenticated: req.session.user ? true : false,
    user: req.session.user || null,
    query: req.query 
  });
});

// POST handler for contact form
app.post('/contacts', async (req, res) => {
  console.log('=== Contact Form Submission ===');
  console.log('Name:', req.body.name);
  console.log('Email:', req.body.email);
  console.log('Phone:', req.body.phone);
  console.log('Message:', req.body.message);
  if (req.session.user) {
    console.log('User:', req.session.user.username, `(${req.session.user.role})`);
  }
  console.log('==============================');

  try {
    await feedbackDB.create({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      message: req.body.message,
      user_id: req.session.user ? req.session.user.id : null
    });
    res.redirect('/contacts?success=true');
  } catch (error) {
    console.error('Error saving feedback:', error);
    res.redirect('/contacts?error=true');
  }
});

// Auth routes
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('pages/login', { page: 'login', title: 'Вход', error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await userDB.findByUsernameOrEmail(username);
    
    if (!user) {
      console.log('Login attempt failed: user not found', username);
      return res.render('pages/login', {
        page: 'login',
        title: 'Вход',
        error: 'Неверное имя пользователя или пароль'
      });
    }

    const match = await bcrypt.compare(password, user.password);
    
    if (!match) {
      console.log('Login attempt failed: wrong password for user', username);
      return res.render('pages/login', {
        page: 'login',
        title: 'Вход',
        error: 'Неверное имя пользователя или пароль'
      });
    }
    
    console.log('Login successful:', user.username, 'role:', user.role);

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      avatar_path: user.avatar_path
    };

    const redirect = req.query.redirect || '/';
    res.redirect(redirect);
  } catch (error) {
    console.error('Login error:', error);
    return res.render('pages/login', {
      page: 'login',
      title: 'Вход',
      error: 'Ошибка при входе. Попробуйте позже.'
    });
  }
});

app.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('pages/register', { page: 'register', title: 'Регистрация', error: null });
});

app.post('/register', async (req, res) => {
  const { username, email, password, confirmPassword, first_name, last_name, phone } = req.body;

  // Валидация
  if (!username || !email || !password) {
    return res.render('pages/register', {
      page: 'register',
      title: 'Регистрация',
      error: 'Имя пользователя, email и пароль обязательны для заполнения'
    });
  }

  if (password !== confirmPassword) {
    return res.render('pages/register', {
      page: 'register',
      title: 'Регистрация',
      error: 'Пароли не совпадают'
    });
  }

  if (password.length < 6) {
    return res.render('pages/register', {
      page: 'register',
      title: 'Регистрация',
      error: 'Пароль должен быть не менее 6 символов'
    });
  }

  // Проверка на существующего пользователя
  const existingUserByUsername = await userDB.findByUsername(username);
  if (existingUserByUsername) {
    return res.render('pages/register', {
      page: 'register',
      title: 'Регистрация',
      error: 'Пользователь с таким именем уже существует'
    });
  }

  const existingUserByEmail = await userDB.findByEmail(email);
  if (existingUserByEmail) {
    return res.render('pages/register', {
      page: 'register',
      title: 'Регистрация',
      error: 'Пользователь с таким email уже существует'
    });
  }

  // Создание нового пользователя (роль по умолчанию - user)
  try {
    const userId = await userDB.create({
      username,
      email,
      password,
      role: 'user',
      first_name: first_name || null,
      last_name: last_name || null,
      phone: phone || null
    });

    // Автоматический вход после регистрации
    const newUser = await userDB.findById(userId);
    req.session.user = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      phone: newUser.phone
    };

    res.redirect('/profile');
  } catch (error) {
    console.error('Registration error:', error);
    return res.render('pages/register', {
      page: 'register',
      title: 'Регистрация',
      error: 'Ошибка при регистрации. Попробуйте позже.'
    });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

// Protected routes - require authentication
app.get('/profile', requireAuth, async (req, res) => {
  const user = await userDB.findById(req.session.user.id);
  if (!user) {
    req.session.destroy();
    return res.redirect('/login');
  }
  
  // Получаем зарегистрированные мероприятия пользователя
  const registrations = await eventRegistrationDB.getUserRegistrations(req.session.user.id);
  
  res.render('pages/profile', {
    page: 'profile',
    title: 'Профиль',
    query: req.query,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      avatar_path: user.avatar_path,
      created_at: user.created_at,
      updated_at: user.updated_at
    },
    registrations: registrations || []
  });
});

// Редактирование профиля
app.get('/profile/edit', requireAuth, async (req, res) => {
  const user = await userDB.findById(req.session.user.id);
  if (!user) {
    req.session.destroy();
    return res.redirect('/login');
  }

  res.render('pages/profile-edit', {
    page: 'profile-edit',
    title: 'Редактирование профиля',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      avatar_path: user.avatar_path
    },
    error: null,
    success: null
  });
});

app.post('/profile/edit', requireAuth, upload.single('avatar'), async (req, res) => {
  const { username, email, first_name, last_name, phone } = req.body;
  const userId = req.session.user.id;

  if (req.fileValidationError) {
    const user = await userDB.findById(userId);
    return res.render('pages/profile-edit', {
      page: 'profile-edit',
      title: 'Редактирование профиля',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        avatar_path: user.avatar_path
      },
      error: req.fileValidationError,
      success: null
    });
  }

  // Валидация
  if (!username || !email) {
    const user = await userDB.findById(userId);
    return res.render('pages/profile-edit', {
      page: 'profile-edit',
      title: 'Редактирование профиля',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        avatar_path: user.avatar_path
      },
      error: 'Имя пользователя и email обязательны',
      success: null
    });
  }

  // Проверка на уникальность username и email
  const existingUserByUsername = await userDB.findByUsername(username);
  if (existingUserByUsername && existingUserByUsername.id !== userId) {
    const user = await userDB.findById(userId);
    return res.render('pages/profile-edit', {
      page: 'profile-edit',
      title: 'Редактирование профиля',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        avatar_path: user.avatar_path
      },
      error: 'Пользователь с таким именем уже существует',
      success: null
    });
  }

  const existingUserByEmail = await userDB.findByEmail(email);
  if (existingUserByEmail && existingUserByEmail.id !== userId) {
    const user = await userDB.findById(userId);
    return res.render('pages/profile-edit', {
      page: 'profile-edit',
      title: 'Редактирование профиля',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        avatar_path: user.avatar_path
      },
      error: 'Пользователь с таким email уже существует',
      success: null
    });
  }

  const avatarPath = req.file ? `/uploads/${req.file.filename}` : undefined;

  // Обновление данных
  const updated = await userDB.update(userId, {
    username,
    email,
    first_name: first_name || null,
    last_name: last_name || null,
    phone: phone || null,
    avatar_path: avatarPath
  });

  if (updated) {
    // Обновление сессии
    const updatedUser = await userDB.findById(userId);
    req.session.user = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role,
      first_name: updatedUser.first_name,
      last_name: updatedUser.last_name,
      phone: updatedUser.phone,
      avatar_path: updatedUser.avatar_path
    };

    res.redirect('/profile?success=updated');
  } else {
    const user = await userDB.findById(userId);
    res.render('pages/profile-edit', {
      page: 'profile-edit',
      title: 'Редактирование профиля',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        avatar_path: user.avatar_path
      },
      error: 'Ошибка при обновлении данных',
      success: null
    });
  }
});

// Смена пароля
app.get('/profile/password', requireAuth, (req, res) => {
  res.render('pages/profile-password', {
    page: 'profile-password',
    title: 'Смена пароля',
    error: null,
    success: null
  });
});

app.post('/profile/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.session.user.id;

  // Валидация
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.render('pages/profile-password', {
      page: 'profile-password',
      title: 'Смена пароля',
      error: 'Все поля обязательны для заполнения',
      success: null
    });
  }

  if (newPassword !== confirmPassword) {
    return res.render('pages/profile-password', {
      page: 'profile-password',
      title: 'Смена пароля',
      error: 'Новые пароли не совпадают',
      success: null
    });
  }

  if (newPassword.length < 6) {
    return res.render('pages/profile-password', {
      page: 'profile-password',
      title: 'Смена пароля',
      error: 'Новый пароль должен быть не менее 6 символов',
      success: null
    });
  }

  // Проверка текущего пароля
  const user = await userDB.findById(userId);
  const match = await bcrypt.compare(currentPassword, user.password);

  if (!match) {
    return res.render('pages/profile-password', {
      page: 'profile-password',
      title: 'Смена пароля',
      error: 'Текущий пароль неверен',
      success: null
    });
  }

  // Обновление пароля
  const updated = await userDB.updatePassword(userId, newPassword);

  if (updated) {
    res.render('pages/profile-password', {
      page: 'profile-password',
      title: 'Смена пароля',
      error: null,
      success: 'Пароль успешно изменен'
    });
  } else {
    res.render('pages/profile-password', {
      page: 'profile-password',
      title: 'Смена пароля',
      error: 'Ошибка при изменении пароля',
      success: null
    });
  }
});

// Admin routes - require admin or superadmin
app.get('/admin', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const stats = await userDB.getStats();
  const users = await userDB.getAll();
  
  res.render('pages/admin', {
    page: 'admin',
    title: 'Админ-панель',
    user: req.session.user,
    stats: stats,
    users: users
  });
});

// Superadmin routes - require superadmin only
app.get('/admin/users', requireAuth, requireRole('superadmin'), async (req, res) => {
  const users = await userDB.getAll();
  
  res.render('pages/admin-users', {
    page: 'admin-users',
    title: 'Управление пользователями',
    user: req.session.user,
    users: users
  });
});

app.post('/admin/users/:id/role', requireAuth, requireRole('superadmin'), async (req, res) => {
  const userId = parseInt(req.params.id);
  const { role } = req.body;

  if (!['user', 'admin', 'superadmin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const user = await userDB.findById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  await userDB.updateRole(userId, role);
  
  // Обновляем сессию если это текущий пользователь
  if (req.session.user.id === userId) {
    const updatedUser = await userDB.findById(userId);
    req.session.user.role = updatedUser.role;
  }

  res.redirect('/admin/users');
});

// Events management routes - require superadmin only
// Старые маршруты перенаправляют на управление контентом
app.get('/admin/events', requireAuth, requireRole('superadmin'), (req, res) => {
  res.redirect('/admin/content');
});

// Новые маршруты для событий в разделе управления контентом
app.get('/admin/content/events/new', requireAuth, requireRole('superadmin'), (req, res) => {
  res.render('pages/admin-event-form', {
    page: 'admin-event-form',
    title: 'Новое событие',
    user: req.session.user,
    event: null,
    error: null
  });
});

app.post('/admin/content/events', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { title, description, event_date, event_time, location } = req.body;

  if (!title || !event_date) {
    return res.render('pages/admin-event-form', {
      page: 'admin-event-form',
      title: 'Новое событие',
      user: req.session.user,
      event: null,
      error: 'Название и дата события обязательны'
    });
  }

  try {
    await eventDB.create({
      title,
      description: description || null,
      event_date,
      event_time: event_time || null,
      location: location || null,
      created_by: req.session.user.id
    });
    res.redirect('/admin/content?success=event_created');
  } catch (error) {
    console.error('Error creating event:', error);
    res.render('pages/admin-event-form', {
      page: 'admin-event-form',
      title: 'Новое событие',
      user: req.session.user,
      event: null,
      error: 'Ошибка при создании события'
    });
  }
});

app.get('/admin/content/events/:id/edit', requireAuth, requireRole('superadmin'), async (req, res) => {
  const eventId = parseInt(req.params.id);
  const event = await eventDB.findById(eventId);

  if (!event) {
    return res.status(404).render('pages/error', {
      page: 'error',
      title: 'Ошибка',
      message: 'Событие не найдено'
    });
  }

  res.render('pages/admin-event-form', {
    page: 'admin-event-form',
    title: 'Редактирование события',
    user: req.session.user,
    event: event,
    error: null
  });
});

app.post('/admin/content/events/:id', requireAuth, requireRole('superadmin'), async (req, res) => {
  const eventId = parseInt(req.params.id);
  const { title, description, event_date, event_time, location } = req.body;

  if (!title || !event_date) {
    const event = await eventDB.findById(eventId);
    return res.render('pages/admin-event-form', {
      page: 'admin-event-form',
      title: 'Редактирование события',
      user: req.session.user,
      event: event,
      error: 'Название и дата события обязательны'
    });
  }

  try {
    await eventDB.update(eventId, {
      title,
      description: description || null,
      event_date,
      event_time: event_time || null,
      location: location || null
    });
    res.redirect('/admin/content?success=event_updated');
  } catch (error) {
    console.error('Error updating event:', error);
    const event = await eventDB.findById(eventId);
    res.render('pages/admin-event-form', {
      page: 'admin-event-form',
      title: 'Редактирование события',
      user: req.session.user,
      event: event,
      error: 'Ошибка при обновлении события'
    });
  }
});

app.post('/admin/content/events/:id/delete', requireAuth, requireRole('superadmin'), async (req, res) => {
  const eventId = parseInt(req.params.id);
  
  try {
    await eventDB.delete(eventId);
    res.redirect('/admin/content?success=event_deleted');
  } catch (error) {
    console.error('Error deleting event:', error);
    res.redirect('/admin/content?error=event_delete_failed');
  }
});

// Feedback management routes - require admin or superadmin
app.get('/admin/feedback', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const feedbackList = await feedbackDB.getAll();
    res.render('pages/admin-feedback', {
      page: 'admin-feedback',
      title: 'Обратная связь',
      user: req.session.user,
      feedback: feedbackList || [],
      query: req.query
    });
  } catch (error) {
    console.error('Error loading feedback:', error);
    res.render('pages/admin-feedback', {
      page: 'admin-feedback',
      title: 'Обратная связь',
      user: req.session.user,
      feedback: [],
      query: req.query
    });
  }
});

app.post('/admin/feedback/:id/status', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const feedbackId = parseInt(req.params.id);
  const { status } = req.body;

  if (!['new', 'processed'].includes(status)) {
    return res.redirect('/admin/feedback?error=invalid_status');
  }

  try {
    await feedbackDB.updateStatus(feedbackId, status);
    res.redirect('/admin/feedback?success=updated');
  } catch (error) {
    console.error('Error updating feedback status:', error);
    res.redirect('/admin/feedback?error=update_failed');
  }
});

app.post('/admin/feedback/:id/reply', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const feedbackId = parseInt(req.params.id);
  const { reply_text } = req.body;
  const repliedBy = req.session.user.id;

  if (!reply_text || reply_text.trim().length === 0) {
    return res.redirect('/admin/feedback?error=empty_reply');
  }

  try {
    await feedbackDB.addReply(feedbackId, reply_text.trim(), repliedBy);
    res.redirect('/admin/feedback?success=replied');
  } catch (error) {
    console.error('Error adding reply:', error);
    res.redirect('/admin/feedback?error=reply_failed');
  }
});

app.post('/admin/feedback/:id/delete', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const feedbackId = parseInt(req.params.id);

  try {
    const deleted = await feedbackDB.delete(feedbackId);
    if (deleted) {
      res.redirect('/admin/feedback?success=deleted');
    } else {
      res.redirect('/admin/feedback?error=delete_failed');
    }
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.redirect('/admin/feedback?error=delete_failed');
  }
});

// Content management routes - require superadmin only
app.get('/admin/content', requireAuth, requireRole('superadmin'), async (req, res) => {
  const leaders = await leaderDB.getAll();
  const projects = await projectDB.getAll();
  const events = await eventDB.getAll();
  res.render('pages/admin-content', {
    page: 'admin-content',
    title: 'Управление контентом',
    user: req.session.user,
    leaders: leaders || [],
    projects: projects || [],
    events: events || [],
    query: req.query
  });
});

// Leaders management
app.get('/admin/content/leaders/new', requireAuth, requireRole('superadmin'), (req, res) => {
  res.render('pages/admin-leader-form', {
    page: 'admin-leader-form',
    title: 'Новый руководитель',
    user: req.session.user,
    leader: null,
    error: null
  });
});

app.post('/admin/content/leaders', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { name, role, bio, avatar } = req.body;

  if (!name || !role) {
    return res.render('pages/admin-leader-form', {
      page: 'admin-leader-form',
      title: 'Новый руководитель',
      user: req.session.user,
      leader: null,
      error: 'Имя и должность обязательны'
    });
  }

  try {
    await leaderDB.create({ name, role, bio: bio || null, avatar: avatar || null });
    res.redirect('/admin/content?success=leader_created');
  } catch (error) {
    console.error('Error creating leader:', error);
    res.render('pages/admin-leader-form', {
      page: 'admin-leader-form',
      title: 'Новый руководитель',
      user: req.session.user,
      leader: null,
      error: 'Ошибка при создании руководителя'
    });
  }
});

app.get('/admin/content/leaders/:id/edit', requireAuth, requireRole('superadmin'), async (req, res) => {
  const leaderId = parseInt(req.params.id);
  const leader = await leaderDB.findById(leaderId);

  if (!leader) {
    return res.status(404).render('pages/error', {
      page: 'error',
      title: 'Ошибка',
      message: 'Руководитель не найден'
    });
  }

  res.render('pages/admin-leader-form', {
    page: 'admin-leader-form',
    title: 'Редактирование руководителя',
    user: req.session.user,
    leader: leader,
    error: null
  });
});

app.post('/admin/content/leaders/:id', requireAuth, requireRole('superadmin'), async (req, res) => {
  const leaderId = parseInt(req.params.id);
  const { name, role, bio, avatar } = req.body;

  if (!name || !role) {
    const leader = await leaderDB.findById(leaderId);
    return res.render('pages/admin-leader-form', {
      page: 'admin-leader-form',
      title: 'Редактирование руководителя',
      user: req.session.user,
      leader: leader,
      error: 'Имя и должность обязательны'
    });
  }

  try {
    await leaderDB.update(leaderId, { name, role, bio: bio || null, avatar: avatar || null });
    res.redirect('/admin/content?success=leader_updated');
  } catch (error) {
    console.error('Error updating leader:', error);
    const leader = await leaderDB.findById(leaderId);
    res.render('pages/admin-leader-form', {
      page: 'admin-leader-form',
      title: 'Редактирование руководителя',
      user: req.session.user,
      leader: leader,
      error: 'Ошибка при обновлении руководителя'
    });
  }
});

app.post('/admin/content/leaders/:id/delete', requireAuth, requireRole('superadmin'), async (req, res) => {
  const leaderId = parseInt(req.params.id);
  
  try {
    await leaderDB.delete(leaderId);
    res.redirect('/admin/content?success=leader_deleted');
  } catch (error) {
    console.error('Error deleting leader:', error);
    res.redirect('/admin/content?error=leader_delete_failed');
  }
});

// Projects management
app.get('/admin/content/projects/new', requireAuth, requireRole('superadmin'), (req, res) => {
  res.render('pages/admin-project-form', {
    page: 'admin-project-form',
    title: 'Новый проект',
    user: req.session.user,
    project: null,
    error: null
  });
});

app.post('/admin/content/projects', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { title, description, icon } = req.body;

  if (!title || !description) {
    return res.render('pages/admin-project-form', {
      page: 'admin-project-form',
      title: 'Новый проект',
      user: req.session.user,
      project: null,
      error: 'Название и описание обязательны'
    });
  }

  try {
    await projectDB.create({ title, description, icon: icon || null });
    res.redirect('/admin/content?success=project_created');
  } catch (error) {
    console.error('Error creating project:', error);
    res.render('pages/admin-project-form', {
      page: 'admin-project-form',
      title: 'Новый проект',
      user: req.session.user,
      project: null,
      error: 'Ошибка при создании проекта'
    });
  }
});

app.get('/admin/content/projects/:id/edit', requireAuth, requireRole('superadmin'), async (req, res) => {
  const projectId = parseInt(req.params.id);
  const project = await projectDB.findById(projectId);

  if (!project) {
    return res.status(404).render('pages/error', {
      page: 'error',
      title: 'Ошибка',
      message: 'Проект не найден'
    });
  }

  res.render('pages/admin-project-form', {
    page: 'admin-project-form',
    title: 'Редактирование проекта',
    user: req.session.user,
    project: project,
    error: null
  });
});

app.post('/admin/content/projects/:id', requireAuth, requireRole('superadmin'), async (req, res) => {
  const projectId = parseInt(req.params.id);
  const { title, description, icon } = req.body;

  if (!title || !description) {
    const project = await projectDB.findById(projectId);
    return res.render('pages/admin-project-form', {
      page: 'admin-project-form',
      title: 'Редактирование проекта',
      user: req.session.user,
      project: project,
      error: 'Название и описание обязательны'
    });
  }

  try {
    await projectDB.update(projectId, { title, description, icon: icon || null });
    res.redirect('/admin/content?success=project_updated');
  } catch (error) {
    console.error('Error updating project:', error);
    const project = await projectDB.findById(projectId);
    res.render('pages/admin-project-form', {
      page: 'admin-project-form',
      title: 'Редактирование проекта',
      user: req.session.user,
      project: project,
      error: 'Ошибка при обновлении проекта'
    });
  }
});

app.post('/admin/content/projects/:id/delete', requireAuth, requireRole('superadmin'), async (req, res) => {
  const projectId = parseInt(req.params.id);
  
  try {
    await projectDB.delete(projectId);
    res.redirect('/admin/content?success=project_deleted');
  } catch (error) {
    console.error('Error deleting project:', error);
    res.redirect('/admin/content?error=project_delete_failed');
  }
});

// Event registrations management routes - require admin or superadmin
app.get('/admin/event-registrations', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const events = await eventDB.getAll();
    
    // Получаем количество регистраций для каждого мероприятия
    const eventsWithRegistrations = await Promise.all(
      (events || []).map(async (event) => {
        const count = await eventRegistrationDB.getRegistrationCount(event.id);
        return {
          ...event,
          registrationCount: count
        };
      })
    );
    
    res.render('pages/admin-event-registrations', {
      page: 'admin-event-registrations',
      title: 'Регистрации на мероприятия',
      user: req.session.user,
      events: eventsWithRegistrations || [],
      query: req.query
    });
  } catch (error) {
    console.error('Error loading event registrations:', error);
    res.render('pages/admin-event-registrations', {
      page: 'admin-event-registrations',
      title: 'Регистрации на мероприятия',
      user: req.session.user,
      events: [],
      query: req.query
    });
  }
});

app.get('/admin/event-registrations/:id', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const eventId = parseInt(req.params.id);
  
  try {
    const event = await eventDB.findById(eventId);
    
    if (!event) {
      return res.status(404).render('pages/error', {
        page: 'error',
        title: 'Ошибка',
        message: 'Мероприятие не найдено'
      });
    }
    
    // Получаем все регистрации на это мероприятие с данными пользователей
    const registrations = await eventRegistrationDB.getEventRegistrations(eventId);
    
    res.render('pages/admin-event-registration-details', {
      page: 'admin-event-registration-details',
      title: 'Регистрации на мероприятие',
      user: req.session.user,
      event: event,
      registrations: registrations || []
    });
  } catch (error) {
    console.error('Error loading event registration details:', error);
    res.status(500).render('pages/error', {
      page: 'error',
      title: 'Ошибка',
      message: 'Ошибка при загрузке данных о регистрациях'
    });
  }
});

// Маршруты для регистрации на мероприятия
app.post('/events/:id/register', requireAuth, async (req, res) => {
  const eventId = parseInt(req.params.id);
  const userId = req.session.user.id;

  try {
    // Проверяем, существует ли мероприятие
    const event = await eventDB.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Мероприятие не найдено' });
    }

    // Регистрируем пользователя
    const registrationId = await eventRegistrationDB.register(eventId, userId);
    
    if (registrationId === null) {
      return res.status(400).json({ error: 'Вы уже зарегистрированы на это мероприятие' });
    }

    res.json({ success: true, message: 'Вы успешно зарегистрированы на мероприятие' });
  } catch (error) {
    console.error('Error registering for event:', error);
    res.status(500).json({ error: 'Ошибка при регистрации на мероприятие' });
  }
});

app.post('/events/:id/unregister', requireAuth, async (req, res) => {
  const eventId = parseInt(req.params.id);
  const userId = req.session.user.id;

  try {
    // Проверяем, существует ли мероприятие
    const event = await eventDB.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Мероприятие не найдено' });
    }

    // Отменяем регистрацию
    const unregistered = await eventRegistrationDB.unregister(eventId, userId);
    
    if (!unregistered) {
      return res.status(400).json({ error: 'Вы не были зарегистрированы на это мероприятие' });
    }

    res.json({ success: true, message: 'Регистрация на мероприятие отменена' });
  } catch (error) {
    console.error('Error unregistering from event:', error);
    res.status(500).json({ error: 'Ошибка при отмене регистрации' });
  }
});

// Запуск сервера после инициализации БД
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
