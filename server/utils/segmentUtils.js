import nodejieba from 'nodejieba';

// 初始化分词器
nodejieba.load();

/**
 * 对文本进行分词
 * @param {string} text 需要分词的文本
 * @return {string[]} 分词结果数组
 */
export const segmentText = (text) => {
  if (!text || typeof text !== 'string') return [];
  return nodejieba.cut(text);
};

/**
 * 生成分词后的 SQL 查询条件
 * @param {string} text 搜索文本
 * @param {string} fieldName 要搜索的字段名
 * @return {object} 包含 whereClause 和 params 的对象
 */
export const generateSegmentedWhereClause = (text, fieldName, logic = 'AND') => {
  if (!text || typeof text !== 'string') {
    return { whereClause: '', params: [] };
  }
  
  // 对搜索文本进行分词
  const segments = segmentText(text);
  
  if (segments.length === 0) {
    // 如果分词结果为空，回退到原始的模糊匹配
    return { 
      whereClause: `${fieldName} LIKE ?`, 
      params: [`%${text}%`] 
    };
  }
  
  // 构建 OR 连接的查询条件
  const conditions = segments.map(() => `${fieldName} LIKE ?`);
  const whereClause = `(${conditions.join(` ${logic} `)})`;
  
  // 构建参数数组
  const params = segments.map(segment => `%${segment}%`);
  
  return { whereClause, params };
};

/**
 * 根据分词结果对搜索结果进行排序（相关性排序）
 * @param {Array} results 搜索结果数组
 * @param {string} searchText 原始搜索文本
 * @param {string} textField 用于匹配的字段名
 * @return {Array} 排序后的结果
 */
export const rankResultsByRelevance = (results, searchText, textField) => {
  if (!results || !results.length || !searchText) return results;
  
  const segments = segmentText(searchText);
  if (!segments.length) return results;
  
  return results.sort((a, b) => {
    const textA = a[textField] || '';
    const textB = b[textField] || '';
    
    // 计算匹配的分词数量
    const matchCountA = segments.filter(segment => textA.includes(segment)).length;
    const matchCountB = segments.filter(segment => textB.includes(segment)).length;
    
    // 优先按匹配的分词数量排序
    if (matchCountA !== matchCountB) {
      return matchCountB - matchCountA;
    }
    
    // 如果匹配数量相同，则按字段长度排序（较短的更相关）
    return textA.length - textB.length;
  });
};