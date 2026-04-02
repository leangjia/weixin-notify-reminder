const cron = require('node-cron');
const { sendWechatMessage, buildReminderMessage } = require('./wechat');
const { sendEmail, buildEmailContent } = require('./email');
const { getReportsNeedingReminder, loadDemoData } = require('./import');
const db = require('./db');

const scheduledTasks = new Map();

function getCurrentTime() {
  const now = new Date();
  const offset = 8 * 60 * 60 * 1000;
  const localTime = new Date(now.getTime() + offset);
  return localTime.toISOString().replace('T', ' ').substring(0, 19);
}

function startScheduler() {
  console.log('[Scheduler] 启动任务调度器...');
  
  const vendorCount = db.prepare('SELECT COUNT(*) as count FROM vendors').get();
  if (vendorCount.count === 0) {
    console.log('[Scheduler] 无供应商数据，加载演示数据...');
    loadDemoData();
  }

  const tasks = db.prepare('SELECT * FROM tasks WHERE enabled = 1').all();
  
  for (const task of tasks) {
    scheduleTask(task);
  }

  console.log(`[Scheduler] 已调度 ${tasks.length} 个任务`);

  // 每天凌晨3点自动清理日志
  cron.schedule('0 3 * * *', () => {
    const cleanDays = parseInt(process.env.LOG_CLEAN_DAYS) || 30;
    try {
      const result = db.prepare('DELETE FROM send_logs WHERE sent_at < datetime("now", "-" || ? || " days")').run(cleanDays);
      console.log(`[Scheduler] 自动清理了 ${result.changes} 条旧日志`);
    } catch (e) {
      console.error('[Scheduler] 日志清理失败:', e.message);
    }
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'Asia/Shanghai'
  });
}

function scheduleTask(task) {
  if (scheduledTasks.has(task.id)) {
    scheduledTasks.get(task.id).stop();
  }

  if (!task.enabled) return;

  const cronJob = cron.schedule(task.cron, async () => {
    console.log(`[Scheduler] 执行任务: ${task.name}`);
    await executeReminderTask(task);
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'Asia/Shanghai'
  });

  scheduledTasks.set(task.id, cronJob);
  console.log(`[Scheduler] 任务 "${task.name}" 已调度，cron: ${task.cron}`);
}

