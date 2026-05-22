// 修真传说 v14 - 视频paintTo全屏绘制
var canvas, ctx, W, H, dpr
var state = 'start'       // start | play | shop | rank | victory | video

var GRID_COLS = 5
var GRID_ROWS = 6
var MAX_LEVEL = 10

// 通关条件
var NORMAL_WIN = 3   // 3个飞升 = 普通通关
var SUPER_WIN = 5    // 5个飞升 = 高级通关

var gold = 100, level = 1, maxMergeLevel = 1
var grid = [], spawnCost = 5
var cellSize = 0, ox = 0, oy = 0
var dragging = null
var _lastTouchPos = null  // 用于商店/排行 touchEnd 点击
var incomeTimer = null
var coverImg = null
var coverReady = false
var elemImages = []
var elemReady = []

// 通关状态
var winType = ''       // 'normal' | 'super'
var videoPlayer = null
var _videoPaintMode = null  // 'offscreen' | 'paint' | 'drawImage' | 'dom' | null
var videoPlaying = false
var _videoCloseHandler = null  // 视频关闭回调（DOM模式用）

// 提示系统
var tipText = ''
var tipTimer = null
var tipColor = '#FFF'

var ELEMENTS = [
  { name: '练气', color: '#88CCFF' },
  { name: '筑基', color: '#55AAFF' },
  { name: '金丹', color: '#FFD700' },
  { name: '元婴', color: '#FF88CC' },
  { name: '化神', color: '#AA77FF' },
  { name: '炼虚', color: '#77FFAA' },
  { name: '合体', color: '#FF77AA' },
  { name: '大乘', color: '#FFAA44' },
  { name: '渡劫', color: '#AA44FF' },
  { name: '飞升', color: '#FFFFFF' }
]

