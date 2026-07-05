/**
 * Qtine 文档站 —— 纯前端应用逻辑
 * Hash 路由 / Markdown 渲染 / 全文搜索 / MD3 主题切换
 */
(function () {
  'use strict';

  var CFG = window.QTINE_DOCS_CONFIG;
  var BASE = '';
  var cache = {};
  var searchIndex = null;

  // ========== 工具 ==========
  function $(sel, parent) { return (parent || document).querySelector(sel); }
  function $$(sel, parent) { return Array.prototype.slice.call((parent || document).querySelectorAll(sel)); }

  function getRoute() {
    var hash = location.hash.replace(/^#\/?/, '');
    if (!hash) return CFG.home || '/index';
    return '/' + hash.replace(/^\/+/, '');
  }

  function routeToPath(route) {
    return BASE + '/docs' + route + '.md';
  }

  function isHome(route) {
    return route === '/index' || route === '/' || route === '';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ========== Frontmatter 解析（简易 YAML） ==========
  function parseFrontmatter(md) {
    var fm = null;
    var body = md;
    var match = /^---\n([\s\S]*?)\n---\n?/.exec(md);
    if (match) {
      fm = parseYaml(match[1]);
      body = md.slice(match[0].length);
    }
    return { frontmatter: fm || {}, body: body };
  }

  function parseYaml(text) {
    // 简易 YAML：支持两级嵌套（key: value 与 key: 下面的 - 列表项）
    var result = {};
    var lines = text.split('\n');
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim() || /^#/.test(line)) { i++; continue; }
      var m = /^([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(line);
      if (m) {
        var key = m[1];
        var val = m[2].trim();
        if (val === '') {
          // 可能是块（列表或对象）
          var block = [];
          i++;
          while (i < lines.length && /^\s/.test(lines[i]) && !/^#/.test(lines[i].trim())) {
            block.push(lines[i]);
            i++;
          }
          // 解析块
          if (block.length && /^\s*-\s/.test(block[0])) {
            // 列表
            result[key] = parseYamlList(block);
          } else {
            // 对象
            result[key] = parseYaml(block.join('\n'));
          }
          continue;
        } else {
          // 标量值
          result[key] = parseScalar(val);
        }
      }
      i++;
    }
    return result;
  }

  function parseYamlList(lines) {
    var items = [];
    var current = null;
    lines.forEach(function (line) {
      var m = /^(\s*)-\s+(.*)$/.exec(line);
      if (m) {
        var indent = m[1].length;
        var rest = m[2];
        // 检查是否是 key: value
        var kv = /^([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(rest);
        if (kv) {
          current = {};
          current[kv[1]] = parseScalar(kv[2].trim());
          items.push(current);
        } else {
          items.push(parseScalar(rest));
          current = null;
        }
      } else {
        // 当前 list item 的后续属性
        var kv2 = /^(\s+)([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(line);
        if (kv2 && current) {
          current[kv2[2]] = parseScalar(kv2[3].trim());
        }
      }
    });
    return items;
  }

  function parseScalar(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null' || val === '') return null;
    if (/^-?\d+$/.test(val)) return parseInt(val, 10);
    if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
    // 去引号
    if (/^["'].*["']$/.test(val)) return val.slice(1, -1);
    return val;
  }

  // ========== Markdown 渲染（支持内联 HTML） ==========
  function renderMarkdown(md) {
    if (!md) return '';
    var html = md;

    // 提取代码块
    var codeBlocks = [];
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, function (m, lang, code) {
      var idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || '', code: code });
      return '\u0000CODEBLOCK' + idx + '\u0000';
    });
    // 提取内联代码
    var inlineCodes = [];
    html = html.replace(/`([^`]+)`/g, function (m, code) {
      var idx = inlineCodes.length;
      inlineCodes.push(code);
      return '\u0000INLINE' + idx + '\u0000';
    });

    // 注意：不转义 < > —— 允许内联 HTML（标准 markdown 行为）
    // 只转义 &
    html = html.replace(/&/g, '&amp;');
    // 修复已经被 &amp; 破坏的实体
    html = html.replace(/&amp;(amp|lt|gt|quot|#\d+);/g, '&$1;');

    // 标题
    html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 分隔线
    html = html.replace(/^---+$/gm, '<hr>');

    // 引用块
    html = html.replace(/^&gt; (.+)$/gm, function (m, text) {
      return '<blockquote><p>' + text + '</p></blockquote>';
    });
    html = html.replace(/(<\/blockquote>)\n*(<blockquote>)/g, '\n');

    // 表格
    html = html.replace(/^(\|.+\|)\n(\|[-: |]+\|)\n((?:\|.+\|\n?)+)/gm, function (m, header, sep, body) {
      var heads = header.split('|').filter(function (s) { return s.trim(); });
      var rows = body.trim().split('\n').map(function (r) {
        return r.split('|').filter(function (s, i, arr) {
          return i > 0 && i < arr.length - 1;
        });
      });
      var thead = '<thead><tr>' + heads.map(function (h) {
        return '<th>' + h.trim() + '</th>';
      }).join('') + '</tr></thead>';
      var tbody = '<tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + c.trim() + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody>';
      return '<table>' + thead + tbody + '</table>';
    });

    // 列表
    html = html.replace(/^(\s*)[-*] (.+)$/gm, function (m, indent, text) {
      return indent + '<li>' + text + '</li>';
    });
    html = html.replace(/^(\s*)\d+\. (.+)$/gm, function (m, indent, text) {
      return indent + '<li>' + text + '</li>';
    });
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, function (m) {
      return '<ul>' + m.trim() + '</ul>';
    });

    // 图片
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');

    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, text, url) {
      if (/^https?:/.test(url)) {
        return '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>';
      }
      var inner = url.replace(/\.md$/, '').replace(/^\.\//, '/');
      if (inner.charAt(0) !== '/') inner = '/' + inner;
      return '<a href="#' + inner + '">' + text + '</a>';
    });

    // 粗体 / 斜体
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 段落（连续非空行且非块级元素）
    html = html.split(/\n\n+/).map(function (block) {
      block = block.trim();
      if (!block) return '';
      if (/^<(h\d|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|hr|pre|img|div|p|section|article)/.test(block)) {
        return block;
      }
      return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');

    // 还原代码块
    html = html.replace(/\u0000CODEBLOCK(\d+)\u0000/g, function (m, idx) {
      var block = codeBlocks[parseInt(idx, 10)];
      return '<pre><code class="language-' + (block.lang || 'plaintext') + '">' +
        escapeHtml(block.code) + '</code></pre>';
    });
    html = html.replace(/\u0000INLINE(\d+)\u0000/g, function (m, idx) {
      return '<code>' + escapeHtml(inlineCodes[parseInt(idx, 10)]) + '</code>';
    });

    return html;
  }

  // ========== 代码高亮 ==========
  function highlightCode(container) {
    $$('pre code', container).forEach(function (codeEl) {
      var lang = (codeEl.className.match(/language-(\w+)/) || [])[1] || '';
      var raw = codeEl.textContent;
      codeEl.innerHTML = tokenize(raw, lang);
    });
  }

  function tokenize(code, lang) {
    var tokens = [];
    var i = 0;
    var len = code.length;
    var hashComment = lang === 'python' || lang === 'py' || lang === 'bash' || lang === 'sh' || lang === 'yaml' || lang === 'yml' || lang === 'toml';

    while (i < len) {
      var ch = code[i];
      if (hashComment && ch === '#') {
        var end = code.indexOf('\n', i);
        if (end < 0) end = len;
        tokens.push('<span class="token comment">' + escapeHtml(code.slice(i, end)) + '</span>');
        i = end;
        continue;
      }
      if ((lang === 'js' || lang === 'javascript' || lang === 'c' || lang === 'java' || lang === 'cpp' || lang === 'ts' || lang === 'typescript') && ch === '/' && code[i + 1] === '/') {
        var end2 = code.indexOf('\n', i);
        if (end2 < 0) end2 = len;
        tokens.push('<span class="token comment">' + escapeHtml(code.slice(i, end2)) + '</span>');
        i = end2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        var quote = ch;
        var j = i + 1;
        while (j < len && code[j] !== quote) {
          if (code[j] === '\\') j++;
          j++;
        }
        tokens.push('<span class="token string">' + escapeHtml(code.slice(i, j + 1)) + '</span>');
        i = j + 1;
        continue;
      }
      if (/\d/.test(ch) && (i === 0 || /[^\w]/.test(code[i - 1]))) {
        var num = '';
        while (i < len && /[\d.]/.test(code[i])) { num += code[i]; i++; }
        tokens.push('<span class="token number">' + num + '</span>');
        continue;
      }
      if (/[a-zA-Z_]/.test(ch)) {
        var word = '';
        while (i < len && /[\w]/.test(code[i])) { word += code[i]; i++; }
        var keywords = ['def','class','import','from','return','if','else','elif','for','while','try','except','finally','with','as','in','not','and','or','is','None','True','False','async','await','yield','lambda','pass','break','continue','global','nonlocal','raise','assert','del','function','const','let','var','new','this','typeof','instanceof','void','delete','public','private','protected','static','int','string','bool','boolean'];
        if (keywords.indexOf(word) >= 0) {
          tokens.push('<span class="token keyword">' + word + '</span>');
        } else if (code[i] === '(') {
          tokens.push('<span class="token function">' + word + '</span>');
        } else {
          tokens.push(escapeHtml(word));
        }
        continue;
      }
      tokens.push(escapeHtml(ch));
      i++;
    }
    return tokens.join('');
  }

  // ========== 首页渲染（解析 frontmatter 生成 hero + features） ==========
  var FEATURE_ICONS = {
    plugin: '<path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/>',
    adapter: '<path d="M12 2c-3.31 0-6 2.69-6 6v3H4v10h16V11h-2V8c0-3.31-2.69-6-6-6zm0 2c2.21 0 4 1.79 4 4v3H8V8c0-2.21 1.79-4 4-4zm0 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>',
    websocket: '<path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>',
    webui: '<path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/>',
    chat: '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>',
    shield: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>',
    storage: '<path d="M2 7h20v2H2V7zm0 4h20v4H2v-4zm0 6h20v2H2v-2zM4 9v6h16V9H4z"/>',
    docker: '<path d="M21 16.5c.61-.7 1-1.51 1-2.5 0-1.86-1.27-3.41-3-3.86V6h2c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v2c0 .55.45 1 1 1h2v17h2v-7h2.07c.44 2.06 1.97 3.64 4 4.06V21h4c1.1 0 2-.9 2-2v-1.5c0-.55.45-1 1-1s1 .45 1 1z"/>',
  };

  function renderHome(container, md) {
    var parsed = parseFrontmatter(md);
    var fm = parsed.frontmatter;
    var hero = fm.hero || {};
    var features = fm.features || [];
    var actions = hero.actions || [];

    var actionsHtml = actions.map(function (a) {
      var cls = a.theme === 'brand' ? 'btn btn--filled' : 'btn btn--tonal';
      var href = /^https?:/.test(a.link) ? a.link : '#' + a.link;
      var target = /^https?:/.test(a.link) ? ' target="_blank" rel="noopener"' : '';
      return '<a class="' + cls + '" href="' + href + '"' + target + '>' + escapeHtml(a.text) + '</a>';
    }).join('');

    var featuresHtml = features.map(function (f, idx) {
      var iconPath = FEATURE_ICONS[f.icon] || FEATURE_ICONS.plugin;
      return '<div class="feature-card" style="animation-delay:' + (idx * 60) + 'ms">' +
        '<div class="feature-card__icon"><svg viewBox="0 0 24 24">' + iconPath + '</svg></div>' +
        '<div class="feature-card__title">' + escapeHtml(f.title) + '</div>' +
        '<div class="feature-card__desc">' + escapeHtml(f.details) + '</div>' +
        '</div>';
    }).join('');

    var heroName = hero.name || CFG.site.title;
    var heroText = hero.text || '';
    var heroTagline = hero.tagline || '';
    var logoSrc = hero.image && hero.image.src ? hero.image.src : CFG.site.logo;

    container.innerHTML =
      '<div class="home">' +
        '<div class="hero">' +
          '<div class="hero__inner">' +
            '<div class="hero__left">' +
              '<h1 class="hero__title">' + escapeHtml(heroName) + ' <span class="accent">' + escapeHtml(heroText) + '</span></h1>' +
              '<p class="hero__subtitle">' + escapeHtml(heroTagline) + '</p>' +
              '<div class="hero__actions">' + actionsHtml + '</div>' +
            '</div>' +
            '<div class="hero__right">' +
              '<img class="hero__logo" src="' + logoSrc + '" alt="' + escapeHtml(heroName) + '">' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="features">' + featuresHtml + '</div>' +
      '</div>';
  }

  // ========== 加载页面 ==========
  function loadPage(route) {
    var contentEl = $('#content');
    var path = routeToPath(route);
    var home = isHome(route);

    // 主页：隐藏侧栏；非主页：显示侧栏（电脑端）
    document.body.classList.toggle('home', home);
    if (home) {
      document.body.classList.add('no-sidebar');
    } else {
      // 非主页时，电脑端默认显示侧栏（除非用户之前主动关闭过）
      // 保留用户的 no-sidebar 偏好：如果是用户主动关闭的，不强制打开
      // 简化：非主页时清除 no-sidebar（用户可再点关闭）
      document.body.classList.remove('no-sidebar');
    }

    contentEl.classList.add('exit');
    setTimeout(function () {
      contentEl.classList.remove('exit');
      contentEl.innerHTML = '<div class="loading"><div class="loading__spinner"></div></div>';

      fetchMarkdown(path).then(function (md) {
        if (home) {
          renderHome(contentEl, md);
        } else {
          var parsed = parseFrontmatter(md);
          var html = renderMarkdown(parsed.body);
          var docNav = renderDocNav(route);
          contentEl.innerHTML = '<div class="markdown">' + html + '</div>' + docNav;
          highlightCode(contentEl);
          updateToc(contentEl);
          // 翻页按钮涟漪
          $$('.doc-nav__item', contentEl).forEach(attachRipple);
        }
        void contentEl.offsetWidth;
        window.scrollTo({ top: 0, behavior: 'instant' });
        updateSidebarActive(route);
        updateTopbarActive(route);
        updateFab();
      }).catch(function (err) {
        contentEl.innerHTML =
          '<div class="error-state">' +
          '<svg class="error-state__icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>' +
          '<div class="error-state__title">页面加载失败</div>' +
          '<div class="error-state__desc">' + escapeHtml(err.message || '未知错误') + '</div>' +
          '</div>';
      });
    }, 150);
  }

  function fetchMarkdown(path) {
    if (cache[path]) return Promise.resolve(cache[path]);
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      cache[path] = text;
      return text;
    });
  }

  function updateToc(container) {}

  // ========== 翻页导航（上一页/下一页） ==========
  // 扁平化所有文档页面（按 sidebar 顺序）
  function getFlatPages() {
    var pages = [];
    Object.keys(CFG.sidebar).forEach(function (prefix) {
      CFG.sidebar[prefix].forEach(function (group) {
        group.items.forEach(function (item) {
          pages.push({ link: item.link, text: item.text });
        });
      });
    });
    return pages;
  }

  function getNeighbors(route) {
    var pages = getFlatPages();
    var idx = -1;
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].link === route) { idx = i; break; }
    }
    if (idx < 0) return null;
    return {
      prev: idx > 0 ? pages[idx - 1] : null,
      next: idx < pages.length - 1 ? pages[idx + 1] : null,
    };
  }

  function renderDocNav(route) {
    var nb = getNeighbors(route);
    if (!nb) return '';
    var html = '<div class="doc-nav">';
    if (nb.prev) {
      html += '<a class="doc-nav__item doc-nav__item--prev" href="#' + nb.prev.link + '">' +
        '<span class="doc-nav__label">上一页</span>' +
        '<span class="doc-nav__title">' + escapeHtml(nb.prev.text) + '</span>' +
        '</a>';
    }
    if (nb.next) {
      var onlyClass = !nb.prev ? ' doc-nav__item--only' : '';
      html += '<a class="doc-nav__item doc-nav__item--next' + onlyClass + '" href="#' + nb.next.link + '">' +
        '<span class="doc-nav__label">下一页</span>' +
        '<span class="doc-nav__title">' + escapeHtml(nb.next.text) + '</span>' +
        '</a>';
    }
    // 如果只有 prev 没有 next（最后一页）
    if (nb.prev && !nb.next) {
      // 已添加 prev，next 不存在，prev 占满
      html = '<div class="doc-nav">' +
        '<a class="doc-nav__item doc-nav__item--prev doc-nav__item--only" href="#' + nb.prev.link + '">' +
        '<span class="doc-nav__label">上一页</span>' +
        '<span class="doc-nav__title">' + escapeHtml(nb.prev.text) + '</span>' +
        '</a>';
    }
    html += '</div>';
    return html;
  }

  // ========== 侧边栏 ==========
  function renderSidebar(route) {
    var sidebar = $('#sidebar');
    var groups = null;
    var prefixes = Object.keys(CFG.sidebar).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < prefixes.length; i++) {
      if (route.indexOf(prefixes[i]) === 0) {
        groups = CFG.sidebar[prefixes[i]];
        break;
      }
    }
    if (!groups) { sidebar.innerHTML = ''; return; }
    var html = groups.map(function (group) {
      var items = group.items.map(function (item) {
        return '<a class="sidebar__item" href="#' + item.link + '" data-route="' + item.link + '">' +
          escapeHtml(item.text) + '</a>';
      }).join('');
      return '<div class="sidebar__group">' +
        '<div class="sidebar__group-title">' + escapeHtml(group.title) + '</div>' +
        items + '</div>';
    }).join('');
    sidebar.innerHTML = html;
  }

  function updateSidebarActive(route) {
    $$('.sidebar__item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.route === route);
    });
  }

  // ========== 顶部导航 ==========
  function renderTopbar() {
    var nav = $('#topbar-nav');
    nav.innerHTML = CFG.nav.map(function (item) {
      if (item.external) {
        return '<a class="topbar__nav-item" href="' + item.link.replace('external:', '') + '" target="_blank" rel="noopener">' + escapeHtml(item.text) + '</a>';
      }
      return '<a class="topbar__nav-item" href="#' + item.link + '" data-match="' + item.match + '">' + escapeHtml(item.text) + '</a>';
    }).join('');
  }

  function updateTopbarActive(route) {
    $$('.topbar__nav-item').forEach(function (el) {
      var match = el.dataset.match;
      el.classList.toggle('active', match && route.indexOf(match) === 0);
    });
  }

  // ========== 主题 ==========
  function initTheme() {
    var saved = localStorage.getItem('qtine-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('qtine-theme', theme);
    var icon = $('#theme-icon');
    if (icon) {
      if (theme === 'dark') {
        icon.innerHTML = '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>';
      } else {
        icon.innerHTML = '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM12 2c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1s1-.45 1-1V3c0-.55-.45-1-1-1zm0 17c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1s1-.45 1-1v-1c0-.55-.45-1-1-1zm11-8c0-.55-.45-1-1-1h-1c-.55 0-1 .45-1 1s.45 1 1 1h1c.55 0 1-.45 1-1zM4 11c0-.55-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1h1c.55 0 1-.45 1-1zm15.66-7.07c-.39-.39-1.02-.39-1.41 0l-.71.71c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l.71-.71c.39-.39.39-1.02 0-1.41zM6.34 19.07c.39-.39.39-1.02 0-1.41-.39-.39-1.02-.39-1.41 0l-.71.71c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l.71-.71zm14.32 0l-.71-.71c-.39-.39-1.02-.39-1.41 0-.39.39-.39 1.02 0 1.41l.71.71c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41zM6.34 4.93l-.71-.71c-.39-.39-1.02-.39-1.41 0-.39.39-.39 1.02 0 1.41l.71.71c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41z"/>';
      }
    }
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'light' ? 'dark' : 'light');
  }

  // ========== 涟漪 ==========
  function attachRipple(el) {
    el.addEventListener('click', function (e) {
      var rect = el.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      el.appendChild(ripple);
      setTimeout(function () { ripple.remove(); }, 600);
    });
  }

  // ========== FAB ==========
  function updateFab() {
    var fab = $('#fab');
    fab.classList.toggle('visible', window.scrollY > 400);
  }

  // ========== 搜索（带动画） ==========
  function openSearch() {
    var dialog = $('#search-dialog');
    dialog.classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('#search-input').focus(); }, 120);
    ensureSearchIndex();
  }

  function closeSearch() {
    var dialog = $('#search-dialog');
    dialog.classList.remove('show');
    document.body.style.overflow = '';
    $('#search-input').value = '';
    $('#search-results').innerHTML = '';
    $('#search-results').classList.remove('has-results');
  }

  function ensureSearchIndex() {
    if (searchIndex) return;
    var pages = [];
    Object.keys(CFG.sidebar).forEach(function (prefix) {
      CFG.sidebar[prefix].forEach(function (group) {
        group.items.forEach(function (item) {
          pages.push({ link: item.link, text: item.text, content: '' });
        });
      });
    });
    searchIndex = pages;
    pages.forEach(function (page) {
      fetchMarkdown(routeToPath(page.link)).then(function (md) {
        var parsed = parseFrontmatter(md);
        page.content = parsed.body.toLowerCase();
      }).catch(function () {});
    });
  }

  function doSearch(query) {
    var results = $('#search-results');
    if (!query || !query.trim()) {
      results.innerHTML = '';
      results.classList.remove('has-results');
      return;
    }
    var q = query.toLowerCase().trim();
    var matched = (searchIndex || []).filter(function (page) {
      if (!page.content) return false;
      return page.content.indexOf(q) >= 0 || page.text.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 20);

    if (matched.length === 0) {
      results.innerHTML = '<div class="search-dialog__empty">未找到匹配的文档</div>';
      results.classList.remove('has-results');
      return;
    }
    results.classList.add('has-results');
    results.innerHTML = matched.map(function (page, idx) {
      return '<a class="search-dialog__result" href="#' + page.link + '" style="animation-delay:' + (idx * 30) + 'ms">' +
        '<div class="search-dialog__result-title">' + escapeHtml(page.text) + '</div>' +
        '<div class="search-dialog__result-path">' + escapeHtml(page.link) + '</div>' +
        '</a>';
    }).join('');
    $$('.search-dialog__result', results).forEach(function (el) {
      el.addEventListener('click', function () { closeSearch(); });
    });
  }

  // ========== 侧边栏 toggle（电脑端 + 移动端统一） ==========
  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function toggleSidebar() {
    if (isMobile()) {
      var sidebar = $('#sidebar');
      var scrim = $('#scrim');
      var isOpen = sidebar.classList.contains('open');
      sidebar.classList.toggle('open', !isOpen);
      scrim.classList.toggle('show', !isOpen);
    } else {
      // 电脑端：toggle body.no-sidebar
      document.body.classList.toggle('no-sidebar');
    }
  }

  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#scrim').classList.remove('show');
  }

  // ========== 初始化 ==========
  function init() {
    document.title = CFG.site.title + ' · ' + CFG.site.subtitle;
    var favicon = $('link[rel="icon"]');
    if (favicon) favicon.href = CFG.site.favicon;

    var brandImg = $('#brand-logo');
    if (brandImg) brandImg.src = CFG.site.logo;
    var brandText = $('#brand-text');
    if (brandText) brandText.innerHTML = CFG.site.title + ' <span class="accent">文档</span>';

    renderTopbar();
    initTheme();

    $('#menu-btn').addEventListener('click', toggleSidebar);
    $('#theme-btn').addEventListener('click', toggleTheme);
    $('#search-btn').addEventListener('click', openSearch);
    $('#fab').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#search-close').addEventListener('click', closeSearch);
    $('#search-input').addEventListener('input', function (e) { doSearch(e.target.value); });
    $('#scrim').addEventListener('click', closeSidebar);
    $('#search-dialog').addEventListener('click', function (e) {
      if (e.target === this) closeSearch();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSearch();
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
    });

    window.addEventListener('scroll', function () {
      $('#topbar').classList.toggle('scrolled', window.scrollY > 8);
      updateFab();
    });

    $$('.topbar__menu-btn, .topbar__theme-btn, .topbar__search-btn, .btn, .fab, .sidebar__item, .topbar__nav-item').forEach(attachRipple);

    window.addEventListener('hashchange', function () {
      var route = getRoute();
      renderSidebar(route);
      loadPage(route);
    });

    var route = getRoute();
    renderSidebar(route);
    loadPage(route);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
