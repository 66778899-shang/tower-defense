// 冒烟测试：stub 掉 DOM/Canvas，在 node 里真实跑游戏逻辑
// 固定随机数种子：让“笨 AI”战报可复现，否则难度对比会被随机波动掩盖
let __seed = 1;
function seed(n){ __seed = n >>> 0; }
Math.random = function(){
  __seed = (__seed + 0x6D2B79F5) | 0;
  let t = __seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 用法: node _smoke.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const noop = () => {};
const ctxProxy = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas') return { width: 800, height: 560 };
    if (p === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set() { return true; }
});
const mkEl = () => ({
  textContent: '', innerHTML: '', value: '', dataset: {}, onclick: null,
  style: new Proxy({}, { get: () => '', set: () => true }),
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  appendChild: noop, addEventListener: noop, select: noop, focus: noop,
  getContext: () => ctxProxy,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 560 }),
  querySelectorAll: () => []
});
const elCache = {};   // 与真实浏览器一致：同一个 id 返回同一个元素
global.document = {
  getElementById: id => (elCache[id] || (elCache[id] = mkEl())),
  createElement: mkEl,
  querySelectorAll: () => [], addEventListener: noop
};
function AC() {
  this.currentTime = 0; this.destination = {};
  this.createOscillator = () => ({ type: '', frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop, start: noop, stop: noop });
  this.createGain = () => ({ gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop });
}
global.window = { devicePixelRatio: 1, addEventListener: noop, AudioContext: AC };
global.requestAnimationFrame = noop;