function formatGold(g) {
  return Math.floor(g || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function showTip(msg, color) {
  tipText = msg || ''
  tipColor = color || '#FFF'
  if (tipTimer) clearTimeout(tipTimer)
  tipTimer = setTimeout(function() { tipText = '' }, 1800)
}

function initGrid() {
  grid = []
  for (var r = 0; r < GRID_ROWS; r++) {
    grid[r] = []
    for (var c = 0; c < GRID_COLS; c++) grid[r][c] = 0
  }
}

function roundRect(x, y, w, h, r) {
  if (!r || r <= 0) { ctx.rect(x, y, w, h); return }
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function drawElem(x, y, size, elemId) {
  var elem = ELEMENTS[elemId - 1]
  if (!elem) return
  var cx = x + size / 2, cy = y + size / 2
  var r = size / 2 - 3

  ctx.fillStyle = elem.color + '50'
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = elem.color + 'BB'
  ctx.lineWidth = 1.5; ctx.stroke()

  var imgIdx = elemId - 1
  if (elemImages[imgIdx] && elemReady[imgIdx]) {
    var img = elemImages[imgIdx]
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()
    var s = size * 0.78
    var scale = s / Math.max(img.width, img.height)
    ctx.drawImage(img, cx - img.width * scale / 2, cy - img.height * scale / 2,
                  img.width * scale, img.height * scale)
    ctx.restore()
  } else {
    ctx.fillStyle = elem.color
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFF'
    ctx.font = 'bold ' + Math.max(10, Math.floor(size * 0.16)) + 'px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(elem.name, cx, cy)
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'
  }
}

// ── 图片加载 ──
function loadImages() {
  console.log('[loadImages] 开始, canvas:', !!canvas, 'tt:', !!tt)
  console.log('[loadImages] canvas.createImage:', typeof canvas !== 'undefined' ? typeof canvas.createImage : 'N/A')
  console.log('[loadImages] tt.createImage:', typeof tt !== 'undefined' ? typeof tt.createImage : 'N/A')
  console.log('[loadImages] new Image:', typeof Image)

  // 尝试所有可能的图片创建方式
  var creators = [
    { name: 'canvas.createImage', fn: function() { return (typeof canvas !== 'undefined' && canvas.createImage) ? canvas.createImage() : null } },
    { name: 'tt.createImage', fn: function() { return (typeof tt !== 'undefined' && tt.createImage) ? tt.createImage() : null } },
    { name: 'wx.createImage', fn: function() { return (typeof wx !== 'undefined' && wx.createImage) ? wx.createImage() : null } },
    { name: 'new Image()', fn: function() { return new Image() } }
  ]

  var createImg = null
  var creatorName = ''
  for (var ci = 0; ci < creators.length; ci++) {
    try {
      var testImg = creators[ci].fn()
      if (testImg) {
        createImg = creators[ci].fn
        creatorName = creators[ci].name
        console.log('[图片] 选择:', creatorName)
        break
      }
    } catch(e) {
      console.log('[图片] ' + creators[ci].name + ' 失败:', e.message)
    }
  }
  if (!createImg) { createImg = function() { return new Image() }; creatorName = 'new Image() force' }

  // 尝试多种路径格式
  var coverPaths = [
    'images/cover_bg.png',
    '/images/cover_bg.png',
    './images/cover_bg.png',
    'cover_bg.png'
  ]

  // 封面图 - 依次尝试每个路径
  function tryLoadCover(pathIdx) {
    if (pathIdx >= coverPaths.length) {
      console.log('[封面] 所有路径都失败！')
      // 最终尝试：用 base64 1x1 像素测试 canvas 是否能 drawImage
      return
    }
    try {
      var img = createImg()
      var path = coverPaths[pathIdx]
      img.onload = function() {
        console.log('[封面OK]', creatorName, 'path:', path, img.width, 'x', img.height)
        coverImg = img
        coverReady = true
      }
      img.onerror = function(e) {
        console.log('[封面FAIL]', creatorName, 'path:', path, e)
        tryLoadCover(pathIdx + 1)
      }
      img.src = path
      // 超时保护：3秒后尝试下一个路径
      setTimeout(function() {
        if (!coverReady) {
          console.log('[封面TIMEOUT]', creatorName, 'path:', path, '→ 尝试下一个')
          tryLoadCover(pathIdx + 1)
        }
      }, 3000)
    } catch(err) {
      console.log('[封面异常]', err.message, '→ 尝试下一个')
      tryLoadCover(pathIdx + 1)
    }
  }

  tryLoadCover(0)

  // 元素图 - 使用同样的创建方式
  for (var i = 1; i <= MAX_LEVEL; i++) {
    (function(idx) {
      var paths = ['images/elem_' + (idx + 1) + '.png', '/images/elem_' + (idx + 1) + '.png']
      function tryElem(pi) {
        if (pi >= paths.length) return
        try {
          var img = createImg()
          img.onload = function() {
            elemImages[idx] = img
            elemReady[idx] = true
            console.log('[元素' + (idx+1) + 'OK]', paths[pi], img.width, 'x', img.height)
          }
          img.onerror = function(e) {
            console.log('[元素' + (idx+1) + 'FAIL]', paths[pi], e)
            tryElem(pi + 1)
          }
          img.src = paths[pi]
          setTimeout(function() {
            if (!elemReady[idx]) tryElem(pi + 1)
          }, 3000)
        } catch(err) { elemImages[idx] = null; elemReady[idx] = false }
      }
      tryElem(0)
    })(i - 1)
  }
}

function calcLayout() {
  cellSize = Math.floor(W / GRID_COLS)
  ox = Math.floor((W - cellSize * GRID_COLS) / 2)
  oy = Math.floor((H - cellSize * GRID_ROWS) / 2) + 38
}

function calcIncome() {
  var inc = 0
  for (var r = 0; r < GRID_ROWS; r++) {
    if (!grid[r]) continue
    for (var c = 0; c < GRID_COLS; c++) {
      if (grid[r][c] > 0) inc += Math.floor(Math.pow(3, grid[r][c] - 1))
    }
  }
  return Math.floor(inc * (1 + (maxMergeLevel - 1) * 0.3))
}

// ── 统计飞升数量 ──
function countFeisheng() {
  var cnt = 0
  for (var r = 0; r < GRID_ROWS; r++) {
    if (!grid[r]) continue
    for (var c = 0; c < GRID_COLS; c++) {
      if (grid[r][c] === MAX_LEVEL) cnt++
    }
  }
  return cnt
}

// ── 检查通关 ──
function checkWin() {
  var fs = countFeisheng()
  if (fs >= SUPER_WIN) {
    winType = 'super'
    state = 'victory'
    if (incomeTimer) { clearInterval(incomeTimer); incomeTimer = null }
  } else if (fs >= NORMAL_WIN) {
    winType = 'normal'
    state = 'victory'
    if (incomeTimer) { clearInterval(incomeTimer); incomeTimer = null }
  }
}

// ══════════════════ 渲染 ══════════════════
function render() {
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)

  if (state === 'start') renderStart()
  else if (state === 'play') renderGame()
  else if (state === 'shop') renderShop()
  else if (state === 'rank') renderRank()
  else if (state === 'victory') renderVictory()
  else if (state === 'video') renderVideoOverlay()

  requestAnimationFrame(render)
}

function renderStart() {
  // 抖音 tt.createImage 没有 naturalWidth，只用 width 判断
  var coverOk = coverReady && coverImg && (coverImg.width > 0 || coverImg.naturalWidth > 0)
  if (coverOk) {
    ctx.drawImage(coverImg, 0, 0, W, H)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(0, 0, W, H)
  } else {
    var grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, '#0a1628'); grad.addColorStop(1, '#1a3a4e')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    for (var i = 0; i < 80; i++)
      ctx.fillRect((i * 137) % W, (i * 89) % H, 2, 2)
  }

  ctx.save()
  ctx.fillStyle = '#FFD700'; ctx.font = 'bold 38px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.shadowColor = '#FF6600'; ctx.shadowBlur = 10
  ctx.fillText('修 真 传 说', W / 2, H * 0.30); ctx.shadowBlur = 0
  ctx.fillStyle = '#aab0cc'; ctx.font = '15px sans-serif'
  ctx.fillText('— 合成 · 养成 · 飞升 —', W / 2, H * 0.39)
  ctx.restore()

  if (maxMergeLevel > 1) {
    ctx.fillStyle = '#FFD700'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('已飞升: ' + ELEMENTS[Math.min(maxMergeLevel - 1, 9)].name, W / 2, H * 0.47)
  }

  var bw = 180, bh = 48
  var bx = Math.floor((W - bw) / 2), by = H * 0.58
  ctx.fillStyle = '#FFD700'
  roundRect(bx, by, bw, bh, 12); ctx.fill()
  ctx.fillStyle = '#1a1a2e'; ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('开 始 游 戏', W / 2, by + bh / 2)

  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
  ctx.fillText('拖动相同元素合成升级 · 收集灵石突破境界', W / 2, H * 0.72)

  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'
}

function renderGame() {
  var cs = cellSize || Math.floor(W / GRID_COLS)

  // 顶栏
  ctx.fillStyle = 'rgba(8,8,24,0.94)'; ctx.fillRect(0, 0, W, 62)
  ctx.fillStyle = '#8888cc'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'
  ctx.fillText('境界: ' + ELEMENTS[Math.min(maxMergeLevel - 1, 9)].name, 8, 18)
  ctx.fillStyle = '#FF9900'; ctx.font = 'bold 13px sans-serif'
  ctx.fillText('Lv.' + level, 8, 42)
  var inc = calcIncome()
  ctx.fillStyle = '#55cc55'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right'
  ctx.fillText('+' + formatGold(inc) + '/s', W - 8, 26)
  ctx.fillStyle = '#888899'; ctx.font = '11px sans-serif'
  ctx.fillText('最高: ' + ELEMENTS[Math.min(maxMergeLevel - 1, 9)].name, W - 8, 46)

  // 飞升进度
  var fs = countFeisheng()
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
  var progText = '🌟 飞升: ' + fs + '/' + NORMAL_WIN + (fs >= NORMAL_WIN ? ' ✓' : '') +
                  (SUPER_WIN > NORMAL_WIN ? ' | 🏆 ' + fs + '/' + SUPER_WIN : '')
  ctx.fillText(progText, W / 2, 56)

  // 网格上方：灵石居中显示
  ctx.fillStyle = '#FFD700'; ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('💰 ' + formatGold(gold), W / 2, oy - 16)

  // 网格
  for (var r = 0; r < GRID_ROWS; r++) {
    for (var c = 0; c < GRID_COLS; c++) {
      var x = ox + c * cs, y = oy + r * cs
      ctx.fillStyle = '#0a1628'; ctx.fillRect(x + 2, y + 2, cs - 4, cs - 4)
      ctx.strokeStyle = '#16324a'; ctx.lineWidth = 1
      ctx.strokeRect(x + 2, y + 2, cs - 4, cs - 4)
      if (!grid[r]) grid[r] = []
      var eid = grid[r][c] || 0
      if (eid > 0 && !(dragging && dragging.r === r && dragging.c === c))
        drawElem(x + 2, y + 2, cs - 4, eid)
    }
  }

  // 拖拽中
  if (dragging && dragging.eid > 0)
    drawElem(dragging.x - cs / 2, dragging.y - cs / 2, cs, dragging.eid)

  // 底部三按钮
  var by2 = oy + GRID_ROWS * cs + 10, bh2 = 36
  var gap = 6
  var bw3 = Math.floor((W - gap * 4) / 3)
  var bxs = [gap, gap + bw3 + gap, gap + (bw3 + gap) * 2]

  ctx.fillStyle = '#5a2a1a'
  roundRect(bxs[0], by2, bw3, bh2, 8); ctx.fill()
  ctx.fillStyle = '#FF7744'; ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('🗑 回收', bxs[0] + bw3 / 2, by2 + bh2 / 2)

  ctx.fillStyle = '#3a1a5a'
  roundRect(bxs[1], by2, bw3, bh2, 8); ctx.fill()
  ctx.fillStyle = '#cc88ff'
  ctx.fillText('🏪 商店', bxs[1] + bw3 / 2, by2 + bh2 / 2)

  ctx.fillStyle = '#1a3a5a'
  roundRect(bxs[2], by2, bw3, bh2, 8); ctx.fill()
  ctx.fillStyle = '#44BBFF'
  ctx.fillText('🏆 排行', bxs[2] + bw3 / 2, by2 + bh2 / 2)

  // 提示
  if (tipText) {
    ctx.fillStyle = tipColor === 'red' ? 'rgba(180,0,0,0.88)' : 'rgba(0,120,0,0.88)'
    ctx.font = 'bold 15px sans-serif'
    var tw = ctx.measureText(tipText).width + 36
    roundRect(W / 2 - tw / 2, H * 0.42, tw, 40, 8); ctx.fill()
    ctx.fillStyle = '#FFF'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(tipText, W / 2, H * 0.42 + 20)
  }

  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'
}

// ══════════════════ 通关画面 ══════════════════
function renderVictory() {
  // 背景遮罩
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  ctx.fillRect(0, 0, W, H)

  var isSuper = (winType === 'super')
  var title = isSuper ? '🏆 高级通关！' : '✨ 普通通关！'
  var subtitle = isSuper ? '你已集齐 5 个飞升，登顶仙界！' : '你已集齐 3 个飞升，成功渡劫！'

  // 标题
  ctx.fillStyle = isSuper ? '#FFD700' : '#00DDFF'
  ctx.font = 'bold 32px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.shadowColor = isSuper ? '#FF6600' : '#0088AA'
  ctx.shadowBlur = 15
  ctx.fillText(title, W / 2, H * 0.22)
  ctx.shadowBlur = 0

  // 副标题
  ctx.fillStyle = '#CCC'
  ctx.font = '15px sans-serif'
  ctx.fillText(subtitle, W / 2, H * 0.30)

  // 统计
  var totalElem = 0
  for (var r = 0; r < GRID_ROWS; r++) {
    if (!grid[r]) continue
    for (var c = 0; c < GRID_COLS; c++) { if (grid[r][c] > 0) totalElem++ }
  }
  ctx.fillStyle = '#888899'; ctx.font = '13px sans-serif'
  ctx.fillText('最终境界: ' + ELEMENTS[maxMergeLevel - 1].name + '  |  灵石: ' + formatGold(gold) + '  |  元素: ' + totalElem, W / 2, H * 0.37)

  // 按钮
  var btnW = 200, btnH = 46
  var gap = 14
  var by = H * 0.48

  // 播放视频按钮
  ctx.fillStyle = isSuper ? '#CC44FF' : '#2299FF'
  roundRect(W / 2 - btnW / 2, by, btnW, btnH, 10); ctx.fill()
  ctx.fillStyle = '#FFF'; ctx.font = 'bold 16px sans-serif'
  ctx.fillText(isSuper ? '🎬 播放庆功视频' : '🎬 播放通关视频', W / 2, by + btnH / 2)

  // 继续游戏（仅普通通关）
  if (!isSuper) {
    ctx.fillStyle = '#228833'
    roundRect(W / 2 - btnW / 2, by + btnH + gap, btnW, btnH, 10); ctx.fill()
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 16px sans-serif'
    ctx.fillText('▶ 继续游戏', W / 2, by + btnH + gap + btnH / 2)
  }

  // 重玩游戏
  ctx.fillStyle = '#CC6622'
  roundRect(W / 2 - btnW / 2, by + (btnH + gap) * (isSuper ? 1 : 2), btnW, btnH, 10); ctx.fill()
  ctx.fillStyle = '#FFF'; ctx.font = 'bold 16px sans-serif'
  ctx.fillText('🔄 重玩游戏', W / 2, by + (btnH + gap) * (isSuper ? 1 : 2) + btnH / 2)

  // 预告
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '11px sans-serif'
  ctx.fillText('⚔ 仙魔大战 · 敬请期待 ⚔', W / 2, H * 0.90)

  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'
}

// ══════════════════ 视频播放覆盖层 ══════════════════
function renderVideoOverlay() {
  // DOM 模式：video 元素自己全屏显示，canvas 只需保持帧循环
  if (_videoPaintMode === 'dom') {
    ctx.fillStyle = 'rgba(0,0,0,0.01)'
    ctx.fillRect(0, 0, W, H)
    return
  }
  
  // paintTo / drawImage 模式：将视频绘制到 canvas 全屏
  if (videoPlayer && _videoPaintMode) {
    try {
      // 优先 paintTo（offscreen video 专用）
      if (typeof videoPlayer.paintTo === 'function') {
        var pw = W * (dpr || 1)
        var ph = H * (dpr || 1)
        videoPlayer.paintTo(canvas, 0, 0, pw, ph)
        return
      }
      
      // 尝试 ctx.drawImage（把 video 对象当图片源）
      if (videoPlayer.videoWidth > 0 || videoPlayer.width > 0) {
        var vw = videoPlayer.videoWidth || videoPlayer.width || W
        var vh = videoPlayer.videoHeight || videoPlayer.height || H
        ctx.drawImage(videoPlayer, 0, 0, vw, vh, 0, 0, W, H)
        return
      }
      
      // 无尺寸信息也尝试 drawImage
      ctx.drawImage(videoPlayer, 0, 0, W, H)
      return
    } catch(e) {
      console.warn('[视频 render 失败]', e.message || e)
    }
  }
  
  // fallback: 提示信息 + 点击跳过
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#FFD700'; ctx.font = 'bold 18px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('🎬 庆功视频中...', W / 2, H / 2 - 20)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '13px sans-serif'
  ctx.fillText('点击屏幕跳过', W / 2, H / 2 + 15)
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'
}

function playVideo() {
  state = 'video'
  try {
    var videoSrc = (winType === 'super') 
      ? 'https://raw.githubusercontent.com/yk8899git/xiaochengxu/main/images/clear15.mp4'
      : 'https://raw.githubusercontent.com/yk8899git/xiaochengxu/main/images/clear5.mp4'
    console.log('[视频] 尝试播放:', videoSrc, 'winType:', winType)
    
    // 方案1: tt.createOffscreenVideo + paintTo（抖音离屏视频，绘制到canvas全屏）
    if (typeof tt.createOffscreenVideo === 'function') {
      console.log('[视频] 使用 createOffscreenVideo + paintTo')
      try {
        videoPlayer = tt.createOffscreenVideo({
          src: videoSrc,
          autoplay: true,
          muted: false
        })
        if (videoPlayer) {
          videoPlayer.play()
          _videoPaintMode = 'offscreen'
          console.log('[视频] offscreenVideo play() 已调用')
          if (videoPlayer.onEnded) {
            videoPlayer.onEnded(function() { console.log('[视频 offscreen ended]'); state = 'victory'; _videoPaintMode = null })
          } else {
            var _oeCheck = setInterval(function() {
              try { if (videoPlayer.ended) { clearInterval(_oeCheck); state = 'victory'; _videoPaintMode = null } }
              catch(e) { clearInterval(_oeCheck); state = 'victory'; _videoPaintMode = null }
            }, 500)
          }
          return
        }
      } catch(oe) { console.warn('[视频 offscreen 失败]', oe) }
    }
    
    // 方案2: tt.createVideo + 尝试 paintTo / drawImage
    if (typeof tt.createVideo === 'function') {
      console.log('[视频] 使用 tt.createVideo')
      videoPlayer = tt.createVideo({
        src: videoSrc,
        autoplay: true,
        muted: false
      })
      if (videoPlayer) {
        videoPlayer.play()
        
        // 检查是否有 paintTo 方法
        if (typeof videoPlayer.paintTo === 'function') {
          _videoPaintMode = 'paint'
          console.log('[视频] → paintTo 模式')
        } else {
          // 没有 paintTo，检查能否 drawImage
          _videoPaintMode = 'drawImage'
          console.log('[视频] → drawImage 模式, width:', videoPlayer.width, 'height:', videoPlayer.height)
        }
        
        var _vCheck = setInterval(function() {
          try { if (videoPlayer.ended) { clearInterval(_vCheck); state = 'victory'; _videoPaintMode = null } }
          catch(e) { clearInterval(_vCheck); state = 'victory'; _videoPaintMode = null }
        }, 500)
        return
      }
    }
    
    // 方案3: DOM Video 元素强制全屏覆盖（兜底）
    console.log('[视频] 使用 DOM Video 全屏覆盖')
    if (typeof document !== 'undefined' && document.createElement) {
      var vid = document.createElement('video')
      vid.src = videoSrc
      vid.autoplay = true
      vid.loop = false
      vid.muted = false
      vid.playsInline = false
      // 强制全屏：fixed定位 + 超高z-index + 100vw/vh
      vid.style.cssText = [
        'position:fixed',
        'top:0!important',
        'left:0!important',
        'width:100vw!important',
        'height:100vh!important',
        'z-index:2147483647!important',
        'background:#000!important',
        'object-fit:cover!important',
        'display:block!important',
        'visibility:visible!important',
        'opacity:1!important'
      ].join(';')
      document.body.appendChild(vid)
      videoPlayer = vid
      _videoPaintMode = 'dom'  // 标记为DOM模式，render里不需要绘制
      
      var _domEnd = function() {
        console.log('[DOM Video ended]')
        state = 'victory'
        _videoPaintMode = null
        try { vid.pause(); vid.remove() } catch(e) {}
      }
      vid.onended = _domEnd
      vid.onerror = function(e) { console.error('[DOM Video error]', e); _domEnd() }
      // 触摸/点击也可关闭
      _videoCloseHandler = function() { _domEnd() }
      return
    }
    
    // 最终 fallback
    console.warn('[视频] 无可用视频API，跳过')
    showTip('视频播放暂不可用', 'red')
    setTimeout(function() { state = 'victory' }, 1500)
  } catch(err) {
    console.error('[视频异常]', err.message)
    state = 'victory'
  }
}

// ══════════════════ 商店（Canvas UI）══════════════════
var shopItems = []

function buildShopItems() {
  shopItems = []
  for (var i = 1; i <= MAX_LEVEL; i++) {
    var cost = (i === 9) ? 0 : Math.floor(100 * Math.pow(5, i - 1))  // 渡劫丹免费
    shopItems.push({
      name: ELEMENTS[i-1].name + '丹',
      desc: (i === 9) ? '⚡ 特价测试用 · 获得 渡劫 元素' : '获得 ' + ELEMENTS[i-1].name + ' 元素',
      cost: cost,
      lv: i,
      color: ELEMENTS[i-1].color
    })
    if (i === 9) console.log('[商店] 渡劫丹价格:', cost)
  }
}

function renderShop() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H)

  var pw = Math.min(W - 30, 360)
  var ph = Math.min(H - 30, 580)
  var px = (W - pw) / 2
  var py = (H - ph) / 2

  ctx.fillStyle = '#12122a'
  roundRect(px, py, pw, ph, 14); ctx.fill()
  ctx.strokeStyle = '#333366'; ctx.lineWidth = 2
  roundRect(px, py, pw, ph, 14); ctx.stroke()

  ctx.fillStyle = '#1a1a3e'
  roundRect(px, py, pw, 44, 14); ctx.fill()
  ctx.fillStyle = '#FFD700'; ctx.font = 'bold 18px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('🏪 丹 药 铺', W / 2, py + 22)

  ctx.fillStyle = '#FFD700'; ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  ctx.fillText('💰 ' + formatGold(gold), px + pw - 14, py + 22)

  ctx.fillStyle = '#aa3333'
  roundRect(px + pw - 38, py + 8, 28, 28, 6); ctx.fill()
  ctx.fillStyle = '#FFF'; ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('✕', px + pw - 24, py + 22)

  if (!shopItems.length) buildShopItems()

  var itemH = 52
  var listTop = py + 50
  var listBottom = py + ph - 10

  for (var i = 0; i < shopItems.length; i++) {
    var iy = listTop + i * itemH
    if (iy + itemH > listBottom - 4) break
    var item = shopItems[i]
    var canBuy = gold >= item.cost

    ctx.fillStyle = canBuy ? 'rgba(30,30,70,0.9)' : 'rgba(20,20,40,0.7)'
    roundRect(px + 8, iy, pw - 16, itemH - 4, 8); ctx.fill()

    ctx.fillStyle = item.color
    roundRect(px + 10, iy + 2, 4, itemH - 8, 2); ctx.fill()

    ctx.fillStyle = canBuy ? '#FFF' : '#666'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(item.name, px + 24, iy + itemH / 2 - 8)

    ctx.fillStyle = canBuy ? '#888899' : '#444'
    ctx.font = '11px sans-serif'
    ctx.fillText(item.desc, px + 24, iy + itemH / 2 + 10)

    ctx.fillStyle = canBuy ? '#FFD700' : '#664400'
    ctx.font = 'bold ' + (item.lv === 9 ? '15' : '13') + 'px sans-serif'
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(formatGold(item.cost) + (item.lv === 9 ? ' ⚡' : ''), px + pw - 16, iy + itemH / 2)
  }

  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
  ctx.fillText('点击丹药购买 · 点击 ✕ 关闭', W / 2, py + ph - 4)
}

