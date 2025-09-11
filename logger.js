const fs = require('fs');
const path = require('path');

// 日志存储文件
const LOGS_FILE = path.join(__dirname, 'logs.json');

/**
 * 加载日志
 */
function loadLogs() {
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const data = fs.readFileSync(LOGS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('❌ 加载日志失败:', error.message);
    return [];
  }
}

/**
 * 保存日志
 */
function saveLogs(logs) {
  try {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('❌ 保存日志失败:', error.message);
    return false;
  }
}

/**
 * 记录日志
 * @param {string} taskName 任务名称
 * @param {string} mobile 手机号
 * @param {string} operation 操作类型 (send_success, send_failure, task_enabled, task_disabled)
 * @param {string} message 消息内容（可选）
 * @param {object} details 详细信息（可选）
 */
function logOperation(taskName, mobileList, operation, message = '', details = {}) {
  const logs = loadLogs();
  const newLog = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 11), // 唯一ID
    taskName,
    mobileList,
    operation,
    message,
    details,
    timestamp: new Date().toISOString(),
    timestampFormatted: new Date().toLocaleString('zh-CN', {
      timeZone: process.env.TZ || 'Asia/Shanghai',
      hour12: false
    })
  };
  
  logs.push(newLog);
  
  // 限制日志条数，最多保存10000条
  if (logs.length > 10000) {
    logs.splice(0, logs.length - 10000);
  }
  
  saveLogs(logs);
}

/**
 * 根据手机号获取日志
 */
function getLogsByPhone(phone, limit = 100) {
  const logs = loadLogs();
  const filteredLogs = logs
    .filter(log => log.mobileList.includes(phone))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
  
  return filteredLogs;
}

/**
 * 根据任务名称获取日志
 */
function getLogsByTaskName(taskName, limit = 100) {
  const logs = loadLogs();
  const filteredLogs = logs
    .filter(log => log.taskName === taskName)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
  
  return filteredLogs;
}

/**
 * 获取所有日志（支持分页）
 */
function getAllLogs(offset = 0, limit = 100) {
  const logs = loadLogs();
  const sortedLogs = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return {
    logs: sortedLogs.slice(offset, offset + limit),
    total: sortedLogs.length
  };
}

module.exports = {
  logOperation,
  getLogsByPhone,
  getLogsByTaskName,
  getAllLogs
};