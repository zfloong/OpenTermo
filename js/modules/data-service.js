/**
 * 数据服务模块
 * 处理数据获取和图标缓存
 */

/**
 * 获取数据的函数
 * 从本地data.json文件中获取网站配置数据
 * @async
 * @returns {Promise<Object>} 网站配置数据
 */
async function fetchData() {
  try {
    // 请求同目录下的 data.json 文件
    const response = await fetch('./data.json');
    if (!response.ok) throw new Error('网络响应异常');
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('加载数据失败:', error);
    throw error;
  }
}

/**
 * 从缓存获取图标
 * 检查图标是否在本地存储中，且未过期
 * @param {string} url - 图标URL
 * @returns {string|null} 缓存的图标数据或null
 */
function getCachedIcon(url) {
  try {
    const cache = localStorage.getItem('iconCache');
    if (cache) {
      const iconCache = JSON.parse(cache);
      const cachedItem = iconCache[url];
      // 检查缓存是否过期（7天）
      if (cachedItem && (Date.now() - cachedItem.timestamp) < 7 * 24 * 60 * 60 * 1000) {
        return cachedItem.data;
      }
    }
  } catch (error) {
    console.error('读取图标缓存失败:', error);
  }
  return null;
}

/**
 * 缓存图标
 * 下载图标并转换为base64存储到本地
 * @async
 * @param {string} url - 图标URL
 * @returns {Promise<string>} 缓存的图标数据或原始URL
 */
async function cacheIcon(url) {
  try {
    // 先检查是否已经在缓存中
    if (getCachedIcon(url)) {
      return getCachedIcon(url);
    }

    // 下载图标
    const response = await fetch(url);
    if (!response.ok) throw new Error('图标下载失败');
    
    // 转换为base64
    const blob = await response.blob();
    const reader = new FileReader();
    
    return new Promise((resolve, reject) => {
      reader.onloadend = () => {
        const base64data = reader.result;
        
        // 保存到缓存
        try {
          const cache = localStorage.getItem('iconCache') || '{}';
          const iconCache = JSON.parse(cache);
          iconCache[url] = {
            data: base64data,
            timestamp: Date.now()
          };
          localStorage.setItem('iconCache', JSON.stringify(iconCache));
          resolve(base64data);
        } catch (error) {
          console.error('保存图标缓存失败:', error);
          resolve(url); // 失败时使用原始URL
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('缓存图标失败:', error);
    return url; // 失败时使用原始URL
  }
}

export { fetchData, getCachedIcon, cacheIcon };