function handleShopTouch(p) {
  var pw = Math.min(W - 30, 360)
  var ph = Math.min(H - 30, 580)
  var px = (W - pw) / 2
  var py = (H - ph) / 2

  // 关闭按钮（扩大点击区域）
  if (p.x >= px + pw - 44 && p.x <= px + pw - 4 && p.y >= py + 2 && p.y <= py + 42) {
    console.log('[商店] 点击关闭按钮')
    state = 'play'; return true  // true = 已消费（关闭类操作）
  }
  // 点击面板外关闭
  if (p.x < px || p.x > px + pw || p.y < py || p.y > py + ph) {
    console.log('[商店] 点击面板外')
    state = 'play'; return true
  }

  // 商品购买（返回 false 表示未消费，留给 touchEnd 处理）
  if (!shopItems.length) buildShopItems()
  var itemH = 52
  var listTop = py + 50
  for (var i = 0; i < shopItems.length; i++) {
    var iy = listTop + i * itemH
    if (p.x >= px + 4 && p.x <= px + pw - 4 && p.y >= iy - 4 && p.y <= iy + itemH) {
      var item = shopItems[i]
      console.log('[商店] 点击商品:', item.name, 'cost:', item.cost, 'gold:', gold)
      if (gold < item.cost) {
        showTip('灵石不足！需要 ' + formatGold(item.cost), 'red'); return true
      }
      gold -= item.cost
      console.log('[商店] 扣款后 gold:', gold)
      if (item.lv > (level || 1)) level = item.lv
      spawnCost = Math.floor(5 * Math.pow(1.5, (level || 1) - 1))
      doSpawnAt(item.lv)
      checkWin()
      showTip('服用 ' + item.name + ' 成功！', '#00DD88')
      return true
    }
  }
  return false  // 未命中任何区域
}

