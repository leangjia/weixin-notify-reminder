const axios = require('axios');

const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send';
const WECHAT_WEBHOOK_KEY = process.env.WECHAT_WEBHOOK_KEY || '';

// 消息发送频率控制
let messageQueue = [];
const MAX_PER_MINUTE = 20;
const RATE_LIMIT_MS = 60 * 1000 / MAX_PER_MINUTE; // 3000ms between messages

async function sendWechatMessage(content, mentionedList = [], mentionedMobileList = []) {
  if (!WECHAT_WEBHOOK_KEY) {
    console.log('[WeChat] Webhook key not configured, skipping...');
    return { success: false, error: 'Webhook key not configured' };
  }

  // 添加到队列
  messageQueue.push({ content, mentionedList, mentionedMobileList });
  
  // 处理队列
  if (messageQueue.length === 1) {
    processQueue();
  }
  
  return { success: true, queued: true };
}

async function processQueue() {
  while (messageQueue.length > 0) {
    const msg = messageQueue[0];
    await sendSingleMessage(msg.content, msg.mentionedList, msg.mentionedMobileList);
    messageQueue.shift();
    
    // 控制发送频率
    if (messageQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
    }
  }
}

async function sendSingleMessage(content, mentionedList = [], mentionedMobileList = []) {
  const webhookUrl = `${WECHAT_WEBHOOK_URL}?key=${WECHAT_WEBHOOK_KEY}`;
  
  const data = {
    msgtype: 'text',
    text: {
      content: content,
      mentioned_list: mentionedList,
      mentioned_mobile_list: mentionedMobileList
    }
  };

  try {
    const response = await axios.post(webhookUrl, data, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.status === 200 && response.data.errcode === 0) {
      console.log('[WeChat] Message sent successfully');
      return { success: true };
    } else {
      console.error('[WeChat] Send failed:', response.data);
      return { success: false, error: response.data.errmsg };
    }
  } catch (error) {
    console.error('[WeChat] Send error:', error.message);
    return { success: false, error: error.message };
  }
}

function buildReminderMessage(vendor, data) {
  const { materialCategory, materialModel, supplier, reportType, testOrg, reportNo, reportDate, expiryDate, validDays } = data;
  
  // 获取日期月-日格式
  const today = new Date();
  const dateStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // 构建消息
  if (validDays <= 15 && validDays >= 0) {
    // 待更新提醒
    return `${dateStr}${vendor}${reportType}报告待更新:\n材料类别:${materialCategory}\n型号:${materialModel}\n报告编号:${reportNo}\n到期日:${expiryDate},剩余 ${validDays} 天`;
  } else if (validDays < 0) {
    // 超期提醒
    return `${dateStr}${vendor}${reportType}报告超期:\n材料类别:${materialCategory}\n型号:${materialModel}\n报告编号:${reportNo}\n到期日:${expiryDate},已超期 ${Math.abs(validDays)} 天`;
  }
  return null;
}

module.exports = {
  sendWechatMessage,
  buildReminderMessage
};