async function executeReminderTask(task) {
  const remindType = task.remind_type || '报告';
  console.log(`[Scheduler] 执行任务: ${task.name}, 类型: ${remindType}`);
  
  if (remindType === '体系证书') {
    const threshold = parseInt(process.env.REMINDER_DAYS_THRESHOLD) || 15;
    const certificates = db.prepare(`
      SELECT * FROM certificates 
      WHERE valid_days <= ? AND enabled = 1
    `).all(threshold);
    
    const notifyTypes = task.notify_type.split(',');
    
    for (const cert of certificates) {
      const message = `体系证书到期提醒:\n组织名称:${cert.organization_name}\n证书名称:${cert.certificate_name}\n认证机构:${cert.certification_authority}\n证书编号:${cert.certificate_no}\n到期日期:${cert.expiry_date}\n剩余有效天数:${cert.valid_days}天`;
      
      if (notifyTypes.includes('wechat')) {
        const vendor = db.prepare('SELECT * FROM vendors WHERE name = ?').get(cert.organization_name);
        const mobiles = vendor && vendor.mobile ? vendor.mobile.split(/[,;，；|]/).map(m => m.trim()).filter(m => m) : [];
        await sendWechatMessage(message, [], mobiles);
      }
      
      if (notifyTypes.includes('email') && vendor && vendor.email) {
        const ccList = vendor.cc ? vendor.cc.split(/[,;，；|]/).map(m => m.trim()).filter(m => m) : [];
        await sendEmail(vendor.email, `体系证书到期提醒 - ${cert.organization_name}`, message, ccList);
      }
      
      const now = getCurrentTime();
      db.prepare(`
        INSERT INTO send_logs (task_id, vendor, material_model, message_type, notify_type, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(task.id || null, cert.organization_name, cert.certificate_name, cert.valid_days < 0 ? 'expired' : 'reminder', task.notify_type, 'sent', now);
    }
  }
  
  if (remindType === '报告') {
    const { reports, waferReports } = getReportsNeedingReminder();
    const notifyTypes = task.notify_type.split(',');

    for (const report of reports) {
      const vendor = db.prepare('SELECT * FROM vendors WHERE name = ?').get(report.vendor);
      if (!vendor) continue;

      const message = buildReminderMessage(vendor.name, {
        materialCategory: report.material_category,
        materialModel: report.material_model,
        supplier: report.vendor,
        reportType: report.report_type,
        testOrg: report.test_org,
        reportNo: report.report_no,
        reportDate: report.report_date,
        expiryDate: report.expiry_date,
        validDays: report.valid_days
      });

      if (!message) continue;

      if (notifyTypes.includes('wechat')) {
        const mobiles = vendor.mobile ? vendor.mobile.split(/[,;，；|]/).map(m => m.trim()).filter(m => m) : [];
        await sendWechatMessage(message, [], mobiles);
      }

      if (notifyTypes.includes('email') && vendor.email) {
        const emailData = buildEmailContent(vendor.name, {
          materialCategory: report.material_category,
          materialModel: report.material_model,
          supplier: report.vendor,
          reportType: report.report_type,
          testOrg: report.test_org,
          reportNo: report.report_no,
          reportDate: report.report_date,
          expiryDate: report.expiry_date,
          validDays: report.valid_days
        });
        
        if (emailData) {
          const ccList = vendor.cc ? vendor.cc.split(/[,;，；|]/).map(m => m.trim()).filter(m => m) : [];
          await sendEmail(vendor.email, emailData.subject, emailData.content, ccList);
        }
      }

      const taskId = task.id || null;
      const now = getCurrentTime();
      db.prepare(`
        INSERT INTO send_logs (task_id, vendor, material_model, message_type, notify_type, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(taskId, report.vendor, report.material_model, report.valid_days < 0 ? 'expired' : 'reminder', task.notify_type, 'sent', now);
    }

    for (const report of waferReports) {
      const vendor = db.prepare('SELECT * FROM vendors WHERE name = ?').get(report.vendor);
      if (!vendor) continue;

      const message = buildReminderMessage(vendor.name, {
        materialCategory: report.material_category,
        materialModel: report.material_model,
        supplier: report.vendor,
        reportType: report.report_type,
        testOrg: '',
        reportNo: report.report_no,
        reportDate: report.report_date,
        expiryDate: report.expiry_date,
        validDays: report.valid_days
      });

      if (!message) continue;

      if (notifyTypes.includes('wechat')) {
        const mobiles = vendor.mobile ? vendor.mobile.split(/[,;，；|]/).map(m => m.trim()).filter(m => m) : [];
        await sendWechatMessage(message, [], mobiles);
      }

      if (notifyTypes.includes('email') && vendor.email) {
        const emailData = buildEmailContent(vendor.name, {
          materialCategory: report.material_category,
          materialModel: report.material_model,
          supplier: report.vendor,
          reportType: report.report_type,
          testOrg: '',
          reportNo: report.report_no,
          reportDate: report.report_date,
          expiryDate: report.expiry_date,
          validDays: report.valid_days
        });
        
        if (emailData) {
          const ccList = vendor.cc ? vendor.cc.split(/[,;，；|]/).map(m => m.trim()).filter(m => m) : [];
          await sendEmail(vendor.email, emailData.subject, emailData.content, ccList);
        }
      }

      const taskId = task.id || null;
      const now = getCurrentTime();
      db.prepare(`
        INSERT INTO send_logs (task_id, vendor, material_model, message_type, notify_type, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(taskId, report.vendor, report.material_model, report.valid_days < 0 ? 'expired' : 'reminder', task.notify_type, 'sent', now);
    }
  }

  if (task.id) {
    const now = getCurrentTime();
    db.prepare('UPDATE tasks SET last_run = ? WHERE id = ?').run(now, task.id);
  }
  console.log(`[Scheduler] 任务 "${task.name}" 已完成`);
}

function stopScheduler() {
  for (const [id, job] of scheduledTasks) {
    job.stop();
  }
  scheduledTasks.clear();
  console.log('[Scheduler] 所有任务已停止');
}

function reloadTask(taskId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (task) {
    scheduleTask(task);
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  reloadTask,
  executeReminderTask,
  scheduledTasks
};