function doSpawnAt(lv) {
  var empty = []
  for (var r = 0; r < GRID_ROWS; r++) {
    if (!grid[r]) grid[r] = []
    for (var c = 0; c < GRID_COLS; c++) {
      if (!grid[r][c] || grid[r][c] === 0) empty.push({ r: r, c: c })
    }
  }
  if (empty.length > 0) {
    var pos = empty[Math.floor(Math.random() * empty.length)]
    if (!grid[pos.r]) grid[pos.r] = []
    grid[pos.r][pos.c] = lv
  } else {
    showTip('没有空位了！先合成一些吧', 'red')
  }
}

// ══════════════════ 排行（Canvas UI）══════════════════
function renderRank() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H)

  var pw = Math.min(W - 30, 380)
  var ph = Math.min(H - 60, 480)
  var px = (W - pw) / 2
  var py = (H - ph) / 2

  ctx.fillStyle = '#12122a'
  roundRect(px, py, pw, ph, 14); ctx.fill()
  ctx.strokeStyle = '#333366'; ctx.lineWidth = 2
  roundRect(px, py, pw, ph, 14); ctx.stroke()

  ctx.fillStyle = '#1a1a3e'
  roundRect(px, py, pw, 44, 14); ctx.fill()
  ctx.fillStyle = '#FFD700'; ctx.font = 'bold 18px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('🏆 修真排行榜', W / 2, py + 22)

  ctx.fillStyle = '#aa3333'
  roundRect(px + pw - 38, py + 8, 28, 28, 6); ctx.fill()
  ctx.fillStyle = '#FFF'; ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('✕', px + pw - 24, py + 22)

  var counts = {}
  for (var i = 1; i <= MAX_LEVEL; i++) counts[i] = 0
  for (var r = 0; r < GRID_ROWS; r++) {
    if (!grid[r]) continue
    for (var c = 0; c < GRID_COLS; c++) {
      if (grid[r][c] > 0) counts[grid[r][c]]++
    }
  }

  var itemH = 40
  var listTop = py + 52
  for (var lv = MAX_LEVEL; lv >= 1; lv--) {
    var iy = listTop + (MAX_LEVEL - lv) * itemH
    if (iy + itemH > py + ph - 8) break
    var cnt = counts[lv] || 0
    var elem = ELEMENTS[lv - 1]

    ctx.fillStyle = cnt > 0 ? 'rgba(30,30,70,0.85)' : 'rgba(15,15,35,0.5)'
    roundRect(px + 8, iy, pw - 16, itemH - 4, 6); ctx.fill()

    ctx.fillStyle = elem.color
    roundRect(px + 10, iy + 2, 4, itemH - 8, 2); ctx.fill()

    ctx.fillStyle = lv <= 3 ? '#FFD700' : '#666'
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('#' + (MAX_LEVEL - lv + 1), px + 22, iy + itemH / 2)

    ctx.fillStyle = cnt > 0 ? '#FFF' : '#555'
    ctx.font = '13px sans-serif'
    ctx.fillText(elem.name, px + 58, iy + itemH / 2)

    ctx.fillStyle = cnt > 0 ? '#44BBFF' : '#333'
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText(cnt + ' 个', px + pw - 16, iy + itemH / 2)
  }

  var totalElem = 0
  for (var k in counts) totalElem += counts[k]
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
  ctx.fillText('共 ' + totalElem + ' 个元素 · 点击 ✕ 关闭', W / 2, py + ph - 4)

  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'
}

