/**
 * 事件处理模块
 * 处理用户交互事件
 */

/**
 * 保存用户偏好到本地存储
 * @param {string} key - 偏好键名
 * @param {*} value - 偏好值
 */
function savePreference(key, value) {
  try {
    localStorage.setItem(`userPreference_${key}`, JSON.stringify(value));
  } catch (error) {
    console.error('保存偏好设置失败:', error);
  }
}

/**
 * 从本地存储获取用户偏好
 * @param {string} key - 偏好键名
 * @param {*} defaultValue - 默认值
 * @returns {*} 偏好值或默认值
 */
function getSavedPreference(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(`userPreference_${key}`);
    return value ? JSON.parse(value) : defaultValue;
  } catch (error) {
    console.error('读取偏好设置失败:', error);
    return defaultValue;
  }
}

/**
 * 清除所有用户偏好
 */
function clearAllPreferences() {
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('userPreference_')) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('清除偏好设置失败:', error);
  }
}

/**
 * 绑定搜索切换事件
 * 为搜索引擎按钮添加点击事件，切换搜索引擎
 * @param {Object} searchData - 搜索相关配置数据
 */
function bindSearchEvents(searchData) {
  const engineBtns = document.querySelectorAll('.engine-btn');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.querySelector('.search-input');

  // 从本地存储加载默认搜索引擎
  const savedEngine = getSavedPreference('defaultEngine');
  if (savedEngine) {
    const savedBtn = Array.from(engineBtns).find(btn => btn.getAttribute('data-name') === savedEngine);
    if (savedBtn) {
      engineBtns.forEach(b => b.classList.remove('active'));
      savedBtn.classList.add('active');
      const url = savedBtn.getAttribute('data-url');
      const paramName = savedBtn.getAttribute('data-name');
      searchForm.action = url.split('?')[0];
      searchInput.name = paramName;
    }
  }

  engineBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // 样式切换
      engineBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 功能切换
      const url = btn.getAttribute('data-url');
      const paramName = btn.getAttribute('data-name');
      
      searchForm.action = url.split('?')[0];
      searchInput.name = paramName;

      // 保存到本地存储
      savePreference('defaultEngine', paramName);
    });
  });

  // 初始化搜索历史
  initSearchHistory(searchInput, searchForm);
}

/**
 * 初始化搜索历史
 * @param {HTMLInputElement} searchInput - 搜索输入框
 * @param {HTMLFormElement} searchForm - 搜索表单
 */
let searchHistoryListenerAdded = false;

function initSearchHistory(searchInput, searchForm) {
  // 创建历史记录容器
  const historyContainer = document.createElement('div');
  historyContainer.className = 'search-history';
  historyContainer.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 0 0 10px 10px;
    box-shadow: var(--shadow);
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
    display: none;
  `;
  
  // 插入到搜索框下方
  const searchBox = searchInput.parentElement;
  searchBox.style.position = 'relative';
  searchBox.appendChild(historyContainer);
  
  // 显示历史记录
  searchInput.addEventListener('focus', () => {
    showSearchHistory(historyContainer, searchInput);
  });
  
  // 点击其他地方隐藏历史记录 - 只添加一次监听器
  if (!searchHistoryListenerAdded) {
    document.addEventListener('click', (e) => {
      if (!searchBox.contains(e.target)) {
        historyContainer.style.display = 'none';
      }
    });
    searchHistoryListenerAdded = true;
  }
  
  // 提交搜索时保存历史记录
  searchForm.addEventListener('submit', (e) => {
    const query = searchInput.value.trim();
    if (query) {
      saveSearchHistory(query);
    }
  });
}

/**
 * 显示搜索历史
 * @param {HTMLElement} container - 历史记录容器
 * @param {HTMLInputElement} searchInput - 搜索输入框
 */
function showSearchHistory(container, searchInput) {
  const history = getSearchHistory();
  if (history.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  // 生成历史记录 HTML
  let html = '<div style="padding: 10px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">';
  html += '<span style="font-weight: 500; color: var(--text-sub);">搜索历史</span>';
  html += '<button id="clear-history" style="background: none; border: none; color: var(--text-sub); cursor: pointer; font-size: 0.8rem;">清除</button>';
  html += '</div>';
  
  history.forEach((item, index) => {
    html += `<div class="history-item" data-index="${index}" style="padding: 10px; cursor: pointer; transition: background 0.2s;">`;
    html += `<i class="ri-history-line" style="margin-right: 10px; color: var(--text-sub);"></i>`;
    html += `<span>${item}</span>`;
    html += '</div>';
  });
  
  container.innerHTML = html;
  container.style.display = 'block';
  
  // 添加历史记录项点击事件
  container.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = item.getAttribute('data-index');
      searchInput.value = history[index];
      container.style.display = 'none';
    });
  });
  
  // 添加清除历史记录事件
  document.getElementById('clear-history').addEventListener('click', () => {
    clearSearchHistory();
    container.style.display = 'none';
  });
  
  // 添加鼠标悬停效果
  container.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      item.style.background = 'rgba(0, 0, 0, 0.05)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = 'transparent';
    });
  });
}

/**
 * 保存搜索历史
 * @param {string} query - 搜索关键词
 */
function saveSearchHistory(query) {
  const history = getSearchHistory();
  
  // 移除重复项
  const filteredHistory = history.filter(item => item !== query);
  
  // 添加到开头
  filteredHistory.unshift(query);
  
  // 限制历史记录数量
  const limitedHistory = filteredHistory.slice(0, 10);
  
  // 保存到本地存储
  savePreference('searchHistory', limitedHistory);
}

/**
 * 获取搜索历史
 * @returns {Array} 搜索历史数组
 */
function getSearchHistory() {
  return getSavedPreference('searchHistory', []);
}

/**
 * 清除搜索历史
 */
function clearSearchHistory() {
  savePreference('searchHistory', []);
}

/**
 * 绑定 Tab 切换事件
 * 为导航标签页添加点击事件，切换内容板块
 */
function bindTabEvents() {
  const tabs = document.querySelectorAll('.tab-btn');
  const sections = document.querySelectorAll('.category-section');

  // 从本地存储加载上次选择的标签页
  const savedTab = getSavedPreference('activeTab');
  if (savedTab) {
    const savedTabElement = Array.from(tabs).find(tab => tab.getAttribute('data-target') === savedTab);
    if (savedTabElement) {
      // 激活保存的标签页
      tabs.forEach(t => t.classList.remove('active'));
      savedTabElement.classList.add('active');
      
      // 显示对应的内容
      sections.forEach(section => {
        section.classList.remove('active');
      });
      const targetSection = document.getElementById(savedTab);
      if (targetSection) targetSection.classList.add('active');
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // 按钮样式切换
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 内容显示切换
      const targetId = tab.getAttribute('data-target');
      sections.forEach(section => {
        section.classList.remove('active');
      });
      const targetSection = document.getElementById(targetId);
      if (targetSection) targetSection.classList.add('active');

      // 保存到本地存储
      savePreference('activeTab', targetId);
    });
  });
}

export { bindSearchEvents, bindTabEvents, savePreference, getSavedPreference, clearAllPreferences };