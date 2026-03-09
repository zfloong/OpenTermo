/**
 * 主导航管理文件
 * 整合各个模块，初始化应用
 */

import { fetchData } from './modules/data-service.js';
import { renderSearch, renderNavAndContent } from './modules/renderer.js';
import { bindSearchEvents, bindTabEvents } from './modules/event-handler.js';
import { showLoading, hideLoading, showError, initNetworkListeners } from './modules/error-handler.js';

/**
 * 加载数据并初始化页面
 */
async function loadDataAndInit() {
  try {
    // 显示加载状态
    showLoading();
    
    // 获取数据
    const data = await fetchData();
    
    // 初始化页面
    initPage(data);
    
    // 隐藏加载状态
    hideLoading();
  } catch (error) {
    console.error('加载数据失败:', error);
    // 显示错误提示
    showError('数据加载失败，请检查网络连接后重试');
  }
}

/**
 * 初始化页面的总指挥
 * 调用各个渲染函数和事件绑定函数
 * @param {Object} data - 网站配置数据
 */
function initPage(data) {
  renderSearch(data.search);
  renderNavAndContent(data.categories);
  
  // 渲染完 HTML 后，再绑定点击事件
  bindSearchEvents(data.search);
  bindTabEvents();
}

/**
 * 页面加载完成后执行的初始化函数
 */
document.addEventListener('DOMContentLoaded', () => {
  // 初始化网络状态监听
  initNetworkListeners();
  
  // 加载数据并初始化页面
  loadDataAndInit();
  
  // 监听重试事件
  window.addEventListener('retryFetchData', loadDataAndInit);
});