function handleRankTouch(p) {
  var pw = Math.min(W - 30, 380)
  var ph = Math.min(H - 60, 480)
  var px = (W - pw) / 2
  var py = (H - ph) / 2
  if ((p.x >= px + pw - 44 && p.x <= px + pw - 4 && p.y >= py + 2 && p.y <= py + 42) ||
      p.x < px || p.x > px + pw || p.y < py || p.y > py + ph) {
    state = 'play'; return true
  }
  return false
}

// ══════════════════ 触摸事件 ══════════════════
function touchPos(e) {
  if (!e || !e.touches || !e.touches.length) return null
  var t = e.touches[0]
  return { x: t.clientX || t.x || 0, y: t.clientY || t.y || 0 }
}

function onTouchStart(e) {
  var p = touchPos(e)
  if (!p) return

  // 商店/排行：touchStart 立即响应（关闭按钮、面板外关闭）
  if (state === 'shop') { handleShopTouch(p); return }
  if (state === 'rank') { handleRankTouch(p); return }

  // 记录坐标供 touchEnd 用（商品购买用）
  _lastTouchPos = p

  // 视频中点击返回
  if (state === 'video') {
    if (videoPlayer) { try { videoPlayer.destroy && videoPlayer.destroy() } catch(x){} videoPlayer = null }
    state = 'victory'
    return
  }

  // 通关画面点击
  if (state === 'victory') { handleVictoryTouch(p); return }

  if (state === 'start') {
    var bw = 180, bh = 48
    var bx = Math.floor((W - bw) / 2), by = H * 0.58
    if (p.x >= bx && p.x <= bx + bw && p.y >= by && p.y <= by + bh) {
      state = 'play'
      if (!grid || !grid.length) initGrid()
      calcLayout()
      spawnCost = Math.floor(5 * Math.pow(1.5, (level || 1) - 1))
      if (!incomeTimer) startIncomeLoop()
    }
    return
  }

  if (state !== 'play') return
  var cs = cellSize || Math.floor(W / GRID_COLS)
  var col = Math.floor((p.x - ox) / cs)
  var row = Math.floor((p.y - oy) / cs)
  if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
    if (!grid[row]) grid[row] = []
    var eid = grid[row][col] || 0
    if (eid > 0) dragging = { x: p.x, y: p.y, r: row, c: col, eid: eid }
  }

  var by2 = oy + GRID_ROWS * cs + 10, bh2 = 36
  var gap = 6
  var bw3 = Math.floor((W - gap * 4) / 3)
  var bxs = [gap, gap + bw3 + gap, gap + (bw3 + gap) * 2]
  if (p.y >= by2 && p.y <= by2 + bh2) {
    if (p.x >= bxs[0] && p.x <= bxs[0] + bw3) {
      doRecycle()
    } else if (p.x >= bxs[1] && p.x <= bxs[1] + bw3) {
      buildShopItems(); state = 'shop'
    } else if (p.x >= bxs[2] && p.x <= bxs[2] + bw3) {
      state = 'rank'
    }
  }
}

