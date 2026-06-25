/**
 * 数据服务模块
 * 处理数据获取
 */

/**
 * 获取数据的函数
 * 从本地data.json文件中获取网站配置数据
 * @async
 * @returns {Promise<Object>} 网站配置数据
 */
async function fetchData() {
  try {
    const response = await fetch('./data.json');
    if (!response.ok) throw new Error('网络响应异常');
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('加载数据失败:', error);
    throw error;
  }
}

export { fetchData };
