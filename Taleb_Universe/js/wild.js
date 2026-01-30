/* =========================================
   Wildness Awakening - Logic Engine v4.0
   Pure Chinese & Optimized Spacing
   ========================================= */

/* =========================================
   Wildness Awakening - Logic Engine v4.1
   Optimized Sequence & Titles
   ========================================= */

const weekData = [
    { 
        day: '周一', 
        title: '高强度 · 力量日', // 【已修正】标题匹配下方的高强度内容
        subtitle: 'Heavy Lifts',
        icon: 'ri-hammer-line', 
        // 内容源自原来的周二，移到这里匹配“高强度”
        diet_allowed: ['优质蛋白', '肉类/动物内脏', '高质量碳水 (训练后)'],
        diet_avoid: ['低脂饮食', '超加工食品（重油重盐）'],
        movement: ['8个小时+', '波比跳/俯卧撑', '爆发力训练'],
        remark: '“只有极度的压力才能引发身体的进化”。进行大重量训练，刺激骨密度和激素水平。', 
        img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop' 
    },
    { 
        day: '周二', 
        title: '低强度 · 恢复日', // 【已修正】标题匹配下方的恢复内容
        subtitle: 'Recovery & Walk',
        icon: 'ri-footprint-line',
        // 内容源自原来的周一，移到这里匹配“恢复”
        diet_allowed: ['跳过早餐 (间歇性禁食)', '地中海式正餐', '橄榄油/红酒'],
        diet_avoid: ['糖', '零食 (Snacking)', '种子油'],
        movement: ['低难度有氧*2', '慢走40分钟'],
        remark: '高强度后的主动恢复。模仿祖先在狩猎间隙的低能耗巡视。让身体燃烧脂肪储备。', 
        img: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?q=80&w=1468&auto=format&fit=crop' 
    },
    { 
        day: '周三', 
        title: '低强度 · 斋戒日',
        subtitle: 'Orthodox Fast',
        icon: 'ri-leaf-line',
        diet_allowed: ['素食 (Vegan)、谷物', '仅晚餐进食 (Warrior Diet)', '茶/黑咖啡'],
        diet_avoid: ['所有动物制品 (肉/奶/蛋)', '油腻食物'],
        movement: ['低难度有氧*2', '平板支撑/伸展'],
        remark: '遵循希腊东正教传统。人为制造蛋白质匮乏，激活自噬，清理体内垃圾。', 
        img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=1470&auto=format&fit=crop' 
    },
    { 
        day: '周四', 
        title: '匮乏 · 斋戒日', // 【优化】强调“匮乏” (Scarcity)
        subtitle: 'Deep Fast',
        icon: 'ri-contrast-drop-2-line',
        diet_allowed: ['水', '仅晚餐进食', '素食晚餐'],
        diet_avoid: ['零食', '娱乐性饮料'],
        movement: ['空腹运动', '冥想'],
        remark: '这是一周中最艰难的“随机压力”。通过饥饿让感官变得敏锐，食物在晚上会尝起来像上帝的恩赐。', 
        img: 'https://images.unsplash.com/photo-1605160759367-2708b5329977?q=80&w=1470&auto=format&fit=crop' 
    },
    { 
        day: '周五', 
        title: '稳态 · 巡猎日', // 【优化】改为“稳态” (Steady State) 更精准
        subtitle: 'Steady State',
        icon: 'ri-compass-3-line',
        diet_allowed: ['鱼类/海鲜', '大量蔬菜', '奶酪 (Cheese)'],
        diet_avoid: ['糖分', '过度精制的面食'],
        movement: ['长时间徒步 (Hiking)', '携带重物行走 (Rucking)'],
        remark: '保持高活动量。塔勒布认为每天应燃烧 3000+ 卡路里。只要运动量够，不需要刻意限制热量。', 
        img: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?q=80&w=1470&auto=format&fit=crop' 
    },
    { 
        day: '周六', 
        title: '稳态 · 巡猎日 · 盛宴', // 【优化】强调“盛宴” (Feast)
        subtitle: 'The Feast',
        icon: 'ri-goblet-line',
        diet_allowed: ['你想吃的一切', '超加工食品', '零食'],
        diet_avoid: ['独自进食', '罪恶感'],
        movement: ['社交活动', '跳舞', '低难度有氧*2 + 随意运动'],
        remark: '“只有当你能享受盛宴时，斋戒才有意义”。打破适应性，享受林迪效应筛选出的美食。', 
        img: 'https://images.unsplash.com/photo-1529562726359-291583d726b0?q=80&w=1470&auto=format&fit=crop' 
    },
    { 
        day: '周日', 
        title: '稳态 · 巡猎日', // 【优化】强调“合成” (Anabolic)
        subtitle: 'Meat & Rest',
        icon: 'ri-restaurant-2-line',
        diet_allowed: ['周日烤肉 (Sunday Roast)', '脂肪', '骨髓'],
        diet_avoid: ['压力', '工作'],
        movement: ['完全休息', '或者为了乐趣而运动'],
        remark: '彻底的合成代谢。补充周三周五亏空的蛋白质。身体在休息时变强，而不是在训练时。', 
        img: 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1469&auto=format&fit=crop' 
    }
];

function initWildPage() {
    const heroContainer = document.getElementById('hero-container');
    const timelineContainer = document.getElementById('timeline-container');
    const heroTemplate = document.getElementById('hero-template').content;
    
    // 1. 找到今天 (0=周日, 转为索引6)
    const date = new Date();
    const dayIndex = date.getDay(); 
    const todayDataIndex = dayIndex === 0 ? 6 : dayIndex - 1;
    
    const todayItem = weekData[todayDataIndex];
    const otherDays = weekData.filter((_, idx) => idx !== todayDataIndex);

    // 2. 渲染 HERO (今天)
    const heroClone = heroTemplate.cloneNode(true);
    
    heroClone.querySelector('.day-name').textContent = todayItem.day;
    heroClone.querySelector('.card-title').textContent = todayItem.title;
    heroClone.querySelector('.card-subtitle').textContent = todayItem.subtitle;
    heroClone.querySelector('.remark').textContent = todayItem.remark;
    heroClone.querySelector('.card-image').style.backgroundImage = `url('${todayItem.img}')`;
    
    fillList(heroClone.querySelector('.list-diet-allow'), todayItem.diet_allowed);
    fillList(heroClone.querySelector('.list-diet-avoid'), todayItem.diet_avoid);
    fillList(heroClone.querySelector('.list-movement'), todayItem.movement);
    
    heroContainer.appendChild(heroClone);

    // 3. 渲染 TIMELINE (其他日子)
    otherDays.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'timeline-item';
        itemDiv.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-content">
                <div>
                    <span class="t-day">${item.day}</span>
                    <span class="t-title">${item.title}</span>
                </div>
            </div>
        `;
        timelineContainer.appendChild(itemDiv);
    });
}

function fillList(ul, items) {
    items.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        ul.appendChild(li);
    });
}


document.addEventListener('DOMContentLoaded', initWildPage);
