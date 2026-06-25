/**
 * 渲染模块
 * 处理DOM渲染功能
 */

/**
 * 渲染搜索区
 * 创建搜索引擎按钮、快捷链接和搜索表单
 * @param {Object} searchData - 搜索相关配置数据
 */
function renderSearch(searchData) {
  const searchContainer = document.getElementById('search-container');
  if (!searchContainer) return;

  const fragment = document.createDocumentFragment();

  // A. 创建搜索引擎按钮容器
  const searchEnginesDiv = document.createElement('div');
  searchEnginesDiv.className = 'search-engines';

  searchData.engines.forEach((engine, index) => {
    const engineBtn = document.createElement('button');
    engineBtn.className = `engine-btn ${index === 0 ? 'active' : ''}`;
    engineBtn.setAttribute('data-url', engine.url);
    engineBtn.setAttribute('data-name', engine.param);
    engineBtn.textContent = engine.name;
    searchEnginesDiv.appendChild(engineBtn);
  });

  const divider = document.createElement('div');
  divider.className = 'divider';
  searchEnginesDiv.appendChild(divider);

  searchData.quickLinks.forEach(link => {
    const linkElement = document.createElement('a');
    linkElement.href = link.url;
    linkElement.className = 'mini-icon';
    linkElement.target = '_blank';
    linkElement.title = link.title;

    const imgElement = document.createElement('img');
    imgElement.alt = link.title;
    imgElement.src = link.icon;

    linkElement.appendChild(imgElement);
    searchEnginesDiv.appendChild(linkElement);
  });

  fragment.appendChild(searchEnginesDiv);

  // B. 创建搜索表单
  const searchForm = document.createElement('form');
  searchForm.id = 'searchForm';
  searchForm.action = searchData.engines[0].url.split('?')[0];
  searchForm.method = 'get';
  searchForm.target = '_blank';

  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.name = searchData.engines[0].param;
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search...';
  searchInput.autocomplete = 'off';

  const searchBtn = document.createElement('button');
  searchBtn.type = 'submit';
  searchBtn.className = 'search-btn';
  searchBtn.innerHTML = '<i class="ri-search-2-line"></i>';

  searchBox.appendChild(searchInput);
  searchBox.appendChild(searchBtn);
  searchForm.appendChild(searchBox);
  fragment.appendChild(searchForm);

  searchContainer.innerHTML = '';
  searchContainer.appendChild(fragment);
}

/**
 * 渲染导航栏和主内容区
 * @param {Array} categories - 分类数据数组
 */
function renderNavAndContent(categories) {
  const navTabsContainer = document.getElementById('navTabs');
  const mainContentContainer = document.getElementById('main-content-area');
  
  if (!navTabsContainer || !mainContentContainer) return;

  const navFragment = document.createDocumentFragment();
  const contentFragment = document.createDocumentFragment();

  categories.forEach((cat, index) => {
    const tabBtn = document.createElement('button');
    tabBtn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
    tabBtn.setAttribute('data-target', cat.id);
    tabBtn.innerHTML = `<i class="${cat.icon}"></i> ${cat.navTitle}`;
    navFragment.appendChild(tabBtn);

    const section = document.createElement('div');
    section.id = cat.id;
    section.className = `category-section ${index === 0 ? 'active' : ''}`;

    if (cat.sections) {
      cat.sections.forEach(sectionData => {
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'section-group-title';
        sectionTitle.textContent = sectionData.name;
        section.appendChild(sectionTitle);

        const grid = document.createElement('div');
        grid.className = 'grid';

        const cardsFragment = document.createDocumentFragment();
        sectionData.items.forEach(item => {
          const cardHtml = renderCards([item]);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = cardHtml.trim();
          cardsFragment.appendChild(tempDiv.firstElementChild);
        });
        grid.appendChild(cardsFragment);
        section.appendChild(grid);
      });
    } else {
      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'section-header';
      sectionHeader.innerHTML = `
        <i class="${cat.icon}" style="font-size: 1.8rem; color: ${cat.titleColor};"></i>
        <div class="section-title">${cat.sectionTitle}</div>
      `;
      section.appendChild(sectionHeader);

      const grid = document.createElement('div');
      grid.className = 'grid';

      const cardsFragment = document.createDocumentFragment();
      cat.items.forEach(item => {
        const cardHtml = renderCards([item]);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml.trim();
        cardsFragment.appendChild(tempDiv.firstElementChild);
      });
      grid.appendChild(cardsFragment);
      section.appendChild(grid);
    }

    contentFragment.appendChild(section);
  });

  navTabsContainer.innerHTML = '';
  navTabsContainer.appendChild(navFragment);
  
  mainContentContainer.innerHTML = '';
  mainContentContainer.appendChild(contentFragment);
}

/**
 * 生成卡片 HTML
 * @param {Array} items - 项目数据数组
 * @returns {string} 卡片HTML字符串
 */
function renderCards(items) {
  return items.map(item => {
    let iconHtml = '';
    if (item.icon) {
      iconHtml = `<img src="${item.icon}" alt="${item.title}" onerror="this.style.display='none'">`;
    } else if (item.iconSymbol) {
      iconHtml = `<i class="${item.iconSymbol}" style="font-size: 36px; color: ${item.iconColor}; background: ${item.iconBg || 'transparent'}; border-radius: 8px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;"></i>`;
    }

    return `
      <a href="${item.url}" class="card" target="_blank">
        ${iconHtml}
        <div class="card-info"><h3>${item.title}</h3></div>
      </a>
    `;
  }).join('');
}

export { renderSearch, renderNavAndContent, renderCards };
