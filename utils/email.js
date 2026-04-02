const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.qiye.aliyun.com';
const SMTP_PORT = process.env.SMTP_PORT || 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || '';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

async function sendEmail(to, subject, content, cc = []) {
  if (!SMTP_USER || !SMTP_PASS) {
    console.log('[Email] SMTP not configured, skipping...');
    return { success: false, error: 'SMTP not configured' };
  }

  const fromAddress = SMTP_USER;
  
  const mailOptions = {
    from: fromAddress,
    to: Array.isArray(to) ? to.join(',') : to,
    cc: Array.isArray(cc) ? cc.join(',') : (cc || ''),
    subject: subject,
    text: content
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] Message sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] Send error:', error.message);
    return { success: false, error: error.message };
  }
}

function buildEmailContent(vendor, data, isExpired) {
  const { materialCategory, materialModel, supplier, reportType, testOrg, reportNo, reportDate, expiryDate, validDays } = data;
  const today = new Date().toISOString().split('T')[0];
  
  if (validDays <= 15 && validDays >= 0) {
    const subject = `${vendor}${reportType}报告待更新:${materialCategory}-型号:${materialModel}-${reportType}报告到期:${expiryDate}，有效期剩${validDays}天，请及时更新!`;
    const content = `TO 尊敬的合作伙伴 ${vendor}:\n您有环保报告马上就要到期了，请及时更新！！材料信息如下: \n材料类别:${materialCategory}\n型号:${materialModel}\n供应商:${supplier}\n报告类型:${reportType}\n测试机构:${testOrg}\n报告编号:${reportNo}\n报告日期:${reportDate}\n到期日期:${expiryDate}\n有效天数剩余：${validDays}天！\n--------------------------------------广州巨风集智有限公司 品质部 ${today}`;
    return { subject, content };
  } else if (validDays < 0) {
    const subject = `${vendor}${reportType}报告须更新:${materialCategory}-型号:${materialModel}-${reportType}报告到期:${expiryDate}，已超${Math.abs(validDays)}天!`;
    const content = `TO 尊敬的合作伙伴 ${vendor}:\n您有环保报告已经超期，请及时更新！！材料信息如下: \n材料类别:${materialCategory}\n型号:${materialModel}\n供应商:${supplier}\n报告类型:${reportType}\n测试机构:${testOrg}\n报告编号:${reportNo}\n报告日期:${reportDate}\n到期日期:${expiryDate}\n已超期：${Math.abs(validDays)}天！\n--------------------------------------广州巨风集智有限公司 品质部 ${today}`;
    return { subject, content };
  }
  return null;
}

module.exports = {
  sendEmail,
  buildEmailContent
};
