const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const EXCEL_PATH = process.env.EXCEL_PATH || './data';
const REPORT_VALID_DAYS = parseInt(process.env.REPORT_VALID_DAYS) || 364;

function readExcel(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }
  
  const workbook = XLSX.readFile(filePath);
  return workbook;
}

function parseExcelToData(workbook) {
  const data = {
    reports: [],
    waferReports: [],
    vendors: [],
    certificates: []
  };

  // 封装材料/主报告 Sheet
  const sheet0Name = workbook.SheetNames.find(name => name.includes('封装') || name.includes('材料'));
  const sheet0 = sheet0Name ? workbook.Sheets[sheet0Name] : workbook.Sheets[workbook.SheetNames[0]];
  if (sheet0) {
    console.log('[Import] Processing sheet:', sheet0Name || workbook.SheetNames[0]);
    const json = XLSX.utils.sheet_to_json(sheet0, { defval: '' });
    const firstRow = json[0] || {};
    
    // 查找供应商列 - 从"有效天数"之后，排除"未采购备"
    const vendorColumns = [];
    const baseCols = ['序号', '材料型号', '材料类别', '供应', '报告类型', '测试机构', '报告编号', '报告日期', '报告到期日期', '有效天数', '未采购备'];
    
    for (const key of Object.keys(firstRow)) {
      let isBase = false;
      for (const base of baseCols) {
        if (key.includes(base)) { isBase = true; break; }
      }
      if (!isBase && key.trim()) {
        vendorColumns.push({ name: key.trim() });
      }
    }

    for (let rowIdx = 1; rowIdx < json.length; rowIdx++) {
      const row = json[rowIdx];
      const materialModel = row['材料型号'];
      if (!materialModel || materialModel === 'na') continue;

      // 遍历供应商列，找到有值的（标记为√或其他）
      for (const vc of vendorColumns) {
        const val = row[vc.name];
        if (val && String(val).trim() && String(val).trim() !== '' && String(val).trim().toLowerCase() !== 'na') {
          data.reports.push({
            material_model: materialModel || '',
            material_category: row['材料类别'] || row['材料类别'.replace(/.$/, '')] || '',
            vendor: vc.name,
            report_type: row['报告类型'] || '',
            test_org: row['测试机构'] || '',
            report_no: row['报告编号'] || '',
            report_date: parseExcelDate(row['报告日期']),
            supplier_column: vc.name
          });
        }
      }
    }
  }

  // 晶圆/Wafer报告 Sheet (根据Sheet名称查找)
  const waferSheetName = workbook.SheetNames.find(name => name.includes('晶圆'));
  if (waferSheetName) {
    const sheet1 = workbook.Sheets[waferSheetName];
    const json = XLSX.utils.sheet_to_json(sheet1, { defval: '' });
    data.waferReports = json.map(row => ({
      material_model: row['材料型号'] || '',
      material_category: row['材料类别'] || '',
      vendor: row['供应商'] || '',
      report_type: row['报告类型'] || '',
      report_no: row['报告编号'] || '',
      report_date: parseExcelDate(row['报告日期'])
    })).filter(r => r.material_model && r.material_model !== 'na');
  }

  // 邮件地址/供应商配置 Sheet (根据Sheet名称查找)
  const emailSheetName = workbook.SheetNames.find(name => name.includes('邮件') || name.includes('地址'));
  if (emailSheetName) {
    const sheet2 = workbook.Sheets[emailSheetName];
    const json = XLSX.utils.sheet_to_json(sheet2, { defval: '' });
    data.vendors = json.map(row => ({
      name: row['供应商'] || row['供应?'] || '',
      email: row['邮箱地址'] || row['邮箱?'] || '',
      cc: row['抄送'] || row['抄?'] || '',
      mobile: row['手机号'] || ''
    })).filter(r => r.name);
  } else if (workbook.SheetNames[2]) {
    // 备用：尝试读取第三个Sheet
    const sheet2 = workbook.Sheets[workbook.SheetNames[2]];
    const json = XLSX.utils.sheet_to_json(sheet2, { defval: '' });
    data.vendors = json.map(row => ({
      name: row['供应商'] || row['供应?'] || '',
      email: row['邮箱地址'] || row['邮箱?'] || '',
      cc: row['抄送'] || row['抄?'] || '',
      mobile: row['手机号'] || ''
    })).filter(r => r.name);
  }

  // 体系证书 Sheet
  const certSheetName = workbook.SheetNames.find(name => name.includes('体系证书'));
  if (certSheetName) {
    const certSheet = workbook.Sheets[certSheetName];
    const json = XLSX.utils.sheet_to_json(certSheet, { defval: '' });
    data.certificates = json.map(row => ({
      organization_name: row['组织名称'] || '',
      certificate_name: row['证书名称'] || '',
      certification_scope: row['认证/代理范围'] || '',
      certification_authority: row['认证/授权机构'] || '',
      certificate_no: row['证书编号'] || '',
      iatf_certificate_no: row['IATF证书编号'] || '',
      organization_address: row['组织认证地址'] || '',
      certificate_date: parseExcelDate(row['现行证书日期']),
      expiry_date: parseExcelDate(row['证书有效期限']),
      valid_days: row['有效天数'] || 0
    })).filter(c => c.organization_name);
  }

  return data;
}

