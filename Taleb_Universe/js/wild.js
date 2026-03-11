/* =========================================
   Wildness Instinct - 今日指南系统
   Version: 8.0 - 运动·饮食·睡眠三大板块
   Philosophy: 反脆弱 + 杠铃策略
   ========================================= */

/* ============================================================
   1. 核心配置：三大板块内容
   ============================================================ */

// 周计划数据（运动板块）
const WEEKLY_PLAN = [
  { // 周一 (索引 0)
    day: '周一',
    type: '漫步日',
    content: '漫步 1-2 小时',
    note: '模拟祖先平静采集日',
    icon: 'ri-footprint-line'
  },
  { // 周二
    day: '周二',
    type: '随身体感觉日',
    content: '心情决定一切',
    note: '不可预测，防止身体适应平庸',
    icon: 'ri-emotion-line'
  },
  { // 周三
    day: '周三',
    type: '高强度锻炼日',
    content: '漫步 1-2 小时 + 5-15 分钟高强度运动',
    note: '极端压力，让身体从尾部事件中变强',
    icon: 'ri-flashlight-fill'
  },
  { // 周四
    day: '周四',
    type: '漫步日',
    content: '漫步 1-2 小时',
    note: '强调恢复，让身体超补偿',
    icon: 'ri-footprint-line'
  },
  { // 周五
    day: '周五',
    type: '随身体感觉日',
    content: '心情决定一切',
    note: '不可预测，防止身体适应平庸',
    icon: 'ri-emotion-line'
  },
  { // 周六
    day: '周六',
    type: '漫步日',
    content: '漫步 1-2 小时',
    note: '周末放松',
    icon: 'ri-footprint-line'
  },
  { // 周日
    day: '周日',
    type: '漫步日',
    content: '漫步 1-2 小时',
    note: '周末放松',
    icon: 'ri-footprint-line'
  }
];

// 生命哲思语录库（每日轮换）
// 添加新语录：直接在数组中复制格式添加即可
const DAILY_QUOTES = [
  '生命需要间歇性剧烈压力，而非绝对稳定。追求恒定只会变脆弱。',
  '史前人类从无"每周三次、定时定量"的机械锻炼日程。',
  '若无精神追求，马拉松便是一种现代发明的、匀速的枯燥消耗。',
  '"规律运动"是现代迷信，它误以为稳定输入必有线性回报。',
  '规律的中等强度锻炼，因缺乏极致刺激与修复，往往效率最低。',
  '最佳策略是"两极结合"：极高强度冲击配以极长时间悠闲。',
  '实践上，大量悠闲漫步为基础，穿插几次短暂但拼尽全力的锻炼。',
  '最高法则是信任身体的自适应力，提供多变信号，而非粗暴管理。',
  '超补偿原理：身体的进化逻辑是"破坏 - 重建 - 更强"。缺乏剧烈压力，就失去了"破坏"与"更强"的起点。',
  '自律神经的智慧：真正的平衡，是在交感神经的全力出击与副交感神经的彻底修复之间，实现有节奏的切换。',
  '进化塑造了我们的"应激 - 恢复"循环系统。持续温和的压力会耗尽它，而间歇的极限挑战能使其更强大。',
  '身体的"反脆弱"性，根植于用一次高质量的深度恢复，来响应一次有意义的强烈应激。两者缺一不可。'
];

// 根据日期获取语录（每日固定，循环显示）
function getDailyQuote(date) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / (1000 * 60 * 60 * 24));
  const quoteIndex = dayOfYear % DAILY_QUOTES.length;
  return DAILY_QUOTES[quoteIndex];
}

// 根据日期获取饮食类型（每日固定，循环显示）
function getDietType(date) {
  const dayOfMonth = date.getDate();
  const cycle = dayOfMonth % 10;  // 10 天一个周期
  
  if (cycle < 4) return 'fasting';      // 40% 概率：4 天禁食
  if (cycle < 6) return 'feast';        // 20% 概率：2 天盛宴
  if (cycle < 9) return 'plant_based';  // 30% 概率：3 天植物为主
  return 'random';                      // 10% 概率：1 天随机
}

/* ============================================================
   2. 随机系统：今日不确定性
   ============================================================ */

// 获取今日计划（根据周几）
function getTodayPlan() {
  const today = new Date();
  const dayIndex = today.getDay(); // 0=周日，1=周一，..., 6=周六
  
  // 转换为数组索引（0=周一，6=周日）
  const arrayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
  
  return WEEKLY_PLAN[arrayIndex];
}

/* ============================================================
   4. UI 渲染系统
   ============================================================ */

