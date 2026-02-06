const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const { promisify } = require('util');

// Создание подключения к БД
const dbPath = path.join(__dirname, 'database.db');
let db;

// Инициализация базы данных
function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      
      // Включение внешних ключей
      db.run('PRAGMA foreign_keys = ON');
      
      // Создание таблицы пользователей
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          first_name TEXT,
          last_name TEXT,
          phone TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          reject(err);
          return;
        }
        
        // Добавление колонки avatar_path, если ее нет
        db.run('ALTER TABLE users ADD COLUMN avatar_path TEXT', (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.warn('Avatar column add warning:', err.message);
          }
        });

        // Создание индексов
        db.run('CREATE INDEX IF NOT EXISTS idx_username ON users(username)');
        db.run('CREATE INDEX IF NOT EXISTS idx_email ON users(email)');
        
        // Создание таблицы событий
        db.run(`
          CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            event_date DATE NOT NULL,
            event_time TEXT,
            location TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
          )
        `, (err) => {
          if (err) {
            console.error('Error creating events table:', err);
            reject(err);
            return;
          }
          
          // Создание индекса для событий
          db.run('CREATE INDEX IF NOT EXISTS idx_event_date ON events(event_date)');
          
          // Создание таблицы руководителей
          db.run(`
            CREATE TABLE IF NOT EXISTS leaders (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              role TEXT NOT NULL,
              bio TEXT,
              avatar TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `, (err) => {
            if (err) {
              console.error('Error creating leaders table:', err);
              reject(err);
              return;
            }
            
            // Создание таблицы проектов
            db.run(`
              CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                icon TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )
            `, (err) => {
              if (err) {
                console.error('Error creating projects table:', err);
                reject(err);
                return;
              }

              // Создание таблицы обратной связи
              db.run(`
                CREATE TABLE IF NOT EXISTS feedback (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  email TEXT NOT NULL,
                  phone TEXT,
                  message TEXT NOT NULL,
                  status TEXT DEFAULT 'new',
                  user_id INTEGER,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (user_id) REFERENCES users(id)
                )
              `, (err) => {
                if (err) {
                  console.error('Error creating feedback table:', err);
                  reject(err);
                  return;
                }

                // Добавление колонки user_id, если ее нет
                db.run('ALTER TABLE feedback ADD COLUMN user_id INTEGER', (err) => {
                  if (err && !err.message.includes('duplicate column')) {
                    console.warn('User_id column add warning:', err.message);
                  }
                });

                // Создание таблицы ответов на сообщения обратной связи
                db.run(`
                  CREATE TABLE IF NOT EXISTS feedback_replies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    feedback_id INTEGER NOT NULL,
                    reply_text TEXT NOT NULL,
                    replied_by INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE,
                    FOREIGN KEY (replied_by) REFERENCES users(id)
                  )
                `, (err) => {
                  if (err) {
                    console.error('Error creating feedback_replies table:', err);
                    reject(err);
                    return;
                  }

                  // Создание таблицы регистраций на мероприятия
                  db.run(`
                    CREATE TABLE IF NOT EXISTS event_registrations (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      event_id INTEGER NOT NULL,
                      user_id INTEGER NOT NULL,
                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                      UNIQUE(event_id, user_id)
                    )
                  `, (err) => {
                    if (err) {
                      console.error('Error creating event_registrations table:', err);
                      reject(err);
                      return;
                    }

                    // Создание индексов для регистраций
                    db.run('CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id)');
                    db.run('CREATE INDEX IF NOT EXISTS idx_event_registrations_user ON event_registrations(user_id)');

                    // Инициализация дефолтных данных
                    initDefaultContent().then(() => {
                      // Инициализация дефолтных пользователей
                      initDefaultUsers().then(() => {
                        console.log('Database initialized successfully');
                        resolve();
                      }).catch(reject);
                    }).catch(reject);
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

// Инициализация дефолтного контента
async function initDefaultContent() {
  return new Promise(async (resolve, reject) => {
    try {
      // Проверка, есть ли уже руководители
      const leadersCount = await dbGet('SELECT COUNT(*) as count FROM leaders');
      const projectsCount = await dbGet('SELECT COUNT(*) as count FROM projects');
      
      if (leadersCount.count > 0 && projectsCount.count > 0) {
        console.log('Default content already exists, skipping initialization');
        resolve();
        return;
      }
      
      // Создание дефолтных руководителей
      if (leadersCount.count === 0) {
        await dbRun(
          'INSERT INTO leaders (name, role, bio, avatar) VALUES (?, ?, ?, ?)',
          ['Иванов Иван Иванович', 'Координатор отделения', 'Опыт работы с молодежью более 10 лет. Организатор множества успешных проектов и мероприятий.', '👨‍💼']
        );
        await dbRun(
          'INSERT INTO leaders (name, role, bio, avatar) VALUES (?, ?, ?, ?)',
          ['Петрова Мария Сергеевна', 'Заместитель координатора', 'Специалист по работе с волонтерами и организацией образовательных программ.', '👩‍💼']
        );
        await dbRun(
          'INSERT INTO leaders (name, role, bio, avatar) VALUES (?, ?, ?, ?)',
          ['Сидоров Алексей Дмитриевич', 'Руководитель спортивного направления', 'Организатор спортивных мероприятий и тренер по командным видам спорта.', '👨‍🎓']
        );
        await dbRun(
          'INSERT INTO leaders (name, role, bio, avatar) VALUES (?, ?, ?, ?)',
          ['Козлова Анна Викторовна', 'Руководитель творческого направления', 'Художник и организатор культурных мероприятий. Куратор арт-проектов.', '👩‍🎨']
        );
        console.log('Default leaders initialized');
      }
      
      // Создание дефолтных проектов
      if (projectsCount.count === 0) {
        await dbRun(
          'INSERT INTO projects (title, description, icon) VALUES (?, ?, ?)',
          ['Проект "Молодые лидеры"', 'Программа развития лидерских качеств для активных участников движения. Включает тренинги, встречи с успешными людьми и возможность реализовать собственный проект.', '🎯']
        );
        await dbRun(
          'INSERT INTO projects (title, description, icon) VALUES (?, ?, ?)',
          ['"Эко-квартал"', 'Долгосрочный проект по экологическому просвещению и озеленению городских территорий. Участники создают экологические уголки в своих районах.', '🌿']
        );
        await dbRun(
          'INSERT INTO projects (title, description, icon) VALUES (?, ?, ?)',
          ['"Школа добровольцев"', 'Образовательная программа для тех, кто хочет помогать другим. Обучение навыкам волонтерской работы и участие в реальных социальных проектах.', '📚']
        );
        await dbRun(
          'INSERT INTO projects (title, description, icon) VALUES (?, ?, ?)',
          ['"Арт-пространство"', 'Творческая площадка для реализации художественных проектов. Организация выставок, конкурсов и мастер-классов по различным видам искусства.', '🎨']
        );
        console.log('Default projects initialized');
      }
      
      resolve();
    } catch (error) {
      console.error('Error initializing default content:', error);
      reject(error);
    }
  });
}

// Инициализация дефолтных пользователей
async function initDefaultUsers() {
  return new Promise(async (resolve, reject) => {
    try {
      // Проверка, есть ли уже пользователи
      const countResult = await dbGet('SELECT COUNT(*) as count FROM users');
      
      if (countResult.count > 0) {
        console.log('Default users already exist, skipping initialization');
        resolve();
        return;
      }
      
      const saltRounds = 10;
      
      // Superadmin
      const superadminHash = await bcrypt.hash('superadmin123', saltRounds);
      await dbRun(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        ['superadmin', 'superadmin@digitalnavigator.ru', superadminHash, 'superadmin']
      );
      
      // Admin
      const adminHash = await bcrypt.hash('admin123', saltRounds);
      await dbRun(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@digitalnavigator.ru', adminHash, 'admin']
      );
      
      // Regular user
      const userHash = await bcrypt.hash('user123', saltRounds);
      await dbRun(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        ['user', 'user@digitalnavigator.ru', userHash, 'user']
      );
      
      console.log('Default users initialized:');
      console.log('Superadmin: username=superadmin, password=superadmin123');
      console.log('Admin: username=admin, password=admin123');
      console.log('User: username=user, password=user123');
      
      resolve();
    } catch (error) {
      console.error('Error initializing default users:', error);
      reject(error);
    }
  });
}

// Вспомогательные функции для промисов
const dbGet = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params || [], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params || [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbRun = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params || [], function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

// Функции для работы с пользователями
const userDB = {
  // Найти пользователя по username или email
  findByUsernameOrEmail: (identifier) => {
    return dbGet('SELECT * FROM users WHERE username = ? OR email = ?', [identifier, identifier]);
  },

  // Найти пользователя по ID
  findById: (id) => {
    return dbGet('SELECT * FROM users WHERE id = ?', [id]);
  },

  // Найти пользователя по username
  findByUsername: (username) => {
    return dbGet('SELECT * FROM users WHERE username = ?', [username]);
  },

  // Найти пользователя по email
  findByEmail: (email) => {
    return dbGet('SELECT * FROM users WHERE email = ?', [email]);
  },

  // Создать нового пользователя
  create: async (userData) => {
    const { username, email, password, role = 'user', first_name, last_name, phone } = userData;
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const result = await dbRun(
      'INSERT INTO users (username, email, password, role, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, role, first_name || null, last_name || null, phone || null]
    );

    return result.lastID;
  },

  // Обновить данные пользователя
  update: async (id, userData) => {
    const { username, email, first_name, last_name, phone, avatar_path } = userData;
    const updateFields = [];
    const values = [];

    if (username !== undefined) {
      updateFields.push('username = ?');
      values.push(username);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      values.push(email);
    }
    if (first_name !== undefined) {
      updateFields.push('first_name = ?');
      values.push(first_name);
    }
    if (last_name !== undefined) {
      updateFields.push('last_name = ?');
      values.push(last_name);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      values.push(phone);
    }
    if (avatar_path !== undefined) {
      updateFields.push('avatar_path = ?');
      values.push(avatar_path);
    }

    if (updateFields.length === 0) {
      return false;
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
    const result = await dbRun(sql, values);
    return result.changes > 0;
  },

  // Обновить пароль пользователя
  updatePassword: async (id, newPassword) => {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    const result = await dbRun(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, id]
    );
    return result.changes > 0;
  },

  // Изменить роль пользователя
  updateRole: async (id, role) => {
    const result = await dbRun(
      'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [role, id]
    );
    return result.changes > 0;
  },

  // Получить всех пользователей
  getAll: () => {
    return dbAll(
      'SELECT id, username, email, role, first_name, last_name, phone, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
  },

  // Удалить пользователя
  delete: async (id) => {
    const result = await dbRun('DELETE FROM users WHERE id = ?', [id]);
    return result.changes > 0;
  },

  // Получить статистику
  getStats: async () => {
    const total = await dbGet('SELECT COUNT(*) as count FROM users');
    const byRole = await dbAll('SELECT role, COUNT(*) as count FROM users GROUP BY role');
    
    return {
      total: total.count,
      byRole: byRole.reduce((acc, row) => {
        acc[row.role] = row.count;
        return acc;
      }, {})
    };
  }
};

// Функции для работы с событиями
const eventDB = {
  // Получить все события, отсортированные по дате
  getAll: () => {
    return dbAll(
      'SELECT * FROM events ORDER BY event_date ASC, event_time ASC'
    );
  },

  // Получить событие по ID
  findById: (id) => {
    return dbGet('SELECT * FROM events WHERE id = ?', [id]);
  },

  // Создать новое событие
  create: async (eventData) => {
    const { title, description, event_date, event_time, location, created_by } = eventData;
    const result = await dbRun(
      'INSERT INTO events (title, description, event_date, event_time, location, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description || null, event_date, event_time || null, location || null, created_by]
    );
    return result.lastID;
  },

  // Обновить событие
  update: async (id, eventData) => {
    const { title, description, event_date, event_time, location } = eventData;
    const result = await dbRun(
      'UPDATE events SET title = ?, description = ?, event_date = ?, event_time = ?, location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, description || null, event_date, event_time || null, location || null, id]
    );
    return result.changes > 0;
  },

  // Удалить событие
  delete: async (id) => {
    const result = await dbRun('DELETE FROM events WHERE id = ?', [id]);
    return result.changes > 0;
  }
};

// Функции для работы с руководителями
const leaderDB = {
  // Получить всех руководителей
  getAll: () => {
    return dbAll('SELECT * FROM leaders ORDER BY id ASC');
  },

  // Получить руководителя по ID
  findById: (id) => {
    return dbGet('SELECT * FROM leaders WHERE id = ?', [id]);
  },

  // Создать нового руководителя
  create: async (leaderData) => {
    const { name, role, bio, avatar } = leaderData;
    const result = await dbRun(
      'INSERT INTO leaders (name, role, bio, avatar) VALUES (?, ?, ?, ?)',
      [name, role, bio || null, avatar || null]
    );
    return result.lastID;
  },

  // Обновить руководителя
  update: async (id, leaderData) => {
    const { name, role, bio, avatar } = leaderData;
    const result = await dbRun(
      'UPDATE leaders SET name = ?, role = ?, bio = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, role, bio || null, avatar || null, id]
    );
    return result.changes > 0;
  },

  // Удалить руководителя
  delete: async (id) => {
    const result = await dbRun('DELETE FROM leaders WHERE id = ?', [id]);
    return result.changes > 0;
  }
};

// Функции для работы с проектами
const projectDB = {
  // Получить все проекты
  getAll: () => {
    return dbAll('SELECT * FROM projects ORDER BY id ASC');
  },

  // Получить проект по ID
  findById: (id) => {
    return dbGet('SELECT * FROM projects WHERE id = ?', [id]);
  },

  // Создать новый проект
  create: async (projectData) => {
    const { title, description, icon } = projectData;
    const result = await dbRun(
      'INSERT INTO projects (title, description, icon) VALUES (?, ?, ?)',
      [title, description, icon || null]
    );
    return result.lastID;
  },

  // Обновить проект
  update: async (id, projectData) => {
    const { title, description, icon } = projectData;
    const result = await dbRun(
      'UPDATE projects SET title = ?, description = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, description, icon || null, id]
    );
    return result.changes > 0;
  },

  // Удалить проект
  delete: async (id) => {
    const result = await dbRun('DELETE FROM projects WHERE id = ?', [id]);
    return result.changes > 0;
  }
};

// Функции для работы с обратной связью
const feedbackDB = {
  // Получить все сообщения обратной связи
  getAll: async () => {
    const feedbackList = await dbAll('SELECT * FROM feedback ORDER BY created_at DESC');
    // Получаем ответы для каждого сообщения
    for (let feedback of feedbackList) {
      feedback.replies = await dbAll(
        `SELECT fr.*, u.username, u.role 
         FROM feedback_replies fr 
         LEFT JOIN users u ON fr.replied_by = u.id 
         WHERE fr.feedback_id = ? 
         ORDER BY fr.created_at ASC`,
        [feedback.id]
      );
    }
    return feedbackList;
  },

  // Получить сообщение по ID с ответами
  findById: async (id) => {
    const feedback = await dbGet('SELECT * FROM feedback WHERE id = ?', [id]);
    if (feedback) {
      feedback.replies = await dbAll(
        `SELECT fr.*, u.username, u.role 
         FROM feedback_replies fr 
         LEFT JOIN users u ON fr.replied_by = u.id 
         WHERE fr.feedback_id = ? 
         ORDER BY fr.created_at ASC`,
        [id]
      );
    }
    return feedback;
  },

  // Создать новое сообщение
  create: async (feedbackData) => {
    const { name, email, phone, message, user_id } = feedbackData;
    const result = await dbRun(
      'INSERT INTO feedback (name, email, phone, message, status, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, phone || null, message, 'new', user_id || null]
    );
    return result.lastID;
  },

  // Обновить статус сообщения
  updateStatus: async (id, status) => {
    const result = await dbRun(
      'UPDATE feedback SET status = ? WHERE id = ?',
      [status, id]
    );
    return result.changes > 0;
  },

  // Удалить сообщение
  delete: async (id) => {
    const result = await dbRun('DELETE FROM feedback WHERE id = ?', [id]);
    return result.changes > 0;
  },

  // Добавить ответ на сообщение
  addReply: async (feedbackId, replyText, repliedBy) => {
    const result = await dbRun(
      'INSERT INTO feedback_replies (feedback_id, reply_text, replied_by) VALUES (?, ?, ?)',
      [feedbackId, replyText, repliedBy]
    );
    // Обновляем статус сообщения на "processed" при добавлении ответа
    await dbRun('UPDATE feedback SET status = ? WHERE id = ?', ['processed', feedbackId]);
    return result.lastID;
  },

  // Получить ответы для сообщения
  getReplies: async (feedbackId) => {
    return dbAll(
      `SELECT fr.*, u.username, u.role 
       FROM feedback_replies fr 
       LEFT JOIN users u ON fr.replied_by = u.id 
       WHERE fr.feedback_id = ? 
       ORDER BY fr.created_at ASC`,
      [feedbackId]
    );
  }
};

// Функции для работы с регистрациями на мероприятия
const eventRegistrationDB = {
  // Зарегистрироваться на мероприятие
  register: async (eventId, userId) => {
    try {
      const result = await dbRun(
        'INSERT INTO event_registrations (event_id, user_id) VALUES (?, ?)',
        [eventId, userId]
      );
      return result.lastID;
    } catch (error) {
      // Если уже зарегистрирован, возвращаем null
      if (error.message.includes('UNIQUE constraint')) {
        return null;
      }
      throw error;
    }
  },

  // Отменить регистрацию на мероприятие
  unregister: async (eventId, userId) => {
    const result = await dbRun(
      'DELETE FROM event_registrations WHERE event_id = ? AND user_id = ?',
      [eventId, userId]
    );
    return result.changes > 0;
  },

  // Проверить, зарегистрирован ли пользователь на мероприятие
  isRegistered: async (eventId, userId) => {
    const registration = await dbGet(
      'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ?',
      [eventId, userId]
    );
    return !!registration;
  },

  // Получить все регистрации пользователя
  getUserRegistrations: async (userId) => {
    return dbAll(
      `SELECT er.*, e.title, e.description, e.event_date, e.event_time, e.location 
       FROM event_registrations er 
       JOIN events e ON er.event_id = e.id 
       WHERE er.user_id = ? 
       ORDER BY e.event_date ASC, e.event_time ASC`,
      [userId]
    );
  },

  // Получить всех зарегистрированных пользователей на мероприятие
  getEventRegistrations: async (eventId) => {
    return dbAll(
      `SELECT er.*, u.username, u.email, u.first_name, u.last_name, u.phone 
       FROM event_registrations er 
       JOIN users u ON er.user_id = u.id 
       WHERE er.event_id = ? 
       ORDER BY er.created_at ASC`,
      [eventId]
    );
  },

  // Получить количество зарегистрированных на мероприятие
  getRegistrationCount: async (eventId) => {
    const result = await dbGet(
      'SELECT COUNT(*) as count FROM event_registrations WHERE event_id = ?',
      [eventId]
    );
    return result ? result.count : 0;
  }
};

// Экспорт
module.exports = {
  db,
  initDatabase,
  userDB,
  eventDB,
  leaderDB,
  projectDB,
  feedbackDB,
  eventRegistrationDB
};
