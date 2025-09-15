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
    isFinish: false,
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

function pagination(pageNo = 1, pageSize = 10, dataList = []) {
  if (pageNo < 1 || pageSize < 1) return [] // 非法参数直接返回空数组

  const start = (pageNo - 1) * pageSize
  const end = start + pageSize

  return dataList.slice(start, end)
}

/**
 * 根据手机号获取日志
 */
function getLogsByPhone(phone, status, pageNo = 1, pageSize = 20) {
  const logs = loadLogs();
  const filteredLogs = logs
    .filter(log => log.mobileList.includes(phone))
    .filter(log => {
      if (status) {
        return log.operation === status
      } else {
        return true
      }
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  
  return {
    logs: pagination(pageNo, pageSize, filteredLogs),
    total: filteredLogs.length
  };
}

/**
 * 根据任务名称获取日志
 */
function getLogsByTaskName(taskName, pageNo = 1, pageSize = 20) {
  const logs = loadLogs();
  const filteredLogs = logs
    .filter(log => log.taskName === taskName)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  
  return {
    logs: pagination(pageNo, pageSize, filteredLogs),
    total: filteredLogs.length
  };
}

/**
 * 获取所有日志（支持分页）
 */
function getAllLogs() {
  const logs = loadLogs();
  return logs;
}

module.exports = {
  saveLogs,
  logOperation,
  getLogsByPhone,
  getLogsByTaskName,
  getAllLogs
};