function handleVictoryTouch(p) {
  var btnW = 200, btnH = 46
  var gap = 14
  var by = H * 0.48
  var isSuper = (winType === 'super')

  // 播放视频
  if (p.x >= W / 2 - btnW / 2 && p.x <= W / 2 + btnW / 2 &&
      p.y >= by && p.y <= by + btnH) {
    playVideo()
    return
  }

  // 继续游戏（仅普通通关）
  if (!isSuper) {
    if (p.x >= W / 2 - btnW / 2 && p.x <= W / 2 + btnW / 2 &&
        p.y >= by + btnH + gap && p.y <= by + btnH * 2 + gap) {
      state = 'play'
      if (!incomeTimer) startIncomeLoop()
      return
    }
  }

  // 重玩游戏
  var restartY = by + (btnH + gap) * (isSuper ? 1 : 2)
  if (p.x >= W / 2 - btnW / 2 && p.x <= W / 2 + btnW / 2 &&
      p.y >= restartY && p.y <= restartY + btnH) {
    resetGame()
  }
}

function resetGame() {
  gold = 100
  level = 1
  maxMergeLevel = 1
  winType = ''
  initGrid()
  calcLayout()
  spawnCost = 5
  if (videoPlayer) { videoPlayer.destroy(); videoPlayer = null }
  state = 'start'
  if (!incomeTimer) startIncomeLoop()
}

