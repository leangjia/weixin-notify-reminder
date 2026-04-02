const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'rohs-monitor-secret-key-2024';
const JWT_EXPIRES_IN = '24h';

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function createDefaultAdmin() {
  const adminExists = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');
  if (adminExists.count === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashedPassword, 'admin');
    console.log('[Auth] Default admin user created: admin / admin123');
  }
}

function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return { success: false, error: '用户名或密码错误' };
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return { success: false, error: '用户名或密码错误' };
  }

  const token = generateToken(user);
  return { success: true, token, user: { id: user.id, username: user.username, role: user.role } };
}

function register(username, password, role = 'user') {
  const exists = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get(username);
  if (exists.count > 0) {
    return { success: false, error: '用户名已存在' };
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashedPassword, role);
  
  return { success: true, id: result.lastInsertRowid };
}

function getAllUsers() {
  return db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id').all();
}

function getUserById(id) {
  return db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id);
}

function updateUser(id, data) {
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!targetUser) {
    return { success: false, error: '用户不存在' };
  }
  
  // 禁止修改管理员用户
  if (targetUser.role === 'admin') {
    return { success: false, error: '不能修改管理员用户' };
  }
  
  const fields = [];
  const values = [];
  
  if (data.username) {
    fields.push('username = ?');
    values.push(data.username);
  }
  if (data.password) {
    fields.push('password = ?');
    values.push(bcrypt.hashSync(data.password, 10));
  }
  if (data.role) {
    // 非管理员不能将用户设置为管理员
    if (data.role === 'admin') {
      return { success: false, error: '普通用户不能授予管理员权限' };
    }
    fields.push('role = ?');
    values.push(data.role);
  }
  
  if (fields.length === 0) return { success: false, error: '没有要更新的字段' };
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { success: true };
}

function deleteUser(id) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(id);
  if (!user) {
    return { success: false, error: '用户不存在' };
  }
  if (user.role === 'admin') {
    return { success: false, error: '不能删除管理员' };
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return { success: true };
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未授权' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'token无效或已过期' });
  }

  req.user = decoded;
  next();
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: '需要管理员权限' });
  }
  next();
}

module.exports = {
  createDefaultAdmin,
  login,
  register,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authMiddleware,
  adminMiddleware
};