// 渲染今日指南（运动板块）
function renderExerciseGuide() {
  const today = new Date();
  const todayPlan = getTodayPlan();
  const container = document.getElementById('exercise');
  
  if (!container) return;
  
  let html = `
    <h3>🏃 运动</h3>
    <div class="core-advice">
      <div class="advice-item">
        <i class="ri-footprint-line"></i>
        <div class="advice-text">
          <h4>每日漫步</h4>
          <p>每天漫步 1-2 小时，模拟原始人类的平静采集日</p>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <div class="advice-item">
        <i class="ri-book-open-line"></i>
        <div class="advice-text">
          <h4>生命哲思</h4>
          <p class="quote-text">"${getDailyQuote(today)}"</p>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <div class="advice-item today-plan">
        <i class="${todayPlan.icon}"></i>
        <div class="advice-text">
          <h4>今日建议（${todayPlan.day}）</h4>
          <p><strong>${todayPlan.type}</strong></p>
          <p>${todayPlan.content}</p>
          <p>${todayPlan.note}</p>
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

// 渲染饮食板块
function renderDietGuide() {
  const today = new Date();
  const container = document.getElementById('diet');
  
  if (!container) return;
  
  // 获取今日饮食类型（基于日期固定）
  const dietType = getDietType(today);
  
  let html = `
    <h3>🌱 饮食</h3>
    <div class="core-advice">
      
      <!-- 1. 饮食铁律 -->
      <div class="advice-item">
        <i class="ri-restaurant-line"></i>
        <div class="advice-text">
          <h4>饮食铁律</h4>
          <p><strong>不吃人类发明食物</strong> - 只吃天然、未加工的传统食物。</p>
          <p><strong>只喝千年饮品</strong> - 水、咖啡、茶。</p>
          <p><strong>去除毒素</strong> - 糖、超加工食品、种子油。</p>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <!-- 2. 今日建议 -->
      ${dietType === 'fasting' ? `
      <div class="advice-item">
        <i class="ri-time-line"></i>
        <div class="advice-text">
          <h4>禁食日</h4>
          <p>今天跳过早餐或只吃一顿。激活自噬，让身体清理垃圾。</p>
        </div>
      </div>
      ` : dietType === 'feast' ? `
      <div class="advice-item">
        <i class="ri-goblet-line"></i>
        <div class="advice-text">
          <h4>盛宴日</h4>
          <p>今天可以大吃肉/内脏/骨髓！模仿祖先狩猎成功的日子。</p>
        </div>
      </div>
      ` : dietType === 'plant_based' ? `
      <div class="advice-item">
        <i class="ri-leaf-line"></i>
        <div class="advice-text">
          <h4>植物为主日</h4>
          <p>今天以传统蔬菜、坚果、橄榄油为主。</p>
        </div>
      </div>
      ` : `
      <div class="advice-item">
        <i class="ri-dice-3-line"></i>
        <div class="advice-text">
          <h4>随机饮食日</h4>
          <p>今天随机选择：想吃肉就吃肉，想吃素就吃素。听从身体。</p>
        </div>
      </div>
      `}
      
      <div class="divider"></div>
      
      <!-- 3. 核心原则 -->
      <div class="advice-item">
        <i class="ri-brain-line"></i>
        <div class="advice-text">
          <h4>核心原则</h4>
          <p><strong>植物常规，肉不规律</strong> - 大部分日子以植物为主，偶尔大吃肉/内脏/骨髓。</p>
          <p><strong>无固定计划</strong> - 不数卡路里，不固定餐次。听身体信号，饿了就吃，饱了就停。</p>
        </div>
      </div>
      
    </div>
  `;
  
  container.innerHTML = html;
}

// 渲染睡眠板块
function renderSleepGuide() {
  const container = document.getElementById('sleep');
  
  if (!container) return;
  
  let html = `
    <h3>😴 睡眠</h3>
    <div class="core-advice">
      
      <!-- 一、反对僵化日程 -->
      <div class="advice-item">
        <div class="advice-text">
          <h4>一、反对僵化日程</h4>
          <p>舍弃固定作息和闹钟。身体自然醒就起床，困了再睡。拒绝将睡眠塞进时间表，由内在节律而非外部钟表主导。</p>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <!-- 二、无忧睡眠 -->
      <div class="advice-item">
        <div class="advice-text">
          <h4>二、无忧睡眠</h4>
          <p>睡眠目标是"无忧"的深度恢复，质量远重于时长。接纳白天小睡，核心是解除对睡眠时长的焦虑，专注恢复本身。</p>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <!-- 三、个人习惯示例 -->
      <div class="advice-item">
        <div class="advice-text">
          <h4>三、个人习惯示例</h4>
          <p>拥抱作息随机性，塔勒布本人曾晚 8 点睡、凌晨 4 点醒。不设固定程序，完全随状态、社交需求变化。</p>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <!-- 四、拥抱偶发剥夺 -->
      <div class="advice-item">
        <div class="advice-text">
          <h4>四、拥抱偶发剥夺</h4>
          <p>从进化角度看，人类的睡眠系统天生极具弹性，一次偶发的睡眠不足只是小扰动。只要<strong>白天不大量补睡</strong>，身体成功自我恢复后，未来的睡眠节律反而会变得更稳定、更抗干扰。能在波动中维持运转并借机变强的睡眠系统，才是符合自然规律的稳健设计</p>
        </div>
      </div>
      
    </div>
  `;
  
  container.innerHTML = html;
}

/* ============================================================
   5. 初始化
   ============================================================ */
function initWildPage() {
  console.log('Initializing Wildness Instinct...');
  renderExerciseGuide();
  renderDietGuide();
  renderSleepGuide();
  
  // 方案一：今日计划高亮强调动画（打开网页时强调 5 秒）
  highlightTodayPlan();
  
  console.log('Initialization complete.');
}

// 方案一：高亮强调今日计划
function highlightTodayPlan() {
  const todayPlanElement = document.querySelector('.today-plan');
  if (todayPlanElement) {
    // 延迟一点时间，等板块显示后再高亮
    setTimeout(() => {
      todayPlanElement.classList.add('highlight-active');
      
      // 5 秒后恢复正常
      setTimeout(() => {
        todayPlanElement.classList.remove('highlight-active');
      }, 5000);
    }, 1500);
  }
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', initWildPage);

// 调试：检查 DOM 是否加载完成
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  // 文档已经加载完成，手动初始化
  setTimeout(initWildPage, 100);
}