function onTouchMove(e) {
  if (dragging) { var p = touchPos(e); if (p) { dragging.x = p.x; dragging.y = p.y } }
}

function onTouchEnd(e) {
  if (!dragging) return
  var cs = cellSize || Math.floor(W / GRID_COLS)
  var hc = Math.floor((dragging.x - ox) / cs)
  var hr = Math.floor((dragging.y - oy) / cs)
  if (hr >= 0 && hr < GRID_ROWS && hc >= 0 && hc < GRID_COLS && !(hr === dragging.r && hc === dragging.c)) {
    if (!grid[hr]) grid[hr] = []
    var target = grid[hr][hc] || 0
    if (target === dragging.eid && dragging.eid < MAX_LEVEL) {
      if (Math.random() < 0.5) {
        grid[dragging.r][dragging.c] = 0
        grid[hr][hc] = dragging.eid + 1
        if (dragging.eid + 1 > maxMergeLevel) {
          maxMergeLevel = dragging.eid + 1
          if (maxMergeLevel > (level || 1)) level = maxMergeLevel
          spawnCost = Math.floor(5 * Math.pow(1.5, (level || 1) - 1))
        }
        showTip('炼丹成功！晋升 ' + ELEMENTS[dragging.eid].name + '！', 'green')
        checkWin()
      } else {
        grid[dragging.r][dragging.c] = 0
        grid[hr][hc] = 0
        showTip('炼丹失败！' + ELEMENTS[dragging.eid - 1].name + '化为灰烬...', 'red')
      }
    } else if (target === 0) {
      grid[dragging.r][dragging.c] = 0
      grid[hr][hc] = dragging.eid
    }
  }
  dragging = null
}