const test = `
/* ================= SMOKE TEST ================= */
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) fail++; };

// 1. 关卡与路径
console.log('[关卡] 共 ' + LEVELS.length + ' 关');
ok(LEVELS.length >= 5, '至少 5 个关卡');
ok(LEVELS[LEVELS.length-1].waves === 0, '最后一关是无尽模式');

for (let li=0; li<LEVELS.length; li++){
  const L = LEVELS[li];
  // 两条路必须汇入同一基地
  const a = L.paths[0][L.paths[0].length-1], b = L.paths[1][L.paths[1].length-1];
  ok(a[0]===b[0] && a[1]===b[1], '关卡' + L.id + ' 两条路汇入同一基地');
  // 展开后逐格检查
  let axial = true, inside = true;
  for (const wps of L.paths){
    const raw = [];
    for (let i=0;i<wps.length-1;i++){
      let x1=wps[i][0], y1=wps[i][1], x2=wps[i+1][0], y2=wps[i+1][1];
      const dx=Math.sign(x2-x1), dy=Math.sign(y2-y1);
      let x=x1, y=y1; raw.push([x,y]);
      while(x!==x2||y!==y2){ x+=dx; y+=dy; raw.push([x,y]); }
    }
    const cells = raw.filter((cc,i)=> i===0 || cc[0]!==raw[i-1][0] || cc[1]!==raw[i-1][1]);
    for (let i=1;i<cells.length;i++){
      if (Math.abs(cells[i][0]-cells[i-1][0]) + Math.abs(cells[i][1]-cells[i-1][1]) !== 1) axial = false;
    }
    for (const cc of cells) if (!inBounds(cc[0], cc[1])) inside = false;
  }
  ok(axial && inside, '关卡' + L.id + ' ' + L.name + ' 路径逐格连续且在图内');
}

// 切到关卡2 做后续常规校验
reset(1);
ok(S.level.id === LEVELS[1].id, '切换关卡生效 (' + S.level.name + ')');
ok(paths.length === 2, '当前关卡有两条路径');
ok(basePos && Math.abs(basePos.x - paths[0].pts[paths[0].pts.length-1].x) < 1, 'basePos 与路径终点一致');
ok(Math.hypot(paths[0].pts[0].x-paths[1].pts[0].x, paths[0].pts[0].y-paths[1].pts[0].y) > 100, '两个入口彼此分离');

// 敌人分流：两条路轮流来
reset(1); S.wave = 1;
const pids = [];
for (let i=0;i<6;i++){ spawnEnemy('grunt'); pids.push(S.enemies[S.enemies.length-1].pathId); }
ok(pids.join(',') === '0,1,0,1,0,1', '敌人轮流分配到两条路 (' + pids.join(',') + ')');
ok(S.enemies.every(e => e.path && e.path.pts.length > 1), '每个敌人都绑定了有效路径');
ok(paths.every(p => p.flyLen > 0), '每条路径都有飞行直线距离');// 2. 波次组成
const kinds = n => waveComposition(n).map(x=>x.kind);
const w1 = kinds(1), w5 = kinds(5), w10 = kinds(10), w20 = kinds(20);
console.log('[波次] W1=' + w1.length + ' W5=' + w5.length + ' W10=' + w10.length + ' W20=' + w20.length);
ok(w1.length > 0 && w20.length > w10.length && w10.length > w1.length, '波次规模递增');
ok(w1.every(x=>x==='grunt'), '第1波只有小兵');
ok(w5.indexOf('tank') >= 0, '第5波出现重甲');
ok(w20.indexOf('flyer') >= 0, '后期出现飞行兵');

// 3. 数值：塔升级曲线
const fake = { def: TOWERS.arrow, level: 1 };
const lv1 = towerStats(fake);
fake.level = 4;
const lv4 = towerStats(fake);
console.log('[数值] 箭塔 Lv1 DPS=' + lv1.dps.toFixed(1) + ' -> Lv4 DPS=' + lv4.dps.toFixed(1));
ok(lv4.dps > lv1.dps * 2, '满级显著提升');
ok(upgradeCost({def:TOWERS.arrow, level:1}) < TOWERS.arrow.cost * 2, '升级成本合理');
ok(sellValue({def:TOWERS.arrow, level:1}) === Math.floor(TOWERS.arrow.cost*0.6), '出售返还 60%');

// 4. 护甲减伤
const e = { hp:100, maxHp:100, armor:5, def:ENEMIES.grunt, x:0, y:0 };
damage(e, 13, '#000');
ok(e.hp === 92, '护甲生效: 13-5=8, 剩 92 (实际 ' + e.hp + ')');

// ================= 模拟对局 =================
S.sound = false;

function distToPath(p, c, r){
  const x = c*CELL+CELL/2, y = r*CELL+CELL/2;
  let best = 1e9;
  for (let i=0;i<p.pts.length-1;i++){
    const a = p.pts[i], b = p.pts[i+1];
    const dx = b.x-a.x, dy = b.y-a.y, len2 = dx*dx + dy*dy;
    const k = len2 ? Math.max(0, Math.min(1, ((x-a.x)*dx + (y-a.y)*dy)/len2)) : 0;
    best = Math.min(best, Math.hypot(x-(a.x+k*dx), y-(a.y+k*dy)));
  }
  return best;
}
// 按到每条路径中心线的距离分组，AI 才能公平地分散布防
function buildSpotGroups(){
  return paths.map(p=>{
    const arr = [];
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
      if (grid[r][c] !== 0) continue;
      const d = distToPath(p, c, r);
      if (d <= 80) arr.push({c, r, d});
    }
    arr.sort((a,b)=>a.d-b.d);
    return arr;
  });
}
// 与关卡无关：当前地图上所有可建塔的空格
function freeCells(){
  const arr = [];
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++)
    if (!isRoad(c,r) && !towerAt(c,r)) arr.push({c:c, r:r});
  return arr;
}

// 用"笨 AI"完整模拟一关，返回战报
function simulateLevel(li, maxWave, seedExtra){
  seed(0x9E37 + li * 7919 + (seedExtra || 0));   // 每关固定种子
  reset(li);
  S.level = Object.assign({}, S.level, { waves: 0 });   // 临时改无尽，避免提前通关
  buildMap();
  const groups = buildSpotGroups();
  const order = ['arrow','arrow','frost','cannon','arrow','laser','frost','cannon','laser','arrow'];
  let built = 0;
  const startHp = S.hp;

  function tryBuild(){
    for (let k=0;k<2;k++){
      const g = groups[(built + k) % 2];
      for (const sp of g) {
        if (towerAt(sp.c, sp.r)) continue;
        const type = order[built % order.length];
        if (S.gold >= TOWERS[type].cost) { placeTower(sp.c, sp.r, type); built++; return true; }
        return false;
      }
    }
    const ts = S.towers.find(t => t.level >= MAX_LEVEL && !t.branch && S.gold >= specCost(t));
    if (ts) { specialize(ts, built % 2 ? 'b' : 'a'); return true; }
    const tu = S.towers.find(t => t.level < MAX_LEVEL && S.gold >= upgradeCost(t));
    if (tu) { upgradeTower(tu); return true; }
    return false;
  }

  const dt = 1/60;
  let simTime = 0;
  const hist = [];
  while (S.wave < maxWave && S.status === 'playing' && simTime < 5000){
    if (!S.waveRunning && S.enemies.length === 0) startWave();
    const was = S.waveRunning;
    update(dt);
    if (was && !S.waveRunning) hist.push({wave:S.wave, hp:S.hp, gold:S.gold, towers:S.towers.length, kills:S.kills});
    simTime += dt;
    if (Math.round(simTime*60) % 45 === 0) tryBuild();
  }
  return { wave:S.wave, hp:S.hp, startHp:startHp, status:S.status, hist:hist,
           towers:S.towers.length, kills:S.kills, time:simTime };
}

reset(1);
const spotGroups = buildSpotGroups();
const spots = spotGroups.flat();
console.log('[AI] 建塔点 路1=' + spotGroups[0].length + ' 路2=' + spotGroups[1].length);
ok(spotGroups.every(g => g.length >= 20), '两条路各有充足建塔点');

const r2 = simulateLevel(1, 20);
console.log('[对局] 关卡2 模拟: 波次=' + r2.wave + ' 生命=' + r2.hp + '/' + r2.startHp +
            ' 击杀=' + r2.kills + ' 塔=' + r2.towers + ' 时长=' + Math.round(r2.time) + 's');
console.log('  波次记录(前12):');
r2.hist.slice(0,12).forEach(h => console.log('    W' + String(h.wave).padStart(2) +
  '  剩余生命 ' + String(h.hp).padStart(2) + '  金币 ' + String(h.gold).padStart(4) +
  '  塔 ' + String(h.towers).padStart(2) + '  累计击杀 ' + h.kills));
ok(r2.kills > 50, '产生了实际战斗与击杀 (' + r2.kills + ')');
ok(r2.towers > 5, 'AI 成功建造了塔 (' + r2.towers + ')');
ok(r2.wave >= 5, '至少推进到第5波 (实际 ' + r2.wave + ')');
ok(r2.hist.length > 3, '波次能正常结算 (' + r2.hist.length + ' 波完成)');

// 各关难度曲线
console.log('\\n[难度] 各关 AI 战报（跑满 15 波或阵亡）');
const reports = [0,1,2,3,4].map(li => simulateLevel(li, 15));
reports.forEach((r, i)=>{
  const L = LEVELS[i];
  console.log('    关卡' + L.id + ' ' + L.name + '  到达 W' + r.wave +
              '  剩余生命 ' + r.hp + '/' + r.startHp + '  塔 ' + r.towers + '  击杀 ' + r.kills);
});
ok(reports[0].wave >= 15, '关卡1 笨 AI 能撑满 15 波');
ok(reports[0].hp > reports[3].hp, '关卡4 比关卡1 明显更难 (剩血 ' + reports[0].hp + ' vs ' + reports[3].hp + ')');
// 5. 漏怪扣血验证
console.log('\\n[边界] 直接把敌人送到终点');
reset(1);                       // 前面关卡3 已阵亡，重置出可用血量
const before = S.hp;
const ee = { kind:'grunt', def:ENEMIES.grunt, maxHp:999, hp:999, speed:10, reward:0, armor:0,
             r:9, color:'#000', x:paths[0].pts[0].x, y:paths[0].pts[0].y, pi:1, traveled:0, slowT:0, slowAmt:0, angle:0, pathId:0, path:paths[0] };
S.enemies.push(ee);
leak(ee);
ok(S.hp === before - 1, '漏怪扣 1 点生命');
ok(ee.leaked === true, '漏怪后被标记移除');

// 6. 战术技能
const dt = 1/60;   // 全局固定步长，供逐帧断言使用
console.log('\\n[技能] 空袭与极寒冻结');
reset();
for (let i=0;i<3;i++) spawnEnemy('grunt');
const hp0 = S.enemies[0].hp;
ok(castSkill('airstrike', S.enemies[0].x, S.enemies[0].y) === true, '空袭释放成功');
ok(S.skills.airstrike === SKILLS.airstrike.cd, '空袭进入冷却 (' + SKILLS.airstrike.cd + 's)');
ok(castSkill('airstrike', 10, 10) === false, '冷却期间无法重复释放');
ok(S.enemies[0].hp < hp0 || S.enemies[0].dead, '空袭造成了伤害');
ok(AIR_DAMAGE(20) > AIR_DAMAGE(1), '空袭伤害随波次成长 (' + AIR_DAMAGE(1) + ' -> ' + AIR_DAMAGE(20) + ')');

reset();
for (let i=0;i<3;i++) spawnEnemy('grunt');
ok(castSkill('freeze') === true, '冻结释放成功');
ok(S.enemies.every(e => e.slowT >= 4 && e.slowAmt >= 0.7), '全场减速生效');
const cd0 = S.skills.freeze;
for (let i=0;i<60;i++) update(dt);
ok(Math.abs(S.skills.freeze - (cd0 - 1)) < 0.05, '冷却随时间递减 (1s 后 ' + S.skills.freeze.toFixed(2) + ')');
reset();
ok(castSkill('freeze') === false, '无敌人时冻结不释放（不浪费冷却）');

// 7. 塔的累计伤害统计
reset();
let placed = false;
for (const sp of spots) { if (!isRoad(sp.c, sp.r) && !towerAt(sp.c, sp.r)) { placeTower(sp.c, sp.r, 'arrow'); placed = true; break; } }
ok(placed && S.towers.length === 1, '测试塔建造成功');
for (let i=0;i<12;i++) spawnEnemy('grunt');
for (let i=0;i<900;i++) update(dt);
ok(S.towers[0].totalDamage > 0, '塔累计伤害被统计 (' + S.towers[0].totalDamage.toFixed(0) + ')');

// 8. 下一波预览
reset();
const comp = waveComposition(S.wave + 1);
ok(comp.length > 0, '下一波预览有数据 (第1波 ' + comp.length + ' 个)');
let pvErr = null;
try { renderPreview(); renderRecord(); syncStats(); } catch (err) { pvErr = err; }
ok(pvErr === null, '预览/战绩/冷却 UI 渲染无异常' + (pvErr ? ': ' + pvErr.message : ''));

// 9. 成就与本地存档
reset();
S.save.ach = {};
S.wave = 10; checkAch();
ok(S.save.ach.w10 === true, '到达第10波解锁成就');
S.wave = 20; checkAch();
ok(S.save.ach.w20 === true, '到达第20波解锁成就');
S.gold = 900; checkAch();
ok(S.save.ach.rich === true, '金币达标解锁成就');
ok(S.save.ach.w30 !== true, '未达条件的成就不解锁');

reset();
const g0 = S.save.games, k0 = S.save.totalKills;
S.wave = 9; S.kills = 123;
gameOver();
ok(S.save.games === g0 + 1, '结束一局写入局数');
ok(S.save.totalKills === k0 + 123, '累计击杀被累加');
ok(S.save.bestWave >= 9, '最佳波次被更新 (' + S.save.bestWave + ')');
ok(S.status === 'over', '结束状态正确');

// 10. 分支专精
console.log('\\n[专精] Lv3 后的二选一');
reset(); S.gold = 99999;
placeTower(freeCells()[0].c, freeCells()[0].r, 'arrow');
const tw = S.towers[0];
ok(tw.level === 1 && !tw.branch, '初始 Lv1 且无专精');
upgradeTower(tw); upgradeTower(tw);
ok(tw.level === MAX_LEVEL, '可普通升级到 Lv' + MAX_LEVEL);
upgradeTower(tw);
ok(tw.level === MAX_LEVEL, 'Lv' + MAX_LEVEL + ' 后不能继续普通升级');

// 与"同等级但不专精"对比，才能看出专精的取舍
const nb = towerStats({ def: TOWERS.arrow, level: 4 });
specialize(tw, 'a');
ok(tw.level === SPEC_LEVEL && tw.branch === 'a', '专精后为 Lv4 且记录分支');
const sa = towerStats(tw);
ok(sa.rate > nb.rate * 1.8, '连弩攻速大幅提升 (' + nb.rate.toFixed(2) + ' -> ' + sa.rate.toFixed(2) + ')');
ok(sa.dmg < nb.dmg, '连弩单发伤害下降作代价 (' + nb.dmg.toFixed(0) + ' -> ' + sa.dmg.toFixed(0) + ')');
ok(sa.dps > nb.dps, '连弩总体 DPS 仍提升 (' + nb.dps.toFixed(1) + ' -> ' + sa.dps.toFixed(1) + ')');

reset(); S.gold = 99999;
placeTower(freeCells()[1].c, freeCells()[1].r, 'arrow');
const tw2 = S.towers[0];
upgradeTower(tw2); upgradeTower(tw2); specialize(tw2, 'b');
const sb2 = towerStats(tw2);
ok(sb2.rng > nb.rng * 1.5, '狙击射程大幅提升 (' + nb.rng.toFixed(0) + ' -> ' + sb2.rng.toFixed(0) + ')');
ok(Math.abs(sb2.pierceArmor - 0.6) < 0.001, '狙击带 60% 破甲');
ok(specialize(tw2, 'a') === undefined && tw2.branch === 'b', '已专精的塔不能再改分支');

// 破甲实测
const ae = { hp:1000, maxHp:1000, armor:20, def:ENEMIES.grunt, x:0, y:0 };
damage(ae, 100, '#000', null, 0.6);
ok(Math.abs(ae.hp - 908) < 0.01, '护甲20 在 60% 破甲下按 8 计 (剩 ' + ae.hp + ')');

// 11. 灼烧持续伤害
reset();
spawnEnemy('grunt');
const be = S.enemies[0];
const hpB = be.hp;
applyBurn(be, 40);
ok(be.burnT > 0 && be.burnDps === 40, '灼烧状态已附加');
for (let i=0;i<120;i++) update(dt);
ok(be.hp < hpB || be.dead, '灼烧持续掉血 (' + hpB + ' -> ' + (be.dead ? '已死亡' : be.hp.toFixed(0)) + ')');

// 12. 飞行单位与对空限制
console.log('\\n[飞行] 直线突进 + 炮塔无法对空');
ok(paths[0].flyLen < paths[0].len * 0.6, '飞行路程明显短于地面 (' + Math.round(paths[0].flyLen) + ' vs ' + Math.round(paths[0].len) + ')');

reset(); S.gold = 99999;
placeTower(freeCells()[2].c, freeCells()[2].r, 'cannon');
const cannon = S.towers[0];
spawnEnemy('flyer');
const fe = S.enemies[0];
const fhp = fe.hp;
for (let i=0;i<180;i++){ fe.x = cannon.x + 20; fe.y = cannon.y; update(dt); }
ok(fe.hp === fhp, '炮塔对飞行单位完全无伤害（贴脸 3 秒）');

reset(); S.gold = 99999;
placeTower(freeCells()[3].c, freeCells()[3].r, 'arrow');
const archer = S.towers[0];
spawnEnemy('flyer');
const fe2 = S.enemies[0];
const fhp2 = fe2.hp;
for (let i=0;i<180;i++){ fe2.x = archer.x + 20; fe2.y = archer.y; update(dt); }
ok(fe2.hp < fhp2 || fe2.dead, '箭塔可以正常攻击飞行单位');

// 飞行单位从各自入口起飞并沿直线推进
reset();
spawnEnemy('flyer', 0);
const fl = S.enemies[0];
for (let i=0;i<300;i++) update(dt);
ok(fl.traveled > 0 || fl.leaked || fl.dead, '飞行单位正常推进 (' + Math.round(fl.traveled) + 'px)');

reset(); spawnEnemy('flyer', 0); const a0 = S.enemies[0];
reset(); spawnEnemy('flyer', 1); const a1 = S.enemies[0];
ok(Math.hypot(a0.x-paths[0].pts[0].x, a0.y-paths[0].pts[0].y) < 1, '飞行从入口1起飞');
ok(Math.hypot(a1.x-paths[1].pts[0].x, a1.y-paths[1].pts[0].y) < 1, '飞行从入口2起飞');
ok(Math.hypot(a0.x-a1.x, a0.y-a1.y) > 100, '两条路的飞行起点相距很远');
ok(ENEMIES.flyer.fly === true && TOWERS.cannon.noAir === true, '飞行与对空限制配置正确');

// 13. 地图编辑器
console.log('\\n[编辑] 任意拐点位置与 L 形连接');
const diag = expandWaypoints([[0,0],[5,5]]);
let axial = true;
for (let i=1;i<diag.length;i++){
  if (Math.abs(diag[i][0]-diag[i-1][0]) + Math.abs(diag[i][1]-diag[i-1][1]) !== 1) axial = false;
}
ok(axial, '不对齐拐点经 L 形连接后逐格轴对齐');
ok(diag.length === 11, 'L 形长度 = |dx|+|dy|+1 = 11 (' + diag.length + ')');
ok(diag[0][0]===0 && diag[0][1]===0 && diag[diag.length-1][0]===5 && diag[diag.length-1][1]===5, 'L 形首尾位置正确');
ok(expandWaypoints([[0,0],[-3,5],[99,5]]).every(cc => inBounds(cc[0], cc[1])), '越界拐点被安全忽略');

reset(); S.gold = 99999;
toggleEdit();
ok(S.edit === true, '进入编辑模式');
ok(S.enemies.length === 0 && !S.waveRunning, '进入编辑时清空战斗状态');

curWpsList()[0][1] = [3, 3];          // 模拟把路径1 的第2个拐点拖到 (3,3)
buildMap(); purgeTowersOnRoad();
let seg1 = true;
for (const p of paths){
  for (let i=1;i<p.pts.length;i++){
    const dx = Math.abs(p.pts[i].x-p.pts[i-1].x), dy = Math.abs(p.pts[i].y-p.pts[i-1].y);
    if (!((dx===0 && dy===CELL) || (dy===0 && dx===CELL))) seg1 = false;
  }
}
ok(seg1, '拖动后所有路径段仍是单格轴对齐');

const n0 = curWpsList()[0].length;
addWp(0);
ok(curWpsList()[0].length === n0+1, '加点成功');
const w0 = curWpsList()[0];
ok(w0[w0.length-1][0] === 19 && w0[w0.length-1][1] === 7, '加点不会改变终点（基地）');
delWp(0, 0);
ok(curWpsList()[0].length === n0, '删点成功');
const nn = curWpsList()[0].length;
delWp(0, nn-1);
ok(curWpsList()[0].length === nn, '终点（基地）不可删除');
while (curWpsList()[0].length > 2) delWp(0, 0);
delWp(0, 0);
ok(curWpsList()[0].length === 2, '至少保留两个拐点');

// 压路塔会被拆除并返还：先在空地建塔，再把路径改过去覆盖它
resetMap(); reset(); S.gold = 99999;             // 此时仍处于编辑模式
let freeCell = null;
for (let r=0;r<ROWS && !freeCell;r++) for (let c=0;c<COLS && !freeCell;c++)
  if (!isRoad(c,r)) freeCell = {c:c, r:r};
placeTower(freeCell.c, freeCell.r, 'arrow');
const goldBefore = S.gold, towersBefore = S.towers.length;
curWpsList()[0][0] = [freeCell.c, freeCell.r];   // 把路径起点拖到塔所在的格子
buildMap(); purgeTowersOnRoad();
ok(towersBefore === 1 && S.towers.length === 0, '压在路上的塔被自动拆除');
ok(S.gold > goldBefore, '拆除时有金币返还 (' + goldBefore + ' -> ' + S.gold + ')');

// 导出配置
resetMap();
let expErr = null;
try { exportWps(); } catch(e){ expErr = e; }
const expVal = $('exportBox').value;
ok(expErr === null, '导出配置无异常');
ok(expVal.indexOf('const PATHS = [') >= 0 && expVal.indexOf('[[0,') >= 0, '导出内容格式正确');
ok(expVal.indexOf('[19,7]') >= 0, '导出内容包含基地终点');
ok(customWps === null, '恢复默认后 customWps 清空');

reset();                       // 重开一局
ok(S.edit === false, '重开一局会自动退出编辑模式');

// 14. 关卡系统与词缀
console.log('\\n[关卡] 解锁 / 星级 / 资源');
S.save.stars = {};
ok(levelUnlocked(0) === true, '第1关默认解锁');
ok(levelUnlocked(1) === false, '未通关时第2关锁定');
S.save.stars[LEVELS[0].id] = 1;
ok(levelUnlocked(1) === true, '拿到星后解锁下一关');
ok(starOf(20,20) === 3, '满血通关 3 星');
ok(starOf(10,20) === 2, '半血通关 2 星');
ok(starOf(1,20) === 1, '残血通关 1 星');

reset(0);
ok(S.gold === LEVELS[0].gold && S.hp === LEVELS[0].hp, '按关卡配置初始化资源 (金 ' + S.gold + ' 血 ' + S.hp + ')');
reset(3);
ok(S.hp === LEVELS[3].hp && S.hp < LEVELS[0].hp, '后期关卡初始生命更低 (' + S.hp + ')');
ok(LEVELS[3].armorMul > LEVELS[0].armorMul, '熔岩要塞护甲系数更高');

// 通关判定
reset(0);
S.wave = S.level.waves;
S.hp = S.level.hp;
victory();
ok(S.status === 'won', '达到目标波次即通关');
ok(S.save.stars[LEVELS[0].id] === 3, '满血通关记录 3 星');

// 关卡3 从第 6 波起带词缀
reset(2); S.wave = 10;
const c10 = waveComposition(10);
const modded = c10.filter(x => x.mod);
ok(modded.length > 0, '关卡3 第10波出现词缀敌人 (' + modded.length + '/' + c10.length + ')');
ok(modded.every(x => MODIFIERS[x.mod]), '词缀 key 都能在 MODIFIERS 里找到');
ok(c10.filter(x=>x.kind==='boss').every(x => !x.mod), '首领不带词缀');

// 词缀的实际数值影响
reset(2); S.wave = 10;
spawnEnemy('grunt', 0, null);
const plain = { hp:S.enemies[0].hp, speed:S.enemies[0].speed, armor:S.enemies[0].armor, r:S.enemies[0].r };
reset(2); S.wave = 10;
spawnEnemy('grunt', 0, 'armor');
const armored = S.enemies[0];
ok(armored.armor > plain.armor, '铁甲：护甲提升 (' + plain.armor + ' -> ' + armored.armor + ')');
reset(2); S.wave = 10;
spawnEnemy('grunt', 0, 'swift');
ok(S.enemies[0].speed > plain.speed, '疾风：速度提升');
reset(2); S.wave = 10;
spawnEnemy('grunt', 0, 'giant');
ok(S.enemies[0].hp > plain.hp && S.enemies[0].r > plain.r, '巨化：血量与体型同时提升');

// 关卡1 没有飞行兵（敌人池限制）
reset(0); S.wave = 12;
ok(waveComposition(12).every(x => x.kind !== 'flyer'), '关卡1 敌人池不含飞行兵');
ok(waveComposition(12).every(x => x.kind !== 'boss'), '关卡1 没有首领');


// 词缀只在起始波之后出现
reset(2); S.wave = 5;
ok(waveComposition(5).every(x => !x.mod), '词缀起始波之前没有强化敌人');
reset(2); S.wave = 14;
ok(waveComposition(14).some(x => x.kind === 'boss'), '关卡3 第14波出现首领');

// 无尽关卡
ok(LEVELS[4].waves === 0, '第5关是无尽模式（无目标波次）');
reset(4); S.wave = 7; gameOver();
ok(S.save.endlessBest >= 7, '无尽模式记录最高波次 (' + S.save.endlessBest + ')');

// 难度单调性：越靠后的关，笨 AI 撑住的波次不增


// 15. 伤害类型 × 抗性矩阵
console.log('\\n[抗性] 伤害类型与敌人抗性');
ok(Object.keys(DMG_TYPES).length === 4, '四种伤害类型');
ok(TOWER_ORDER.every(k => DMG_TYPES[TOWERS[k].dmgType]), '每种塔都有合法的伤害类型');
ok(Object.values(ENEMIES).every(d => !d.resist || Object.keys(d.resist).every(k => DMG_TYPES[k])),
   '敌人抗性字段都指向合法伤害类型');
ok(Object.values(ENEMIES).every(d => d.desc && d.desc.length > 0), '每种敌人都有说明文案');

// 重甲兵：抗物理、惧能量 —— 同一发伤害换类型，实际掉血应有明显差别
reset(0); S.wave = 1; spawnEnemy('tank', 0, null);
const tk = S.enemies[0];
const tkA = tk.hp; damage(tk, 100, '#000', null, 0, 'phys');   const lossPhys = tkA - tk.hp;
const tkB = tk.hp; damage(tk, 100, '#000', null, 0, 'energy'); const lossEnergy = tkB - tk.hp;
ok(lossEnergy > lossPhys * 1.5, '重甲兵吃能量远高于物理 (' + lossPhys.toFixed(0) + ' vs ' + lossEnergy.toFixed(0) + ')');

// 首领抗减速：同样的冰霜弹打上去，减速幅度被抗性吃掉
reset(0); S.wave = 1;
spawnEnemy('boss', 0, null);  const bs = S.enemies[0];
spawnEnemy('grunt', 0, null); const gn = S.enemies[1];
const frostBullet = (target) => ({ x:target.x, y:target.y, tx:target.x, ty:target.y, speed:1,
  target, tower:null, dmg:1, splash:0, slow:0.45, slowDur:2, burn:0, pierceArmor:0,
  dmgType:'frost', color:'#000', angle:0, kind:'frost' });
hit(frostBullet(bs)); hit(frostBullet(gn));
ok(Math.abs(bs.slowAmt - 0.45 * (1 - bs.slowResist)) < 1e-6, '首领减速被抗性削减 (' + bs.slowAmt.toFixed(2) + ')');
ok(gn.slowAmt > bs.slowAmt * 2, '小兵照常吃满减速 (' + gn.slowAmt.toFixed(2) + ' vs ' + bs.slowAmt.toFixed(2) + ')');

// 关卡全局抗性加成：与敌人自身抗性相加
reset(3); S.wave = 1; spawnEnemy('grunt', 0, null);
ok(Math.abs((S.enemies[0].resist.fire || 0) - LEVELS[3].resist.fire) < 1e-6,
   '熔岩要塞给全军附加抗火 (' + (S.enemies[0].resist.fire * 100).toFixed(0) + '%)');
reset(2); S.wave = 1; spawnEnemy('grunt', 0, null);
ok(Math.abs((S.enemies[0].resist.frost || 0) - 0.3) < 1e-6, '霜寒隘口给全军附加抗冰 (30%)');
reset(3); S.wave = 1; spawnEnemy('runner', 0, null);
ok(Math.abs((S.enemies[0].resist.fire || 0) - 0.05) < 1e-6,
   '抗性是相加的：疾行者 -30% 遇上关卡 +35% 变成 +5% (' + (S.enemies[0].resist.fire * 100).toFixed(0) + '%)');

// 16. 护盾兵
console.log('\\n[护盾] 护盾兵：先扣盾、免疫减速、破盾后易伤');
reset(3); S.wave = 1; spawnEnemy('shield', 0, null);
const sh = S.enemies[0];
const sh0 = sh.shield, shp0 = sh.hp;
ok(sh0 > 0 && Math.abs(sh0 - shp0 * ENEMIES.shield.shield) < 1, '护盾值按最大生命比例生成 (' + sh0 + ')');
const dmgIn = 100 * (1 - (sh.resist.phys || 0));   // 抗性同样作用于护盾吸收量
damage(sh, 100, '#000', null, 0, 'phys');
ok(sh.hp === shp0 && Math.abs(sh.shield - (sh0 - dmgIn)) < 1e-6,
   '护盾期间伤害打在盾上，血量不变 (盾 ' + sh0 + ' -> ' + sh.shield.toFixed(0) + ')');
hit(frostBullet(sh));
ok(sh.slowT === 0, '护盾期间免疫减速');
damage(sh, 100, '#000', null, 0, 'phys');
ok(sh.broken === true && sh.shield === 0, '护盾被打空后标记为已破');
ok(sh.hp < shp0, '破盾后开始掉血 (' + shp0 + ' -> ' + sh.hp.toFixed(0) + ')');

// 破盾易伤：同样一发，破过盾的会多掉 25%
reset(3); S.wave = 1; spawnEnemy('shield', 0, null); const shA = S.enemies[0]; shA.shield = 0; shA.broken = true;
reset(3); S.wave = 1; spawnEnemy('shield', 0, null); const shB = S.enemies[0]; shB.shield = 0;
const aA = shA.hp; damage(shA, 100, '#000', null, 0, 'phys'); const lA = aA - shA.hp;
const aB = shB.hp; damage(shB, 100, '#000', null, 0, 'phys'); const lB = aB - shB.hp;
ok(lA > lB * 1.2, '破盾后受伤 +25% (' + lB.toFixed(0) + ' -> ' + lA.toFixed(0) + ')');

// 17. 治疗师
console.log('\\n[治疗] 治疗师周期治疗周围友军');
reset(3); S.wave = 12; S.hp = 999;
spawnEnemy('medic', 0, null); const md = S.enemies[0];
spawnEnemy('grunt', 0, null); const gg = S.enemies[1];
gg.hp = 20;
const wounded = gg.hp;
for (let i=0;i<200;i++){ md.x = gg.x + 10; md.y = gg.y; update(dt); }
ok(gg.hp > wounded, '治疗师把伤兵奶了回来 (' + wounded + ' -> ' + gg.hp.toFixed(0) + ')');
ok(gg.hp <= gg.maxHp, '治疗不会超过生命上限');

// 拉开距离后不再治疗
reset(3); S.wave = 12; S.hp = 999;
spawnEnemy('medic', 0, null); const md2 = S.enemies[0];
spawnEnemy('grunt', 0, null); const gg2 = S.enemies[1];
gg2.hp = 20;
const far = gg2.hp;
for (let i=0;i<200;i++){ md2.x = gg2.x + 400; md2.y = gg2.y + 300; update(dt); }
ok(gg2.hp === far, '超出治疗范围则不生效');

// 新敌人确实进了后期关卡的池子
ok(LEVELS[2].pool.indexOf('shield') >= 0 && LEVELS[0].pool.indexOf('shield') < 0, '护盾兵从第3关开始出现');
ok(LEVELS[3].pool.indexOf('medic')  >= 0 && LEVELS[2].pool.indexOf('medic')  < 0, '治疗师从第4关开始出现');
reset(3);
let shieldSeen = 0, medicSeen = 0;
for(let n=10;n<=16;n++){ S.wave = n; const cc = waveComposition(n);
  if(cc.some(x=>x.kind==='shield')) shieldSeen++;
  if(cc.some(x=>x.kind==='medic'))  medicSeen++; }
ok(shieldSeen >= 3, '第4关 10~16 波持续出现护盾兵 (' + shieldSeen + '/7 波)');
ok(medicSeen  >= 2, '第4关 10~16 波出现治疗师 (' + medicSeen + '/7 波)');


// 18. 主题化地形与氛围
console.log('\\n[主题] 每关一套地形与氛围');
ok(LEVELS.every(L => !!THEMES[L.theme]), '每关都指定了存在的主题');
ok(new Set(LEVELS.map(L => L.theme)).size === LEVELS.length, '五关主题互不重复');

let terrErr = null;
for(let i=0;i<LEVELS.length;i++){
  try { reset(i); buildTerrain(); draw(); } catch(err){ terrErr = err; break; }
}
ok(terrErr === null, '五套地形都能烘焙且渲染无异常' + (terrErr ? ': ' + terrErr.message : ''));
ok(terrain !== null && terrainDirty === false, '地形烘焙后缓存生效、dirty 已清除');

reset(2);
ok(terrainDirty === true, '换关/重建地图后地形会重新烘焙');
reset(3); buildTerrain();
ok(ambient.length > 0 && ambient.length < 80, '氛围粒子数量合理 (' + ambient.length + ')');
ok(curTheme().name === THEMES[LEVELS[3].theme].name, '当前主题跟随关卡 (' + curTheme().name + ')');
ok(hash2(3,4) === hash2(3,4) && hash2(3,4) !== hash2(4,3), '地形装饰用确定性伪随机，不会每帧抖动');

// 有护盾/治疗/飞行的敌人同屏时也要能画
reset(3); S.wave = 12; S.hp = 999;
spawnEnemy('shield', 0, null); spawnEnemy('medic', 1, null);
spawnEnemy('flyer', 0, null);  spawnEnemy('boss', 1, 'giant');
let mixErr = null;
try { draw(); for(let i=0;i<30;i++) update(dt); draw(); } catch(err){ mixErr = err; }
ok(mixErr === null, '护盾/治疗/飞行/词缀同屏渲染无异常' + (mixErr ? ': ' + mixErr.message : ''));

// 编辑模式也要能画（手柄叠在地形上）
reset(0); S.edit = true;
let edErr = null;
try { buildTerrain(); draw(); } catch(err){ edErr = err; }
ok(edErr === null, '编辑模式下渲染无异常');
S.edit = false; reset(0);


// 19. 波次预算模型
console.log('\\n[预算] 各关每波的强度构成（实际威胁 / 预算）');
[0,1,2,3,4].forEach(li=>{
  const L = LEVELS[li];
  const parts = [];
  [1,3,5,8,10,12,15,20].forEach(n=>{
    reset(li); S.wave = n;
    const c = waveComposition(n);
    const tot = c.reduce((a,x)=> a + threatAt(ENEMIES[x.kind], n, L), 0);
    const b = waveBudget(n, L);
    parts.push('W' + n + ' ' + String(c.length).padStart(2) + '个/' + String(Math.round(tot)).padStart(4) +
               '(算' + String(Math.round(b)).padStart(4) + ')');
  });
  console.log('  ' + L.name.slice(0,4) + ' ' + parts.join('  '));
});

// 预算必须真的约束住强度：实际威胁不能离预算太远
reset(1);
let budgetErr = 0, worstRatio = 1;
for(let n=1;n<=16;n++){
  S.wave = n;
  const c = waveComposition(n);
  const tot = c.reduce((a,x)=> a + threatAt(ENEMIES[x.kind], n, S.level), 0);
  const b = waveBudget(n, S.level);
  const ratio = tot / b;
  if(ratio > 1.4 || ratio < 0.55) budgetErr++;
  worstRatio = Math.max(worstRatio, Math.abs(ratio - 1));
}
ok(budgetErr === 0, '每波实际威胁都贴合预算（最大偏差 ' + ((worstRatio-1)*100).toFixed(0) + '%）');

// 强度随波次单调递增，且不出现空波 / 数量爆炸
reset(1);
let prev = 0, mono = true, sizeOk = true;
for(let n=1;n<=16;n++){
  S.wave = n;
  const c = waveComposition(n);
  const tot = c.reduce((a,x)=> a + threatAt(ENEMIES[x.kind], n, S.level), 0);
  if(tot <= prev) mono = false;
  prev = tot;
  if(c.length < 3 || c.length > 60) sizeOk = false;
}
ok(mono, '波次强度随波次严格递增');
ok(sizeOk, '每波数量在合理区间（>=3 且 <=60）');

// 威胁值本身要能区分定位
ok(ENEMIES.boss.cost > ENEMIES.tank.cost * 3, '首领威胁远高于重甲兵 (' + ENEMIES.boss.cost + ' vs ' + ENEMIES.tank.cost + ')');
ok(ENEMIES.medic.cost > ENEMIES.grunt.cost * 2, '治疗师虽脆但威胁更高 (' + ENEMIES.medic.cost + ' vs ' + ENEMIES.grunt.cost + ')');
ok(ENEMIES.tank.cost > ENEMIES.grunt.cost * 3, '重甲兵威胁显著高于小兵 (' + ENEMIES.tank.cost + ' vs ' + ENEMIES.grunt.cost + ')');
ok(Object.keys(ENEMIES).every(k => ENEMIES[k].cost > 0 && ENEMIES[k].weight !== undefined && ENEMIES[k].from >= 1),
   '每种敌人都有威胁值、采购权重与解锁波次');


// 20. 多种子平均：单一种子的战报会有 ±2 波抖动，细调参数时会被噪声带偏
console.log('\\n[复测] 每关跑 3 个种子取平均');
const SEEDS = [0, 977, 4271];
const avgReports = [0,1,2,3,4].map(li=>{
  const rs = SEEDS.map(sd => simulateLevel(li, 15, sd));
  const avg = k => rs.reduce((a,r)=> a + r[k], 0) / rs.length;
  return { li, wave:avg('wave'), hp:avg('hp'), kills:avg('kills'),
           towers:avg('towers'), startHp:rs[0].startHp };
});
avgReports.forEach(r=>{
  const L = LEVELS[r.li];
  console.log('    ' + L.name + '  平均到达 W' + r.wave.toFixed(1) +
              '  平均剩血 ' + r.hp.toFixed(1) + '/' + r.startHp + '  塔 ' + r.towers.toFixed(0));
});
const avgScore = r => r.wave * 1000 + r.hp;
const asc = avgReports.map(avgScore);
ok(asc[0] > asc[1] && asc[1] > asc[2] && asc[2] > asc[3],
   '平均难度逐关递增（生存分 ' + asc.slice(0,4).map(x=>Math.round(x)).join(' > ') + '）');
ok(asc[3] > asc[4], '无尽关不比第4关轻松（生存分 ' + Math.round(asc[3]) + ' > ' + Math.round(asc[4]) + '）');
ok(avgReports[0].wave >= 14, '第1关平均能撑满 15 波 (W' + avgReports[0].wave.toFixed(1) + ')');

// 新敌人在后期关卡中稳定出现（生成是随机的，所以要扫一段波次而不是只看一波）
reset(3);


// 21. 目标策略：威胁值的第二个用途
console.log('\\n[目标] 打最前面的 vs 打威胁最高的');
function aimUnder(mode){
  reset(0); S.gold = 99999;
  const sp = freeCells()[0];
  placeTower(sp.c, sp.r, 'arrow');
  const t2 = S.towers[0];
  S.targetMode = mode;
  spawnEnemy('grunt', 0, null); const g = S.enemies[0];
  spawnEnemy('boss', 0, null);  const bo = S.enemies[1];
  // 小兵更靠近基地，首领在后面但威胁高得多
  g.x = t2.x + 22; g.y = t2.y - 12; g.traveled = 1400;
  bo.x = t2.x + 22; bo.y = t2.y + 12; bo.traveled = 100;
  update(dt);
  const angTo = e => Math.atan2(e.y - t2.y, e.x - t2.x);
  const picked = Math.abs(t2.angle - angTo(g)) < 0.05 ? 'grunt'
               : Math.abs(t2.angle - angTo(bo)) < 0.05 ? 'boss' : 'none';
  return picked;
}
ok(aimUnder('front') === 'grunt', 'front 模式打最靠近基地的（小兵）');
ok(aimUnder('threat') === 'boss', 'threat 模式无视先后、先打威胁最高的（首领）');

const tm0 = S.targetMode;
$('btnTarget').onclick();
ok(S.targetMode !== tm0, '点击按钮可切换目标策略 (' + S.targetMode + ')');
$('btnTarget').onclick();
ok(S.targetMode === tm0, '再点一次切回原策略');

// 22. 敌人图鉴
let dexErr = null;
try { for(let i=0;i<LEVELS.length;i++){ reset(i); S.wave = 8; renderDex(); } } catch(e){ dexErr = e; }
ok(dexErr === null, '五关的敌人图鉴都能渲染' + (dexErr ? ': ' + dexErr.message : ''));
reset(3); S.wave = 10; renderDex();
const dexHtml = $('dex').innerHTML;
ok(dexHtml.indexOf('威胁值') >= 0, '图鉴带威胁值说明');
ok(dexHtml.indexOf('治疗师') >= 0 && dexHtml.indexOf('护盾兵') >= 0, '图鉴列出本关池子里的新敌人');
ok(dexHtml.indexOf('火焰抗35%') >= 0, '图鉴体现了本关的抗性加成');


// 23. 塔的建模：成长曲线、战力度量、按增益定价
console.log('\\n[塔] 每塔一套成长曲线');
ok(TOWER_ORDER.every(k => TOWERS[k].grow && TOWERS[k].role), '每种塔都有成长曲线与角色定位');
const gA = TOWERS.arrow.grow, gC = TOWERS.cannon.grow, gF = TOWERS.frost.grow, gL = TOWERS.laser.grow;
ok(gA.rate > gC.rate, '箭塔的攻速成长高于炮塔 (' + gA.rate + ' vs ' + gC.rate + ')');
ok(gC.dmg > gA.dmg && gC.splash > 1, '炮塔的伤害与溅射成长最高 (' + gC.dmg + ' / 溅射 ' + gC.splash + ')');
ok(gF.slow > 1 && gF.dmg < gA.dmg, '冰霜塔升减速、DPS 涨得最慢 (slow ' + gF.slow + ' / dmg ' + gF.dmg + ')');
ok(gL.rng > gA.rng && gL.rng > gC.rng, '激光塔的射程成长最高 (' + gL.rng + ')');

// 成长要真的体现在数值上，而不是只写在配置里
const l1 = towerStats({def:TOWERS.arrow, level:1}), l3 = towerStats({def:TOWERS.arrow, level:3});
const c1 = towerStats({def:TOWERS.cannon, level:1}), c3 = towerStats({def:TOWERS.cannon, level:3});
ok(l3.rate / l1.rate > c3.rate / c1.rate, '同为升到 Lv3，箭塔攻速涨得比炮塔多 (' +
   (l3.rate/l1.rate).toFixed(2) + 'x vs ' + (c3.rate/c1.rate).toFixed(2) + 'x)');
ok(c3.splash > c1.splash, '炮塔升级后溅射范围真的变大 (' + c1.splash.toFixed(0) + ' -> ' + c3.splash.toFixed(0) + ')');
const f1 = towerStats({def:TOWERS.frost, level:1}), f3 = towerStats({def:TOWERS.frost, level:3});
ok(f3.slow > f1.slow, '冰霜塔升级后减速更强 (' + Math.round(f1.slow*100) + '% -> ' + Math.round(f3.slow*100) + '%)');
ok(f3.slow <= 0.85, '减速再怎么涨也不会到 100% (上限 85%)');

// 战力度量：贵的塔应该更强，但不该成比例地碾压
const pw = k => powerOf(towerStats({def:TOWERS[k], level:1}));
console.log('    Lv1 战力：' + TOWER_ORDER.map(k => TOWERS[k].name + ' ' + pw(k).toFixed(0)).join(' · '));
ok(pw('cannon') > pw('arrow'), '炮塔战力高于箭塔（有溅射加成）');
ok(pw('laser')  > pw('arrow'), '激光塔战力高于箭塔（有破甲加成）');
ok(pw('frost')  < pw('arrow'), '冰霜塔纯战力最低，价值在控场');

// 升级定价 = 涨得多的更贵
const upA = upgradeCost({def:TOWERS.arrow, level:1});
const upF = upgradeCost({def:TOWERS.frost, level:1});
console.log('    Lv1→2 价格：箭塔 ' + upA + ' · 炮塔 ' + upgradeCost({def:TOWERS.cannon, level:1}) +
            ' · 冰霜 ' + upF + ' · 激光 ' + upgradeCost({def:TOWERS.laser, level:1}));
ok(upA < TOWERS.arrow.cost * 2, '升级价格没有离谱 (箭塔 ' + upA + ' vs 造价 ' + TOWERS.arrow.cost + ')');
ok(upF / TOWERS.frost.cost < upA / TOWERS.arrow.cost, '冰霜涨得慢，单位造价的升级也更便宜');
ok(upgradeCost({def:TOWERS.arrow, level:2}) > upA, '等级越高升级越贵');

// 出售价必须与实际花销一致（两套公式分开写必然会对不上）
reset(0); S.gold = 99999;
const sp0 = freeCells()[0];
placeTower(sp0.c, sp0.r, 'arrow');
const twS = S.towers[0];
let paid = TOWERS.arrow.cost;
while(twS.level < MAX_LEVEL){ paid += upgradeCost(twS); upgradeTower(twS); }
ok(Math.abs(spentFor(twS) - paid) < 1, '累计投入与实际花费一致 (' + spentFor(twS) + ' vs ' + paid + ')');
ok(sellValue(twS) === Math.floor(spentFor(twS) * 0.6), '出售返还按实际投入的 60% 计算');

// 激光塔"专克重甲"要名副其实
reset(0); S.wave = 1; spawnEnemy('tank', 0, null);
const tkT = S.enemies[0];
const hpX = tkT.hp; damage(tkT, 100, '#000', null, 0, 'phys');    const dPhysT = hpX - tkT.hp;
reset(0); S.wave = 1; spawnEnemy('tank', 0, null);
const tkL = S.enemies[0];
const hpY = tkL.hp; damage(tkL, 100, '#000', null, 0.35, 'energy'); const dLaser = hpY - tkL.hp;
ok(dLaser > dPhysT, '激光打重甲兵比物理更疼 (' + dPhysT.toFixed(0) + ' -> ' + dLaser.toFixed(0) + ')');
ok(TOWERS.laser.pierceArmor > 0, '激光塔自带破甲 (' + Math.round(TOWERS.laser.pierceArmor*100) + '%)');
ok(TOWERS.frost.preferUnslowed === true, '冰霜塔被标记为优先打未减速目标');

// 冰霜塔的目标偏好：已经减速的敌人会被降权
reset(0); S.gold = 99999;
const spF = freeCells()[2];
placeTower(spF.c, spF.r, 'frost');
const tF = S.towers[0];
spawnEnemy('grunt', 0, null); const ga = S.enemies[0];
spawnEnemy('grunt', 0, null); const gb = S.enemies[1];
const plen = paths[0].len;
ga.x = tF.x + 20; ga.y = tF.y - 10; ga.traveled = plen - 900;                    // 略靠前
gb.x = tF.x + 20; gb.y = tF.y + 10; gb.traveled = plen - 1000;                   // 略靠后
const angF = e => Math.atan2(e.y - tF.y, e.x - tF.x);
update(dt);
ok(Math.abs(tF.angle - angF(ga)) < 0.05, '都未减速时，冰霜塔照常打最前面的');
ga.slowT = 3; ga.slowAmt = 0.5;                                                  // 只给前方那个上减速
tF.cd = 0; update(dt);
ok(Math.abs(tF.angle - angF(gb)) < 0.05, '前方已减速后，改给后面没减速的上 debuff');


// 24. 塔面板渲染（新增的成长预览 / 战力 / 性价比都要能画出来）
let uiErr = null;
try{
  reset(0); S.gold = 99999;
  placeTower(freeCells()[4].c, freeCells()[4].r, 'laser');
  S.selTower = S.towers[0];
  renderInfo();
  upgradeTower(S.selTower); renderInfo();
  specialize(S.selTower, 'a'); renderInfo();
  S.selTower = null; S.selType = 'frost'; renderInfo();
  buildShop();
}catch(e){ uiErr = e; }
ok(uiErr === null, '塔面板（升级预览/战力/性价比）渲染无异常' + (uiErr ? ': ' + uiErr.message : ''));

console.log('\\n' + (fail === 0 ? '>>> 全部通过' : '>>> ' + fail + ' 项失败'));
`;

eval(src + test);
