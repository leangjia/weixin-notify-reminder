/**
 * 工具函数模块
 * 提供Cron表达式解析、日期格式化等通用功能
 */

/**
 * 解析Cron表达式为自然语言描述
 * @param {string} expression Cron表达式
 * @returns {string} 自然语言描述
 */
function parseCronExpression(expression) {
  // 处理简化的表达式（仅5位）
  const parts = expression.trim().split(/\s+/);
  if (parts.length === 5) {
      // 缺少秒字段，默认添加0秒
      parts.unshift('0');
  }
  
  if (parts.length !== 6) {
      throw new Error('无效的Cron表达式，必须包含6个字段：秒 分 时 日 月 周');
  }
  
  const [second, minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  // 解析辅助函数
  function parseField(field, type) {
      // 处理特殊值
      if (field === '*') return type === 'second' ? '0秒' : '';
      if (field === '?') return '';
      
      // 处理步长值（*/n）
      if (field.startsWith('*/')) {
          const step = parseInt(field.substring(2), 10);
          if (isNaN(step)) return '';
          return `每${step}${type === 'second' ? '秒' : 
                  type === 'minute' ? '分钟' : 
                  type === 'hour' ? '小时' : 
                  type === 'dayOfMonth' ? '天' : 
                  type === 'month' ? '个月' : '周'}`;
      }
      
      // 处理逗号分隔的值
      if (field.includes(',')) {
          const values = field.split(',').map(v => parseInt(v));
          return values.join('、');
      }
      
      // 处理范围值
      if (field.includes('-')) {
          const [start, end] = field.split('-').map(v => parseInt(v));
          return `${start}到${end}`;
      }
      
      // 默认处理单一值
      const value = parseInt(field, 10);
      return isNaN(value) ? '' : value.toString();
  }
  
  // 解析每个字段
  const secondDesc = parseField(second, 'second');
  const minuteDesc = parseField(minute, 'minute');
  const hourDesc = parseField(hour, 'hour');
  const dayOfMonthDesc = parseField(dayOfMonth, 'dayOfMonth');
  const monthDesc = parseField(month, 'month');
  const dayOfWeekDesc = parseField(dayOfWeek, 'dayOfWeek');
  
  // 构建描述
  const descriptions = [];
  
  // 1. 处理月和日
  if (monthDesc) {
      descriptions.push(`${monthDesc}月`);
  }
  if (dayOfMonthDesc) {
      descriptions.push(`${dayOfMonthDesc}日`);
  }
  
  // 2. 处理周
  if (dayOfWeekDesc) {
      const weekMap = {
          0: '日',
          1: '一',
          2: '二',
          3: '三',
          4: '四',
          5: '五',
          6: '六',
          7: '日'
      };
      
      descriptions.push(`周${dayOfWeekDesc.split(',').map(w => weekMap[w] || w).join('到')}`);
  }
  
  // 3. 处理时间
  const timeParts = [];
  if (hourDesc) {
      timeParts.push(hourDesc + '点');
  }
  if (minuteDesc) {
      if (minuteDesc === '0') {
          timeParts.push('整');
      } else {
          timeParts.push(minuteDesc + '分');
      }
  }
  if (secondDesc && secondDesc !== '0') {
      timeParts.push(secondDesc + '秒');
  }
  
  let timeDescription = '';
  if (timeParts.length > 0) {
      timeDescription = timeParts.join('') + '执行';
  }
  
  // 4. 处理特殊情况
  if (descriptions.length === 0) {
      return timeDescription || '每天执行';
  }
  
  // 5. 合并描述
  const description = descriptions.join('、') + (timeDescription ? '的' + timeDescription : '执行');
  
  return description;
}

/**
 * 格式化有效日期为可读文本
 * @param {Array} activeDays - 有效日期数组 [0,1,2,3,4,5,6]
 * @returns {string} 可读文本
 */
function formatActiveDays(activeDays) {
  if (!activeDays || activeDays.length === 0) return '每天';
  if (activeDays.length === 7) return '每天';
  
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return activeDays.map(d => dayNames[d]).join(', ');
}


module.exports = {
  parseCronExpression,
  formatActiveDays,
};