function doSpawn() {
  var empty = []
  for (var r = 0; r < GRID_ROWS; r++) {
    if (!grid[r]) grid[r] = []
    for (var c = 0; c < GRID_COLS; c++) {
      if (!grid[r][c] || grid[r][c] === 0) empty.push({ r: r, c: c })
    }
  }
  if (empty.length > 0) {
    var pos = empty[Math.floor(Math.random() * empty.length)]
    if (!grid[pos.r]) grid[pos.r] = []
    grid[pos.r][pos.c] = (level || 1)
  }
}

function doRecycle() {
  var minLv = MAX_LEVEL + 1
  for (var r = 0; r < GRID_ROWS; r++) {
    if (!grid[r]) continue
    for (var c = 0; c < GRID_COLS; c++) {
      if (grid[r][c] > 0 && grid[r][c] < minLv) minLv = grid[r][c]
    }
  }
  if (minLv > MAX_LEVEL) { showTip('没有可回收的元素！', 'red'); return }
  var recycleValue = Math.floor(10 * Math.pow(3, minLv - 1))
  for (var r = 0; r < GRID_ROWS; r++) {
    if (!grid[r]) continue
    for (var c = 0; c < GRID_COLS; c++) {
      if (grid[r][c] === minLv) {
        gold += recycleValue
        grid[r][c] = 0
        showTip('回收 ' + ELEMENTS[minLv - 1].name + ' → +' + formatGold(recycleValue) + ' 灵石', 'green')
        return
      }
    }
  }
}

function startIncomeLoop() {
  incomeTimer = setInterval(function() {
    if (state !== 'play') return
    var inc = calcIncome()
    if (inc > 0) gold += inc
  }, 1000)
}

// ══════════════════ 入口 ══════════════════
tt.onShow(function() {
  console.log('[修真传说] v12 onShow')
  try {
    canvas = tt.createCanvas()
    ctx = canvas.getContext('2d')
    var info = tt.getSystemInfoSync()
    dpr = info.pixelRatio || 1
    W = info.windowWidth
    H = info.windowHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    console.log('[修真传说] Canvas:', W, 'x', H)

    calcLayout()
    loadImages()
    buildShopItems()

    tt.onTouchStart(onTouchStart)
    tt.onTouchMove(onTouchMove)
    tt.onTouchEnd(onTouchEnd)

    requestAnimationFrame(render)
    console.log('[修真传说] v12 ready')
  } catch(err) {
    console.error('[修真传说] ERROR:', err.message, err.stack)
  }
})
