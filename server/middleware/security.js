import path from 'path';
import { MEDIA_FULL_PATH } from '../../serverConfig.js';

// SQL注入防护中间件
const sqlInjectionProtection = (req, res, next) => {
  // 检查请求体中的参数
  const checkForSQLInjection = (obj) => {
    if (!obj) return false;
    
    if (typeof obj === 'object') {
      for (const key in obj) {
        if (typeof obj[key] === 'string' && isSQLInjection(obj[key])) {
          return true;
        } else if (typeof obj[key] === 'object' && checkForSQLInjection(obj[key])) {
          return true;
        }
      }
    } else if (typeof obj === 'string' && isSQLInjection(obj)) {
      return true;
    }
    
    return false;
  };
  
  // 检测SQL注入模式
  const isSQLInjection = (str) => {
    // SQL注入检测正则表达式
    const sqlInjectionPattern = /('\s*(--|#|\\\*)|;\s*DROP\s+TABLE|;\s*DELETE\s+FROM|UNION\s+(ALL\s+)?SELECT|INSERT\s+INTO.+VALUES|SELECT.+FROM.+WHERE.+=)/i;
    return sqlInjectionPattern.test(str);
  };
  
  if (
    checkForSQLInjection(req.query) ||
    checkForSQLInjection(req.body) ||
    checkForSQLInjection(req.params)
  ) {
    console.log('检测到恶意请求', req.path);
    return res.status(403).json({ message: '检测到潜在的恶意请求' });
  }
  
  next();
};

// 内容安全策略中间件
const contentSecurityPolicy = (req, res, next) => {
  // 设置CSP头
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'self';"
  );
  next();
};

// CSRF保护中间件
const csrfProtection = (req, res, next) => {
  // 跳过GET、HEAD、OPTIONS请求
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // 检查Referer头
  const referer = req.headers.referer || req.headers.referrer;
  if (!referer) {
    console.log('missing referer', req.url);
    return res.status(403).json({ message: '缺少Referer头' });
  }
  
  // 检查Origin头
  const origin = req.headers.origin;
  const host = req.headers.host;
  
  // 验证Referer或Origin是否来自同一站点
  try {
    const refererUrl = new URL(referer);
    if (refererUrl.host !== host && (!origin || new URL(origin).host !== host)) {
      console.log('cross site request forbidden', refererUrl.host, host, origin);
      return res.status(403).json({ message: '跨站请求被拒绝' });
    }
  } catch (error) {
    console.error('Invalid referer:', referer);
    return res.status(403).json({ message: '无效的请求来源' });
  }
  
  next();
};

// 安全HTTP头中间件
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()');
  res.removeHeader('X-Powered-By');
  
  next();
};

// 文件路径验证中间件
const validateFilePath = (req, res, next) => {
  // 检查请求中的文件路径参数
  const checkPath = (obj) => {
    if (!obj) return;
    
    for (const key in obj) {
      if (typeof obj[key] === 'string' && (key.includes('path') || key.includes('file') || key.includes('dir'))) {
        const filePath = obj[key];
        
        // 防止路径遍历攻击
        if (filePath.includes('..') || filePath.includes('../')) {
          console.log('path traversal attack detected', filePath);
          return res.status(403).json({ message: '检测到非法的文件路径' });
        }
        
        // 规范化路径并检查是否在允许的目录内
        try {
          const normalizedPath = path.normalize(filePath);
          const fullPath = path.resolve(MEDIA_FULL_PATH, normalizedPath);
          
          // 确保路径在媒体目录内
          if (!fullPath.startsWith(MEDIA_FULL_PATH)) {
            console.log('file path out of range', filePath);
            return res.status(403).json({ message: '文件路径超出允许范围' });
          }
          
          // 替换为规范化的路径
          obj[key] = normalizedPath;
        } catch (error) {
          console.error('Invalid file path:', filePath);
          return res.status(400).json({ message: '无效的文件路径' });
        }
      } else if (typeof obj[key] === 'object') {
        checkPath(obj[key]);
      }
    }
  };
  
  // 检查请求参数中的路径
  checkPath(req.query);
  checkPath(req.body);
  checkPath(req.params);
  
  next();
};

export {
  sqlInjectionProtection,
  contentSecurityPolicy,
  csrfProtection,
  securityHeaders,
  validateFilePath
};