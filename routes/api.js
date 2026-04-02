const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { importFromExcel, loadDemoData, getReportsNeedingReminder } = require('../utils/import');
const { sendWechatMessage } = require('../utils/wechat');
const { sendEmail } = require('../utils/email');
const { startScheduler, stopScheduler, reloadTask, executeReminderTask } = require('../utils/scheduler');
const { login, register, getAllUsers, getUserById, updateUser, deleteUser, createDefaultAdmin, authMiddleware, adminMiddleware } = require('../utils/auth');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');

// 初始化默认管理员
createDefaultAdmin();

// 登录
router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '请输入用户名和密码' });
    }
    const result = login(username, password);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 注册（仅管理员可添加用户）
router.post('/auth/register', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '请输入用户名和密码' });
    }
    const result = register(username, password, role || 'user');
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前用户信息
router.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

const upload = multer({ dest: './data/uploads/' });

const uploadDir = './data/uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 获取所有任务
router.get('/tasks', authMiddleware, (req, res) => {
  try {
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY id').all();
    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建任务
router.post('/tasks', authMiddleware, (req, res) => {
  try {
    const { name, message, cron, mobile_numbers, active_days, notify_type, remind_type, enabled } = req.body;
    
    const stmt = db.prepare(`
      INSERT INTO tasks (name, message, cron, mobile_numbers, active_days, notify_type, remind_type, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      name,
      message || '',
      cron || '0 9 * * *',
      mobile_numbers || '',
      active_days || '[1,2,3,4,5]',
      notify_type || 'wechat,email',
      remind_type || '报告',
      enabled !== undefined ? enabled : 1
    );
    
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新任务
router.put('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, message, cron, mobile_numbers, active_days, notify_type, remind_type, enabled } = req.body;
    
    const fields = [];
    const values = [];
    
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (message !== undefined) { fields.push('message = ?'); values.push(message); }
    if (cron !== undefined) { fields.push('cron = ?'); values.push(cron); }
    if (mobile_numbers !== undefined) { fields.push('mobile_numbers = ?'); values.push(mobile_numbers); }
    if (active_days !== undefined) { fields.push('active_days = ?'); values.push(active_days); }
    if (notify_type !== undefined) { fields.push('notify_type = ?'); values.push(notify_type); }
    if (remind_type !== undefined) { fields.push('remind_type = ?'); values.push(remind_type); }
    if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled); }
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const stmt = db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    
    // 如果启用的状态改变，重新加载任务
    if (enabled !== undefined) {
      const scheduler = require('../utils/scheduler');
      reloadTask(id);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除任务
router.delete('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // 停止定时任务
    const scheduler = require('../scheduler');
    if (scheduler.scheduledTasks && scheduler.scheduledTasks.has(parseInt(id))) {
      scheduler.scheduledTasks.get(parseInt(id)).stop();
      scheduler.scheduledTasks.delete(parseInt(id));
    }
    
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有供应商
router.get('/vendors', (req, res) => {
  try {
    const vendors = db.prepare('SELECT * FROM vendors ORDER BY id').all();
    res.json({ success: true, data: vendors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建供应商
router.post('/vendors', (req, res) => {
  try {
    const { name, email, cc, mobile } = req.body;
    const stmt = db.prepare('INSERT INTO vendors (name, email, cc, mobile) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name, email || '', cc || '', mobile || '');
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新供应商
router.put('/vendors/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, cc, mobile } = req.body;
    const stmt = db.prepare('UPDATE vendors SET name = ?, email = ?, cc = ?, mobile = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(name, email, cc, mobile, id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除供应商
router.delete('/vendors/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM vendors WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有报告
router.get('/reports', (req, res) => {
  try {
    const { type } = req.query;
    let reports;
    
    if (type === 'wafer') {
      reports = db.prepare('SELECT * FROM wafer_reports ORDER BY id').all();
    } else {
      reports = db.prepare('SELECT * FROM reports ORDER BY id').all();
    }
    
    res.json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建报告
router.post('/reports', (req, res) => {
  try {
    const { type, material_model, material_category, vendor, report_type, test_org, report_no, report_date, expiry_date, valid_days } = req.body;
    const table = type === 'wafer' ? 'wafer_reports' : 'reports';
    const stmt = db.prepare(`INSERT INTO ${table} (material_model, material_category, vendor, report_type, test_org, report_no, report_date, expiry_date, valid_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const result = stmt.run(material_model, material_category, vendor, report_type, test_org || '', report_no, report_date, expiry_date, valid_days);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新报告
router.put('/reports/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { type, material_model, material_category, vendor, report_type, test_org, report_no, report_date, expiry_date, valid_days, enabled } = req.body;
    const table = type === 'wafer' ? 'wafer_reports' : 'reports';
    const stmt = db.prepare(`UPDATE ${table} SET material_model = ?, material_category = ?, vendor = ?, report_type = ?, test_org = ?, report_no = ?, report_date = ?, expiry_date = ?, valid_days = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    stmt.run(material_model, material_category, vendor, report_type, test_org, report_no, report_date, expiry_date, valid_days, enabled, id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除报告
router.delete('/reports/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;
    const table = type === 'wafer' ? 'wafer_reports' : 'reports';
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取需要提醒的报告
router.get('/reports/remind', (req, res) => {
  try {
    const data = getReportsNeedingReminder();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 体系证书管理 ============

// 获取所有证书
router.get('/certificates', (req, res) => {
  try {
    const certificates = db.prepare('SELECT * FROM certificates ORDER BY id DESC').all();
    res.json({ success: true, data: certificates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取需要提醒的证书
router.get('/certificates/remind', (req, res) => {
  try {
    const threshold = parseInt(process.env.REMINDER_DAYS_THRESHOLD) || 15;
    const certificates = db.prepare(`
      SELECT * FROM certificates 
      WHERE valid_days <= ? AND enabled = 1
    `).all(threshold);
    res.json({ success: true, data: certificates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加证书
router.post('/certificates', (req, res) => {
  try {
    const {
      organization_name,
      certificate_name,
      certification_scope,
      certification_authority,
      certificate_no,
      iatf_certificate_no,
      organization_address,
      certificate_date,
      expiry_date,
      valid_days
    } = req.body;

    if (!organization_name) {
      return res.status(400).json({ success: false, error: '组织名称不能为空' });
    }

    const stmt = db.prepare(`
      INSERT INTO certificates (organization_name, certificate_name, certification_scope, 
        certification_authority, certificate_no, iatf_certificate_no, organization_address,
        certificate_date, expiry_date, valid_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      organization_name, certificate_name || '', certification_scope || '',
      certification_authority || '', certificate_no || '', iatf_certificate_no || '',
      organization_address || '', certificate_date || null, expiry_date || null,
      valid_days || 0
    );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新证书
router.put('/certificates/:id', (req, res) => {
  try {
    const {
      organization_name,
      certificate_name,
      certification_scope,
      certification_authority,
      certificate_no,
      iatf_certificate_no,
      organization_address,
      certificate_date,
      expiry_date,
      valid_days,
      enabled
    } = req.body;

    const stmt = db.prepare(`
      UPDATE certificates SET 
        organization_name = ?, certificate_name = ?, certification_scope = ?,
        certification_authority = ?, certificate_no = ?, iatf_certificate_no = ?,
        organization_address = ?, certificate_date = ?, expiry_date = ?,
        valid_days = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      organization_name, certificate_name || '', certification_scope || '',
      certification_authority || '', certificate_no || '', iatf_certificate_no || '',
      organization_address || '', certificate_date || null, expiry_date || null,
      valid_days || 0, enabled !== undefined ? enabled : 1, req.params.id
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除证书
router.delete('/certificates/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM certificates WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 从Excel导入数据
router.post('/import', (req, res) => {
  try {
    const { filePath } = req.body;
    const excelPath = filePath || process.env.EXCEL_PATH;
    
    if (!excelPath) {
      return res.status(400).json({ success: false, error: 'Excel path not configured' });
    }
    
    // 查找Excel文件
    const glob = require('glob');
    const files = glob.sync(path.join(excelPath, '*环保报告管控*.xls*'));
    
    if (files.length === 0) {
      return res.status(404).json({ success: false, error: 'Excel file not found' });
    }
    
    const result = importFromExcel(files[files.length - 1]);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 加载Demo数据
router.post('/import/demo', (req, res) => {
  try {
    loadDemoData();
    res.json({ success: true, message: 'Demo data loaded' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 导出模板
router.get('/import/template', (req, res) => {
  try {
    const templateData = {
      vendors: [
        { 供应商: 'ASY', 邮箱地址: 'vendor@example.com', 抄送: 'cc@example.com', 手机号: '13800138000' }
      ],
      reports: [
        { 序号: 1, 材料型号: 'MODEL-001', 材料类别: 'IC', 供应商: 'ASY', 报告类型: 'ROHS', 测试机构: 'SGS', 报告编号: 'R2024001', 报告日期: '2024-01-15', 报告到期日期: '2025-01-14', 有效天数: 364 }
      ],
      waferReports: [
        { 序号: 1, 材料型号: 'WAFER-001', 材料类别: '晶圆', 供应商: 'FAB', 报告类型: 'ROHS', 报告编号: 'W2024001', 报告日期: '2024-01-15', 报告到期日期: '2025-01-14', 有效天数: 364 }
      ],
      certificates: [
        { 序号: 1, 组织名称: 'XXX公司', 证书名称: 'ISO9001', '认证/代理范围': '汽车零部件', '认证/授权机构': 'SGS', 证书编号: 'CNAS-12345', IATF证书编号: '', 组织认证地址: '深圳市某某区', 现行证书日期: '2024-01-01', 证书有效期限: '2027-01-01', 有效天数: 1095 }
      ]
    };

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(templateData.vendors);
    ws1['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, '邮件地址');

    const ws2 = XLSX.utils.json_to_sheet(templateData.reports);
    ws2['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, '封装材料');

    const ws3 = XLSX.utils.json_to_sheet(templateData.waferReports);
    ws3['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws3, '晶圆');

    const ws4 = XLSX.utils.json_to_sheet(templateData.certificates);
    ws4['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws4, '体系证书');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename=rohs_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 上传文件并导入
router.post('/import/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请选择文件' });
    }

    const allowedExtensions = ['.xlsx', '.xls'];
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: '仅支持.xlsx和.xls格式' });
    }

    const result = importFromExcel(req.file.path);
    
    fs.unlinkSync(req.file.path);

    if (result.success) {
      res.json({ success: true, message: `成功导入 ${result.records} 条记录` });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 导出数据
router.get('/export', (req, res) => {
  try {
    const { type } = req.query;
    let data = [];
    let sheetName = '';
    
    if (type === 'reports') {
      data = db.prepare('SELECT * FROM reports').all();
      sheetName = '封装材料';
    } else if (type === 'wafer') {
      data = db.prepare('SELECT * FROM wafer_reports').all();
      sheetName = '晶圆';
    } else if (type === 'vendors') {
      data = db.prepare('SELECT * FROM vendors').all();
      sheetName = '邮件地址';
    } else if (type === 'certificates') {
      data = db.prepare('SELECT * FROM certificates').all();
      sheetName = '体系证书';
    } else {
      return res.status(400).json({ success: false, error: '未知导出类型' });
    }
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    const filename = encodeURIComponent(`RoHS_${sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动触发提醒
router.post('/remind', async (req, res) => {
  try {
    await executeReminderTask({ id: 0, name: 'Manual', notify_type: 'wechat,email' });
    res.json({ success: true, message: 'Reminder sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动触发指定任务
router.post('/tasks/:id/trigger', async (req, res) => {
  try {
    const { id } = req.params;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    await executeReminderTask(task);
    res.json({ success: true, message: '任务已执行' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量触发任务
router.post('/tasks/trigger-batch', async (req, res) => {
  try {
    const { taskIds } = req.body;
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, error: '请选择要触发的任务' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const taskId of taskIds) {
      try {
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        if (task) {
          await executeReminderTask(task);
          successCount++;
        } else {
          errorCount++;
        }
      } catch (e) {
        errorCount++;
      }
    }
    
    res.json({ success: true, message: `成功触发 ${successCount} 个任务${errorCount > 0 ? '，失败 ' + errorCount + ' 个' : ''}` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 测试企业微信消息
router.post('/test/wechat', async (req, res) => {
  try {
    const { content, mobiles, mobileList } = req.body;
    const result = await sendWechatMessage(content || '测试消息', mobiles || [], mobileList || []);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 测试邮件发送
router.post('/test/email', async (req, res) => {
  try {
    const { to, subject, content } = req.body;
    const result = await sendEmail(to, subject, content);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取统计信息
router.get('/stats', (req, res) => {
  try {
    const vendorCount = db.prepare('SELECT COUNT(*) as count FROM vendors').get();
    const reportCount = db.prepare('SELECT COUNT(*) as count FROM reports').get();
    const waferCount = db.prepare('SELECT COUNT(*) as count FROM wafer_reports').get();
    const certCount = db.prepare('SELECT COUNT(*) as count FROM certificates').get();
    const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get();
    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM reports WHERE valid_days <= 15 AND valid_days >= 0").get();
    const expiredCount = db.prepare("SELECT COUNT(*) as count FROM reports WHERE valid_days < 0").get();
    const waferPendingCount = db.prepare("SELECT COUNT(*) as count FROM wafer_reports WHERE valid_days <= 15 AND valid_days >= 0").get();
    const waferExpiredCount = db.prepare("SELECT COUNT(*) as count FROM wafer_reports WHERE valid_days < 0").get();
    const certPendingCount = db.prepare("SELECT COUNT(*) as count FROM certificates WHERE valid_days <= 15 AND valid_days >= 0").get();
    const certExpiredCount = db.prepare("SELECT COUNT(*) as count FROM certificates WHERE valid_days < 0").get();
    
    res.json({
      success: true,
      data: {
        vendors: vendorCount.count,
        reports: reportCount.count,
        waferReports: waferCount.count,
        certificates: certCount.count,
        tasks: taskCount.count,
        pendingReminders: pendingCount.count + waferPendingCount.count + certPendingCount.count,
        expiredReports: expiredCount.count + waferExpiredCount.count + certExpiredCount.count
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取发送日志
router.get('/logs', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logs = db.prepare('SELECT * FROM send_logs ORDER BY sent_at DESC LIMIT ?').all(parseInt(limit));
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除发送日志
router.delete('/logs/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM send_logs WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 清理指定天数之前的日志
router.post('/logs/clean', (req, res) => {
  try {
    const { days = 30 } = req.body;
    const result = db.prepare('DELETE FROM send_logs WHERE sent_at < datetime("now", "-" || ? || " days")').run(days);
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取导入历史
router.get('/import-logs', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM import_logs ORDER BY imported_at DESC LIMIT 20').all();
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 用户管理 ============

// 获取所有用户
router.get('/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const users = getAllUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个用户
router.get('/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const user = getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新用户
router.put('/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const result = updateUser(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除用户
router.delete('/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const result = deleteUser(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 环境变量配置
router.get('/config', (req, res) => {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const config = {};
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) {
          config[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
        }
      });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/config', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { key, value } = req.body;
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    const lines = envContent.split('\n');
    let found = false;
    const newLines = lines.map(line => {
      if (line.startsWith(key + '=')) {
        found = true;
        return key + '=' + value;
      }
      return line;
    });
    
    if (!found) {
      newLines.push(key + '=' + value);
    }
    
    fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
