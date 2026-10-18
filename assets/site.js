// a4b.jp 共通の動き: GAS から公開済みの記事を読んで並べる
(function () {
  var C = window.A4B_CONFIG || {};

  // ─── GAS を読む（fetch がだめなら JSONP） ───
  var jsonpSeq = 0;
  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      var name = '__a4b_cb' + (++jsonpSeq);
      var s = document.createElement('script');
      var timer = setTimeout(function () { done(); reject(new Error('timeout')); }, 15000);
      function done() { clearTimeout(timer); delete window[name]; s.remove(); }
      window[name] = function (data) { done(); resolve(data); };
      s.onerror = function () { done(); reject(new Error('jsonp error')); };
      s.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'callback=' + name;
      document.head.appendChild(s);
    });
  }
  var mode = null; // 'fetch' か 'jsonp'。一度決まったら使い回す
  function api(params) {
    if (!C.GAS_URL) return Promise.reject(new Error('no_url'));
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var url = C.GAS_URL + (q ? '?' + q : '');
    if (mode === 'jsonp') return jsonp(url);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (d) { mode = 'fetch'; return d; }, function () {
      mode = 'jsonp';
      return jsonp(url);
    });
  }

  var listPromise = null;
  function getArticles() {
    if (!listPromise) listPromise = api({}).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      return d.articles;
    });
    return listPromise;
  }

  // ─── 表示 ───
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function para(s) { return esc(s).replace(/\r?\n/g, '<br>'); }
  function jpDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
    return m ? m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : '';
  }
  function excerpt(s, n) { s = String(s || '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) + '…' : s; }
  function slugOf(name) {
    var a = (C.ACTIVITIES || []).filter(function (x) { return x.name === name; })[0];
    return a ? a.slug : '';
  }

  // 写真は1枚ずつ GAS から受け取る（ドライブでは公開していない）
  var photoCache = {};
  function loadPhoto(img) {
    var id = img.getAttribute('data-photo');
    if (!photoCache[id]) photoCache[id] = api({ photo: id }).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      return 'data:' + d.mime + ';base64,' + d.data;
    });
    photoCache[id].then(function (src) { img.src = src; img.classList.add('loaded'); },
      function () { img.closest('figure') && img.closest('figure').classList.add('photo-error'); });
  }
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); loadPhoto(e.target); } });
  }, { rootMargin: '200px' }) : null;
  function watchPhotos(root) {
    root.querySelectorAll('img[data-photo]').forEach(function (img) { io ? io.observe(img) : loadPhoto(img); });
  }

  function card(a) {
    var ph = a.photos && a.photos[0];
    return '<article class="card">' +
      '<a href="kiji.html?id=' + encodeURIComponent(a.id) + '">' +
      '<div class="card-photo">' + (ph ? '<img data-photo="' + esc(ph.id) + '" alt="' + esc(ph.caption || a.title) + '">' : '<span class="no-photo">' + esc(a.activity) + '</span>') + '</div>' +
      '<div class="card-body">' +
      '<p class="meta"><span class="tag tag-' + slugOf(a.activity) + '">' + esc(a.activity) + '</span><time>' + jpDate(a.date) + '</time></p>' +
      '<h3>' + esc(a.title) + '</h3>' +
      '<p>' + esc(excerpt(a.body, 60)) + '</p>' +
      '</div></a></article>';
  }

  function showList(el, list, emptyText) {
    el.innerHTML = list.length ? list.map(card).join('') : '<p class="empty">' + esc(emptyText || 'まだ記事がありません。') + '</p>';
    watchPhotos(el);
  }
  function showError(el, err) {
    el.innerHTML = '<p class="empty">' + (err && err.message === 'no_url'
      ? '記事の読み込みは準備中です。'
      : '記事を読み込めませんでした。時間をおいて、もう一度ひらいてください。') + '</p>';
  }

  // data-articles="latest:4" / "all" / "activity:朝ごはんPJ:3" のついた箱に記事を入れる
  function fillBoxes() {
    var boxes = document.querySelectorAll('[data-articles]');
    if (!boxes.length) return;
    boxes.forEach(function (el) { el.innerHTML = '<p class="empty">読み込み中…</p>'; });
    getArticles().then(function (list) {
      boxes.forEach(function (el) {
        var spec = el.getAttribute('data-articles').split(':');
        var items = list;
        if (spec[0] === 'activity') items = list.filter(function (a) { return a.activity === spec[1]; });
        var n = Number(spec[spec.length - 1]);
        if (n) items = items.slice(0, n);
        showList(el, items, el.getAttribute('data-empty'));
      });
    }, function (err) { boxes.forEach(function (el) { showError(el, err); }); });
  }

  // 活動の紹介: data-count="活動名" のリンクに記事の本数を添える。0本なら「まだありません」にする（2026-10-18）
  function fillCounts() {
    var links = document.querySelectorAll('[data-count]');
    if (!links.length) return;
    getArticles().then(function (list) {
      links.forEach(function (a) {
        var name = a.getAttribute('data-count');
        var n = list.filter(function (x) { return x.activity === name; }).length;
        if (n) { a.textContent = 'この活動の記事を見る（' + n + '本）→'; return; }
        var p = document.createElement('span');
        p.className = 'note';
        p.textContent = 'この活動の記事は、まだありません。';
        a.replaceWith(p);
      });
    }, function () { /* 読めないときはリンクのまま */ });
  }

  // 記事一覧ページ: 活動名で絞り込む
  function setupFilter() {
    var bar = document.getElementById('filter');
    var box = document.getElementById('all-articles');
    if (!bar || !box) return;
    var current = new URLSearchParams(location.search).get('a') || '';
    var btns = [{ name: '', label: 'すべて' }].concat((C.ACTIVITIES || []).map(function (x) { return { name: x.name, label: x.name }; }));
    bar.innerHTML = btns.map(function (b) {
      return '<button type="button" data-a="' + esc(b.name) + '"' + (b.name === current ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(b.label) + '</button>';
    }).join('');
    box.innerHTML = '<p class="empty">読み込み中…</p>';
    getArticles().then(function (list) {
      function render() {
        var items = current ? list.filter(function (a) { return a.activity === current; }) : list;
        showList(box, items, current ? 'この活動の記事は、まだありません。' : '');
      }
      bar.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        current = b.getAttribute('data-a');
        bar.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        history.replaceState(null, '', current ? '?a=' + encodeURIComponent(current) : location.pathname);
        render();
      });
      render();
    }, function (err) { showError(box, err); });
  }

  // 記事ページ
  function setupArticle() {
    var box = document.getElementById('article');
    if (!box) return;
    var id = new URLSearchParams(location.search).get('id');
    box.innerHTML = '<p class="empty">読み込み中…</p>';
    getArticles().then(function (list) {
      var a = list.filter(function (x) { return x.id === id; })[0];
      if (!a) { box.innerHTML = '<p class="empty">この記事は見つかりませんでした。</p>'; return; }
      document.title = a.title + '｜名護中学校コミュニティスクール';
      box.innerHTML =
        '<p class="meta"><a class="tag tag-' + slugOf(a.activity) + '" href="katsudo.html?a=' + encodeURIComponent(a.activity) + '">' + esc(a.activity) + '</a><time>' + jpDate(a.date) + '</time></p>' +
        '<h1>' + esc(a.title) + '</h1>' +
        '<div class="article-body"><p>' + para(a.body) + '</p></div>' +
        (a.photos || []).map(function (p) {
          return '<figure><img data-photo="' + esc(p.id) + '" alt="' + esc(p.caption || '') + '">' + (p.caption ? '<figcaption>' + esc(p.caption) + '</figcaption>' : '') + '</figure>';
        }).join('');
      watchPhotos(box);
    }, function (err) { showError(box, err); });
  }

  // data-school="5" / "all" のついた箱に学校のホームページの CS 記事を、
  // data-insta="5" / "all" の箱に学生ボランティアの Instagram の投稿を、リンクで並べる（なければ節ごと隠す）
  // "3+" は3件だけ出し、残りは「すべて見る」で開く（2026-10-18）
  function fillLinks(attr, param) {
    var boxes = document.querySelectorAll('[' + attr + ']');
    if (!boxes.length) return;
    var q = {}; q[param] = 1;
    api(q).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      boxes.forEach(function (el) {
        var n = el.getAttribute(attr);
        var fold = /\+$/.test(n) ? parseInt(n, 10) : 0;
        var items = n === 'all' || fold ? d.items : d.items.slice(0, Number(n) || 5);
        var section = el.closest('section');
        if (!items.length) { if (section) section.hidden = true; return; }
        el.innerHTML = items.map(function (x, i) {
          return '<li' + (fold && i >= fold ? ' hidden' : '') + '><time>' + jpDate(x.date) + '</time><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a></li>';
        }).join('');
        if (fold && items.length > fold) {
          var p = document.createElement('p');
          p.className = 'more';
          p.innerHTML = '<button type="button" class="link-button">すべて見る（' + items.length + '件）</button>';
          p.firstChild.addEventListener('click', function () {
            el.querySelectorAll('li[hidden]').forEach(function (li) { li.hidden = false; });
            p.remove();
          });
          el.after(p);
        }
      });
    }).catch(function () {
      boxes.forEach(function (el) { var s = el.closest('section'); if (s) s.hidden = true; });
    });
  }

  function setupContact() {
    document.querySelectorAll('[data-contact-form]').forEach(function (a) {
      if (C.CONTACT_FORM_URL) { a.href = C.CONTACT_FORM_URL; } else { a.classList.add('disabled'); a.textContent = 'フォームは準備中です'; a.removeAttribute('href'); }
    });
  }

  function setupNav() {
    var here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.site-nav a').forEach(function (a) {
      // 記事の一覧（katsudo）と記事（kiji）は、メニューでは「活動」の中
      if (a.getAttribute('href') === here || ((here === 'kiji.html' || here === 'katsudo.html') && a.getAttribute('href') === 'shokai.html')) a.setAttribute('aria-current', 'page');
    });
    var t = document.querySelector('.nav-toggle');
    if (t) t.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // ─── 今後の予定とお知らせ（2026-10-18） ───
  // data-news="upcoming:3"（これからの予定・近い順）、"news:3"（お知らせ・新しい順）、"past:10"（終わった予定・新しい順）
  // 中身がない箱は data-empty の文を出す（data-empty がなければ箱の親 .news-col を隠す）。[data-news-section] の中が全部空なら節ごと隠す
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  // 一覧は日付・見出し・時間と場所・小さな画像だけ。押すと oshirase.html の詳細（ひとこと・大きな画像・リンク）が開く（2026-10-18）
  // 画像はシートではなく config.js の NEWS_IMAGES（ID ごと）
  var newsById = {};
  function newsImages(x) { return ((window.A4B_CONFIG || {}).NEWS_IMAGES || {})[x.id] || []; }
  function newsDate(x) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(x.date) || [];
    var w = m.length ? '日月火水木金土'.charAt(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()) : '';
    return '<p class="news-date"><span class="y">' + (m[1] || '') + '</span><span class="md">' + Number(m[2]) + '/' + Number(m[3]) + '</span><span class="w">(' + w + ')</span></p>';
  }
  function newsMeta(x) { return [x.time, x.place].filter(Boolean).map(esc).join('　'); }
  function newsItem(x) {
    var meta = newsMeta(x), img = newsImages(x)[0];
    return '<li class="news-item k-' + (x.kind === '予定' ? 'yotei' : 'oshirase') + '">' +
      '<a class="news-open" href="oshirase.html#' + encodeURIComponent(x.id) + '" data-news-id="' + esc(x.id) + '">' + newsDate(x) +
      '<div class="news-main"><span class="news-kind">' + esc(x.kind) + '</span><h3>' + esc(x.title) + '</h3>' +
      (meta ? '<p class="news-meta">' + meta + '</p>' : '') + '<span class="news-more">くわしく見る</span></div>' +
      (img ? '<img class="news-thumb" src="' + esc(img.src) + '" alt="" loading="lazy">' : '') + '</a></li>';
  }
  function newsDialog() {
    var dlg = document.querySelector('.news-dialog');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'news-dialog';
    dlg.setAttribute('aria-labelledby', 'news-dialog-title');
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('.news-close')) dlg.close(); // 外側か「閉じる」を押したら閉じる
    });
    dlg.addEventListener('close', function () {
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    });
    return dlg;
  }
  function openNews(id) {
    var x = newsById[id];
    if (!x || typeof HTMLDialogElement === 'undefined') return false;
    var meta = newsMeta(x), imgs = newsImages(x);
    var link = x.url ? '<p class="news-link"><a class="button" href="' + esc(x.url) + '"' + (/^https?:\/\/nagochu-cs\.github\.io\//.test(x.url) ? '' : ' target="_blank" rel="noopener"') + '>関連するページを開く</a></p>' : '';
    var dlg = newsDialog();
    dlg.innerHTML = '<div class="news-dialog-in k-' + (x.kind === '予定' ? 'yotei' : 'oshirase') + '">' +
      '<button type="button" class="news-close" aria-label="閉じる">×</button>' +
      '<div class="news-dialog-head">' + newsDate(x) + '<div><span class="news-kind">' + esc(x.kind) + '</span><h2 id="news-dialog-title">' + esc(x.title) + '</h2>' +
      (meta ? '<p class="news-meta">' + meta + '</p>' : '') + '</div></div>' +
      (x.body ? '<p class="news-body">' + para(x.body) + '</p>' : '') + link +
      imgs.map(function (im) {
        return '<figure><a href="' + esc(im.src) + '" target="_blank" rel="noopener"><img src="' + esc(im.src) + '" alt="' + esc(im.alt || '') + '" loading="lazy"></a>' +
          (im.alt ? '<figcaption>' + esc(im.alt) + '（押すと原寸で開きます）</figcaption>' : '') + '</figure>';
      }).join('') + '</div>';
    dlg.showModal();
    dlg.scrollTop = 0;
    return true;
  }
  // お知らせのページの中では、押したらその場で詳細を開く（ほかのページからは oshirase.html#ID へ移ってから開く）
  function setupNewsOpen() {
    if (!/oshirase\.html$/.test(location.pathname)) return;
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a.news-open');
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (openNews(a.getAttribute('data-news-id'))) {
        e.preventDefault();
        history.replaceState(null, '', '#' + encodeURIComponent(a.getAttribute('data-news-id')));
      }
    });
  }
  function fillNews() {
    var boxes = document.querySelectorAll('[data-news]');
    if (!boxes.length) return;
    function hideEmpty() {
      document.querySelectorAll('[data-news-section]').forEach(function (sec) {
        sec.hidden = !sec.querySelector('.news-item');
      });
    }
    api({ news: 1 }).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      var t = today();
      d.items.forEach(function (x) { newsById[x.id] = x; });
      boxes.forEach(function (el) {
        var spec = el.getAttribute('data-news').split(':');
        var n = Number(spec[1]) || 0;
        var items = d.items.filter(function (x) {
          if (spec[0] === 'news') return x.kind === 'お知らせ';
          if (x.kind !== '予定') return false;
          return spec[0] === 'past' ? x.date < t : x.date >= t;
        });
        if (spec[0] === 'upcoming') items = items.slice().reverse(); // 近い順
        if (n) items = items.slice(0, n);
        if (items.length) { el.innerHTML = items.map(newsItem).join(''); return; }
        var empty = el.getAttribute('data-empty');
        if (empty) { el.innerHTML = '<li class="empty">' + esc(empty) + '</li>'; return; }
        var col = el.closest('.news-col');
        if (col) col.hidden = true;
      });
      // 予定かお知らせの片方だけなら、横いっぱいに並べる
      document.querySelectorAll('.news-cols').forEach(function (c) {
        c.classList.toggle('one', c.querySelectorAll('.news-col:not([hidden])').length === 1);
      });
      hideEmpty();
      if (location.hash.length > 1 && /oshirase\.html$/.test(location.pathname)) openNews(decodeURIComponent(location.hash.slice(1)));
    }).catch(function () {
      document.querySelectorAll('[data-news-section]').forEach(function (sec) { sec.hidden = true; });
      boxes.forEach(function (el) { if (el.getAttribute('data-empty')) el.innerHTML = '<li class="empty">読み込めませんでした。時間をおいて開き直してください。</li>'; });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupNav(); setupContact(); fillBoxes(); fillCounts(); setupFilter(); setupArticle(); fillLinks('data-school', 'school'); fillLinks('data-insta', 'insta'); fillNews(); setupNewsOpen();
  });
})();