function parseExcelDate(value) {
  if (!value || value === '') return null;
  
  // 如果是数字（Excel日期序列号）
  if (typeof value === 'number') {
    const date = new Date((value - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // 如果是字符串，尝试解析
  if (typeof value === 'string') {
    const str = value.trim();
    if (!str) return null;
    
    // 尝试多种日期格式
    const patterns = [
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,           // 2024-01-15
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,         // 2024/01/15
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,         // 01/15/2024
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/             // 01-15-2024
    ];
    
    for (const pattern of patterns) {
      const match = str.match(pattern);
      if (match) {
        let year, month, day;
        if (pattern === patterns[0] || pattern === patterns[1]) {
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        } else {
          month = parseInt(match[1]);
          day = parseInt(match[2]);
          year = parseInt(match[3]);
        }
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
    }
    
    // 尝试直接转换
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // 如果是Date对象
  if (value instanceof Date) {
    if (!isNaN(value.getTime())) {
      return value.toISOString().split('T')[0];
    }
  }
  
  return null;
}

function calculateExpiryDate(reportDate) {
  if (!reportDate) return null;
  const date = new Date(reportDate);
  date.setDate(date.getDate() + REPORT_VALID_DAYS);
  return date.toISOString().split('T')[0];
}

function calculateValidDays(expiryDate) {
  if (!expiryDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diff = expiry - today;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function importToDatabase(data) {
  const insertVendor = db.prepare(`
    INSERT OR REPLACE INTO vendors (name, email, cc, mobile)
    VALUES (?, ?, ?, ?)
  `);
  
  const insertReport = db.prepare(`
    INSERT OR REPLACE INTO reports (material_model, material_category, vendor, report_type, test_org, report_no, report_date, expiry_date, valid_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertWafer = db.prepare(`
    INSERT OR REPLACE INTO wafer_reports (material_model, material_category, vendor, report_type, report_no, report_date, expiry_date, valid_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLog = db.prepare(`
    INSERT INTO import_logs (file_path, records_count, status)
    VALUES (?, ?, ?)
  `);

  const insertCert = db.prepare(`
    INSERT OR REPLACE INTO certificates (organization_name, certificate_name, certification_scope,
      certification_authority, certificate_no, iatf_certificate_no, organization_address,
      certificate_date, expiry_date, valid_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    // 导入供应商
    for (const v of data.vendors) {
      insertVendor.run(v.name || '', v.email || '', v.cc || '', v.mobile || '');
    }

    // 导入主报告
    for (const r of data.reports) {
      const reportDate = r.report_date || null;
      const expiryDate = calculateExpiryDate(reportDate);
      const validDays = calculateValidDays(expiryDate);
      insertReport.run(
        String(r.material_model || ''),
        String(r.material_category || ''),
        String(r.vendor || ''),
        String(r.report_type || ''),
        String(r.test_org || ''),
        String(r.report_no || ''),
        reportDate,
        expiryDate,
        Number(validDays) || 0
      );
    }

    // 导入Wafer报告
    for (const r of data.waferReports) {
      const reportDate = r.report_date || null;
      const expiryDate = calculateExpiryDate(reportDate);
      const validDays = calculateValidDays(expiryDate);
      insertWafer.run(
        String(r.material_model || ''),
        String(r.material_category || ''),
        String(r.vendor || ''),
        String(r.report_type || ''),
        String(r.report_no || ''),
        reportDate,
        expiryDate,
        Number(validDays) || 0
      );
    }

    // 导入体系证书
    for (const c of data.certificates) {
      const certDate = c.certificate_date || null;
      const expiryDate = c.expiry_date || null;
      const validDays = calculateValidDays(expiryDate);
      insertCert.run(
        String(c.organization_name || ''),
        String(c.certificate_name || ''),
        String(c.certification_scope || ''),
        String(c.certification_authority || ''),
        String(c.certificate_no || ''),
        String(c.iatf_certificate_no || ''),
        String(c.organization_address || ''),
        certDate,
        expiryDate,
        Number(validDays) || 0
      );
    }

    const totalRecords = data.vendors.length + data.reports.length + data.waferReports.length + data.certificates.length;
    insertLog.run('Excel导入', totalRecords, 'success');
  });

  try {
    transaction();
    return { success: true, records: data.vendors.length + data.reports.length + data.waferReports.length + data.certificates.length };
  } catch (error) {
    console.error('[Import] Database error:', error.message);
    return { success: false, error: error.message };
  }
}

function loadDemoData() {
  const demoVendors = [
    { name: 'ASY', email: 'vendor1@example.com', cc: '13800138000' },
    { name: 'FAB', email: 'vendor2@example.com', cc: '13800138001' },
    { name: 'QP', email: 'vendor3@example.com', cc: '13800138002' }
  ];

  const demoReports = [
    { material_model: 'MODEL-001', material_category: 'IC', vendor: 'ASY', report_type: 'ROHS', test_org: 'SGS', report_no: 'R2024001', report_date: '2024-01-15' },
    { material_model: 'MODEL-002', material_category: 'IC', vendor: 'FAB', report_type: 'ROHS', test_org: 'UL', report_no: 'R2024002', report_date: '2024-06-01' },
    { material_model: 'MODEL-003', material_category: '电容', vendor: 'QP', report_type: 'REACH', test_org: 'TUV', report_no: 'R2024003', report_date: '2024-11-01' },
    { material_model: 'MODEL-004', material_category: '电阻', vendor: 'ASY', report_type: 'ROHS', test_org: 'SGS', report_no: 'R2024004', report_date: '2023-12-01' }
  ];

  const demoWaferReports = [
    { material_model: 'WAFER-001', material_category: '晶圆', vendor: 'FAB', report_type: 'ROHS', report_no: 'W2024001', report_date: '2024-03-01' },
    { material_model: 'WAFER-002', material_category: '晶圆', vendor: 'FAB', report_type: 'ROHS', report_no: 'W2024002', report_date: '2024-08-15' }
  ];

  const insertVendor = db.prepare('INSERT OR REPLACE INTO vendors (name, email, cc) VALUES (?, ?, ?)');
  const insertReport = db.prepare('INSERT OR REPLACE INTO reports (material_model, material_category, vendor, report_type, test_org, report_no, report_date, expiry_date, valid_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertWafer = db.prepare('INSERT OR REPLACE INTO wafer_reports (material_model, material_category, vendor, report_type, report_no, report_date, expiry_date, valid_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  const transaction = db.transaction(() => {
    for (const v of demoVendors) {
      insertVendor.run(v.name, v.email, v.cc);
    }
    for (const r of demoReports) {
      const expiryDate = calculateExpiryDate(r.report_date);
      const validDays = calculateValidDays(expiryDate);
      insertReport.run(r.material_model, r.material_category, r.vendor, r.report_type, r.test_org, r.report_no, r.report_date, expiryDate, validDays);
    }
    for (const r of demoWaferReports) {
      const expiryDate = calculateExpiryDate(r.report_date);
      const validDays = calculateValidDays(expiryDate);
      insertWafer.run(r.material_model, r.material_category, r.vendor, r.report_type, r.report_no, r.report_date, expiryDate, validDays);
    }
  });

  transaction();
  console.log('[Import] Demo data loaded successfully');
}

function importFromExcel(filePath) {
  try {
    const workbook = readExcel(filePath);
    const data = parseExcelToData(workbook);
    return importToDatabase(data);
  } catch (error) {
    console.error('[Import] Error:', error.message);
    return { success: false, error: error.message };
  }
}

function getReportsNeedingReminder() {
  const threshold = parseInt(process.env.REMINDER_DAYS_THRESHOLD) || 15;
  
  const reports = db.prepare(`
    SELECT * FROM reports 
    WHERE valid_days <= ? AND enabled = 1
  `).all(threshold);

  const waferReports = db.prepare(`
    SELECT * FROM wafer_reports 
    WHERE valid_days <= ? AND enabled = 1
  `).all(threshold);

  return { reports, waferReports };
}

module.exports = {
  importFromExcel,
  loadDemoData,
  getReportsNeedingReminder,
  calculateExpiryDate,
  calculateValidDays
};
